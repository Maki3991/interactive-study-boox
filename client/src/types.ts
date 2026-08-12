export type CategoryName = 'todo' | 'ongoing' | 'archive'

export type ArticleBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; items: string[] }

export interface MockArticle {
  path: string
  fileName: string
  title: string
  blocks: ArticleBlock[]
}

export interface MockProject {
  id: string
  name: string
  articles: MockArticle[]
}

export interface MockCategory {
  id: CategoryName
  label: string
  projects: MockProject[]
}

export interface ArticleContext {
  category: MockCategory
  project: MockProject
  article: MockArticle
}

export interface ReadingPosition {
  articlePath: string
  scrollRatio: number
}
