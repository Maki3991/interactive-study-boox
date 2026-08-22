import { useId } from 'react'
import type { SyncState, SyncStatus } from '../types'

export interface SyncPanelProps {
  status: SyncStatus | null
  isLoading: boolean
  isSyncing: boolean
  commitMessage: string
  notice: { kind: 'success' | 'error'; message: string } | null
  onCommitMessageChange: (value: string) => void
  onRefresh: () => void | Promise<unknown>
  onSync: () => void | Promise<void>
}

const stateLabels: Record<SyncState, string> = {
  disabled: '未启用',
  clean: '已同步',
  pending: '有待同步修改',
  conflict: '需要人工处理',
  offline: '暂时不可用',
}

function SyncPanel({
  status,
  isLoading,
  isSyncing,
  commitMessage,
  notice,
  onCommitMessageChange,
  onRefresh,
  onSync,
}: SyncPanelProps) {
  const panelId = useId()
  const headingId = `sync-panel-heading-${panelId}`
  const commitMessageId = `sync-commit-message-${panelId}`
  const state = status?.state ?? 'offline'
  const canSync = state === 'pending' && !isSyncing
  const visibleFiles = status?.changedFiles.slice(0, 5) ?? []
  const hiddenFileCount = Math.max((status?.changedFiles.length ?? 0) - visibleFiles.length, 0)

  return (
    <section className="sync-panel" aria-labelledby={headingId}>
      <div className="sync-panel-header">
        <div>
          <p className="sync-panel-eyebrow">Versioned notes</p>
          <h2 id={headingId}>GitHub 同步</h2>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={isLoading || isSyncing}
          onClick={() => void onRefresh()}
        >
          {isLoading ? '检查中……' : '检查状态'}
        </button>
      </div>

      <div className={`sync-state sync-state-${state}`} role="status" aria-live="polite">
        <span className="sync-state-dot" aria-hidden="true" />
        <span>{status ? stateLabels[status.state] : '正在读取同步状态……'}</span>
      </div>

      {status?.repositoryName && (
        <p className="sync-panel-meta">
          {status.repositoryName}
          {status.branch ? ` · ${status.branch}` : ''}
        </p>
      )}

      {status?.message && <p className="sync-panel-message">{status.message}</p>}

      {visibleFiles.length > 0 && (
        <div className="sync-file-list">
          <p>待同步 Markdown：</p>
          <ul>
            {visibleFiles.map((filePath) => (
              <li key={filePath}>{filePath}</li>
            ))}
          </ul>
          {hiddenFileCount > 0 && <span>还有 {hiddenFileCount} 个文件</span>}
        </div>
      )}

      {status?.blockedFiles && status.blockedFiles.length > 0 && (
        <p className="sync-panel-warning">
          被拦截：{status.blockedFiles.join('、')}
        </p>
      )}

      <label className="sync-commit-label" htmlFor={commitMessageId}>
        本次提交说明（可选）
      </label>
      <input
        id={commitMessageId}
        className="sync-commit-input"
        value={commitMessage}
        maxLength={160}
        disabled={!canSync}
        onChange={(event) => onCommitMessageChange(event.target.value)}
        placeholder="study: sync learning notes"
      />

      <button
        className="primary-button sync-button"
        type="button"
        disabled={!canSync}
        onClick={() => void onSync()}
      >
        {isSyncing ? '正在同步……' : state === 'pending' ? '同步到 GitHub' : '暂无可同步修改'}
      </button>

      {notice && (
        <p className={`sync-panel-notice${notice.kind === 'error' ? ' sync-panel-notice-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </p>
      )}
    </section>
  )
}

export default SyncPanel
