import SyncPanel from './SyncPanel'
import type { SyncPanelProps } from './SyncPanel'

interface SyncDrawerProps extends SyncPanelProps {
  onClose: () => void
}

function SyncDrawer({ onClose, ...syncPanelProps }: SyncDrawerProps) {
  return (
    <aside className="sync-drawer" aria-label="GitHub 同步侧栏">
      <button
        className="sync-drawer-close"
        type="button"
        aria-label="关闭 GitHub 同步侧栏"
        title="关闭 GitHub 同步侧栏"
        onClick={onClose}
      >
        ×
      </button>
      <SyncPanel {...syncPanelProps} />
    </aside>
  )
}

export default SyncDrawer
