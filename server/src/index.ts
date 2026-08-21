import express from 'express'
import { readFile, readdir, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { generateText } from './ai.js'
import { libraryRoot, writeSafetyRoot } from './config.js'
import { buildNextLessonPrompt } from './generationPrompt.js'
import { GitSyncError, getSyncStatus, pushSync } from './gitSync.js'
import { buildLearningContext, LearningContextError } from './learningContext.js'
import {
  GenerationOperation,
  GenerationOperationStore,
  WriteSafetyConflictError,
  createFileAtomically,
  hashFile,
  hashText,
  isValidOperationId,
  writeFileAtomically,
} from './writeSafety.js'

type LibraryEntry = FolderNode | MarkdownFileNode
type ArticleKind = 'plan' | 'lesson' | 'source' | 'other'

interface FolderNode {
  type: 'folder'
  name: string
  relativePath: string
  children: LibraryEntry[]
}

interface MarkdownFileNode {
  type: 'article'
  fileName: string
  relativePath: string
}

interface ArticleContent {
  fileName: string
  title: string
  relativePath: string
  kind: ArticleKind
  markdown: string
  latestFeedback: FeedbackSnapshot | null
  nextArticlePath: string | null
  nextArticleExists: boolean
  generationInProgress: boolean
}

interface FeedbackSnapshot {
  feedback: string
  submissionId: string
}

interface SaveFeedbackRequest {
  articlePath: string
  feedback: string
  submissionId: string
}

interface ValidatedFeedbackRequest {
  relativePath: string
  absolutePath: string
  feedback: string
  submissionId: string
}

interface ResolvedArticlePath {
  relativePath: string
  absolutePath: string
}

type ArticlePathResolution =
  | { ok: true; articlePath: ResolvedArticlePath }
  | { ok: false; status: number; message: string }

type FeedbackValidation =
  | { ok: true; request: ValidatedFeedbackRequest }
  | { ok: false; status: number; message: string }

class ArticleFileError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ArticleFileError'
  }
}

class GeneratedLessonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeneratedLessonError'
  }
}

const app = express()
const port = 3001
const feedbackMarkerPrefix = '<!-- interactive-study-boox:feedback-submission-id='
const feedbackMarkerSuffix = ' -->'
const feedbackWriteLocks = new Map<string, Promise<void>>()
const activeGenerationPaths = new Set<string>()
const activeRollbackOperationIds = new Set<string>()
const generationOperationStore = new GenerationOperationStore(writeSafetyRoot)

app.use(express.json())

const generationStoreReady = generationOperationStore.markInterrupted().catch((error) => {
  console.error('Failed to recover interrupted generation operations:', error)
})

function makeRelativePath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name
}

function normalizeRelativePath(requestedPath: string) {
  return path.posix.normalize(requestedPath.replaceAll('\\', '/'))
}

function isPathInsideLibrary(absolutePath: string) {
  const pathFromLibrary = path.relative(libraryRoot, absolutePath)

  return (
    pathFromLibrary !== '' &&
    pathFromLibrary !== '..' &&
    !pathFromLibrary.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(pathFromLibrary)
  )
}

function resolveArticlePath(requestedPath: unknown): ArticlePathResolution {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    return { ok: false, status: 400, message: '请提供 Markdown 文件的相对路径。' }
  }

  const relativePath = normalizeRelativePath(requestedPath)

  if (!relativePath.toLowerCase().endsWith('.md')) {
    return { ok: false, status: 400, message: '只能操作 Markdown 文件。' }
  }

  const absolutePath = path.resolve(libraryRoot, relativePath)

  if (!isPathInsideLibrary(absolutePath)) {
    return { ok: false, status: 403, message: '不能操作学习库之外的文件。' }
  }

  return { ok: true, articlePath: { relativePath, absolutePath } }
}

function getFeedbackMarker(submissionId: string) {
  return `${feedbackMarkerPrefix}${submissionId}${feedbackMarkerSuffix}`
}

