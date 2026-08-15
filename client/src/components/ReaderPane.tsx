import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import Markdown from 'react-markdown'
import type { ArticleContent } from '../types'
import FeedbackPanel from './FeedbackPanel'

interface ReaderPaneProps {
  article: ArticleContent
  projectName: string
  restoreScrollRatio: number
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  feedbackStatus: { kind: 'success' | 'error'; message: string } | null
  isFeedbackSaving: boolean
  isNextLessonGenerating: boolean
  onFeedbackChange: (value: string) => void
  onSaveFeedback: () => void | Promise<void>
  onGenerateNextLesson: () => void | Promise<void>
  onReadingPositionChange: (scrollRatio: number) => void
  onReaderMenuGesture: () => void
  onOpenArticle: (articlePath: string) => void | Promise<void>
}

function isNarrowScreen() {
  return window.matchMedia('(max-width: 900px)').matches
}

function resolveMarkdownArticlePath(href: string | undefined, currentArticlePath: string) {
  if (!href || href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href)) {
    return null
  }

  const markdownPath = href.split('#', 1)[0].split('?', 1)[0]

  if (!markdownPath.toLowerCase().endsWith('.md')) {
    return null
  }

  const currentDirectory = currentArticlePath.slice(0, currentArticlePath.lastIndexOf('/') + 1)

  try {
    const resolvedUrl = new URL(markdownPath, `https://study-library.local/${currentDirectory}`)

    return decodeURIComponent(resolvedUrl.pathname.replace(/^\//, ''))
  } catch {
    return null
  }
}

function ReaderPane({
  article,
  projectName,
  restoreScrollRatio,
  feedback,
  feedbackRef,
  feedbackStatus,
  isFeedbackSaving,
  isNextLessonGenerating,
  onFeedbackChange,
  onSaveFeedback,
  onGenerateNextLesson,
  onReadingPositionChange,
  onReaderMenuGesture,
  onOpenArticle,
}: ReaderPaneProps) {
  const readerScrollRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<number | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const readerScroll = readerScrollRef.current

      if (!readerScroll) {
        return
      }

      const maxScrollTop = Math.max(readerScroll.scrollHeight - readerScroll.clientHeight, 0)
      readerScroll.scrollTop = Math.round(maxScrollTop * restoreScrollRatio)
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [article.relativePath, restoreScrollRatio])

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    },
    [],
  )

  const handleScroll = () => {
    const readerScroll = readerScrollRef.current

    if (!readerScroll) {
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      const maxScrollTop = Math.max(readerScroll.scrollHeight - readerScroll.clientHeight, 0)
      const scrollRatio = maxScrollTop === 0 ? 0 : readerScroll.scrollTop / maxScrollTop
      onReadingPositionChange(scrollRatio)
    }, 400)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isNarrowScreen()) {
      return
    }

    const target = event.target

    if (
      target instanceof HTMLElement &&
      target.closest('button, textarea, input, a, label') !== null
    ) {
      return
    }

    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerStart = pointerStartRef.current
    pointerStartRef.current = null

    if (!pointerStart || !isNarrowScreen()) {
      return
    }

    const horizontalMovement = Math.abs(event.clientX - pointerStart.x)
    const verticalMovement = Math.abs(event.clientY - pointerStart.y)
    const readerBounds = event.currentTarget.getBoundingClientRect()
    const isShortPress = horizontalMovement < 12 && verticalMovement < 12
    const isLowerQuarter = event.clientY >= readerBounds.top + readerBounds.height * 0.75
    const isCentralArea =
      event.clientX >= readerBounds.left + readerBounds.width * 0.2 &&
      event.clientX <= readerBounds.right - readerBounds.width * 0.2

    if (isShortPress && isLowerQuarter && isCentralArea) {
      onReaderMenuGesture()
    }
  }

  return (
    <section className="reader-pane" aria-label="文章阅读区">
      <header className="reader-header">
        <p className="reader-project-name">{projectName}</p>
        <p className="reader-file-name">{article.fileName}</p>
      </header>

      <div
        className="reader-scroll"
        ref={readerScrollRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <article className="markdown-article">
          <Markdown
            skipHtml
            components={{
              a({ href, children }) {
                const linkedArticlePath = resolveMarkdownArticlePath(href, article.relativePath)

                if (linkedArticlePath) {
                  return (
                    <button
                      className="markdown-link"
                      type="button"
                      onClick={() => void onOpenArticle(linkedArticlePath)}
                    >
                      {children}
                    </button>
                  )
                }

                return (
                  <a
                    href={href}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noreferrer' : undefined}
                  >
                    {children}
                  </a>
                )
              },
            }}
          >
            {article.markdown}
          </Markdown>
        </article>

        <FeedbackPanel
          feedback={feedback}
          feedbackRef={feedbackRef}
          feedbackStatus={feedbackStatus}
          isSaving={isFeedbackSaving}
          isGenerating={isNextLessonGenerating}
          onFeedbackChange={onFeedbackChange}
          onSave={onSaveFeedback}
          onGenerate={onGenerateNextLesson}
        />
      </div>
    </section>
  )
}

export default ReaderPane
