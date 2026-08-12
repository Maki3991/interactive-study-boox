import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { ArticleBlock, MockArticle } from '../types'
import FeedbackPanel, { type GenerationState } from './FeedbackPanel'

interface ReaderPaneProps {
  article: MockArticle
  projectName: string
  restoreScrollRatio: number
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  generationState: GenerationState
  nextArticleFileName?: string
  onFeedbackChange: (value: string) => void
  onSubmitFeedback: () => void
  onOpenNextArticle: () => void
  onRetryGeneration: () => void
  onReadingPositionChange: (scrollRatio: number) => void
  onReaderMenuGesture: () => void
}

function renderBlock(block: ArticleBlock, index: number) {
  const key = `${block.kind}-${index}`

  if (block.kind === 'heading') {
    if (block.level === 1) {
      return (
        <h1 className="reader-heading reader-heading-1" key={key}>
          {block.text}
        </h1>
      )
    }

    if (block.level === 2) {
      return (
        <h2 className="reader-heading reader-heading-2" key={key}>
          {block.text}
        </h2>
      )
    }

    return (
      <h3 className="reader-heading reader-heading-3" key={key}>
        {block.text}
      </h3>
    )
  }

  if (block.kind === 'quote') {
    return <blockquote key={key}>{block.text}</blockquote>
  }

  if (block.kind === 'list') {
    return (
      <ul key={key}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }

  return <p key={key}>{block.text}</p>
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
  generationState,
  nextArticleFileName,
  onFeedbackChange,
  onSubmitFeedback,
  onOpenNextArticle,
  onRetryGeneration,
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
  }, [article.path, restoreScrollRatio])

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
          {article.blocks.map((block, index) => renderBlock(block, index))}
        </article>

        <FeedbackPanel
          feedback={feedback}
          feedbackRef={feedbackRef}
          generationState={generationState}
          nextArticleFileName={nextArticleFileName}
          onFeedbackChange={onFeedbackChange}
          onSubmit={onSubmitFeedback}
          onOpenNextArticle={onOpenNextArticle}
          onRetry={onRetryGeneration}
        />
      </div>
    </section>
  )
}

export default ReaderPane
