interface ReaderMenuProps {
  open: boolean
  onOpenLibrary: () => void
  onFocusFeedback: () => void
}

function ReaderMenu({ open, onOpenLibrary, onFocusFeedback }: ReaderMenuProps) {
  if (!open) {
    return null
  }

  return (
    <section className="mobile-reader-menu" aria-label="阅读控制面板">
      <button type="button" onClick={onOpenLibrary}>
        学习库
      </button>
      <button type="button" onClick={onFocusFeedback}>
        写反馈
      </button>
    </section>
  )
}

export default ReaderMenu
