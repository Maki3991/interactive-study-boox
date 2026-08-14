import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { ArticleContent } from '../types'
import FeedbackPanel from './FeedbackPanel'

interface ReaderPaneProps {
  article: ArticleContent
  projectName: string
  restoreScrollRatio: number
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  onFeedbackChange: (value: string) => void
  onReadingPositionChange: (scrollRatio: number) => void
  onReaderMenuGesture: () => void
}

function isNarrowScreen() {
  return window.matchMedia('(max-width: 900px)').matches
}

function ReaderPane({
  article,
  projectName,
  restoreScrollRatio,
  feedback,
  feedbackRef,
  onFeedbackChange,
  onReadingPositionChange,
  onReaderMenuGesture,
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
          <p className="markdown-source-notice">
            当前显示的是后端读取到的原始 Markdown；阅读排版将在下一步接入。
          </p>
          <pre className="markdown-source">{article.markdown}</pre>
        </article>

        <FeedbackPanel
          feedback={feedback}
          feedbackRef={feedbackRef}
          onFeedbackChange={onFeedbackChange}
        />
      </div>
    </section>
  )
}

export default ReaderPane
