import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { generateNextLesson, loadArticle, loadLibrary, saveFeedback } from './api'
import LibraryTree from './components/LibraryTree'
import ReaderMenu from './components/ReaderMenu'
import ReaderPane from './components/ReaderPane'
import type { ArticleContent, GenerationState, LibraryEntry, ReadingPosition } from './types'

const expandedNodesStorageKey = 'interactive-study-boox.expanded-nodes'
const lastArticleStorageKey = 'interactive-study-boox.last-article'
const readingPositionStorageKey = 'interactive-study-boox.reading-position'

interface FeedbackStatus {
  kind: 'success' | 'error'
  message: string
}

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

function createSubmissionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false)
  const [isNextLessonGenerating, setIsNextLessonGenerating] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus | null>(null)
  const feedbackRef = useRef<HTMLTextAreaElement>(null)
  const savedArticlePathRef = useRef(readStorageValue(lastArticleStorageKey))
  const latestArticleRequestRef = useRef(0)
  const latestFeedbackRequestRef = useRef(0)
  const latestGenerationRequestRef = useRef(0)
  const pendingFeedbackSubmissionRef = useRef<{ feedback: string; submissionId: string } | null>(null)

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
    latestFeedbackRequestRef.current += 1
    latestGenerationRequestRef.current += 1
    pendingFeedbackSubmissionRef.current = null
    setSelectedArticlePath(articlePath)
    setCurrentArticle(null)
    setArticleError(null)
    setIsArticleLoading(true)
    setIsFeedbackSaving(false)
    setIsNextLessonGenerating(false)
    setFeedbackStatus(null)
    setMobileView('reader')
    setReaderMenuOpen(false)

    try {
      const article = await loadArticle(articlePath)

      if (requestId !== latestArticleRequestRef.current) {
        return
      }

      setCurrentArticle(article)
      setRestoreScrollRatio(readScrollRatio(article.relativePath))
      setFeedback(article.latestFeedback?.feedback ?? '')
      pendingFeedbackSubmissionRef.current = article.latestFeedback
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

  const handleFeedbackChange = useCallback((value: string) => {
    setFeedback(value)
    setFeedbackStatus(null)

    if (pendingFeedbackSubmissionRef.current?.feedback !== value) {
      pendingFeedbackSubmissionRef.current = null
    }
  }, [])

  const handleSaveFeedback = useCallback(async () => {
    if (!currentArticle || feedback.trim() === '') {
      return
    }

    const existingSubmission = pendingFeedbackSubmissionRef.current
    const submissionId =
      existingSubmission?.feedback === feedback ? existingSubmission.submissionId : createSubmissionId()
    const requestId = latestFeedbackRequestRef.current + 1

    latestFeedbackRequestRef.current = requestId
    pendingFeedbackSubmissionRef.current = { feedback, submissionId }
    setIsFeedbackSaving(true)
    setFeedbackStatus(null)

    try {
      const result = await saveFeedback({
        articlePath: currentArticle.relativePath,
        feedback: feedback.trim(),
        submissionId,
      })

      if (requestId !== latestFeedbackRequestRef.current) {
        return
      }

      setCurrentArticle((previousArticle) =>
        previousArticle
          ? {
              ...previousArticle,
              latestFeedback: {
                feedback: feedback.trim(),
                submissionId,
              },
            }
          : previousArticle,
      )
      setFeedbackStatus({
        kind: 'success',
        message: result.alreadySaved
          ? '这份反馈此前已经保存，系统没有重复写入。'
          : '反馈已安全保存到当前 Markdown 文件。',
      })
    } catch (error) {
      if (requestId !== latestFeedbackRequestRef.current) {
        return
      }

      setFeedbackStatus({
        kind: 'error',
        message: getErrorMessage(error, '暂时无法保存反馈，草稿仍保留在输入框中。'),
      })
    } finally {
      if (requestId === latestFeedbackRequestRef.current) {
        setIsFeedbackSaving(false)
      }
    }
  }, [currentArticle, feedback])

  const handleGenerateNextLesson = useCallback(async () => {
    const savedFeedback = currentArticle?.latestFeedback?.feedback.trim() ?? ''
    const effectiveFeedback = feedback.trim() || savedFeedback

    if (
      !currentArticle ||
      effectiveFeedback === '' ||
      currentArticle.nextArticleExists ||
      currentArticle.generationInProgress
    ) {
      return
    }

    const existingSubmission = pendingFeedbackSubmissionRef.current
    const submissionId =
      feedback.trim() === '' && currentArticle.latestFeedback
        ? currentArticle.latestFeedback.submissionId
        : existingSubmission?.feedback === feedback
          ? existingSubmission.submissionId
          : createSubmissionId()
    const requestId = latestGenerationRequestRef.current + 1

    latestGenerationRequestRef.current = requestId
    pendingFeedbackSubmissionRef.current = { feedback: effectiveFeedback, submissionId }
    setIsNextLessonGenerating(true)
    setCurrentArticle((previousArticle) =>
      previousArticle ? { ...previousArticle, generationInProgress: true } : previousArticle,
    )
    setFeedbackStatus(null)

    try {
      const result = await generateNextLesson({
        articlePath: currentArticle.relativePath,
        feedback: effectiveFeedback,
        submissionId,
      })

      if (requestId !== latestGenerationRequestRef.current) {
        return
      }

      pendingFeedbackSubmissionRef.current = null
      setFeedback('')
      setFeedbackStatus({
        kind: 'success',
        message: `下一篇已生成：${result.nextArticle.fileName}。当前仍停留在这篇文章。`,
      })
      setCurrentArticle((previousArticle) =>
        previousArticle
          ? { ...previousArticle, generationInProgress: false, nextArticleExists: true }
          : previousArticle,
      )
      setLibraryRequestVersion((previousVersion) => previousVersion + 1)
    } catch (error) {
      if (requestId !== latestGenerationRequestRef.current) {
        return
      }

      setFeedbackStatus({
        kind: 'error',
        message: getErrorMessage(error, '反馈已保存，但下一篇生成失败；可以保留草稿后重试。'),
      })
    } finally {
      if (requestId === latestGenerationRequestRef.current) {
        setIsNextLessonGenerating(false)
        setCurrentArticle((previousArticle) =>
          previousArticle ? { ...previousArticle, generationInProgress: false } : previousArticle,
        )
      }
    }
  }, [currentArticle, feedback])

  useEffect(() => {
    if (!currentArticle?.generationInProgress) {
      return
    }

    const articlePath = currentArticle.relativePath
    let isCurrentRequest = true

    const refreshGenerationState = async () => {
      try {
        const article = await loadArticle(articlePath)

        if (!isCurrentRequest || article.relativePath !== articlePath) {
          return
        }

        if (!article.generationInProgress) {
          setCurrentArticle(article)
          setFeedback(article.latestFeedback?.feedback ?? '')
          pendingFeedbackSubmissionRef.current = article.latestFeedback
        }
      } catch {
        // 生成状态查询失败时保留当前页面状态，下一轮继续尝试。
      }
    }

    const timer = window.setInterval(() => {
      void refreshGenerationState()
    }, 1500)

    return () => {
      isCurrentRequest = false
      window.clearInterval(timer)
    }
  }, [currentArticle])

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

    const generationState: GenerationState =
      currentArticle.generationInProgress || isNextLessonGenerating
        ? 'in-progress'
        : currentArticle.nextArticleExists
          ? 'completed'
          : 'ready'

    return (
      <ReaderPane
        key={currentArticle.relativePath}
        article={currentArticle}
        projectName={getProjectName(currentArticle.relativePath)}
        restoreScrollRatio={restoreScrollRatio}
        feedback={feedback}
        feedbackRef={feedbackRef}
        feedbackStatus={feedbackStatus}
        isFeedbackSaving={isFeedbackSaving}
        isNextLessonGenerating={isNextLessonGenerating}
        generationState={generationState}
        hasSavedFeedback={Boolean(currentArticle.latestFeedback?.feedback.trim())}
        onFeedbackChange={handleFeedbackChange}
        onSaveFeedback={handleSaveFeedback}
        onGenerateNextLesson={handleGenerateNextLesson}
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
