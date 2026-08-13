import express from 'express'
import { readFile, readdir, stat } from 'node:fs/promises'
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

const app = express()
const port = 3001
// 开发期固定读取项目根目录下的测试学习库；以后会改为用户选择并保存的路径。
const libraryRoot = path.resolve(process.cwd(), '../sample-library')

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
  const requestedPath = request.query.path

  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    response.status(400).json({ message: '请提供 Markdown 文件的相对路径。' })
    return
  }

  const relativePath = normalizeRelativePath(requestedPath)

  if (!relativePath.toLowerCase().endsWith('.md')) {
    response.status(400).json({ message: '只能读取 Markdown 文件。' })
    return
  }

  const absolutePath = path.resolve(libraryRoot, relativePath)

  if (!isPathInsideLibrary(absolutePath)) {
    response.status(403).json({ message: '不能读取学习库之外的文件。' })
    return
  }

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

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`)
})
