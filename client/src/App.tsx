import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import LibraryTree from './components/LibraryTree'
import ReaderMenu from './components/ReaderMenu'
import ReaderPane from './components/ReaderPane'
import type { GenerationState } from './components/FeedbackPanel'
import {
  defaultArticlePath,
  findArticleContext,
  getNextArticle,
  mockLibrary,
} from './mockLibrary'
import type { ReadingPosition } from './types'

const expandedNodesStorageKey = 'interactive-study-boox.mock.expanded-nodes'
const lastArticleStorageKey = 'interactive-study-boox.mock.last-article'
const readingPositionStorageKey = 'interactive-study-boox.mock.reading-position'

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

function readInitialArticlePath() {
  const savedPath = readStorageValue(lastArticleStorageKey)

  return savedPath && findArticleContext(savedPath) ? savedPath : defaultArticlePath
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

function App() {
  const initialArticlePath = readInitialArticlePath()
  const [selectedArticlePath, setSelectedArticlePath] = useState(initialArticlePath)
  const [restoreScrollRatio, setRestoreScrollRatio] = useState(() =>
    readScrollRatio(initialArticlePath),
  )
  const [expandedNodes, setExpandedNodes] = useState(readExpandedNodes)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileView, setMobileView] = useState<'reader' | 'library'>('reader')
  const [readerMenuOpen, setReaderMenuOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [generationState, setGenerationState] = useState<GenerationState>('idle')
  const feedbackRef = useRef<HTMLTextAreaElement>(null)
  const generationTimerRef = useRef<number | null>(null)

  const currentContext = findArticleContext(selectedArticlePath)

  useEffect(() => {
    writeStorageValue(lastArticleStorageKey, selectedArticlePath)
  }, [selectedArticlePath])

  useEffect(() => {
    writeStorageValue(expandedNodesStorageKey, JSON.stringify(Array.from(expandedNodes)))
  }, [expandedNodes])

  useEffect(
    () => () => {
      if (generationTimerRef.current !== null) {
        window.clearTimeout(generationTimerRef.current)
      }
    },
    [],
  )

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

  const handleOpenArticle = useCallback((articlePath: string) => {
    if (!findArticleContext(articlePath)) {
      return
    }

    setSelectedArticlePath(articlePath)
    setRestoreScrollRatio(readScrollRatio(articlePath))
    setFeedback('')
    setGenerationState('idle')
    setMobileView('reader')
    setReaderMenuOpen(false)
  }, [])

  const handleReadingPositionChange = useCallback(
    (scrollRatio: number) => {
      const readingPosition: ReadingPosition = {
        articlePath: selectedArticlePath,
        scrollRatio,
      }

      writeStorageValue(readingPositionStorageKey, JSON.stringify(readingPosition))
    },
    [selectedArticlePath],
  )

  const handleSubmitFeedback = useCallback(() => {
    if (feedback.trim().length === 0 || generationState === 'generating') {
      return
    }

    if (generationTimerRef.current !== null) {
      window.clearTimeout(generationTimerRef.current)
    }

    setGenerationState('generating')
    generationTimerRef.current = window.setTimeout(() => {
      setFeedback('')
      setGenerationState('success')
      generationTimerRef.current = null
    }, 900)
  }, [feedback, generationState])

  const handleFocusFeedback = useCallback(() => {
    setMobileView('reader')
    setReaderMenuOpen(false)

    window.setTimeout(() => {
      feedbackRef.current?.scrollIntoView({ block: 'start' })
      feedbackRef.current?.focus({ preventScroll: true })
    }, 0)
  }, [])

  if (!currentContext) {
    return null
  }

  const nextArticle = getNextArticle(currentContext)
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

        <LibraryTree
          categories={mockLibrary}
          expandedNodes={expandedNodes}
          selectedArticlePath={selectedArticlePath}
          onToggleNode={handleToggleNode}
          onOpenArticle={handleOpenArticle}
        />
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

        <ReaderPane
          key={currentContext.article.path}
          article={currentContext.article}
          projectName={currentContext.project.name}
          restoreScrollRatio={restoreScrollRatio}
          feedback={feedback}
          feedbackRef={feedbackRef}
          generationState={generationState}
          nextArticleFileName={nextArticle?.fileName}
          onFeedbackChange={setFeedback}
          onSubmitFeedback={handleSubmitFeedback}
          onOpenNextArticle={() => {
            if (nextArticle) {
              handleOpenArticle(nextArticle.path)
            }
          }}
          onRetryGeneration={handleSubmitFeedback}
          onReadingPositionChange={handleReadingPositionChange}
          onReaderMenuGesture={() => setReaderMenuOpen((isOpen) => !isOpen)}
        />
      </main>

      <section className="mobile-library-screen" aria-label="学习库页面">
        <header className="mobile-library-header">
          <button type="button" onClick={() => setMobileView('reader')}>
            ← 返回文章
          </button>
          <h1>学习库</h1>
        </header>

        <LibraryTree
          categories={mockLibrary}
          expandedNodes={expandedNodes}
          selectedArticlePath={selectedArticlePath}
          onToggleNode={handleToggleNode}
          onOpenArticle={handleOpenArticle}
        />
      </section>

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
