import type {
  ArticleContent,
  LibraryResponse,
  SaveFeedbackRequest,
  SaveFeedbackResponse,
} from './types'

const apiBasePath = '/api'

interface ApiErrorResponse {
  message?: string
}

async function requestJson<T>(requestPath: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBasePath}${requestPath}`, init)

  if (!response.ok) {
    const errorResponse = (await response.json().catch(() => null)) as ApiErrorResponse | null
    const message = errorResponse?.message ?? `请求失败（${response.status}）`

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
