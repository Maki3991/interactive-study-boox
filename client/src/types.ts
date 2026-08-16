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

// 以下类型对应后端真实读取接口的返回数据。当前假数据类型先保留，
// 等页面完成迁移并验证后，再决定是否删除它们。
export type ArticleKind = 'plan' | 'lesson' | 'source' | 'other'
export type GenerationState = 'ready' | 'in-progress' | 'completed'

export type LibraryEntry = FolderNode | MarkdownFileNode

export interface FolderNode {
  type: 'folder'
  name: string
  relativePath: string
  children: LibraryEntry[]
}

export interface MarkdownFileNode {
  type: 'article'
  fileName: string
  relativePath: string
}

export interface LibraryResponse {
  entries: LibraryEntry[]
}

export interface ArticleContent {
  fileName: string
  title: string
  relativePath: string
  kind: ArticleKind
  markdown: string
  latestFeedback: {
    feedback: string
    submissionId: string
  } | null
  nextArticlePath: string | null
  nextArticleExists: boolean
  generationInProgress: boolean
}

export interface SaveFeedbackRequest {
  articlePath: string
  feedback: string
  submissionId: string
}

export interface SaveFeedbackResponse {
  feedbackSaved: true
  currentArticlePath: string
  submissionId: string
  alreadySaved: boolean
}

export interface GeneratedArticleSummary {
  fileName: string
  title: string
  relativePath: string
  kind: 'lesson'
}

export interface GenerateNextLessonResponse {
  feedbackSaved: true
  alreadySaved: boolean
  currentArticlePath: string
  nextArticle: GeneratedArticleSummary
}