function getLatestFeedback(markdown: string): FeedbackSnapshot | null {
  const markerPattern = /<!-- interactive-study-boox:feedback-submission-id=([a-zA-Z0-9-]{8,120}) -->/g
  let latestMatch: RegExpExecArray | null = null

  for (const match of markdown.matchAll(markerPattern)) {
    latestMatch = match
  }

  if (!latestMatch || latestMatch.index === undefined) {
    return null
  }

  const feedback = markdown.slice(latestMatch.index + latestMatch[0].length).trim()

  if (feedback === '') {
    return null
  }

  return {
    feedback,
    submissionId: latestMatch[1],
  }
}

function getNextArticlePath(relativePath: string) {
  const fileName = path.posix.basename(relativePath)
  const match = fileName.match(/^(\d+)(\.md)$/i)

  if (!match) {
    return null
  }

  const nextFileName = `${String(Number(match[1]) + 1).padStart(match[1].length, '0')}${match[2]}`
  const directory = path.posix.dirname(relativePath)

  return directory === '.' ? nextFileName : path.posix.join(directory, nextFileName)
}

function formatFeedbackForAppend(markdown: string, feedback: string, submissionId: string) {
  const separator = markdown.endsWith('\n') ? '\n' : '\n\n'

  return `${separator}---\n\n## 学习反馈\n\n${getFeedbackMarker(submissionId)}\n\n${feedback}\n`
}

function isValidSubmissionId(submissionId: unknown): submissionId is string {
  return typeof submissionId === 'string' && /^[a-zA-Z0-9-]{8,120}$/.test(submissionId)
}

async function withFeedbackWriteLock<T>(absolutePath: string, task: () => Promise<T>): Promise<T> {
  const previousLock = feedbackWriteLocks.get(absolutePath) ?? Promise.resolve()
  let releaseLock = () => {}
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const queuedLock = previousLock.then(() => currentLock)

  feedbackWriteLocks.set(absolutePath, queuedLock)
  await previousLock

  try {
    return await task()
  } finally {
    releaseLock()

    if (feedbackWriteLocks.get(absolutePath) === queuedLock) {
      feedbackWriteLocks.delete(absolutePath)
    }
  }
}

function validateFeedbackRequest(body: Partial<SaveFeedbackRequest> | undefined): FeedbackValidation {
  const resolution = resolveArticlePath(body?.articlePath)

  if (!resolution.ok) {
    return resolution
  }

  if (typeof body?.feedback !== 'string' || body.feedback.trim() === '') {
    return { ok: false, status: 400, message: '反馈内容不能为空。' }
  }

  if (!isValidSubmissionId(body.submissionId)) {
    return { ok: false, status: 400, message: '反馈提交标识无效，请重新提交。' }
  }

  return {
    ok: true,
    request: {
      relativePath: resolution.articlePath.relativePath,
      absolutePath: resolution.articlePath.absolutePath,
      feedback: body.feedback.trim(),
      submissionId: body.submissionId,
    },
  }
}

async function saveFeedbackToFile(request: ValidatedFeedbackRequest) {
  const fileInfo = await stat(request.absolutePath)

  if (!fileInfo.isFile()) {
    throw new ArticleFileError(404, '找不到这篇 Markdown 文章。')
  }

  return withFeedbackWriteLock(request.absolutePath, async () => {
    const markdown = await readFile(request.absolutePath, 'utf8')
    const feedbackMarker = getFeedbackMarker(request.submissionId)

    if (markdown.includes(feedbackMarker)) {
      return true
    }

    await writeFileAtomically(
      request.absolutePath,
      `${markdown}${formatFeedbackForAppend(markdown, request.feedback, request.submissionId)}`,
      `feedback-${request.submissionId}`,
    )
    return false
  })
}

