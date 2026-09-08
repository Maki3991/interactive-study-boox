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

/**
 * The server stores a paragraph's ordinal among ordinary Markdown blocks.
 * ReactMarkdown's source offsets are not stable here because the saved study
 * mark tags are removed before rendering, so assign the same ordinal after
 * the DOM has been created.
 */
export function assignStudyParagraphIndices(articleRoot: HTMLElement) {
  let paragraphIndex = 0

  for (const paragraph of Array.from(articleRoot.querySelectorAll<HTMLElement>('p'))) {
    if (paragraph.closest('li, blockquote, td, th') !== null) {
      paragraph.removeAttribute('data-study-paragraph-index')
      continue
    }

    paragraph.dataset.studyParagraphIndex = String(paragraphIndex)
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

function getParagraph(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest('p[data-study-paragraph-index]') as HTMLElement | null
}

function hasForbiddenSelectionContent(paragraph: HTMLElement, range: Range) {
  if (paragraph.closest('li, blockquote, td, th') !== null) {
    return true
  }

  return Array.from(
    paragraph.querySelectorAll(
      'a, code, pre, button, input, textarea, strong, em, del, img, sub, sup, br',
    ),
  ).some((element) => range.intersectsNode(element))
}

export function captureStudySelection(articleRoot: HTMLElement): StudySelectionAnchor | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  const startParagraph = getParagraph(range.startContainer)
  const endParagraph = getParagraph(range.endContainer)

  if (
    !startParagraph ||
    startParagraph !== endParagraph ||
    !articleRoot.contains(range.startContainer) ||
    !articleRoot.contains(range.endContainer) ||
    hasForbiddenSelectionContent(startParagraph, range)
  ) {
    return null
  }

  const paragraphMap = buildNormalizedTextMap(startParagraph)
  const rawStart = getRawTextOffset(startParagraph, range.startContainer, range.startOffset)
  const rawEnd = getRawTextOffset(startParagraph, range.endContainer, range.endOffset)
  const firstUnitIndex = paragraphMap.units.findIndex((unit) => unit.rawEnd > rawStart)
  const endUnitIndex = paragraphMap.units.findIndex((unit) => unit.rawStart >= rawEnd)
  const start = firstUnitIndex === -1 ? paragraphMap.text.length : firstUnitIndex
  const end = endUnitIndex === -1 ? paragraphMap.text.length : endUnitIndex
  const quote = normalizeText(selection.toString())

  if (
    quote === '' ||
    start >= end ||
    paragraphMap.text.slice(start, end) !== quote ||
    !articleRoot.contains(startParagraph)
  ) {
    return null
  }

  const rect = range.getBoundingClientRect()
  const paragraphIndex = Number(startParagraph.dataset.studyParagraphIndex)

  if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return null
  }

  return {
    id: createAnnotationId(),
    flags: [],
    note: null,
    segments: [
      {
        paragraphIndex,
        paragraphText: paragraphMap.text,
        start,
        end,
        quote,
      },
    ],
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
    articleRoot.querySelectorAll<HTMLElement>('p[data-study-paragraph-index]'),
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
