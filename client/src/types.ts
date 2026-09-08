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

export type StudyAnnotationFlag = 'unknown' | 'favorite'

export interface StudyAnnotationSegment {
  paragraphIndex: number
  paragraphText: string
  start: number
  end: number
  quote: string
}

export interface StudyAnnotation {
  id: string
  flags: StudyAnnotationFlag[]
  note: string | null
  segments: StudyAnnotationSegment[]
  createdAt: string
  updatedAt: string
}

export interface StudyAnnotationInput {
  id: string
  flags: StudyAnnotationFlag[]
  note: string | null
  segments: StudyAnnotationSegment[]
}

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
  markdownHash: string
  annotations: StudyAnnotation[]
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
  markdown: string
  markdownHash: string
  annotations: StudyAnnotation[]
}

export type StudyAnnotationOperation = 'create' | 'update' | 'remove'

export interface SaveAnnotationRequest {
  articlePath: string
  articleHash: string
  operation: StudyAnnotationOperation
  annotation: StudyAnnotationInput
}

export interface SaveAnnotationResponse {
  annotationSaved: true
  articlePath: string
  markdown: string
  markdownHash: string
  annotations: StudyAnnotation[]
}

export type LessonRoute = 'advance' | 'supplement'

export interface GeneratedArticleSummary {
  fileName: string
  title: string
  relativePath: string
  kind: 'lesson'
  route: LessonRoute
  routeReason: string
  sourceRefs: string[]
}

export interface GenerateNextLessonResponse {
  feedbackSaved: true
  alreadySaved: boolean
  operationId: string
  changedFiles: string[]
  currentArticlePath: string
  nextArticle: GeneratedArticleSummary
}

export interface RollbackGenerationResponse {
  operationId: string
  status: 'rolled-back'
  rolledBackFiles: string[]
  feedbackKept: boolean
}

export type SyncState =
  | 'disabled'
  | 'clean'
  | 'pending'
  | 'remote-ahead'
  | 'conflict'
  | 'offline'

export interface SyncStatus {
  state: SyncState
  repositoryName: string | null
  branch: string | null
  changedFiles: string[]
  ahead: number
  behind: number
  conflictFiles: string[]
  lastSyncedCommit: string | null
  message?: string
  blockedFiles?: string[]
}

export interface SyncPushResponse {
  state: 'clean'
  commitHash: string
  commitMessage: string
  syncedFiles: string[]
  syncedAt: string
}

export interface SyncPullResponse {
  state: 'clean'
  commitHash: string
  pulledCommits: number
  updatedFiles: string[]
  pulledAt: string
}
