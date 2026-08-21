import type {
  ArticleContent,
  GenerateNextLessonResponse,
  LibraryResponse,
  RollbackGenerationResponse,
  SaveFeedbackRequest,
  SaveFeedbackResponse,
  SyncPushResponse,
  SyncStatus,
} from './types'

const apiBasePath = '/api'

interface ApiErrorResponse {
  message?: string
  error?: {
    message?: string
  }
}

async function requestJson<T>(requestPath: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBasePath}${requestPath}`, init)

  if (!response.ok) {
    const errorResponse = (await response.json().catch(() => null)) as ApiErrorResponse | null
    const message =
      errorResponse?.message ?? errorResponse?.error?.message ?? `请求失败（${response.status}）`

    throw new Error(message)
  }

  return (await response.json()) as T
}

export function loadLibrary() {
  return requestJson<LibraryResponse>('/library')
}

export function loadArticle(relativePath: string) {
  const encodedPath = encodeURIComponent(relativePath)

  return requestJson<ArticleContent>(`/article?path=${encodedPath}`)
}

export function saveFeedback(request: SaveFeedbackRequest) {
  return requestJson<SaveFeedbackResponse>('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export function generateNextLesson(request: SaveFeedbackRequest) {
  return requestJson<GenerateNextLessonResponse>('/learning/generate-next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export function rollbackGeneration(operationId: string) {
  return requestJson<RollbackGenerationResponse>(
    `/learning/operations/${encodeURIComponent(operationId)}/rollback`,
    { method: 'POST' },
  )
}

export function loadSyncStatus() {
  return requestJson<SyncStatus>('/sync/status')
}

export function pushSync(message?: string) {
  return requestJson<SyncPushResponse>('/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}
