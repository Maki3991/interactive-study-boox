import { readFile, stat } from 'node:fs/promises'
import * as path from 'node:path'

export type ContextFileRole = 'plan' | 'current-article' | 'source'

export interface SourceReference {
  relativePath: string
  heading?: string
}

export interface ContextFile {
  role: ContextFileRole
  relativePath: string
  absolutePath: string
  markdown: string
}

export interface LearningContext {
  projectRootPath: string
  projectRelativePath: string
  planFile: ContextFile
  currentArticle: ContextFile
  currentSourceRefs: SourceReference[]
  nextArticlePath: string
  nextArticleAbsolutePath: string
  nextSourceRefs: SourceReference[]
  sourceFiles: ContextFile[]
}

export class LearningContextError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'LearningContextError'
  }
}

function toPosixPath(filePath: string) {
  return filePath.replaceAll(path.sep, '/').replaceAll('\\', '/')
}

function normalizeRelativePath(requestedPath: string) {
  return path.posix.normalize(requestedPath.trim().replaceAll('\\', '/'))
}

function isPathInside(parentPath: string, childPath: string) {
  const relativePath = path.relative(parentPath, childPath)

  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}

function makeContextError(code: string, message: string, status = 422) {
  return new LearningContextError(status, code, message)
}

async function isRegularFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function isMissingFileError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function findProjectRoot(libraryRoot: string, articlePath: string) {
  let currentPath = path.dirname(articlePath)

  while (true) {
    const planPath = path.join(currentPath, '00-学习计划.md')

    if (await isRegularFile(planPath)) {
      return currentPath
    }

    if (currentPath === libraryRoot) {
      break
    }

    const parentPath = path.dirname(currentPath)

    if (parentPath === currentPath || !isPathInside(libraryRoot, currentPath)) {
      break
    }

    currentPath = parentPath
  }

  throw makeContextError(
    'LEARNING_PLAN_NOT_FOUND',
    '当前文章所属项目缺少 00-学习计划.md。',
  )
}

function resolveArticlePath(libraryRoot: string, requestedPath: unknown) {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    throw makeContextError('ARTICLE_PATH_REQUIRED', '请提供当前学习文章的相对路径。', 400)
  }

  const relativePath = normalizeRelativePath(requestedPath)

  if (relativePath === '.' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
    throw makeContextError('ARTICLE_PATH_OUTSIDE_LIBRARY', '文章路径不能越出学习库。', 403)
  }

  if (!relativePath.toLowerCase().endsWith('.md')) {
    throw makeContextError('ARTICLE_NOT_MARKDOWN', '当前学习文章必须是 Markdown 文件。', 400)
  }

  const absolutePath = path.resolve(libraryRoot, relativePath)

  if (!isPathInside(libraryRoot, absolutePath)) {
    throw makeContextError('ARTICLE_PATH_OUTSIDE_LIBRARY', '文章路径不能越出学习库。', 403)
  }

  return { relativePath, absolutePath }
}

function cleanPlanCell(cell: string) {
  return cell.trim().replace(/^`|`$/g, '')
}

