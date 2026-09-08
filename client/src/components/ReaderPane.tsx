import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import Markdown from 'react-markdown'
import {
  applyStudyAnnotations,
  assignStudyParagraphIndices,
  captureStudySelection,
  normalizeStudyText,
  stripStudyMarkupForRender,
  type StudySelectionAnchor,
} from '../annotations'
import type {
  ArticleContent,
  GenerationState,
  StudyAnnotationInput,
  StudyAnnotationOperation,
} from '../types'
import FeedbackPanel from './FeedbackPanel'

interface ReaderPaneProps {
  article: ArticleContent
  projectName: string
  restoreScrollRatio: number
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  floatingFeedbackRef: RefObject<HTMLTextAreaElement | null>
  feedbackDialogOpen: boolean
  feedbackStatus: { kind: 'success' | 'error'; message: string } | null
  isFeedbackSaving: boolean
  isNextLessonGenerating: boolean
  generationState: GenerationState
  generationRecovery: { changedFiles: string[] } | null
  isRollingBack: boolean
  hasSavedFeedback: boolean
  syncPanelOpen: boolean
  onFeedbackChange: (value: string) => void
  onOpenFeedbackDialog: () => void
  onCloseFeedbackDialog: () => void
  onSaveFeedback: () => void | Promise<void>
  onSaveAnnotation: (
    operation: StudyAnnotationOperation,
    annotation: StudyAnnotationInput,
  ) => void | Promise<void>
  onGenerateNextLesson: () => void | Promise<void>
  onRollback: () => void | Promise<void>
  onReadingPositionChange: (scrollRatio: number) => void
  onReaderMenuGesture: () => void
  onToggleSyncPanel: () => void
  onOpenArticle: (articlePath: string) => void | Promise<void>
}

interface AnnotationPopoverPosition {
  id: string
  top: number
  left: number
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

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '标记保存失败，请刷新文章后重试。'
}

function getToolbarStyle(anchor: StudySelectionAnchor, width = 270) {
  const maxLeft = Math.max(8, window.innerWidth - width - 8)
  const left = Math.min(Math.max(anchor.rect.right - width, 8), maxLeft)
  const top = Math.max(8, anchor.rect.top - 52)

  return { top, left }
}

function getAnnotationInput(annotation: StudySelectionAnchor): StudyAnnotationInput {
  return {
    id: annotation.id,
    flags: annotation.flags,
    note: annotation.note,
    segments: annotation.segments,
  }
}

