import express from 'express'
import { appendFile, readFile, readdir, stat } from 'node:fs/promises'
import * as path from 'node:path'

type LibraryEntry = FolderNode | MarkdownFileNode
type ArticleKind = 'plan' | 'lesson' | 'other'

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
}

interface SaveFeedbackRequest {
  articlePath: string
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

const app = express()
const port = 3001
// 开发期固定读取项目根目录下的测试学习库；以后会改为用户选择并保存的路径。
const libraryRoot = path.resolve(process.cwd(), '../sample-library')
const feedbackMarkerPrefix = '<!-- interactive-study-boox:feedback-submission-id='
const feedbackMarkerSuffix = ' -->'
const feedbackWriteLocks = new Map<string, Promise<void>>()

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

function getArticleTitle(markdown: string, fileName: string) {
  const firstHeading = markdown.match(/^#\s+(.+?)\s*$/m)

  return firstHeading?.[1] ?? fileName.replace(/\.md$/i, '')
}

function getArticleKind(fileName: string): ArticleKind {
  if (fileName === '00-学习计划.md') {
    return 'plan'
  }

  if (/^\d{1,2}(?:[._-]|$)/.test(fileName)) {
    return 'lesson'
  }

  return 'other'
}

function isMissingFileError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
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
    const article: ArticleContent = {
      fileName,
      title: getArticleTitle(markdown, fileName),
      relativePath,
      kind: getArticleKind(fileName),
      markdown,
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

app.post('/api/feedback', async (request, response) => {
  const body = request.body as Partial<SaveFeedbackRequest> | undefined
  const resolution = resolveArticlePath(body?.articlePath)

  if (!resolution.ok) {
    response.status(resolution.status).json({ message: resolution.message })
    return
  }

  if (typeof body?.feedback !== 'string' || body.feedback.trim() === '') {
    response.status(400).json({ message: '反馈内容不能为空。' })
    return
  }

  if (!isValidSubmissionId(body.submissionId)) {
    response.status(400).json({ message: '反馈提交标识无效，请重新提交。' })
    return
  }

  const { relativePath, absolutePath } = resolution.articlePath
  const feedback = body.feedback.trim()
  const submissionId = body.submissionId

  try {
    const fileInfo = await stat(absolutePath)

    if (!fileInfo.isFile()) {
      response.status(404).json({ message: '找不到这篇 Markdown 文章。' })
      return
    }

    const alreadySaved = await withFeedbackWriteLock(absolutePath, async () => {
      const markdown = await readFile(absolutePath, 'utf8')
      const feedbackMarker = getFeedbackMarker(submissionId)

      if (markdown.includes(feedbackMarker)) {
        return true
      }

      await appendFile(absolutePath, formatFeedbackForAppend(markdown, feedback, submissionId), 'utf8')
      return false
    })

    response.json({
      feedbackSaved: true,
      currentArticlePath: relativePath,
      submissionId,
      alreadySaved,
    })
  } catch (error) {
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
