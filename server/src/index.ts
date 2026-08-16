import express from 'express'
import { appendFile, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { generateText } from './ai.js'
import { buildNextLessonPrompt } from './generationPrompt.js'
import { buildLearningContext, LearningContextError } from './learningContext.js'

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
// 开发期固定读取项目根目录下的测试学习库；以后会改为用户选择并保存的路径。
const libraryRoot = path.resolve(process.cwd(), '../sample-library')
const feedbackMarkerPrefix = '<!-- interactive-study-boox:feedback-submission-id='
const feedbackMarkerSuffix = ' -->'
const feedbackWriteLocks = new Map<string, Promise<void>>()
const activeGenerationPaths = new Set<string>()

app.use(express.json())

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

    await appendFile(
      request.absolutePath,
      formatFeedbackForAppend(markdown, request.feedback, request.submissionId),
      'utf8',
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

  let feedbackSaved = false
  activeGenerationPaths.add(validation.request.absolutePath)

  try {
    const alreadySaved = await saveFeedbackToFile(validation.request)
    feedbackSaved = true

    const context = await buildLearningContext(libraryRoot, validation.request.relativePath)

    if (await isRegularFilePath(context.nextArticleAbsolutePath)) {
      response.status(409).json({
        error: {
          code: 'NEXT_ARTICLE_EXISTS',
          message: `下一篇文章已经存在：${path.basename(context.nextArticleAbsolutePath)}`,
          recoverable: false,
        },
        feedbackSaved,
        alreadySaved,
        nextArticlePath: context.nextArticlePath,
      })
      return
    }

    const prompt = buildNextLessonPrompt(context, validation.request.feedback)
    const generatedMarkdown = validateGeneratedLesson(await generateText(prompt))

    await writeFile(context.nextArticleAbsolutePath, generatedMarkdown, {
      encoding: 'utf8',
      flag: 'wx',
    })

    const updatedPlan = updatePlanAfterGeneration(
      context.planFile.markdown,
      context.currentArticle.relativePath,
      context.nextArticlePath,
      validation.request.feedback,
    )
    await writeFile(context.planFile.absolutePath, updatedPlan, 'utf8')

    const nextFileName = path.basename(context.nextArticleAbsolutePath)
    response.status(201).json({
      feedbackSaved,
      alreadySaved,
      currentArticlePath: validation.request.relativePath,
      nextArticle: {
        fileName: nextFileName,
        title: getArticleTitle(generatedMarkdown, nextFileName),
        relativePath: context.nextArticlePath,
        kind: 'lesson',
      },
    })
  } catch (error) {
    if (error instanceof ArticleFileError) {
      response.status(error.status).json({ message: error.message, feedbackSaved })
      return
    }

    if (error instanceof LearningContextError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          recoverable: false,
        },
        feedbackSaved,
      })
      return
    }

    if (error instanceof GeneratedLessonError) {
      response.status(502).json({
        error: {
          code: 'AI_OUTPUT_INVALID',
          message: error.message,
          recoverable: true,
        },
        feedbackSaved,
      })
      return
    }

    if (isMissingFileError(error)) {
      response.status(404).json({
        error: {
          code: 'ARTICLE_FILE_NOT_FOUND',
          message: '找不到当前 Markdown 文章。',
          recoverable: false,
        },
        feedbackSaved,
      })
      return
    }

    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      response.status(409).json({
        error: {
          code: 'NEXT_ARTICLE_EXISTS',
          message: '下一篇文章已经存在，请先确认是否需要重新生成。',
          recoverable: false,
        },
        feedbackSaved,
      })
      return
    }

    console.error('Failed to generate the next lesson:', error)
    response.status(502).json({
      error: {
        code: 'AI_GENERATION_FAILED',
        message: '反馈已经保存，但下一篇生成失败，可以重新尝试。',
        recoverable: true,
      },
      feedbackSaved,
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

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`)
})
