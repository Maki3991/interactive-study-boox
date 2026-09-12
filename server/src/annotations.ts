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

export type StudyAnnotationOperation = 'create' | 'update' | 'remove'

const annotationMetadataPattern =
  /<!-- interactive-study-boox:annotations\s*([\s\S]*?)\s*-->/g
const studyIdPattern = /^[a-zA-Z0-9-]{8,120}$/
const studyMarkTagPattern = /<\/?span\b[^>]*>/gi
const feedbackMarkerPrefix = '<!-- interactive-study-boox:feedback-submission-id='

export class StudyAnnotationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'StudyAnnotationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeStudyText(value: string) {
  return normalizeText(value)
}

function getStudyIdFromOpeningTag(tag: string) {
  const classMatch = tag.match(/\bclass="([^"]*)"/i)
  const idMatch = tag.match(/\bdata-study-id="([a-zA-Z0-9-]{8,120})"/i)

  if (!classMatch?.[1].split(/\s+/).includes('study-mark') || !idMatch) {
    return null
  }

  return idMatch[1]
}

function isClosingSpanTag(tag: string) {
  return /^<\/span\b/i.test(tag)
}

function stripStudyMarkTags(markdown: string, targetId?: string) {
  let result = ''
  let cursor = 0
  let activeStudyMarkId: string | null = null

  for (const match of markdown.matchAll(studyMarkTagPattern)) {
    const tagStart = match.index ?? 0
    const tag = match[0]
    result += markdown.slice(cursor, tagStart)

    if (isClosingSpanTag(tag)) {
      if (activeStudyMarkId !== null) {
        if (targetId === undefined || activeStudyMarkId === targetId) {
          activeStudyMarkId = null
          cursor = tagStart + tag.length
          continue
        }

        activeStudyMarkId = null
      }

      result += tag
      cursor = tagStart + tag.length
      continue
    }

    const studyId = getStudyIdFromOpeningTag(tag)

    if (studyId !== null && (targetId === undefined || studyId === targetId)) {
      activeStudyMarkId = studyId
      cursor = tagStart + tag.length
      continue
    }

    result += tag
    cursor = tagStart + tag.length
  }

  return result + markdown.slice(cursor)
}

export function stripStudyMarkup(markdown: string) {
  return stripStudyMarkTags(stripAnnotationMetadata(markdown))
}

export function stripAnnotationMetadata(markdown: string) {
  return markdown.replace(annotationMetadataPattern, '')
}

function validateSegment(value: unknown, index: number): StudyAnnotationSegment {
  if (!isRecord(value)) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', `批注片段 ${index + 1} 无效。`)
  }

  const paragraphIndex = value.paragraphIndex
  const paragraphText = value.paragraphText
  const start = value.start
  const end = value.end
  const quote = value.quote

  if (
    typeof paragraphIndex !== 'number' ||
    !Number.isInteger(paragraphIndex) ||
    paragraphIndex < 0 ||
    typeof paragraphText !== 'string' ||
    normalizeText(paragraphText) === '' ||
    paragraphText.length > 20000 ||
    typeof start !== 'number' ||
    !Number.isInteger(start) ||
    typeof end !== 'number' ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    typeof quote !== 'string' ||
    normalizeText(quote) === '' ||
    quote.length > 20000
  ) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', `批注片段 ${index + 1} 的定位信息无效。`)
  }

  const normalizedParagraphText = normalizeText(paragraphText)
  const normalizedQuote = normalizeText(quote)

  if (end > normalizedParagraphText.length || normalizedParagraphText.slice(start, end) !== normalizedQuote) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', `批注片段 ${index + 1} 与选中文本不一致。`)
  }

  return {
    paragraphIndex,
    paragraphText: normalizedParagraphText,
    start,
    end,
    quote: normalizedQuote,
  }
}

export function validateStudyAnnotationInput(value: unknown): StudyAnnotationInput {
  if (!isRecord(value)) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', '批注数据无效。')
  }

  const id = value.id
  const flags = value.flags
  const note = value.note
  const segments = value.segments

  if (typeof id !== 'string' || !studyIdPattern.test(id)) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', '批注 ID 无效。')
  }

  if (
    !Array.isArray(flags) ||
    flags.some((flag) => flag !== 'unknown' && flag !== 'favorite') ||
    new Set(flags).size !== flags.length
  ) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', '批注类型无效。')
  }

  if (note !== null && (typeof note !== 'string' || note.trim() === '' || note.length > 10000)) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', '批注内容无效。')
  }

  if (!Array.isArray(segments) || segments.length < 1 || segments.length > 32) {
    throw new StudyAnnotationError(400, 'ANNOTATION_INVALID', '批注必须至少包含一个选中文本片段。')
  }

  return {
    id,
    flags: [...flags],
    note: typeof note === 'string' ? note.trim() : null,
    segments: segments.map((segment, index) => validateSegment(segment, index)),
  }
}

