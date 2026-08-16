import * as path from 'node:path'
import type { LearningContext, SourceReference } from './learningContext.js'

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

function getLibrarySourcePath(context: LearningContext, sourceRef: SourceReference) {
  return path.posix.join(context.projectRelativePath, sourceRef.relativePath)
}

function formatSourceSection(
  context: LearningContext,
  title: string,
  sourceRefs: SourceReference[],
) {
  const blocks = sourceRefs.map((sourceRef) => {
    const libraryPath = getLibrarySourcePath(context, sourceRef)
    const sourceFile = context.sourceFiles.find((file) => file.relativePath === libraryPath)

    if (!sourceFile) {
      throw new Error(`Missing source content for ${sourceRef.relativePath}`)
    }

    const heading = sourceRef.heading ? `，小节：${sourceRef.heading}` : ''

    return `### 原文文件：${sourceRef.relativePath}${heading}\n\n${sourceFile.markdown}`
  })

  return `## ${title}\n\n${blocks.join('\n\n')}`
}

export function buildNextLessonPrompt(context: LearningContext, feedback: string) {
  const nextFileName = path.posix.basename(context.nextArticlePath)

  return [
    learningRules,
    `本次要生成的文件名：${nextFileName}`,
    `\n## 学习计划\n\n${context.planFile.markdown}`,
    `\n## 当前学习文章\n\n文件：${context.currentArticle.relativePath}\n\n${context.currentArticle.markdown}`,
    `\n## 用户本轮反馈\n\n<user_feedback>\n${feedback}\n</user_feedback>`,
    formatSourceSection(context, '当前文章对应的原始材料', context.currentSourceRefs),
    formatSourceSection(context, '下一篇候选原始材料', context.nextSourceRefs),
    '请根据以上材料生成下一篇学习文章。',
  ].join('\n\n')
}
