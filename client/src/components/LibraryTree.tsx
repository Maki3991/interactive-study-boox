import type { LibraryEntry } from '../types'

interface LibraryTreeProps {
  entries: LibraryEntry[]
  expandedNodes: Set<string>
  selectedArticlePath: string
  onToggleNode: (nodeId: string) => void
  onOpenArticle: (articlePath: string) => void | Promise<void>
}

function TreeToggle({ expanded }: { expanded: boolean }) {
  return (
    <span className="tree-toggle" aria-hidden="true">
      {expanded ? '▾' : '▸'}
    </span>
  )
}

interface TreeEntriesProps extends Omit<LibraryTreeProps, 'entries'> {
  entries: LibraryEntry[]
}

function TreeEntries({
  entries,
  expandedNodes,
  selectedArticlePath,
  onToggleNode,
  onOpenArticle,
}: TreeEntriesProps) {
  return (
    <>
      {entries.map((entry) => {
        if (entry.type === 'folder') {
          const nodeId = `folder:${entry.relativePath}`
          const isExpanded = expandedNodes.has(nodeId)

          return (
            <div className="tree-node" key={entry.relativePath}>
              <button
                className="tree-row tree-folder-row"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => onToggleNode(nodeId)}
              >
                <TreeToggle expanded={isExpanded} />
                <span className="tree-folder-mark" aria-hidden="true">
                  □
                </span>
                <span>{entry.name}</span>
              </button>

              {isExpanded && (
                <div className="tree-children">
                  {entry.children.length > 0 ? (
                    <TreeEntries
                      entries={entry.children}
                      expandedNodes={expandedNodes}
                      selectedArticlePath={selectedArticlePath}
                      onToggleNode={onToggleNode}
                      onOpenArticle={onOpenArticle}
                    />
                  ) : (
                    <p className="tree-empty">该文件夹暂无 Markdown 文件</p>
                  )}
                </div>
              )}
            </div>
          )
        }

        const isCurrentArticle = entry.relativePath === selectedArticlePath

        return (
          <button
            className={`tree-row tree-file-row${isCurrentArticle ? ' is-current' : ''}`}
            type="button"
            key={entry.relativePath}
            aria-current={isCurrentArticle ? 'page' : undefined}
            onClick={() => onOpenArticle(entry.relativePath)}
          >
            <span className="tree-file-mark" aria-hidden="true">
              ▤
            </span>
            <span>{entry.fileName}</span>
          </button>
        )
      })}
    </>
  )
}

function LibraryTree({
  entries,
  expandedNodes,
  selectedArticlePath,
  onToggleNode,
  onOpenArticle,
}: LibraryTreeProps) {
  return (
    <nav className="library-tree" aria-label="学习库文件树">
      <TreeEntries
        entries={entries}
        expandedNodes={expandedNodes}
        selectedArticlePath={selectedArticlePath}
        onToggleNode={onToggleNode}
        onOpenArticle={onOpenArticle}
      />
    </nav>
  )
}

export default LibraryTree
