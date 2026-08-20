import type { RefObject } from 'react'
import type { GenerationState } from '../types'

interface FeedbackPanelProps {
  feedback: string
  feedbackRef: RefObject<HTMLTextAreaElement | null>
  feedbackStatus: { kind: 'success' | 'error'; message: string } | null
  isSaving: boolean
  isGenerating: boolean
  generationState: GenerationState
  generationRecovery: { changedFiles: string[] } | null
  isRollingBack: boolean
  hasSavedFeedback: boolean
  onFeedbackChange: (value: string) => void
  onSave: () => void | Promise<void>
  onGenerate: () => void | Promise<void>
  onRollback: () => void | Promise<void>
}

function FeedbackPanel({
  feedback,
  feedbackRef,
  feedbackStatus,
  isSaving,
  isGenerating,
  generationState,
  generationRecovery,
  isRollingBack,
  hasSavedFeedback,
  onFeedbackChange,
  onSave,
  onGenerate,
  onRollback,
}: FeedbackPanelProps) {
  const isBusy = isSaving || isGenerating || generationState !== 'ready'
  const canSubmit = feedback.trim().length > 0 && !isBusy
  const canGenerate =
    (feedback.trim().length > 0 || hasSavedFeedback) && !isBusy && generationState === 'ready'

  return (
    <section className="feedback-panel" aria-labelledby="feedback-heading" aria-busy={isBusy}>
      <div className="feedback-divider" aria-hidden="true" />
      <h2 id="feedback-heading">学习反馈</h2>
      <p className="feedback-help">说说你理解了什么、哪里卡住了，或希望下一篇怎么继续。</p>

      <textarea
        ref={feedbackRef}
        value={feedback}
        rows={6}
        placeholder="这里可以直接打字，也可以调用 BOOX 系统的语音转文字。"
        disabled={isBusy}
        onChange={(event) => onFeedbackChange(event.target.value)}
      />

      <p className="feedback-save-note">
        {hasSavedFeedback && feedback.trim() === ''
          ? '当前文章已有已保存反馈，可以直接提交并生成下一篇。'
          : '可以只保存反馈，也可以提交反馈并让 AI 根据本书原文生成下一篇文章。'}
      </p>

      {feedbackStatus && (
        <div
          className={`feedback-status${feedbackStatus.kind === 'error' ? ' feedback-error' : ''}`}
          role={feedbackStatus.kind === 'error' ? 'alert' : 'status'}
        >
          <p>{feedbackStatus.message}</p>
        </div>
      )}

      <div className="feedback-actions">
        <button className="secondary-button" type="button" disabled={!canSubmit} onClick={() => void onSave()}>
          {isSaving ? '正在保存反馈……' : '只保存反馈'}
        </button>
        <button className="primary-button" type="button" disabled={!canGenerate} onClick={() => void onGenerate()}>
          {isGenerating
            ? '正在生成下一篇……'
            : generationState === 'in-progress'
              ? '后台正在生成下一篇……'
              : generationState === 'completed'
                ? '下一篇已生成'
                : '提交并生成下一篇'}
        </button>
      </div>

      {generationRecovery && generationState === 'completed' && (
        <div className="feedback-status feedback-recovery" role="status">
          <p>本次生成修改了：{generationRecovery.changedFiles.join('、')}</p>
          <button
            className="secondary-button"
            type="button"
            disabled={isRollingBack}
            onClick={() => void onRollback()}
          >
            {isRollingBack ? '正在撤销本次生成……' : '撤销本次生成'}
          </button>
        </div>
      )}
    </section>
  )
}

export default FeedbackPanel