function getArticleTitle(markdown: string, fileName: string) {
  const firstHeading = markdown.match(/^#\s+(.+?)\s*$/m)

  return firstHeading?.[1] ?? fileName.replace(/\.md$/i, '')
}

function getArticleKind(fileName: string, relativePath: string): ArticleKind {
  if (fileName === '00-学习计划.md') {
    return 'plan'
  }

  if (relativePath.split('/').includes('sources')) {
    return 'source'
  }

  if (/^\d{1,2}(?:[._-]|$)/.test(fileName)) {
    return 'lesson'
  }

  return 'other'
}

function isMissingFileError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function isRegularFilePath(filePath: string) {
  try {
    return (await stat(filePath)).isFile()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function validateGeneratedLesson(markdown: string) {
  const output = markdown.trim()
  const requiredHeadings = [
    '# ',
    '## 这一篇要解决的问题',
    '## 正文',
    '## 小结',
    '## 下一篇预告',
    '## 学习反馈',
  ]
  let previousHeadingIndex = -1

  if (output === '') {
    throw new GeneratedLessonError('AI 没有返回学习文章内容。')
  }

  for (const heading of requiredHeadings) {
    const headingIndex = output.indexOf(heading)

    if (headingIndex === -1 || headingIndex < previousHeadingIndex) {
      throw new GeneratedLessonError(`AI 返回的文章缺少或打乱了固定标题：${heading}`)
    }

    previousHeadingIndex = headingIndex
  }

  return `${output}\n`
}

function replacePlanLine(markdown: string, label: string, value: string) {
  const pattern = new RegExp(`^- ${label}.*$`, 'm')

  if (!pattern.test(markdown)) {
    return markdown
  }

  return markdown.replace(pattern, `- ${label}${value}`)
}

function updatePlanAfterGeneration(
  planMarkdown: string,
  currentArticlePath: string,
  nextArticlePath: string,
  feedback: string,
) {
  const currentFileName = path.posix.basename(currentArticlePath)
  const nextFileName = path.posix.basename(nextArticlePath)
  const today = new Date().toISOString().slice(0, 10)
  const compactFeedback = feedback.replace(/\s+/g, ' ').replaceAll('|', '\\|').slice(0, 160)
  let updatedPlan = planMarkdown

  updatedPlan = replacePlanLine(updatedPlan, '当前文章：', `\`${currentFileName}\``)
  updatedPlan = replacePlanLine(updatedPlan, '最近更新：', today)
  updatedPlan = replacePlanLine(updatedPlan, '状态：', `已生成 \`${nextFileName}\`，等待阅读反馈`)
  updatedPlan = replacePlanLine(updatedPlan, '下一步：', `打开 \`${nextFileName}\` 阅读`)

  const feedbackRow = `| \`${currentFileName}\` | ${compactFeedback} | 已生成 \`${nextFileName}\`，等待阅读反馈 |`
  const lines = updatedPlan.split(/\r?\n/)
  const feedbackRowIndex = lines.findIndex((line) => line.includes(`| \`${currentFileName}\` |`))

  if (feedbackRowIndex >= 0) {
    lines[feedbackRowIndex] = feedbackRow
    updatedPlan = lines.join('\n')
  }

  const marker = `<!-- interactive-study-boox:generated-next=${nextArticlePath} -->`

  if (!updatedPlan.includes(marker)) {
    const updateEntry = `- ${today}：根据 \`${currentFileName}\` 的反馈生成 \`${nextFileName}\`。 ${marker}`
    const updateHeading = '## 更新记录'
    const headingIndex = updatedPlan.indexOf(updateHeading)

    if (headingIndex >= 0) {
      const insertAt = headingIndex + updateHeading.length
      updatedPlan = `${updatedPlan.slice(0, insertAt)}\n\n${updateEntry}${updatedPlan.slice(insertAt)}`
    } else {
      updatedPlan = `${updatedPlan.trimEnd()}\n\n${updateHeading}\n\n${updateEntry}\n`
    }
  }

  return updatedPlan
}

async function scanFolder(absolutePath: string, relativePath: string): Promise<LibraryEntry[]> {
  const directoryEntries = await readdir(absolutePath, { withFileTypes: true })
  const readableEntries = directoryEntries
    .filter(
      (entry) =>
        entry.isDirectory() ||
        (entry.isFile() && entry.name.toLowerCase().endsWith('.md')),
    )
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1
      }

      return left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true })
    })

  const nodes: LibraryEntry[] = []

  for (const entry of readableEntries) {
    const childRelativePath = makeRelativePath(relativePath, entry.name)
    const childAbsolutePath = path.join(absolutePath, entry.name)

    if (entry.isDirectory()) {
      nodes.push({
        type: 'folder',
        name: entry.name,
        relativePath: childRelativePath,
        children: await scanFolder(childAbsolutePath, childRelativePath),
      })
      continue
    }

    nodes.push({
      type: 'article',
      fileName: entry.name,
      relativePath: childRelativePath,
    })
  }

  return nodes
}

