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
  code?: string
  error?: {
    message?: string
  }
}

export interface AuthStatus {
  authEnabled: boolean
  authenticated: boolean
  expiresAt: number | null
}

export interface LoginResponse {
  authenticated: boolean
  expiresAt: number
  remember: boolean
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

async function requestJson<T>(requestPath: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBasePath}${requestPath}`, {
    credentials: 'same-origin',
    ...init,
  })

  if (!response.ok) {
    const errorResponse = (await response.json().catch(() => null)) as ApiErrorResponse | null
    const message =
      errorResponse?.message ?? errorResponse?.error?.message ?? `请求失败（${response.status}）`

    if (response.status === 401 && !requestPath.startsWith('/auth/')) {
      window.dispatchEvent(new Event('interactive-study-boox-auth-expired'))
    }

    throw new ApiRequestError(message, response.status, errorResponse?.code)
  }

  return (await response.json()) as T
}

export function loadAuthStatus() {
  return requestJson<AuthStatus>('/auth/status')
}

export function login(password: string, remember: boolean) {
  return requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, remember }),
  })
}

export function logout() {
  return requestJson<{ authenticated: false }>('/auth/logout', { method: 'POST' })
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
