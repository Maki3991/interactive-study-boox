import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { loadArticle, loadLibrary } from './api'
import LibraryTree from './components/LibraryTree'
import ReaderMenu from './components/ReaderMenu'
import ReaderPane from './components/ReaderPane'
import type { ArticleContent, LibraryEntry, ReadingPosition } from './types'

const expandedNodesStorageKey = 'interactive-study-boox.expanded-nodes'
const lastArticleStorageKey = 'interactive-study-boox.last-article'
const readingPositionStorageKey = 'interactive-study-boox.reading-position'

function readStorageValue(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 静态原型在浏览器拒绝本地存储时仍可继续使用，只是不保留偏好。
  }
}

function readExpandedNodes() {
  const savedValue = readStorageValue(expandedNodesStorageKey)

  if (!savedValue) {
    return new Set<string>()
  }

  try {
    const parsedValue: unknown = JSON.parse(savedValue)

    if (Array.isArray(parsedValue) && parsedValue.every((node) => typeof node === 'string')) {
      return new Set(parsedValue)
    }
  } catch {
    // 损坏的原型偏好不应阻止页面启动。
  }

  return new Set<string>()
}

function readScrollRatio(articlePath: string) {
  const savedValue = readStorageValue(readingPositionStorageKey)

  if (!savedValue) {
    return 0
  }

  try {
    const position = JSON.parse(savedValue) as Partial<ReadingPosition>

    if (
      position.articlePath === articlePath &&
      typeof position.scrollRatio === 'number' &&
      Number.isFinite(position.scrollRatio)
    ) {
      return Math.min(Math.max(position.scrollRatio, 0), 1)
    }
  } catch {
    // 损坏的原型偏好不应阻止文章阅读。
  }

  return 0
}

function hasArticle(entries: LibraryEntry[], articlePath: string): boolean {
  return entries.some((entry) => {
    if (entry.type === 'article') {
      return entry.relativePath === articlePath
    }

    return hasArticle(entry.children, articlePath)
  })
}

function getProjectName(articlePath: string) {
  const pathParts = articlePath.split('/')

  return pathParts.length > 1 ? pathParts[pathParts.length - 2] : '学习库'
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message ? error.message : fallbackMessage
}