async function saveGenerationOperationStatus(
  operation: GenerationOperation,
  status: GenerationOperation['status'],
  updates: Partial<GenerationOperation> = {},
) {
  operation.status = status
  Object.assign(operation, updates)
  await generationOperationStore.save(operation)
}

async function markGenerationOperationFailed(
  operation: GenerationOperation,
  code: string,
  message: string,
) {
  operation.status = 'failed'
  operation.error = { code, message }

  try {
    await generationOperationStore.save(operation)
  } catch (saveError) {
    console.error('Failed to persist generation failure state:', saveError)
  }
}

function getGenerationFailure(error: unknown, operation: GenerationOperation) {
  if (error instanceof ArticleFileError) {
    return { status: error.status, code: 'ARTICLE_FILE_ERROR', message: error.message }
  }

  if (error instanceof LearningContextError) {
    return { status: error.status, code: error.code, message: error.message }
  }

  if (error instanceof GeneratedLessonError) {
    return { status: 502, code: 'AI_OUTPUT_INVALID', message: error.message }
  }

  if (error instanceof WriteSafetyConflictError) {
    return { status: 409, code: 'WRITE_SAFETY_CONFLICT', message: error.message }
  }

  if (isMissingFileError(error)) {
    return { status: 404, code: 'ARTICLE_FILE_NOT_FOUND', message: '找不到当前 Markdown 文章。' }
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
    return {
      status: 409,
      code: 'NEXT_ARTICLE_EXISTS',
      message: '下一篇文章已经存在，请先确认是否需要重新生成。',
    }
  }

  if (operation.nextArticle?.afterHash && operation.plan?.afterHash) {
    return {
      status: 500,
      code: 'WRITE_COMMIT_UNCERTAIN',
      message: '生成结果可能已经写入学习库，但操作记录没有完成；请检查操作记录或执行回滚。',
    }
  }

  if (
    operation.status === 'next-article-writing' ||
    operation.status === 'next-article-written' ||
    operation.status === 'plan-writing' ||
    operation.status === 'plan-written'
  ) {
    return {
      status: 500,
      code: 'WRITE_COMMIT_FAILED',
      message: '生成结果已经部分写入，系统已尝试清理本次新文件；请检查操作状态后再重试。',
    }
  }

  return {
    status: 502,
    code: 'AI_GENERATION_FAILED',
    message: '反馈已经保存，但下一篇生成失败，可以重新尝试。',
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/ai/test', async (_request, response) => {
  try {
    const output = await generateText('请只回复：API 连接成功。')
    response.json({ output })
  } catch (error) {
    console.error('Failed to call OpenAI:', error)
    response.status(500).json({
      message: 'AI test request failed. Check the server terminal for details.',
    })
  }
})

app.get('/api/library', async (_request, response) => {
  try {
    const entries = await scanFolder(libraryRoot, '')

    response.json({ entries })
  } catch (error) {
    console.error('Failed to scan the study library:', error)
    response.status(500).json({ message: '无法读取测试学习库。' })
  }
})

