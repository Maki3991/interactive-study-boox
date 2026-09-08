import * as path from 'node:path'
import { parseStudyAnnotations, stripStudyMarkup } from './annotations.js'
import type { LearningContext, SourceReference } from './learningContext.js'
import type { LessonRouteDecision } from './learningRoute.js'

const learningRules = `你负责生成一篇基于原始书籍材料的互动学习文章。

请遵守这些规则：

1. 根据用户反馈调整下一篇的难度、角度和节奏。
2. 原始材料和学习计划优先于你的背景记忆。
3. 原始材料没有支持的事实不要写成确定结论。
4. 原始材料不足时，明确说明依据不足，不要自行补全。
5. 文章要帮助用户理解和应用概念，不要复述整章原文。
6. 只输出 Markdown 文章，不要输出解释、分析过程或代码围栏。

文章必须包含以下标题，顺序保持一致：

# {序号}｜{标题}
## 这一篇要解决的问题
## 正文
## 小结
## 下一篇预告
## 学习反馈

“学习反馈”部分必须保留以下模板：

你可以写：

1. 哪里看懂了？
2. 哪里没看懂？
3. 哪个地方想展开？
4. 这个主题和你的真实问题有什么关系？

请写在这行下面：`

const routeDecisionRules = `你负责判断互动学习的下一步路径，不负责写学习文章。

请根据学习计划、当前文章和用户反馈，在以下两种路径中选择一种：

- advance：用户已经基本理解，或者明确希望继续推进主线；进入下一组相关原文。
- supplement：用户没有理解、提出了具体卡点，或者需要一个更小的例子和补充解释；暂时围绕当前问题补充。

请优先依据用户的真实反馈。反馈很少时，可以选择 advance，但保持小步推进。
请只从“原文索引”中选择 1 到 4 个原文路径。不要创造文件，不要选择 sources/ 之外的路径。

只输出 JSON，不要输出 Markdown、解释文字或代码围栏：

{
  "route": "advance" 或 "supplement",
  "reason": "用一句话说明判断依据",
  "focus": "下一篇的教学重点",
  "sourceRefs": ["sources/…….md"]
}`

function getLibrarySourcePath(context: LearningContext, sourceRef: SourceReference) {
  return path.posix.join(context.projectRelativePath, sourceRef.relativePath)
}

function formatSourceSection(
  context: LearningContext,
  title: string,
  sourceRefs: SourceReference[],
  sourceFiles = context.sourceFiles,
) {
  const blocks = sourceRefs.map((sourceRef) => {
    const libraryPath = getLibrarySourcePath(context, sourceRef)
    const sourceFile = sourceFiles.find((file) => file.relativePath === libraryPath)

    if (!sourceFile) {
      throw new Error(`Missing source content for ${sourceRef.relativePath}`)
    }

    const heading = sourceRef.heading ? `，小节：${sourceRef.heading}` : ''

    return `### 原文文件：${sourceRef.relativePath}${heading}\n\n${sourceFile.markdown}`
  })

  return `## ${title}\n\n${blocks.join('\n\n')}`
}

function formatSourceReferenceList(sourceRefs: SourceReference[]) {
  return sourceRefs.length > 0
    ? sourceRefs.map((sourceRef) => `- ${sourceRef.relativePath}`).join('\n')
    : '（当前学习计划没有预先指定下一篇原文，由你根据原文索引选择。）'
}

function formatStudyAnnotationSection(context: LearningContext) {
  const annotations = parseStudyAnnotations(context.currentArticle.markdown)

  if (annotations.length === 0) {
    return '## 当前文章中的标记\n\n（当前文章没有波浪线、高光或批注。）'
  }

  const records = annotations.flatMap((annotation) => {
    const types = [
      ...(annotation.flags.includes('unknown') ? ['波浪线：用户暂时不理解'] : []),
      ...(annotation.flags.includes('favorite') ? ['高光：用户认为重要或喜欢'] : []),
      ...(annotation.note !== null ? ['批注'] : []),
    ].join('、')

    return annotation.segments.map((segment) => {
      const note = annotation.note === null ? '无批注' : `批注内容：${annotation.note}`
      return `- ${types || '标记'}；原文：“${segment.quote}”；${note}`
    })
  })

  return [
    '## 当前文章中的标记与批注',
    '',
    '以下内容是用户在阅读时主动留下的局部信号。波浪线和批注优先用于识别需要解释或补充的地方；高光只表示用户认为重要或喜欢，默认不要把高光当作“已经理解”或“没有疑问”的证据。',
    '',
    records.join('\n'),
  ].join('\n')
}

export function buildLessonRoutePrompt(context: LearningContext, feedback: string) {
  const sourceIndex = context.sourceIndexFile?.markdown ?? '（未找到原文索引。）'

  return [
    routeDecisionRules,
    `## 学习计划\n\n${context.planFile.markdown}`,
    `## 当前学习文章\n\n文件：${context.currentArticle.relativePath}\n\n${stripStudyMarkup(context.currentArticle.markdown)}`,
    `## 用户本轮反馈\n\n<user_feedback>\n${feedback}\n</user_feedback>`,
    formatStudyAnnotationSection(context),
    formatSourceSection(context, '当前文章对应的原始材料', context.currentSourceRefs),
    `## 学习计划给出的下一篇候选原文\n\n${formatSourceReferenceList(context.nextSourceRefs)}`,
    `## 原文索引\n\n<source_index>\n${sourceIndex}\n</source_index>`,
    '请先完成路径判断。',
  ].join('\n\n')
}

export function buildNextLessonPrompt(
  context: LearningContext,
  feedback: string,
  decision: LessonRouteDecision,
  selectedSourceFiles: LearningContext['sourceFiles'],
) {
  const nextFileName = path.posix.basename(context.nextArticlePath)
  const routeLabel = decision.route === 'supplement' ? '补充当前问题' : '推进学习主线'

  return [
    learningRules,
    `本次要生成的文件名：${nextFileName}`,
    `本次路径：${routeLabel}`,
    `路径判断依据：${decision.reason}`,
    `本次教学重点：${decision.focus}`,
    `\n## 学习计划\n\n${context.planFile.markdown}`,
    `\n## 当前学习文章\n\n文件：${context.currentArticle.relativePath}\n\n${stripStudyMarkup(context.currentArticle.markdown)}`,
    `\n## 用户本轮反馈\n\n<user_feedback>\n${feedback}\n</user_feedback>`,
    formatStudyAnnotationSection(context),
    formatSourceSection(context, '当前文章对应的原始材料', context.currentSourceRefs),
    formatSourceSection(context, '本次选择的原始材料', decision.sourceRefs, selectedSourceFiles),
    `请根据以上材料生成下一篇学习文章。本篇应当${routeLabel}，并具体回应用户反馈。`,
  ].join('\n\n')
}