function ReaderPane({
  article,
  projectName,
  restoreScrollRatio,
  feedback,
  feedbackRef,
  floatingFeedbackRef,
  feedbackDialogOpen,
  feedbackStatus,
  isFeedbackSaving,
  isNextLessonGenerating,
  generationState,
  generationRecovery,
  isRollingBack,
  hasSavedFeedback,
  syncPanelOpen,
  onFeedbackChange,
  onOpenFeedbackDialog,
  onCloseFeedbackDialog,
  onSaveFeedback,
  onSaveAnnotation,
  onGenerateNextLesson,
  onRollback,
  onReadingPositionChange,
  onReaderMenuGesture,
  onToggleSyncPanel,
  onOpenArticle,
}: ReaderPaneProps) {
  const readerScrollRef = useRef<HTMLDivElement>(null)
  const articleRootRef = useRef<HTMLElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<number | null>(null)
  const selectionCaptureTimerRef = useRef<number | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<StudySelectionAnchor | null>(null)
  const [commentEditorOpen, setCommentEditorOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [annotationError, setAnnotationError] = useState<string | null>(null)
  const [isAnnotationSaving, setIsAnnotationSaving] = useState(false)
  const [annotationPopover, setAnnotationPopover] = useState<AnnotationPopoverPosition | null>(null)

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

      if (selectionCaptureTimerRef.current !== null) {
        window.cancelAnimationFrame(selectionCaptureTimerRef.current)
      }
    },
    [],
  )

  useLayoutEffect(() => {
    const articleRoot = articleRootRef.current

    if (articleRoot) {
      assignStudyParagraphIndices(articleRoot)
      applyStudyAnnotations(articleRoot, article.annotations)
    }
  })

  useEffect(() => {
    if (commentEditorOpen) {
      window.setTimeout(() => commentRef.current?.focus({ preventScroll: true }), 0)
    }
  }, [commentEditorOpen])

  const handleScroll = () => {
    const readerScroll = readerScrollRef.current

    setSelectionAnchor(null)
    setCommentEditorOpen(false)
    setAnnotationPopover(null)

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

  const captureSelection = () => {
    if (article.kind !== 'lesson') {
      return
    }

    if (selectionCaptureTimerRef.current !== null) {
      window.cancelAnimationFrame(selectionCaptureTimerRef.current)
    }

    selectionCaptureTimerRef.current = window.requestAnimationFrame(() => {
      const articleRoot = articleRootRef.current

      if (!articleRoot) {
        return
      }

      const capturedSelection = captureStudySelection(articleRoot)

      if (!capturedSelection) {
        return
      }

      const segment = capturedSelection.segments[0]
      const existingAnnotation = article.annotations.find((annotation) =>
        annotation.segments.some(
          (annotationSegment) =>
            annotationSegment.paragraphIndex === segment.paragraphIndex &&
            annotationSegment.start === segment.start &&
            annotationSegment.end === segment.end &&
            annotationSegment.paragraphText === segment.paragraphText,
        ),
      )

      setAnnotationError(null)
      setAnnotationPopover(null)
      setCommentEditorOpen(false)
      setSelectionAnchor({
        ...capturedSelection,
        id: existingAnnotation?.id ?? capturedSelection.id,
        flags: existingAnnotation?.flags ?? [],
        note: existingAnnotation?.note ?? null,
      })
    })
  }

  const saveSelectionAnnotation = async (
    flags: StudyAnnotationInput['flags'],
    note: string | null,
  ) => {
    if (!selectionAnchor || isAnnotationSaving) {
      return
    }

    const existingAnnotation = article.annotations.find(
      (annotation) => annotation.id === selectionAnchor.id,
    )
    const operation: StudyAnnotationOperation = existingAnnotation ? 'update' : 'create'
    const annotation: StudyAnnotationInput = existingAnnotation
      ? {
          id: existingAnnotation.id,
          flags,
          note,
          segments: existingAnnotation.segments,
        }
      : {
          ...getAnnotationInput(selectionAnchor),
          flags,
          note,
        }

    setIsAnnotationSaving(true)
    setAnnotationError(null)

    try {
      await onSaveAnnotation(operation, annotation)
      window.getSelection()?.removeAllRanges()
      setSelectionAnchor(null)
      setCommentEditorOpen(false)
      setCommentDraft('')
    } catch (error) {
      setAnnotationError(getErrorMessage(error))
    } finally {
      setIsAnnotationSaving(false)
    }
  }

  const handleAddFlag = (flag: StudyAnnotationInput['flags'][number]) => {
    const flags = selectionAnchor?.flags.includes(flag)
      ? selectionAnchor.flags
      : [...(selectionAnchor?.flags ?? []), flag]

    void saveSelectionAnnotation(flags, selectionAnchor?.note ?? null)
  }

  const handleOpenCommentEditor = () => {
    if (!selectionAnchor) {
      return
    }

    setCommentDraft(selectionAnchor.note ?? '')
    setAnnotationError(null)
    setCommentEditorOpen(true)
  }

  const handleArticleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target

    if (!(target instanceof HTMLElement)) {
      return
    }

    const commentButton = target.closest<HTMLElement>('[data-study-comment-button]')

    if (!commentButton) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const annotationId = commentButton.dataset.studyCommentButton

    if (!annotationId) {
      return
    }

    const rect = commentButton.getBoundingClientRect()
    const width = 280
    const maxLeft = Math.max(8, window.innerWidth - width - 8)
    const left = Math.min(Math.max(rect.left, 8), maxLeft)
    const top = Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 180))
    setSelectionAnchor(null)
    setCommentEditorOpen(false)
    setAnnotationPopover({ id: annotationId, top: Math.max(8, top), left })
  }

  const activePopoverAnnotation = annotationPopover
    ? article.annotations.find((annotation) => annotation.id === annotationPopover.id) ?? null
    : null
  const toolbarStyle = selectionAnchor ? getToolbarStyle(selectionAnchor) : undefined
  const commentEditorStyle = selectionAnchor
    ? {
        ...getToolbarStyle(selectionAnchor, 320),
      }
    : undefined
  return (
    <section className="reader-pane" aria-label="文章阅读区">
      <header className="reader-header">
        <p className="reader-project-name">{projectName}</p>
        <div className="reader-header-actions">
          <p className="reader-file-name">{article.fileName}</p>
          <button
            className="reader-feedback-toggle"
            type="button"
            onClick={onOpenFeedbackDialog}
          >
            写反馈
          </button>
          <button
            className={`reader-sync-toggle${syncPanelOpen ? ' is-active' : ''}`}
            type="button"
            aria-label={syncPanelOpen ? '关闭 GitHub 同步侧栏' : '打开 GitHub 同步侧栏'}
            aria-expanded={syncPanelOpen}
            title={syncPanelOpen ? '关闭 GitHub 同步侧栏' : '打开 GitHub 同步侧栏'}
            onClick={onToggleSyncPanel}
          >
            ⇅
          </button>
        </div>
      </header>

      <div
        className="reader-scroll"
        ref={readerScrollRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onMouseUp={captureSelection}
        onTouchEnd={() => captureSelection()}
      >
        <article
          className="markdown-article"
          ref={articleRootRef}
          onClick={handleArticleClick}
        >
          <Markdown
            skipHtml
            components={{
              p({ children }) {
                return <p>{children}</p>
              },
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
            {stripStudyMarkupForRender(article.markdown)}
          </Markdown>
        </article>

        <FeedbackPanel
          feedback={feedback}
          feedbackRef={feedbackRef}
          feedbackStatus={feedbackStatus}
          isSaving={isFeedbackSaving}
          isGenerating={isNextLessonGenerating}
          generationState={generationState}
          generationRecovery={generationRecovery}
          isRollingBack={isRollingBack}
          hasSavedFeedback={hasSavedFeedback}
          onFeedbackChange={onFeedbackChange}
          onSave={onSaveFeedback}
          onGenerate={onGenerateNextLesson}
          onRollback={onRollback}
        />
      </div>

      {selectionAnchor && !commentEditorOpen && (
        <div
          className="study-annotation-toolbar"
          style={toolbarStyle}
          role="toolbar"
          aria-label="为选中文字添加标记"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={isAnnotationSaving}
            onClick={() => handleAddFlag('unknown')}
          >
            波浪线
          </button>
          <button
            type="button"
            disabled={isAnnotationSaving}
            onClick={() => handleAddFlag('favorite')}
          >
            高光
          </button>
          <button
            type="button"
            disabled={isAnnotationSaving}
            onClick={handleOpenCommentEditor}
          >
            批注
          </button>
        </div>
      )}

      {selectionAnchor && commentEditorOpen && (
        <div
          className="study-annotation-comment-editor"
          style={commentEditorStyle}
          role="dialog"
          aria-label="为选中文字添加批注"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="study-annotation-dialog-title">为选中文字添加批注</p>
          <p className="study-annotation-quote">“{normalizeStudyText(selectionAnchor.segments[0].quote)}”</p>
          <textarea
            ref={commentRef}
            value={commentDraft}
            rows={4}
            placeholder="写下你的理解、疑问或联想"
            disabled={isAnnotationSaving}
            onChange={(event) => setCommentDraft(event.target.value)}
          />
          {annotationError && <p className="study-annotation-error" role="alert">{annotationError}</p>}
          <div className="study-annotation-dialog-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isAnnotationSaving}
              onClick={() => {
                setCommentEditorOpen(false)
                setAnnotationError(null)
              }}
            >
              取消
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={isAnnotationSaving || commentDraft.trim() === ''}
              onClick={() =>
                void saveSelectionAnnotation(selectionAnchor.flags, commentDraft.trim())
              }
            >
              {isAnnotationSaving ? '正在保存…' : '保存批注'}
            </button>
          </div>
        </div>
      )}

      {annotationError && selectionAnchor && !commentEditorOpen && (
        <p className="study-annotation-error study-annotation-toast" role="alert">
          {annotationError}
        </p>
      )}

      {activePopoverAnnotation && annotationPopover && (
        <div
          className="study-annotation-popover"
          style={{ top: annotationPopover.top, left: annotationPopover.left }}
          role="dialog"
          aria-label="查看批注"
        >
          <div className="study-annotation-popover-header">
            <span>批注</span>
            <button
              type="button"
              aria-label="关闭批注"
              onClick={() => setAnnotationPopover(null)}
            >
              ×
            </button>
          </div>
          <p>{activePopoverAnnotation.note}</p>
        </div>
      )}

      {feedbackDialogOpen && (
        <div className="feedback-dialog-layer">
          <FeedbackPanel
            feedback={feedback}
            feedbackRef={floatingFeedbackRef}
            feedbackStatus={feedbackStatus}
            isSaving={isFeedbackSaving}
            isGenerating={isNextLessonGenerating}
            generationState={generationState}
            generationRecovery={generationRecovery}
            isRollingBack={isRollingBack}
            hasSavedFeedback={hasSavedFeedback}
            onFeedbackChange={onFeedbackChange}
            onSave={onSaveFeedback}
            onGenerate={onGenerateNextLesson}
            onRollback={onRollback}
            variant="floating"
            onClose={onCloseFeedbackDialog}
          />
        </div>
      )}
    </section>
  )
}

export default ReaderPane