app.get('/api/article', async (request, response) => {
  const resolution = resolveArticlePath(request.query.path)

  if (!resolution.ok) {
    response.status(resolution.status).json({ message: resolution.message })
    return
  }

  const { relativePath, absolutePath } = resolution.articlePath

  try {
    const fileInfo = await stat(absolutePath)

    if (!fileInfo.isFile()) {
      response.status(404).json({ message: '找不到这篇 Markdown 文章。' })
      return
    }

    const markdown = await readFile(absolutePath, 'utf8')
    const fileName = path.basename(absolutePath)
    const kind = getArticleKind(fileName, relativePath)
    const nextArticlePath = kind === 'lesson' ? getNextArticlePath(relativePath) : null
    const article: ArticleContent = {
      fileName,
      title: getArticleTitle(markdown, fileName),
      relativePath,
      kind,
      markdown,
      latestFeedback: getLatestFeedback(markdown),
      nextArticlePath,
      nextArticleExists:
        nextArticlePath !== null &&
        (await isRegularFilePath(path.resolve(libraryRoot, nextArticlePath))),
      generationInProgress: activeGenerationPaths.has(absolutePath),
    }

    response.json(article)
  } catch (error) {
    if (isMissingFileError(error)) {
      response.status(404).json({ message: '找不到这篇 Markdown 文章。' })
      return
    }

    console.error('Failed to read the Markdown article:', error)
    response.status(500).json({ message: '无法读取这篇 Markdown 文章。' })
  }
})

app.get('/api/learning/context-preview', async (request, response) => {
  try {
    const context = await buildLearningContext(libraryRoot, request.query.path)
    const files = [context.planFile, context.currentArticle, ...context.sourceFiles].map((file) => ({
      role: file.role,
      relativePath: file.relativePath,
      characters: file.markdown.length,
    }))

    response.json({
      projectPath: context.projectRelativePath,
      currentArticlePath: context.currentArticle.relativePath,
      nextArticlePath: context.nextArticlePath,
      currentSourcePaths: context.currentSourceRefs.map((sourceRef) => sourceRef.relativePath),
      nextSourcePaths: context.nextSourceRefs.map((sourceRef) => sourceRef.relativePath),
      files,
    })
  } catch (error) {
    if (error instanceof LearningContextError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          recoverable: false,
        },
      })
      return
    }

    console.error('Failed to build learning context preview:', error)
    response.status(500).json({
      error: {
        code: 'CONTEXT_PREVIEW_FAILED',
        message: '无法生成学习上下文预览。',
        recoverable: true,
      },
    })
  }
})

app.get('/api/learning/operations/:operationId', async (request, response) => {
  const operationId = request.params.operationId

  if (!isValidOperationId(operationId)) {
    response.status(400).json({ message: '生成操作标识无效。' })
    return
  }

  try {
    const operation = await generationOperationStore.get(operationId)

    if (!operation) {
      response.status(404).json({ message: '找不到这次生成操作。' })
      return
    }

    response.json(operation)
  } catch (error) {
    console.error('Failed to read generation operation:', error)
    response.status(500).json({ message: '无法读取生成操作记录。' })
  }
})