function parseSourceReferences(cell: string): SourceReference[] {
  const references = [...cell.matchAll(/`([^`]+\.md)`/gi)].map((match) => match[1])

  return references.map((relativePath) => ({ relativePath: normalizeRelativePath(relativePath) }))
}

function parseLessonSourceMappings(planMarkdown: string) {
  const mappings = new Map<string, SourceReference[]>()
  let insideMappingSection = false

  for (const line of planMarkdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      insideMappingSection = line.trim() === '## 学习文章与原文映射'
      continue
    }

    if (!insideMappingSection || !line.trim().startsWith('|')) {
      continue
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())

    if (cells.length < 2) {
      continue
    }

    const lessonPath = cleanPlanCell(cells[0])

    if (!lessonPath.toLowerCase().endsWith('.md')) {
      continue
    }

    const sourceRefs = parseSourceReferences(cells[1])

    if (sourceRefs.length > 0) {
      mappings.set(normalizeRelativePath(lessonPath), sourceRefs)
    }
  }

  return mappings
}

function getNextLessonPath(projectRoot: string, currentArticlePath: string) {
  const projectArticlePath = toPosixPath(path.relative(projectRoot, currentArticlePath))
  const fileName = path.posix.basename(projectArticlePath)
  const match = fileName.match(/^(\d+)(\.md)$/i)

  if (!match) {
    throw makeContextError(
      'CURRENT_ARTICLE_NOT_NUMBERED',
      '当前学习文章必须使用数字文件名，例如 01.md。',
    )
  }

  const nextNumber = String(Number(match[1]) + 1).padStart(match[1].length, '0')
  const nextFileName = `${nextNumber}${match[2]}`
  const articleDirectory = path.posix.dirname(projectArticlePath)

  return articleDirectory === '.'
    ? nextFileName
    : path.posix.join(articleDirectory, nextFileName)
}

function getRequiredMapping(
  mappings: Map<string, SourceReference[]>,
  lessonPath: string,
  label: string,
) {
  const sourceRefs = mappings.get(normalizeRelativePath(lessonPath))

  if (!sourceRefs || sourceRefs.length === 0) {
    throw makeContextError(
      'SOURCE_MAPPING_NOT_FOUND',
      `${label}没有找到对应的原文映射。`,
    )
  }

  return sourceRefs
}

async function readContextFile(
  role: ContextFileRole,
  libraryRoot: string,
  absolutePath: string,
): Promise<ContextFile> {
  const relativePath = toPosixPath(path.relative(libraryRoot, absolutePath))
  const markdown = await readFile(absolutePath, 'utf8')

  return { role, relativePath, absolutePath, markdown }
}

async function readSourceFiles(
  libraryRoot: string,
  projectRoot: string,
  sourceRefs: SourceReference[],
) {
  const sourceRoot = path.join(projectRoot, 'sources')
  const files = new Map<string, ContextFile>()

  for (const sourceRef of sourceRefs) {
    const relativeSourcePath = normalizeRelativePath(sourceRef.relativePath)

    if (
      !relativeSourcePath.startsWith('sources/') ||
      !relativeSourcePath.toLowerCase().endsWith('.md')
    ) {
      throw makeContextError(
        'SOURCE_MAPPING_INVALID',
        `原文映射必须指向 sources/ 下的 Markdown 文件：${sourceRef.relativePath}`,
      )
    }

    const absolutePath = path.resolve(projectRoot, relativeSourcePath)

    if (!isPathInside(sourceRoot, absolutePath)) {
      throw makeContextError('SOURCE_PATH_OUTSIDE_PROJECT', '原文路径不能越出 sources/ 文件夹。', 403)
    }

    if (!(await isRegularFile(absolutePath))) {
      throw makeContextError(
        'SOURCE_FILE_NOT_FOUND',
        `找不到原文文件：${sourceRef.relativePath}`,
      )
    }

    const contextFile = await readContextFile('source', libraryRoot, absolutePath)
    files.set(contextFile.relativePath, contextFile)
  }

  return [...files.values()]
}

export async function buildLearningContext(libraryRoot: string, requestedArticlePath: unknown) {
  const resolvedArticle = resolveArticlePath(libraryRoot, requestedArticlePath)

  if (!(await isRegularFile(resolvedArticle.absolutePath))) {
    throw makeContextError('ARTICLE_NOT_FOUND', '找不到当前学习文章。', 404)
  }

  const projectRoot = await findProjectRoot(libraryRoot, resolvedArticle.absolutePath)
  const projectRelativePath = toPosixPath(path.relative(libraryRoot, projectRoot))
  const planPath = path.join(projectRoot, '00-学习计划.md')
  const planFile = await readContextFile('plan', libraryRoot, planPath)
  const currentArticle = await readContextFile(
    'current-article',
    libraryRoot,
    resolvedArticle.absolutePath,
  )
  const mappings = parseLessonSourceMappings(planFile.markdown)
  const currentProjectArticlePath = toPosixPath(path.relative(projectRoot, resolvedArticle.absolutePath))
  const nextArticlePath = getNextLessonPath(projectRoot, resolvedArticle.absolutePath)
  const currentSourceRefs = getRequiredMapping(mappings, currentProjectArticlePath, '当前文章')
  const nextSourceRefs = getRequiredMapping(mappings, nextArticlePath, '下一篇文章')
  const sourceFiles = await readSourceFiles(libraryRoot, projectRoot, [
    ...currentSourceRefs,
    ...nextSourceRefs,
  ])

  return {
    projectRootPath: projectRoot,
    projectRelativePath,
    planFile,
    currentArticle,
    currentSourceRefs,
    nextArticlePath: path.posix.join(projectRelativePath, nextArticlePath),
    nextArticleAbsolutePath: path.resolve(projectRoot, nextArticlePath),
    nextSourceRefs,
    sourceFiles,
  } satisfies LearningContext
}