function validateStoredAnnotation(value: unknown, index: number): StudyAnnotation {
  if (!isRecord(value)) {
    throw new StudyAnnotationError(500, 'ANNOTATION_METADATA_INVALID', `第 ${index + 1} 条标记记录损坏。`)
  }

  const annotation = validateStudyAnnotationInput(value)

  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new StudyAnnotationError(500, 'ANNOTATION_METADATA_INVALID', `第 ${index + 1} 条标记缺少时间信息。`)
  }

  return {
    ...annotation,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

export function parseStudyAnnotations(markdown: string): StudyAnnotation[] {
  const matches = [...markdown.matchAll(annotationMetadataPattern)]

  if (matches.length === 0) {
    return []
  }

  const metadata = matches[matches.length - 1][1].trim()

  try {
    const parsed: unknown = JSON.parse(metadata)

    if (!Array.isArray(parsed)) {
      throw new Error('metadata is not an array')
    }

    return parsed.map((annotation, index) => validateStoredAnnotation(annotation, index))
  } catch (error) {
    if (error instanceof StudyAnnotationError) {
      throw error
    }

    throw new StudyAnnotationError(500, 'ANNOTATION_METADATA_INVALID', '文章中的标记数据无法读取。')
  }
}

function serializeMetadata(annotations: StudyAnnotation[]) {
  return JSON.stringify(annotations, null, 2).replaceAll('-->', '--\\u003e')
}

export function writeAnnotationMetadata(markdown: string, annotations: StudyAnnotation[]) {
  const withoutMetadata = stripAnnotationMetadata(markdown).trimEnd()

  if (annotations.length === 0) {
    return `${withoutMetadata}\n`
  }

  return `${withoutMetadata}\n\n<!-- interactive-study-boox:annotations\n${serializeMetadata(annotations)}\n-->\n`
}

function getStudyMarkClasses(annotation: Pick<StudyAnnotation, 'flags' | 'note'>) {
  const classes = ['study-mark']

  if (annotation.flags.includes('unknown')) {
    classes.push('study-unknown')
  }

  if (annotation.flags.includes('favorite')) {
    classes.push('study-favorite')
  }

  if (annotation.note !== null) {
    classes.push('study-has-note')
  }

  if (annotation.flags.length === 0) {
    classes.push('study-comment-only')
  }

  return classes.join(' ')
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

export function getStudyMarkOpenTag(annotation: Pick<StudyAnnotation, 'id' | 'flags' | 'note'>) {
  return `<span class="${getStudyMarkClasses(annotation)}" data-study-id="${escapeAttribute(annotation.id)}">`
}

function getMainArticleContent(markdown: string) {
  const feedbackStart = markdown.indexOf(feedbackMarkerPrefix)

  return feedbackStart === -1 ? markdown : markdown.slice(0, feedbackStart)
}

interface MarkdownBlock {
  start: number
  end: number
  text: string
  paragraphIndex: number
}

function isSelectableParagraphBlock(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0].trim()

  return (
    firstLine !== '' &&
    !/^#{1,6}\s/.test(firstLine) &&
    !/^(```|~~~)/.test(firstLine) &&
    !/^(?:[-+*]|\d+[.)])\s+/.test(firstLine) &&
    !/^>\s?/.test(firstLine) &&
    !/^([-*_])\1\1+$/.test(firstLine)
  )
}

const markdownListItemPattern = /^([-+*]|\d+[.)])[ \t]+/gm
const nestedMarkdownListItemPattern = /(?:^|\r?\n)[ \t]+(?:[-+*]|\d+[.)])[ \t]+/

function findFlatListItemBlocks(text: string, blockStart: number, paragraphIndex: number) {
  const firstLine = text.split(/\r?\n/, 1)[0].trim()

  if (!/^(?:[-+*]|\d+[.)])[ \t]+/.test(firstLine)) {
    return { blocks: [] as MarkdownBlock[], nextParagraphIndex: paragraphIndex }
  }

  const matches = [...text.matchAll(markdownListItemPattern)]
  const blocks: MarkdownBlock[] = []
  let nextParagraphIndex = paragraphIndex

  for (const [index, match] of matches.entries()) {
    const markerStart = match.index ?? 0
    const contentStart = markerStart + match[0].length
    const contentEnd = matches[index + 1]?.index ?? text.length
    const itemText = text.slice(contentStart, contentEnd)

    if (nestedMarkdownListItemPattern.test(itemText) || buildVisibleTextMap(itemText).text === '') {
      continue
    }

    blocks.push({
      start: blockStart + contentStart,
      end: blockStart + contentEnd,
      text: itemText,
      paragraphIndex: nextParagraphIndex,
    })
    nextParagraphIndex += 1
  }

  return { blocks, nextParagraphIndex }
}

function findMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const blankLinePattern = /\r?\n[ \t]*\r?\n/g
  let cursor = 0
  let paragraphIndex = 0

  for (const match of markdown.matchAll(blankLinePattern)) {
    const matchStart = match.index ?? markdown.length
    const blockText = markdown.slice(cursor, matchStart)
    const listItemBlocks = findFlatListItemBlocks(blockText, cursor, paragraphIndex)

    if (listItemBlocks.blocks.length > 0) {
      blocks.push(...listItemBlocks.blocks)
      paragraphIndex = listItemBlocks.nextParagraphIndex
    } else if (isSelectableParagraphBlock(blockText)) {
      blocks.push({ start: cursor, end: matchStart, text: blockText, paragraphIndex })
      paragraphIndex += 1
    }

    cursor = matchStart + match[0].length
  }

  const finalBlock = markdown.slice(cursor)
  const listItemBlocks = findFlatListItemBlocks(finalBlock, cursor, paragraphIndex)

  if (listItemBlocks.blocks.length > 0) {
    blocks.push(...listItemBlocks.blocks)
  } else if (isSelectableParagraphBlock(finalBlock)) {
    blocks.push({ start: cursor, end: markdown.length, text: finalBlock, paragraphIndex })
  }

  return blocks
}

function getMarkdownStrongDelimiterPositions(rawText: string) {
  const delimiterPositions = new Set<number>()
  const strongPattern = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g

  for (const match of rawText.matchAll(strongPattern)) {
    const start = match.index

    if (start === undefined) {
      continue
    }

    const closingStart = start + match[0].length - 2

    delimiterPositions.add(start)
    delimiterPositions.add(start + 1)
    delimiterPositions.add(closingStart)
    delimiterPositions.add(closingStart + 1)
  }

  return delimiterPositions
}

interface VisibleTextMap {
  text: string
  rawStarts: number[]
  rawEnds: number[]
}

function buildVisibleTextMap(rawText: string): VisibleTextMap {
  const textCharacters: string[] = []
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  const strongDelimiterPositions = getMarkdownStrongDelimiterPositions(rawText)
  let cursor = 0

  while (cursor < rawText.length) {
    if (strongDelimiterPositions.has(cursor)) {
      cursor += 1
      continue
    }

    const tagMatch = rawText.slice(cursor).match(/^<\/?span\b[^>]*>/i)

    if (tagMatch) {
      cursor += tagMatch[0].length
      continue
    }

    const character = rawText[cursor]

    if (/\s/.test(character)) {
      const whitespaceStart = cursor

      while (cursor < rawText.length && /\s/.test(rawText[cursor])) {
        cursor += 1
      }

      if (textCharacters.length > 0 && textCharacters[textCharacters.length - 1] !== ' ') {
        textCharacters.push(' ')
        rawStarts.push(whitespaceStart)
        rawEnds.push(cursor)
      }

      continue
    }

    textCharacters.push(character)
    rawStarts.push(cursor)
    rawEnds.push(cursor + 1)
    cursor += 1
  }

  if (textCharacters[textCharacters.length - 1] === ' ') {
    textCharacters.pop()
    rawStarts.pop()
    rawEnds.pop()
  }

  return { text: textCharacters.join(''), rawStarts, rawEnds }
}

function findUniqueTextOccurrence(text: string, query: string) {
  const firstIndex = text.indexOf(query)

  if (firstIndex === -1 || text.indexOf(query, firstIndex + 1) !== -1) {
    return null
  }

  return firstIndex
}

function findParagraphForSegment(markdown: string, segment: StudyAnnotationSegment) {
  const mainContent = getMainArticleContent(markdown)
  const blocks = findMarkdownBlocks(mainContent)
  const normalizedParagraphText = normalizeText(segment.paragraphText)
  const exactParagraphMatches = blocks.filter(
    (block) => buildVisibleTextMap(block.text).text === normalizedParagraphText,
  )
  const quote = normalizeText(segment.quote)
  let block = exactParagraphMatches.find(
    (candidate) => candidate.paragraphIndex === segment.paragraphIndex,
  )
  let quoteStart = segment.start

  if (!block && exactParagraphMatches.length === 1) {
    block = exactParagraphMatches[0]
  }

  // The client stores rendered paragraph text, while this file still contains
  // Markdown syntax such as **bold**. Prefer the original paragraph ordinal
  // and the selected quote when the full paragraph text cannot match exactly.
  if (!block) {
    const indexedCandidate = blocks.find(
      (candidate) => candidate.paragraphIndex === segment.paragraphIndex,
    )
    const indexedQuoteStart = indexedCandidate
      ? findUniqueTextOccurrence(buildVisibleTextMap(indexedCandidate.text).text, quote)
      : null

    if (indexedCandidate && indexedQuoteStart !== null) {
      block = indexedCandidate
      quoteStart = indexedQuoteStart
    }
  }

  if (!block) {
    const quoteMatches = blocks.flatMap((candidate) => {
      const candidateQuoteStart = findUniqueTextOccurrence(buildVisibleTextMap(candidate.text).text, quote)

      return candidateQuoteStart === null
        ? []
        : [{ block: candidate, quoteStart: candidateQuoteStart }]
    })

    if (quoteMatches.length === 1) {
      block = quoteMatches[0].block
      quoteStart = quoteMatches[0].quoteStart
    }
  }

  if (!block) {
    throw new StudyAnnotationError(
      409,
      'ANNOTATION_ANCHOR_NOT_FOUND',
      exactParagraphMatches.length > 1
        ? '选中的文字在文章中出现了多次，暂时无法安全保存，请重新选择。'
        : '选中的文字已经无法在当前文章中定位，请刷新文章后重试。',
    )
  }

  const visibleMap = buildVisibleTextMap(block.text)

  if (
    quoteStart < 0 ||
    quoteStart + quote.length > visibleMap.text.length ||
    visibleMap.text.slice(quoteStart, quoteStart + quote.length) !== quote
  ) {
    throw new StudyAnnotationError(409, 'ANNOTATION_ANCHOR_NOT_FOUND', '选中的文字已经发生变化，请重新选择。')
  }

  const rawStart = visibleMap.rawStarts[quoteStart]
  const rawEnd = visibleMap.rawEnds[quoteStart + quote.length - 1]

  if (rawStart === undefined || rawEnd === undefined || rawStart >= rawEnd) {
    throw new StudyAnnotationError(409, 'ANNOTATION_ANCHOR_NOT_FOUND', '选中的文字无法定位，请重新选择。')
  }

  return { rawStart: block.start + rawStart, rawEnd: block.start + rawEnd }
}

function getStudyMarkRanges(markdown: string) {
  const ranges: Array<{ id: string; start: number; end: number }> = []
  const tagMatches = [...markdown.matchAll(studyMarkTagPattern)]
  const openMarks: Array<{ id: string; start: number }> = []

  for (const match of tagMatches) {
    const start = match.index ?? 0
    const tag = match[0]

    if (isClosingSpanTag(tag)) {
      const opening = openMarks.pop()

      if (opening) {
        ranges.push({ id: opening.id, start: opening.start, end: start + tag.length })
      }

      continue
    }

    const id = getStudyIdFromOpeningTag(tag)

    if (id) {
      openMarks.push({ id, start })
    }
  }

  return ranges
}

function assertRangeDoesNotOverlapStudyMark(
  markdown: string,
  rawStart: number,
  rawEnd: number,
) {
  const overlaps = getStudyMarkRanges(markdown).some(
    (range) => rawStart < range.end && rawEnd > range.start,
  )

  if (overlaps) {
    throw new StudyAnnotationError(
      409,
      'ANNOTATION_OVERLAP',
      '这段文字已经有标记，第一版暂不支持重叠标记，请选择未标记的文字。',
    )
  }
}

function insertAnnotationMarks(
  markdown: string,
  annotation: StudyAnnotation,
) {
  const ranges = annotation.segments.map((segment) => ({
    ...findParagraphForSegment(markdown, segment),
    segment,
  }))

  for (const range of ranges) {
    assertRangeDoesNotOverlapStudyMark(markdown, range.rawStart, range.rawEnd)
  }

  let result = markdown
  for (const range of ranges.sort((left, right) => right.rawStart - left.rawStart)) {
    const openTag = getStudyMarkOpenTag(annotation)
    result =
      result.slice(0, range.rawStart) +
      openTag +
      result.slice(range.rawStart, range.rawEnd) +
      '</span>' +
      result.slice(range.rawEnd)
  }

  return result
}

function updateAnnotationMarkTags(markdown: string, annotation: StudyAnnotation) {
  const escapedId = annotation.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const openingTagPattern = new RegExp(
    `<span\\b[^>]*\\bdata-study-id="${escapedId}"[^>]*>`,
    'gi',
  )

  return markdown.replace(openingTagPattern, getStudyMarkOpenTag(annotation))
}

function removeAnnotationMarkTags(markdown: string, annotationId: string) {
  let result = markdown

  while (true) {
    const escapedId = annotationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const openingTagPattern = new RegExp(
      `<span\\b[^>]*\\bdata-study-id="${escapedId}"[^>]*>`,
      'i',
    )
    const openingMatch = openingTagPattern.exec(result)

    if (!openingMatch || openingMatch.index === undefined) {
      return result
    }

    const openingEnd = openingMatch.index + openingMatch[0].length
    const closingIndex = result.indexOf('</span>', openingEnd)

    if (closingIndex === -1) {
      throw new StudyAnnotationError(500, 'ANNOTATION_METADATA_INVALID', '文章中的标记标签不完整。')
    }

    result = result.slice(0, openingMatch.index) + result.slice(openingEnd, closingIndex) + result.slice(closingIndex + '</span>'.length)
  }
}

function createStoredAnnotation(input: StudyAnnotationInput, now = new Date().toISOString()) {
  return { ...input, createdAt: now, updatedAt: now }
}

export function applyStudyAnnotationOperation(
  markdown: string,
  operation: StudyAnnotationOperation,
  input: StudyAnnotationInput,
) {
  const annotations = parseStudyAnnotations(markdown)
  const existingIndex = annotations.findIndex((annotation) => annotation.id === input.id)

  if (operation === 'create') {
    if (existingIndex !== -1) {
      throw new StudyAnnotationError(409, 'ANNOTATION_ALREADY_EXISTS', '这条标记已经保存，请刷新文章后重试。')
    }

    const annotation = createStoredAnnotation(input)
    const updatedMarkdown = insertAnnotationMarks(stripAnnotationMetadata(markdown), annotation)
    const updatedAnnotations = [...annotations, annotation]

    return { markdown: writeAnnotationMetadata(updatedMarkdown, updatedAnnotations), annotations: updatedAnnotations }
  }

  if (existingIndex === -1) {
    throw new StudyAnnotationError(404, 'ANNOTATION_NOT_FOUND', '找不到这条标记，请刷新文章后重试。')
  }

  const existingAnnotation = annotations[existingIndex]

  if (operation === 'update') {
    const updatedAnnotation: StudyAnnotation = {
      ...existingAnnotation,
      flags: input.flags,
      note: input.note,
      segments: existingAnnotation.segments,
      updatedAt: new Date().toISOString(),
    }
    const updatedMarkdown = updateAnnotationMarkTags(stripAnnotationMetadata(markdown), updatedAnnotation)
    const updatedAnnotations = [...annotations]
    updatedAnnotations[existingIndex] = updatedAnnotation

    return { markdown: writeAnnotationMetadata(updatedMarkdown, updatedAnnotations), annotations: updatedAnnotations }
  }

  const updatedMarkdown = removeAnnotationMarkTags(stripAnnotationMetadata(markdown), input.id)
  const updatedAnnotations = annotations.filter((annotation) => annotation.id !== input.id)

  return { markdown: writeAnnotationMetadata(updatedMarkdown, updatedAnnotations), annotations: updatedAnnotations }
}