app.post('/api/learning/operations/:operationId/rollback', async (request, response) => {
  const operationId = request.params.operationId

  if (!isValidOperationId(operationId)) {
    response.status(400).json({ message: '生成操作标识无效。' })
    return
  }

  let operation: GenerationOperation | null

  try {
    operation = await generationOperationStore.get(operationId)
  } catch (error) {
    console.error('Failed to read generation operation for rollback:', error)
    response.status(500).json({ message: '无法读取生成操作记录。' })
    return
  }

  if (!operation) {
    response.status(404).json({ message: '找不到这次生成操作。' })
    return
  }

  if (operation.status === 'rolled-back') {
    response.json({
      operationId,
      status: operation.status,
      rolledBackFiles: operation.changedFiles,
      feedbackKept: operation.feedbackSaved,
    })
    return
  }

  const nextArticleRecord = operation.nextArticle
  const planRecord = operation.plan

  if (
    !nextArticleRecord?.afterHash ||
    !planRecord?.beforeHash ||
    !operation.changedFiles.includes(nextArticleRecord.relativePath)
  ) {
    response.status(409).json({
      error: {
        code: 'OPERATION_NOT_ROLLBACK_READY',
        message: '这次生成没有足够的快照和写入记录，暂时不能执行自动回滚。',
        recoverable: true,
      },
      operationId,
      feedbackSaved: operation.feedbackSaved,
    })
    return
  }

  // The operation may be `failed` or `interrupted` if the process stopped while
  // writing. We compare the current plan with both the before and after hash:
  // either the plan is still untouched (only remove the new article), or it is
  // exactly the generated version (restore the snapshot and remove the article).

  const currentArticleResolution = resolveArticlePath(operation.currentArticlePath)
  const nextArticleResolution = resolveArticlePath(nextArticleRecord.relativePath)
  const planResolution = resolveArticlePath(planRecord.relativePath)

  if (!currentArticleResolution.ok || !nextArticleResolution.ok || !planResolution.ok) {
    response.status(403).json({ message: '生成操作包含不在当前学习库内的文件。' })
    return
  }

  if (activeGenerationPaths.has(currentArticleResolution.articlePath.absolutePath)) {
    response.status(409).json({
      error: {
        code: 'GENERATION_IN_PROGRESS',
        message: '当前文章正在生成，请等待当前操作完成。',
        recoverable: true,
      },
      operationId,
    })
    return
  }

  if (activeRollbackOperationIds.has(operationId)) {
    response.status(409).json({
      error: {
        code: 'ROLLBACK_IN_PROGRESS',
        message: '这次生成正在撤销，请等待当前操作完成。',
        recoverable: true,
      },
      operationId,
    })
    return
  }

  const nextArticlePath = nextArticleResolution.articlePath.absolutePath
  const planPath = planResolution.articlePath.absolutePath

  activeRollbackOperationIds.add(operationId)

  try {
    const currentPlanHash = await hashFile(planPath)
    const planWasWritten = planRecord.afterHash !== undefined && currentPlanHash === planRecord.afterHash
    const planIsStillOriginal = currentPlanHash === planRecord.beforeHash

    if (!planWasWritten && !planIsStillOriginal) {
      throw new WriteSafetyConflictError('学习计划已经被其他操作修改，不能自动回滚。')
    }

    if (await isRegularFilePath(nextArticlePath)) {
      const currentNextArticleHash = await hashFile(nextArticlePath)

      if (currentNextArticleHash !== nextArticleRecord.afterHash) {
        throw new WriteSafetyConflictError('下一篇文章已经被其他操作修改，不能自动回滚。')
      }
    }

    if (planWasWritten) {
      await generationOperationStore.restoreSnapshot(operation, planRecord, planPath)
    }

    await generationOperationStore.deleteCreatedFileIfUnchanged(
      nextArticlePath,
      nextArticleRecord.afterHash,
    )

    operation.status = 'rolled-back'
    operation.error = undefined
    await generationOperationStore.save(operation)

    response.json({
      operationId,
      status: operation.status,
      rolledBackFiles: planWasWritten
        ? [nextArticleRecord.relativePath, planRecord.relativePath]
        : [nextArticleRecord.relativePath],
      feedbackKept: operation.feedbackSaved,
    })
  } catch (error) {
    if (error instanceof WriteSafetyConflictError) {
      response.status(409).json({
        error: {
          code: 'ROLLBACK_CONFLICT',
          message: error.message,
          recoverable: false,
        },
        operationId,
        feedbackSaved: operation.feedbackSaved,
      })
      return
    }

    console.error('Failed to roll back generation operation:', error)
    response.status(500).json({
      error: {
        code: 'ROLLBACK_FAILED',
        message: '回滚没有完整完成，请保留当前文件并检查操作记录。',
        recoverable: true,
      },
      operationId,
      feedbackSaved: operation.feedbackSaved,
    })
  } finally {
    activeRollbackOperationIds.delete(operationId)
  }
})

