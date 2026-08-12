import type { MockCategory } from '../types'

interface LibraryTreeProps {
  categories: MockCategory[]
  expandedNodes: Set<string>
  selectedArticlePath: string
  onToggleNode: (nodeId: string) => void
  onOpenArticle: (articlePath: string) => void
}

function TreeToggle({ expanded }: { expanded: boolean }) {
  return (
    <span className="tree-toggle" aria-hidden="true">
      {expanded ? '▾' : '▸'}
    </span>
  )
}

function LibraryTree({
  categories,
  expandedNodes,
  selectedArticlePath,
  onToggleNode,
  onOpenArticle,
}: LibraryTreeProps) {
  return (
    <nav className="library-tree" aria-label="学习库文件树">
      {categories.map((category) => {
        const categoryNodeId = `category:${category.id}`
        const categoryExpanded = expandedNodes.has(categoryNodeId)

        return (
          <section className="tree-category" key={category.id}>
            <button
              className="tree-row tree-folder-row"
              type="button"
              aria-expanded={categoryExpanded}
              onClick={() => onToggleNode(categoryNodeId)}
            >
              <TreeToggle expanded={categoryExpanded} />
              <span className="tree-folder-mark" aria-hidden="true">
                □
              </span>
              <span>{category.label}</span>
            </button>

            {categoryExpanded && (
              <div className="tree-children">
                {category.projects.map((project) => {
                  const projectNodeId = `project:${project.id}`
                  const projectExpanded = expandedNodes.has(projectNodeId)

                  return (
                    <div className="tree-project" key={project.id}>
                      <button
                        className="tree-row tree-folder-row"
                        type="button"
                        aria-expanded={projectExpanded}
                        onClick={() => onToggleNode(projectNodeId)}
                      >
                        <TreeToggle expanded={projectExpanded} />
                        <span className="tree-folder-mark" aria-hidden="true">
                          □
                        </span>
                        <span>{project.name}</span>
                      </button>

                      {projectExpanded && (
                        <div className="tree-files">
                          {project.articles.map((article) => {
                            const isCurrentArticle = article.path === selectedArticlePath

                            return (
                              <button
                                className={`tree-row tree-file-row${
                                  isCurrentArticle ? ' is-current' : ''
                                }`}
                                type="button"
                                key={article.path}
                                aria-current={isCurrentArticle ? 'page' : undefined}
                                onClick={() => onOpenArticle(article.path)}
                              >
                                <span className="tree-file-mark" aria-hidden="true">
                                  ▤
                                </span>
                                <span>{article.fileName}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </nav>
  )
}

export default LibraryTree
