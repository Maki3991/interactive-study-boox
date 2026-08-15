import type { RefObject } from 'react'

interface FeedbackPanelProps {
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  feedbackStatus: { kind: 'success' | 'error'; message: string } | null
  isSaving: boolean
  onFeedbackChange: (value: string) => void
  onSave: () => void | Promise<void>
}

function FeedbackPanel({
  feedback,
  feedbackRef,
  feedbackStatus,
  isSaving,
  onFeedbackChange,
  onSave,
}: FeedbackPanelProps) {
  const canSave = feedback.trim().length > 0 && !isSaving

  return (
    <section className="feedback-panel" aria-labelledby="feedback-heading" aria-busy={isSaving}>
      <div className="feedback-divider" aria-hidden="true" />
      <h2 id="feedback-heading">学习反馈</h2>
      <p className="feedback-help">说说你理解了什么、哪里卡住了，或希望下一篇怎么继续。</p>

      <textarea
        ref={feedbackRef}
        value={feedback}
        rows={6}
        placeholder="这里可以直接打字，也可以调用 BOOX 系统的语音转文字。"
        disabled={isSaving}
        onChange={(event) => onFeedbackChange(event.target.value)}
      />

      <p className="feedback-save-note">
        当前版本会把反馈追加到这篇 Markdown 文件；下一篇 AI 生成将在后续接入。
      </p>

      {feedbackStatus && (
        <div
          className={`feedback-status${feedbackStatus.kind === 'error' ? ' feedback-error' : ''}`}
          role={feedbackStatus.kind === 'error' ? 'alert' : 'status'}
        >
          <p>{feedbackStatus.message}</p>
        </div>
      )}

      <button className="primary-button" type="button" disabled={!canSave} onClick={() => void onSave()}>
        {isSaving ? '正在保存反馈……' : '保存反馈'}
      </button>
    </section>
  )
}

export default FeedbackPanel
