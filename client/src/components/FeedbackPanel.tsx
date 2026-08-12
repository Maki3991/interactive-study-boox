import type { RefObject } from 'react'

export type GenerationState = 'idle' | 'generating' | 'success' | 'failure'

interface FeedbackPanelProps {
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  generationState: GenerationState
  nextArticleFileName?: string
  onFeedbackChange: (value: string) => void
  onSubmit: () => void
  onOpenNextArticle: () => void
  onRetry: () => void
}

function FeedbackPanel({
  feedback,
  feedbackRef,
  generationState,
  nextArticleFileName,
  onFeedbackChange,
  onSubmit,
  onOpenNextArticle,
  onRetry,
}: FeedbackPanelProps) {
  const isGenerating = generationState === 'generating'
  const canSubmit = feedback.trim().length > 0 && !isGenerating

  return (
    <section className="feedback-panel" aria-labelledby="feedback-heading">
      <div className="feedback-divider" aria-hidden="true" />
      <h2 id="feedback-heading">学习反馈</h2>
      <p className="feedback-help">说说你理解了什么、哪里卡住了，或希望下一篇怎么继续。</p>

      <textarea
        ref={feedbackRef}
        value={feedback}
        rows={6}
        placeholder="这里可以直接打字，也可以调用 BOOX 系统的语音转文字。"
        onChange={(event) => onFeedbackChange(event.target.value)}
      />

      <button
        className="primary-button"
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {isGenerating ? '正在保存反馈并生成下一篇……' : '提交并生成下一篇'}
      </button>

      {generationState === 'success' && (
        <div className="feedback-status feedback-success" role="status">
          <p>下一篇已生成：{nextArticleFileName ?? '下一篇文章.md'}</p>
          {nextArticleFileName && (
            <button className="text-button" type="button" onClick={onOpenNextArticle}>
              打开下一篇
            </button>
          )}
        </div>
      )}

      {generationState === 'failure' && (
        <div className="feedback-status feedback-error" role="alert">
          <p>反馈已保存，下一篇生成失败。</p>
          <button className="text-button" type="button" onClick={onRetry}>
            重新生成
          </button>
        </div>
      )}
    </section>
  )
}

export default FeedbackPanel