app.post('/api/learning/generate-next', async (request, response) => {
  const body = request.body as Partial<SaveFeedbackRequest> | undefined
  const validation = validateFeedbackRequest(body)

  if (!validation.ok) {
    response.status(validation.status).json({ message: validation.message })
    return
  }

  if (activeGenerationPaths.has(validation.request.absolutePath)) {
    response.status(409).json({
      error: {
        code: 'GENERATION_IN_PROGRESS',
        message: '当前文章正在生成下一篇，请等待当前请求完成。',
        recoverable: true,
      },
    })
    return
  }

  let operation: GenerationOperation

  try {
    await generationStoreReady
    operation = await generationOperationStore.create({
      currentArticlePath: validation.request.relativePath,
      feedbackSubmissionId: validation.request.submissionId,
    })
  } catch (error) {
    console.error('Failed to create generation operation:', error)
    response.status(500).json({
      error: {
        code: 'OPERATION_RECORD_FAILED',
        message: '无法创建生成操作记录，本次请求没有调用 AI。',
        recoverable: true,
      },
      feedbackSaved: false,
    })
    return
  }

  let feedbackSaved = false
  activeGenerationPaths.add(validation.request.absolutePath)

  try {
    const alreadySaved = await saveFeedbackToFile(validation.request)
    feedbackSaved = true
    operation.feedbackSaved = true
    await saveGenerationOperationStatus(operation, 'feedback-saved')

    const context = await buildLearningContext(libraryRoot, validation.request.relativePath)
    operation.nextArticlePath = context.nextArticlePath
    operation.planPath = context.planFile.relativePath
    if (await isRegularFilePath(context.nextArticleAbsolutePath)) {
      await markGenerationOperationFailed(
        operation,
        'NEXT_ARTICLE_EXISTS',
        `下一篇文章已经存在：${path.basename(context.nextArticleAbsolutePath)}`,
      )
      response.status(409).json({
        error: {
          code: 'NEXT_ARTICLE_EXISTS',
          message: `下一篇文章已经存在：${path.basename(context.nextArticleAbsolutePath)}`,
          recoverable: false,
        },
        feedbackSaved,
        alreadySaved,
        operationId: operation.operationId,
        nextArticlePath: context.nextArticlePath,
      })
      return
    }

    operation.nextArticle = {
      relativePath: context.nextArticlePath,
      createdByOperation: true,
    }
    operation.plan = await generationOperationStore.createSnapshot(
      operation,
      { relativePath: context.planFile.relativePath },
      context.planFile.absolutePath,
    )

    if (operation.plan.beforeHash !== hashText(context.planFile.markdown)) {
      throw new WriteSafetyConflictError('学习计划在生成前已经被其他操作修改，已停止本次生成。')
    }

    await saveGenerationOperationStatus(operation, 'snapshot-created')

    const prompt = buildNextLessonPrompt(context, validation.request.feedback)
    const generatedMarkdown = validateGeneratedLesson(await generateText(prompt))
    await saveGenerationOperationStatus(operation, 'ai-generated')
    operation.nextArticle = {
      ...operation.nextArticle,
      relativePath: context.nextArticlePath,
      afterHash: hashText(generatedMarkdown),
      createdByOperation: true,
    }
    await saveGenerationOperationStatus(operation, 'next-article-writing')

    await createFileAtomically(context.nextArticleAbsolutePath, generatedMarkdown, operation.operationId)
    operation.changedFiles = [context.nextArticlePath]
    await saveGenerationOperationStatus(operation, 'next-article-written')

    const updatedPlan = updatePlanAfterGeneration(
      context.planFile.markdown,
      context.currentArticle.relativePath,
      context.nextArticlePath,
      validation.request.feedback,
    )
    operation.plan = {
      ...operation.plan,
      relativePath: context.planFile.relativePath,
      afterHash: hashText(updatedPlan),
    }

    const currentPlanHashBeforeWrite = await hashFile(context.planFile.absolutePath)

    if (currentPlanHashBeforeWrite !== operation.plan.beforeHash) {
      throw new WriteSafetyConflictError('学习计划在 AI 生成期间已经被其他操作修改，已保留原文件。')
    }

    await saveGenerationOperationStatus(operation, 'plan-writing')
    await writeFileAtomically(context.planFile.absolutePath, updatedPlan, operation.operationId)
    operation.changedFiles = [context.nextArticlePath, context.planFile.relativePath]
    await saveGenerationOperationStatus(operation, 'plan-written')
    await saveGenerationOperationStatus(operation, 'committed')

    const nextFileName = path.basename(context.nextArticleAbsolutePath)
    response.status(201).json({
      feedbackSaved,
      alreadySaved,
      operationId: operation.operationId,
      changedFiles: operation.changedFiles,
      currentArticlePath: validation.request.relativePath,
      nextArticle: {
        fileName: nextFileName,
        title: getArticleTitle(generatedMarkdown, nextFileName),
        relativePath: context.nextArticlePath,
        kind: 'lesson',
      },
    })
  } catch (error) {
    const failure = getGenerationFailure(error, operation)
    const nextArticleRecord = operation.nextArticle
    const generatedArticleHash = nextArticleRecord?.afterHash
    let planWasWritten = false
    let planIsStillOriginal = false

    if (operation.plan && operation.planPath) {
      const planResolution = resolveArticlePath(operation.planPath)

      if (planResolution.ok && operation.plan.beforeHash) {
        try {
          const currentPlanHash = await hashFile(planResolution.articlePath.absolutePath)
          planWasWritten =
            operation.plan.afterHash !== undefined && currentPlanHash === operation.plan.afterHash
          planIsStillOriginal = currentPlanHash === operation.plan.beforeHash
        } catch (planError) {
          console.error('Failed to inspect the learning plan after a write error:', planError)
        }
      }
    }

    const shouldCleanUpCreatedArticle =
      operation.status !== 'committed' &&
      operation.status !== 'rolled-back' &&
      nextArticleRecord?.createdByOperation === true &&
      operation.nextArticlePath !== null &&
      operation.changedFiles.includes(operation.nextArticlePath) &&
      typeof generatedArticleHash === 'string' &&
      !planWasWritten &&
      planIsStillOriginal

    let cleanupMessage = ''

    if (shouldCleanUpCreatedArticle && operation.nextArticlePath) {
      try {
        const nextArticleResolution = resolveArticlePath(operation.nextArticlePath)

        if (nextArticleResolution.ok) {
          await generationOperationStore.deleteCreatedFileIfUnchanged(
            nextArticleResolution.articlePath.absolutePath,
            generatedArticleHash,
          )
        }
      } catch (cleanupError) {
        cleanupMessage = ' 自动清理新文件失败，请使用操作记录检查本次生成。'
        console.error('Failed to clean up generated lesson after a write error:', cleanupError)
      }
    }

    const failureMessage = `${failure.message}${cleanupMessage}`
    await markGenerationOperationFailed(operation, failure.code, failureMessage)

    console.error('Failed to generate the next lesson:', error)
    response.status(failure.status).json({
      error: {
        code: failure.code,
        message: failureMessage,
        recoverable: failure.status >= 500 || failure.code === 'WRITE_SAFETY_CONFLICT',
      },
      feedbackSaved,
      operationId: operation.operationId,
    })
  } finally {
    activeGenerationPaths.delete(validation.request.absolutePath)
  }
})

