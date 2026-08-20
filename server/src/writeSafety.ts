import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import * as path from 'node:path'

export type GenerationOperationStatus =
  | 'preparing'
  | 'feedback-saved'
  | 'snapshot-created'
  | 'ai-generated'
  | 'next-article-writing'
  | 'next-article-written'
  | 'plan-writing'
  | 'plan-written'
  | 'committed'
  | 'failed'
  | 'interrupted'
  | 'rolled-back'

export interface OperationFileRecord {
  relativePath: string
  beforeHash?: string
  afterHash?: string
  backupRelativePath?: string
  createdByOperation?: boolean
}

export interface GenerationOperation {
  operationId: string
  status: GenerationOperationStatus
  currentArticlePath: string
  nextArticlePath: string | null
  planPath: string | null
  feedbackSubmissionId: string
  feedbackSaved: boolean
  changedFiles: string[]
  nextArticle: OperationFileRecord | null
  plan: OperationFileRecord | null
  createdAt: string
  updatedAt: string
  error?: {
    code: string
    message: string
  }
}

interface CreateOperationInput {
  currentArticlePath: string
  feedbackSubmissionId: string
}

const operationIdPattern = /^[a-zA-Z0-9-]{8,120}$/
const terminalStatuses = new Set<GenerationOperationStatus>([
  'committed',
  'failed',
  'interrupted',
  'rolled-back',
])

export class WriteSafetyConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WriteSafetyConflictError'
  }
}

export function isValidOperationId(operationId: unknown): operationId is string {
  return typeof operationId === 'string' && operationIdPattern.test(operationId)
}

export function hashText(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export async function hashFile(filePath: string) {
  return hashText(await readFile(filePath, 'utf8'))
}

async function removeFileIfPresent(filePath: string) {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}

function isMissingFileError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * Write a text file beside its final path and rename it only after the write succeeds.
 * The temporary file is on the same filesystem, so rename is atomic on the local filesystem.
 */
export async function writeFileAtomically(filePath: string, content: string, operationId: string) {
  const temporaryPath = `${filePath}.tmp-${operationId}-${randomUUID()}`

  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await removeFileIfPresent(temporaryPath)
    throw error
  }
}

/**
 * Create a file without replacing a file that may have appeared after the
 * caller's initial existence check. A hard-link operation is atomic and fails
 * with EEXIST when the destination already exists.
 */
export async function createFileAtomically(filePath: string, content: string, operationId: string) {
  const temporaryPath = `${filePath}.tmp-${operationId}-${randomUUID()}`

  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    await link(temporaryPath, filePath)
    await unlink(temporaryPath)
  } catch (error) {
    await removeFileIfPresent(temporaryPath)
    throw error
  }
}

export class GenerationOperationStore {
  private readonly operationsRoot: string

  constructor(private readonly root: string) {
    this.operationsRoot = path.join(root, 'operations')
  }

  async initialize() {
    await mkdir(this.operationsRoot, { recursive: true })
  }

  async create(input: CreateOperationInput) {
    await this.initialize()

    const now = new Date().toISOString()
    const operation: GenerationOperation = {
      operationId: randomUUID(),
      status: 'preparing',
      currentArticlePath: input.currentArticlePath,
      nextArticlePath: null,
      planPath: null,
      feedbackSubmissionId: input.feedbackSubmissionId,
      feedbackSaved: false,
      changedFiles: [],
      nextArticle: null,
      plan: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.save(operation)
    return operation
  }

  async save(operation: GenerationOperation) {
    if (!isValidOperationId(operation.operationId)) {
      throw new Error('Invalid generation operation id')
    }

    await this.initialize()
    operation.updatedAt = new Date().toISOString()
    const operationPath = this.getOperationPath(operation.operationId)
    await writeFileAtomically(
      operationPath,
      `${JSON.stringify(operation, null, 2)}\n`,
      `${operation.operationId}-journal`,
    )
  }

  async get(operationId: string) {
    if (!isValidOperationId(operationId)) {
      return null
    }

    try {
      return JSON.parse(await readFile(this.getOperationPath(operationId), 'utf8')) as GenerationOperation
    } catch (error) {
      if (isMissingFileError(error)) {
        return null
      }

      throw error
    }
  }

  async list() {
    await this.initialize()
    const entries = await readdir(this.operationsRoot, { withFileTypes: true })
    const operations: GenerationOperation[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }

      const operationId = entry.name.slice(0, -'.json'.length)
      const operation = await this.get(operationId)

      if (operation) {
        operations.push(operation)
      }
    }

    return operations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async markInterrupted() {
    for (const operation of await this.list()) {
      if (terminalStatuses.has(operation.status)) {
        continue
      }

      operation.status = 'interrupted'
      operation.error = {
        code: 'GENERATION_INTERRUPTED',
        message: '生成过程在服务停止前没有完成，请检查操作状态后再决定是否恢复。',
      }
      await this.save(operation)
    }
  }

  async createSnapshot(operation: GenerationOperation, file: OperationFileRecord, sourcePath: string) {
    const sourceInfo = await stat(sourcePath)

    if (!sourceInfo.isFile()) {
      throw new Error(`Cannot snapshot a non-file path: ${sourcePath}`)
    }

    const backupRelativePath = path.posix.join('backup', `${file.relativePath.replaceAll('/', '__')}.md`)
    const backupPath = this.getArtifactPath(operation.operationId, backupRelativePath)
    const sourceContent = await readFile(sourcePath, 'utf8')

    await mkdir(path.dirname(backupPath), { recursive: true })
    await writeFileAtomically(
      backupPath,
      sourceContent,
      `${operation.operationId}-backup`,
    )

    return {
      ...file,
      beforeHash: hashText(sourceContent),
      backupRelativePath,
    } satisfies OperationFileRecord
  }

  async restoreSnapshot(operation: GenerationOperation, file: OperationFileRecord, targetPath: string) {
    if (!file.backupRelativePath) {
      throw new Error(`No snapshot exists for ${file.relativePath}`)
    }

    const backupPath = this.getArtifactPath(operation.operationId, file.backupRelativePath)
    const backupContent = await readFile(backupPath, 'utf8')
    await writeFileAtomically(targetPath, backupContent, `${operation.operationId}-restore`)
  }

  async deleteCreatedFileIfUnchanged(filePath: string, expectedHash: string) {
    let currentHash: string

    try {
      currentHash = await hashFile(filePath)
    } catch (error) {
      if (isMissingFileError(error)) {
        return false
      }

      throw error
    }

    if (currentHash !== expectedHash) {
      throw new WriteSafetyConflictError(`文件已被其他操作修改，不能自动删除：${filePath}`)
    }

    await unlink(filePath)
    return true
  }

  private getOperationPath(operationId: string) {
    return path.join(this.operationsRoot, `${operationId}.json`)
  }

  private getArtifactPath(operationId: string, relativePath: string) {
    if (!isValidOperationId(operationId)) {
      throw new Error('Invalid generation operation id')
    }

    const operationRoot = path.join(this.operationsRoot, operationId)
    const artifactPath = path.resolve(operationRoot, relativePath)
    const relativeArtifactPath = path.relative(operationRoot, artifactPath)

    if (
      relativeArtifactPath === '' ||
      relativeArtifactPath === '..' ||
      relativeArtifactPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeArtifactPath)
    ) {
      throw new Error('Invalid generation artifact path')
    }

    return artifactPath
  }
}
