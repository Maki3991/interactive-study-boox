import type { StudyAnnotation, StudyAnnotationInput } from './types'

const annotationMetadataPattern =
  /<!-- interactive-study-boox:annotations\s*([\s\S]*?)\s*-->/g
const studyMarkTagPattern = /<\/?span\b[^>]*>/gi

export interface StudySelectionAnchor extends StudyAnnotationInput {
  rect: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function createAnnotationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

function stripStudyMarkTags(markdown: string) {
  let result = ''
  let cursor = 0
  let activeStudyMark = false

  for (const match of markdown.matchAll(studyMarkTagPattern)) {
    const tagStart = match.index ?? 0
    const tag = match[0]
    result += markdown.slice(cursor, tagStart)

    if (/^<\/span\b/i.test(tag)) {
      if (activeStudyMark) {
        activeStudyMark = false
        cursor = tagStart + tag.length
        continue
      }

      result += tag
      cursor = tagStart + tag.length
      continue
    }

    if (getStudyIdFromOpeningTag(tag) !== null) {
      activeStudyMark = true
      cursor = tagStart + tag.length
      continue
    }

    result += tag
    cursor = tagStart + tag.length
  }

  return result + markdown.slice(cursor)
}

export function stripStudyMarkupForRender(markdown: string) {
  return stripStudyMarkTags(markdown.replace(annotationMetadataPattern, ''))
}

function isSelectableStudyBlock(block: HTMLElement) {
  if (block.matches('li')) {
    return (
      block.parentElement?.closest('li') === null &&
      block.querySelector('ul, ol') === null &&
      block.closest('blockquote, td, th') === null
    )
  }

  return block.matches('p') && block.closest('li, blockquote, td, th') === null
}

/**
 * The server stores a block's ordinal among ordinary Markdown blocks and
 * flat list items. ReactMarkdown's source offsets are not stable here because
 * the saved study mark tags are removed before rendering, so assign the same
 * ordinal after the DOM has been created.
 */
export function assignStudyParagraphIndices(articleRoot: HTMLElement) {
  let paragraphIndex = 0

  const candidates = Array.from(articleRoot.querySelectorAll<HTMLElement>('p, li'))

  for (const candidate of candidates) {
    candidate.removeAttribute('data-study-paragraph-index')
  }

  for (const block of candidates.filter(isSelectableStudyBlock)) {
    block.dataset.studyParagraphIndex = String(paragraphIndex)
    paragraphIndex += 1
  }
}

export function getStudyAnnotationClasses(annotation: Pick<StudyAnnotation, 'flags' | 'note'>) {
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

interface TextUnit {
  node: Text
  rawStart: number
  rawEnd: number
}

interface NormalizedTextMap {
  text: string
  units: TextUnit[]
}

function isCommentButton(node: Node) {
  return node instanceof HTMLElement && node.matches('[data-study-comment-button]')
}

function collectTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let currentNode = walker.nextNode()

  while (currentNode) {
    if (!isCommentButton(currentNode.parentNode as Node)) {
      textNodes.push(currentNode as Text)
    }

    currentNode = walker.nextNode()
  }

  return textNodes
}

function buildNormalizedTextMap(root: HTMLElement): NormalizedTextMap {
  const characters: string[] = []
  const units: TextUnit[] = []
  let rawOffset = 0

  for (const node of collectTextNodes(root)) {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const character = node.data[offset]

      if (/\s/.test(character)) {
        const whitespaceStart = rawOffset
        rawOffset += 1

        if (characters.length > 0 && characters[characters.length - 1] !== ' ') {
          characters.push(' ')
          units.push({ node, rawStart: whitespaceStart, rawEnd: rawOffset })
        }

        continue
      }

      characters.push(character)
      units.push({ node, rawStart: rawOffset, rawEnd: rawOffset + 1 })
      rawOffset += 1
    }
  }

  if (characters[characters.length - 1] === ' ') {
    characters.pop()
    units.pop()
  }

  return { text: characters.join(''), units }
}