function App() {
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [libraryRequestVersion, setLibraryRequestVersion] = useState(0)
  const [currentArticle, setCurrentArticle] = useState<ArticleContent | null>(null)
  const [isArticleLoading, setIsArticleLoading] = useState(false)
  const [articleError, setArticleError] = useState<string | null>(null)
  const [selectedArticlePath, setSelectedArticlePath] = useState('')
  const [restoreScrollRatio, setRestoreScrollRatio] = useState(0)
  const [expandedNodes, setExpandedNodes] = useState(readExpandedNodes)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'reader' | 'library'>('reader')
  const [readerMenuOpen, setReaderMenuOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const feedbackRef = useRef<HTMLTextAreaElement>(null)
  const savedArticlePathRef = useRef(readStorageValue(lastArticleStorageKey))
  const latestArticleRequestRef = useRef(0)

  useEffect(() => {
    if (currentArticle) {
      writeStorageValue(lastArticleStorageKey, currentArticle.relativePath)
    }
  }, [currentArticle])

  useEffect(() => {
    writeStorageValue(expandedNodesStorageKey, JSON.stringify(Array.from(expandedNodes)))
  }, [expandedNodes])

  const handleToggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((previousNodes) => {
      const nextNodes = new Set(previousNodes)

      if (nextNodes.has(nodeId)) {
        nextNodes.delete(nodeId)
      } else {
        nextNodes.add(nodeId)
      }

      return nextNodes
    })
  }, [])

  const handleOpenArticle = useCallback(async (articlePath: string) => {
    const requestId = latestArticleRequestRef.current + 1
    latestArticleRequestRef.current = requestId
    setSelectedArticlePath(articlePath)
    setCurrentArticle(null)
    setArticleError(null)
    setIsArticleLoading(true)
    setMobileView('reader')
    setReaderMenuOpen(false)

    try {
      const article = await loadArticle(articlePath)

      if (requestId !== latestArticleRequestRef.current) {
        return
      }

      setCurrentArticle(article)
      setRestoreScrollRatio(readScrollRatio(article.relativePath))
      setFeedback('')
    } catch (error) {
      if (requestId !== latestArticleRequestRef.current) {
        return
      }

      setArticleError(getErrorMessage(error, '无法打开这篇 Markdown 文章。'))
    } finally {
      if (requestId === latestArticleRequestRef.current) {
        setIsArticleLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let isCurrentRequest = true

    loadLibrary()
      .then((library) => {
        if (!isCurrentRequest) {
          return
        }

        setLibraryEntries(library.entries)

        const savedArticlePath = savedArticlePathRef.current
        savedArticlePathRef.current = null

        if (savedArticlePath && hasArticle(library.entries, savedArticlePath)) {
          void handleOpenArticle(savedArticlePath)
        }
      })
      .catch((error: unknown) => {
        if (isCurrentRequest) {
          setLibraryError(getErrorMessage(error, '无法读取测试学习库。'))
        }
      })
      .finally(() => {
        if (isCurrentRequest) {
          setIsLibraryLoading(false)
        }
      })

    return () => {
      isCurrentRequest = false
    }
  }, [handleOpenArticle, libraryRequestVersion])

  const handleRetryLibrary = useCallback(() => {
    setIsLibraryLoading(true)
    setLibraryError(null)
    setLibraryRequestVersion((previousVersion) => previousVersion + 1)
  }, [])

  const handleReadingPositionChange = useCallback(
    (scrollRatio: number) => {
      if (!currentArticle) {
        return
      }

      const readingPosition: ReadingPosition = {
        articlePath: currentArticle.relativePath,
        scrollRatio,
      }

      writeStorageValue(readingPositionStorageKey, JSON.stringify(readingPosition))
    },
    [currentArticle],
  )

  const handleFocusFeedback = useCallback(() => {
    setMobileView('reader')
    setReaderMenuOpen(false)

    window.setTimeout(() => {
      feedbackRef.current?.scrollIntoView({ block: 'start' })
      feedbackRef.current?.focus({ preventScroll: true })
    }, 0)
  }, [])

  const handleShowLibrary = useCallback(() => {
    setSidebarOpen(true)
    setMobileView('library')
    setReaderMenuOpen(false)
  }, [])

  const renderLibraryContent = () => {
    if (isLibraryLoading) {
      return <p className="library-state" role="status">正在读取学习库……</p>
    }

    if (libraryError) {
      return (
        <div className="library-state library-state-error" role="alert">
          <p>{libraryError}</p>
          <button className="text-button" type="button" onClick={handleRetryLibrary}>
            重新读取
          </button>
        </div>
      )
    }

    if (libraryEntries.length === 0) {
      return <p className="library-state">测试学习库中暂无 Markdown 文件。</p>
    }

    return (
      <LibraryTree
        entries={libraryEntries}
        expandedNodes={expandedNodes}
        selectedArticlePath={selectedArticlePath}
        onToggleNode={handleToggleNode}
        onOpenArticle={handleOpenArticle}
      />
    )
  }

  const renderReaderContent = () => {
    if (isLibraryLoading) {
      return <section className="reader-status" role="status">正在读取学习库……</section>
    }

    if (libraryError) {
      return (
        <section className="reader-status" role="alert">
          <p>{libraryError}</p>
          <button className="text-button" type="button" onClick={handleRetryLibrary}>
            重新读取学习库
          </button>
        </section>
      )
    }

    if (isArticleLoading) {
      return <section className="reader-status" role="status">正在打开文章……</section>
    }

    if (articleError) {
      return (
        <section className="reader-status" role="alert">
          <p>{articleError}</p>
          <button className="text-button" type="button" onClick={handleShowLibrary}>
            打开学习库
          </button>
        </section>
      )
    }

    if (!currentArticle) {
      return (
        <section className="reader-status">
          <p>从学习库选择一篇 Markdown 文章开始阅读。</p>
          <button className="text-button" type="button" onClick={handleShowLibrary}>
            打开学习库
          </button>
        </section>
      )
    }

    return (
      <ReaderPane
        key={currentArticle.relativePath}
        article={currentArticle}
        projectName={getProjectName(currentArticle.relativePath)}
        restoreScrollRatio={restoreScrollRatio}
        feedback={feedback}
        feedbackRef={feedbackRef}
        onFeedbackChange={setFeedback}
        onReadingPositionChange={handleReadingPositionChange}
        onReaderMenuGesture={() => setReaderMenuOpen((isOpen) => !isOpen)}
        onOpenArticle={handleOpenArticle}
      />
    )
  }

  const appClassName = [
    'app-shell',
    sidebarOpen ? '' : 'sidebar-is-collapsed',
    mobileView === 'library' ? 'mobile-library-is-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={appClassName}>
      <aside className="desktop-sidebar">
        <header className="library-panel-header">
          <div>
            <p className="eyebrow">Interactive Study</p>
            <h1>学习库</h1>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="收起学习库"
            title="收起学习库"
            onClick={() => setSidebarOpen(false)}
          >
            ‹
          </button>
        </header>

        {renderLibraryContent()}
      </aside>

      <main className="reading-workspace">
        {!sidebarOpen && (
          <button
            className="expand-library-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
          >
            ☰ 学习库
          </button>
        )}

        {renderReaderContent()}
      </main>

      {mobileView === 'library' && (
        <button
          className="mobile-library-dismiss-area"
          type="button"
          aria-label="关闭学习库，返回文章"
          onClick={() => setMobileView('reader')}
        />
      )}

      <aside className="mobile-library-drawer" aria-label="学习库抽屉">
        <header className="mobile-library-header">
          <button type="button" onClick={() => setMobileView('reader')}>
            ← 返回文章
          </button>
          <h1>学习库</h1>
        </header>

        {renderLibraryContent()}
      </aside>

      <ReaderMenu
        open={readerMenuOpen}
        onOpenLibrary={() => {
          setReaderMenuOpen(false)
          setMobileView('library')
        }}
        onFocusFeedback={handleFocusFeedback}
      />
    </div>
  )
}

export default App
