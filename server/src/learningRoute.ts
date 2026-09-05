import * as path from 'node:path'
import type { SourceReference } from './learningContext.js'

export type LessonRoute = 'advance' | 'supplement'

export interface LessonRouteDecision {
  route: LessonRoute
  reason: string
  focus: string
  sourceRefs: SourceReference[]
}

export class LessonRouteDecisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LessonRouteDecisionError'
  }
}

function readJsonObject(output: string) {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')

  if (start < 0 || end <= start) {
    throw new LessonRouteDecisionError('AI 没有返回可解析的学习路径判断。')
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown
  } catch {
    throw new LessonRouteDecisionError('AI 返回的学习路径判断不是有效 JSON。')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRoute(value: unknown): LessonRoute {
  if (value === 'advance' || value === '推进') {
    return 'advance'
  }

  if (value === 'supplement' || value === '补充') {
    return 'supplement'
  }

  throw new LessonRouteDecisionError('AI 返回的学习路径必须是 advance 或 supplement。')
}

function parseText(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LessonRouteDecisionError(`AI 返回的 ${fieldName} 不能为空。`)
  }

  return value.trim().slice(0, maxLength)
}

function parseSourcePath(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LessonRouteDecisionError('AI 返回了无效的原文路径。')
  }

  const normalized = path.posix.normalize(value.trim().replaceAll('\\', '/').replace(/^`|`$/g, ''))

  if (
    !normalized.startsWith('sources/') ||
    normalized === 'sources/' ||
    normalized.includes('/../') ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized) ||
    !normalized.toLowerCase().endsWith('.md')
  ) {
    throw new LessonRouteDecisionError(`AI 选择了不安全的原文路径：${value}`)
  }

  return normalized
}

export function parseLessonRouteDecision(output: string): LessonRouteDecision {
  const parsed = readJsonObject(output)

  if (!isRecord(parsed)) {
    throw new LessonRouteDecisionError('AI 返回的学习路径判断必须是 JSON 对象。')
  }

  if (!Array.isArray(parsed.sourceRefs) || parsed.sourceRefs.length === 0) {
    throw new LessonRouteDecisionError('AI 没有为下一篇文章选择原文材料。')
  }

  if (parsed.sourceRefs.length > 4) {
    throw new LessonRouteDecisionError('AI 为一篇文章选择了过多原文材料。')
  }

  const sourcePaths = [...new Set(parsed.sourceRefs.map(parseSourcePath))]

  return {
    route: parseRoute(parsed.route),
    reason: parseText(parsed.reason, 'reason', 600),
    focus: parseText(parsed.focus, 'focus', 400),
    sourceRefs: sourcePaths.map((relativePath) => ({ relativePath })),
  }
}

export function validateLessonRouteSources(
  decision: LessonRouteDecision,
  sourceIndexMarkdown: string | null,
  fallbackSourceRefs: SourceReference[],
) {
  const indexedPaths = new Set(
    [...(sourceIndexMarkdown ?? '').matchAll(/`(sources\/[^`]+\.md)`/gi)].map((match) =>
      path.posix.normalize(match[1].replaceAll('\\', '/')),
    ),
  )
  const allowedPaths =
    indexedPaths.size > 0
      ? indexedPaths
      : new Set(fallbackSourceRefs.map((sourceRef) => path.posix.normalize(sourceRef.relativePath)))

  if (allowedPaths.size === 0) {
    return
  }

  const unknownPaths = decision.sourceRefs
    .map((sourceRef) => sourceRef.relativePath)
    .filter((relativePath) => !allowedPaths.has(relativePath))

  if (unknownPaths.length > 0) {
    throw new LessonRouteDecisionError(
      `AI 选择的原文不在当前项目的原文索引中：${unknownPaths.join('、')}`,
    )
  }
}