app.post('/api/feedback', async (request, response) => {
  const body = request.body as Partial<SaveFeedbackRequest> | undefined
  const validation = validateFeedbackRequest(body)

  if (!validation.ok) {
    response.status(validation.status).json({ message: validation.message })
    return
  }

  try {
    const alreadySaved = await saveFeedbackToFile(validation.request)

    response.json({
      feedbackSaved: true,
      currentArticlePath: validation.request.relativePath,
      submissionId: validation.request.submissionId,
      alreadySaved,
    })
  } catch (error) {
    if (error instanceof ArticleFileError) {
      response.status(error.status).json({ message: error.message })
      return
    }

    if (isMissingFileError(error)) {
      response.status(404).json({ message: '找不到这篇 Markdown 文章。' })
      return
    }

    console.error('Failed to save feedback:', error)
    response.status(500).json({ message: '无法保存反馈，请稍后重试。' })
  }
})

app.get('/api/sync/status', async (_request, response) => {
  response.json(await getSyncStatus())
})

app.post('/api/sync/push', async (request, response) => {
  const body = request.body as { message?: unknown } | undefined

  try {
    response.json(await pushSync(body?.message))
  } catch (error) {
    if (error instanceof GitSyncError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          recoverable: error.status >= 500,
        },
      })
      return
    }

    console.error('Failed to synchronize the learning repository:', error)
    response.status(500).json({
      error: {
        code: 'GIT_SYNC_FAILED',
        message: '同步学习资料失败，请检查服务端日志。',
        recoverable: true,
      },
    })
  }
})

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`)
})
