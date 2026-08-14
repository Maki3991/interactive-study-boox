import type { RefObject } from 'react'

interface FeedbackPanelProps {
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  onFeedbackChange: (value: string) => void
}

function FeedbackPanel({
  feedback,
  feedbackRef,
  onFeedbackChange,
}: FeedbackPanelProps) {
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

      <p className="feedback-unavailable" role="status">
        当前版本已接入真实文章读取；这里的草稿只保留在当前页面，反馈保存和下一篇生成将在后续接入。
      </p>

      <button className="primary-button" type="button" disabled>
        反馈保存与生成开发中
      </button>
    </section>
  )
}

export default FeedbackPanel