function getRawTextOffset(root: HTMLElement, container: Node, offset: number) {
  let rawOffset = 0
  let found = false

  const visit = (node: Node): void => {
    if (found || isCommentButton(node)) {
      return
    }

    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        rawOffset += offset
      } else {
        const childNodes = Array.from(node.childNodes)

        for (const childNode of childNodes.slice(0, offset)) {
          rawOffset += getVisibleRawTextLength(childNode)
        }
      }

      found = true
      return
    }

    if (node.nodeType === Node.TEXT_NODE) {
      rawOffset += node.textContent?.length ?? 0
      return
    }

    for (const childNode of Array.from(node.childNodes)) {
      visit(childNode)

      if (found) {
        return
      }
    }
  }

  const getVisibleRawTextLength = (node: Node): number => {
    if (isCommentButton(node)) {
      return 0
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length ?? 0
    }

    return Array.from(node.childNodes).reduce(
      (length, childNode) => length + getVisibleRawTextLength(childNode),
      0,
    )
  }

  visit(root)
  return rawOffset
}

function getStudyBlock(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest('[data-study-paragraph-index]') as HTMLElement | null
}

function hasForbiddenSelectionContent(block: HTMLElement, range: Range) {
  return Array.from(
    block.querySelectorAll(
      'a, code, pre, button, input, textarea, em, del, img, sub, sup, br',
    ),
  ).some((element) => range.intersectsNode(element))
}

function hasForbiddenArticleSelectionContent(articleRoot: HTMLElement, range: Range) {
  return Array.from(
    articleRoot.querySelectorAll('h1, h2, h3, h4, h5, h6, blockquote, table, hr'),
  ).some((element) => range.intersectsNode(element))
}

function getSelectionSegment(
  block: HTMLElement,
  range: Range,
  isFirstParagraph: boolean,
  isLastParagraph: boolean,
) {
  const paragraphMap = buildNormalizedTextMap(block)

  if (
    (isFirstParagraph && !block.contains(range.startContainer)) ||
    (isLastParagraph && !block.contains(range.endContainer))
  ) {
    return null
  }

  const lastUnit = paragraphMap.units[paragraphMap.units.length - 1]
  const rawStart = isFirstParagraph
    ? getRawTextOffset(block, range.startContainer, range.startOffset)
    : 0
  const rawEnd = isLastParagraph
    ? getRawTextOffset(block, range.endContainer, range.endOffset)
    : lastUnit?.rawEnd ?? 0
  const firstUnitIndex = paragraphMap.units.findIndex((unit) => unit.rawEnd > rawStart)
  const endUnitIndex = paragraphMap.units.findIndex((unit) => unit.rawStart >= rawEnd)
  const start = firstUnitIndex === -1 ? paragraphMap.text.length : firstUnitIndex
  const end = endUnitIndex === -1 ? paragraphMap.text.length : endUnitIndex
  const quote = paragraphMap.text.slice(start, end)
  const paragraphIndex = Number(block.dataset.studyParagraphIndex)

  if (
    !Number.isInteger(paragraphIndex) ||
    paragraphIndex < 0 ||
    quote === '' ||
    start >= end
  ) {
    return null
  }

  return {
    paragraphIndex,
    paragraphText: paragraphMap.text,
    start,
    end,
    quote,
  }
}

export function captureStudySelection(articleRoot: HTMLElement): StudySelectionAnchor | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  const startParagraph = getStudyBlock(range.startContainer)
  const endParagraph = getStudyBlock(range.endContainer)

  if (
    !startParagraph ||
    !endParagraph ||
    !articleRoot.contains(range.startContainer) ||
    !articleRoot.contains(range.endContainer) ||
    !articleRoot.contains(startParagraph) ||
    !articleRoot.contains(endParagraph) ||
    hasForbiddenArticleSelectionContent(articleRoot, range)
  ) {
    return null
  }

  const paragraphs = Array.from(
    articleRoot.querySelectorAll<HTMLElement>('[data-study-paragraph-index]'),
  )
  const startParagraphIndex = paragraphs.indexOf(startParagraph)
  const endParagraphIndex = paragraphs.indexOf(endParagraph)

  if (
    startParagraphIndex === -1 ||
    endParagraphIndex === -1 ||
    startParagraphIndex > endParagraphIndex
  ) {
    return null
  }

  const selectedParagraphs = paragraphs.slice(startParagraphIndex, endParagraphIndex + 1)

  if (selectedParagraphs.some((paragraph) => hasForbiddenSelectionContent(paragraph, range))) {
    return null
  }

  const segments = selectedParagraphs
    .map((paragraph, index) =>
      getSelectionSegment(
        paragraph,
        range,
        index === 0,
        index === selectedParagraphs.length - 1,
      ),
    )
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
  const quote = normalizeText(selection.toString())
  const expectedQuote = normalizeText(segments.map((segment) => segment.quote).join(' '))

  if (quote === '' || segments.length === 0 || quote !== expectedQuote) {
    return null
  }

  const rect = range.getBoundingClientRect()

  return {
    id: createAnnotationId(),
    flags: [],
    note: null,
    segments,
    rect: {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    },
  }
}

function getParagraphForSegment(
  paragraphs: HTMLElement[],
  segment: StudyAnnotation['segments'][number],
) {
  const indexedParagraph = paragraphs.find(
    (paragraph) => Number(paragraph.dataset.studyParagraphIndex) === segment.paragraphIndex,
  )

  if (indexedParagraph && buildNormalizedTextMap(indexedParagraph).text === segment.paragraphText) {
    return indexedParagraph
  }

  const matchingParagraphs = paragraphs.filter(
    (paragraph) => buildNormalizedTextMap(paragraph).text === segment.paragraphText,
  )

  return matchingParagraphs.length === 1 ? matchingParagraphs[0] : null
}

export function restoreStudySelection(
  articleRoot: HTMLElement,
  segments: StudyAnnotation['segments'],
) {
  const selection = window.getSelection()

  if (!selection || segments.length === 0) {
    return false
  }

  const paragraphs = Array.from(
    articleRoot.querySelectorAll<HTMLElement>('[data-study-paragraph-index]'),
  )
  const resolvedSegments = segments.map((segment) => {
    const paragraph = getParagraphForSegment(paragraphs, segment)

    if (!paragraph) {
      return null
    }

    const textMap = buildNormalizedTextMap(paragraph)

    if (
      textMap.text !== segment.paragraphText ||
      segment.start < 0 ||
      segment.end > textMap.text.length ||
      textMap.text.slice(segment.start, segment.end) !== segment.quote
    ) {
      return null
    }

    const startUnit = textMap.units[segment.start]
    const endUnit = textMap.units[segment.end - 1]

    return startUnit && endUnit ? { paragraph, startUnit, endUnit } : null
  })

  if (resolvedSegments.some((resolvedSegment) => resolvedSegment === null)) {
    return false
  }

  const firstResolvedSegment = resolvedSegments[0]
  const lastResolvedSegment = resolvedSegments[resolvedSegments.length - 1]

  if (!firstResolvedSegment || !lastResolvedSegment) {
    return false
  }

  const expectedQuote = normalizeText(segments.map((segment) => segment.quote).join(' '))

  if (
    selection.rangeCount > 0 &&
    !selection.isCollapsed &&
    normalizeText(selection.toString()) === expectedQuote &&
    articleRoot.contains(selection.anchorNode) &&
    articleRoot.contains(selection.focusNode)
  ) {
    return true
  }

  const range = document.createRange()
  range.setStart(
    firstResolvedSegment.startUnit.node,
    firstResolvedSegment.startUnit.rawStart -
      getRawTextOffset(firstResolvedSegment.paragraph, firstResolvedSegment.startUnit.node, 0),
  )
  range.setEnd(
    lastResolvedSegment.endUnit.node,
    lastResolvedSegment.endUnit.rawEnd -
      getRawTextOffset(lastResolvedSegment.paragraph, lastResolvedSegment.endUnit.node, 0),
  )
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

function addCommentButton(wrapper: HTMLElement, annotationId: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'study-comment-button'
  button.dataset.studyCommentButton = annotationId
  button.setAttribute('aria-label', '查看批注')
  button.title = '查看批注'
  button.textContent = '⋯'
  wrapper.append(button)
}

function hasExpectedStudyAnnotations(
  articleRoot: HTMLElement,
  annotations: StudyAnnotation[],
) {
  const renderedWrappers = Array.from(
    articleRoot.querySelectorAll<HTMLElement>('[data-study-id].study-mark'),
  ).filter((wrapper) => wrapper.parentElement?.closest('[data-study-id].study-mark') === null)

  if (annotations.length === 0) {
    return renderedWrappers.length === 0
  }

  const expectedWrapperCount = annotations.reduce(
    (count, annotation) => count + annotation.segments.length,
    0,
  )

  if (renderedWrappers.length !== expectedWrapperCount) {
    return false
  }

  return annotations.every((annotation) => {
    const annotationWrappers = renderedWrappers.filter(
      (wrapper) => wrapper.dataset.studyId === annotation.id,
    )

    if (
      annotationWrappers.length !== annotation.segments.length ||
      annotationWrappers.some(
        (wrapper) => wrapper.className !== getStudyAnnotationClasses(annotation),
      )
    ) {
      return false
    }

    const commentButtonCount = annotationWrappers.filter(
      (wrapper) => wrapper.querySelector('[data-study-comment-button]') !== null,
    ).length

    return commentButtonCount === (annotation.note === null ? 0 : 1)
  })
}

function wrapAnnotationRange(
  paragraph: HTMLElement,
  annotation: StudyAnnotation,
  segment: StudyAnnotation['segments'][number],
  shouldAddCommentButton: boolean,
) {
  const textMap = buildNormalizedTextMap(paragraph)

  if (
    textMap.text !== segment.paragraphText ||
    segment.start < 0 ||
    segment.end > textMap.text.length ||
    textMap.text.slice(segment.start, segment.end) !== segment.quote
  ) {
    return false
  }

  const startUnit = textMap.units[segment.start]
  const endUnit = textMap.units[segment.end - 1]

  if (!startUnit || !endUnit) {
    return false
  }

  const range = document.createRange()
  range.setStart(startUnit.node, startUnit.rawStart - getRawTextOffset(paragraph, startUnit.node, 0))
  range.setEnd(endUnit.node, endUnit.rawEnd - getRawTextOffset(paragraph, endUnit.node, 0))

  const wrapper = document.createElement('span')
  wrapper.className = getStudyAnnotationClasses(annotation)
  wrapper.dataset.studyId = annotation.id
  const segmentIndex = annotation.segments.indexOf(segment)

  if (segmentIndex >= 0) {
    wrapper.dataset.studySegmentIndex = String(segmentIndex)
  }

  const fragment = range.extractContents()
  wrapper.append(fragment)

  if (shouldAddCommentButton) {
    addCommentButton(wrapper, annotation.id)
  }

  range.insertNode(wrapper)
  return true
}

export function applyStudyAnnotations(
  articleRoot: HTMLElement,
  annotations: StudyAnnotation[],
) {
  if (hasExpectedStudyAnnotations(articleRoot, annotations)) {
    return
  }

  const renderedWrappers = Array.from(
    articleRoot.querySelectorAll<HTMLElement>('[data-study-id].study-mark'),
  ).filter((wrapper) => wrapper.parentElement?.closest('[data-study-id].study-mark') === null)

  for (const wrapper of renderedWrappers) {
    const fragment = document.createDocumentFragment()

    for (const childNode of Array.from(wrapper.childNodes)) {
      if (!isCommentButton(childNode)) {
        fragment.append(childNode)
      }
    }

    wrapper.replaceWith(fragment)
  }

  const paragraphs = Array.from(
    articleRoot.querySelectorAll<HTMLElement>('[data-study-paragraph-index]'),
  )

  for (const annotation of annotations) {
    const segmentsByParagraph = new Map<HTMLElement, StudyAnnotation['segments']>()

    for (const segment of annotation.segments) {
      const paragraph = getParagraphForSegment(paragraphs, segment)

      if (!paragraph) {
        continue
      }

      const paragraphSegments = segmentsByParagraph.get(paragraph) ?? []
      paragraphSegments.push(segment)
      segmentsByParagraph.set(paragraph, paragraphSegments)
    }

    for (const [paragraph, segments] of segmentsByParagraph) {
      const lastSegment = annotation.segments[annotation.segments.length - 1]

      for (const segment of [...segments].sort((left, right) => right.start - left.start)) {
        wrapAnnotationRange(paragraph, annotation, segment, segment === lastSegment && annotation.note !== null)
      }
    }
  }
}
