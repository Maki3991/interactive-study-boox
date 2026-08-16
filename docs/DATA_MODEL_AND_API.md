# Data Model and API

> 版本：v0.4
> 更新日期：2026-08-15
> 当前状态：书籍学习模式已确认；AI 上下文读取和生成接口已实现，前端接入与实际生成验证待完成

## 1. 文档目的

本文档定义电脑端 Web Prototype（P0）中：

- 应用里有哪些数据；
- 数据保存在哪里；
- 前端和后端通过哪些 API 沟通；
- 每个 API 接收什么、返回什么；
- 文件读写必须遵守哪些边界。

本文档不是数据库表设计。P0 不使用数据库，Markdown 文件和文件夹是学习内容的主要真源。

## 2. 数据保存位置

| 数据 | 保存位置 | 说明 |
| --- | --- | --- |
| 原始书籍材料 | `sources/` | 拆分后的原始 Markdown，只读使用 |
| 原文索引 | `00-原文索引.md` | 原始章节的路径、顺序和摘要 |
| 学习计划 | `00-学习计划.md` | 每个学习项目的总体计划 |
| 学习文章 | `01.md`、`02.md` 等 | AI 生成或用户手动准备的文章 |
| 原文映射 | `00-学习计划.md` | 每篇学习文章对应的一个或多个原文文件 |
| 用户反馈 | 当前文章末尾 | 不单独创建反馈数据库或文件夹 |
| 学习库目录树 | 文件夹结构 | 保留用户真实的文件夹层级；只把 `.md` 文件作为可阅读文章返回 |
| 学习库路径 | 本地 JSON 配置 | 只由后端读取和修改 |
| 上次打开的文章 | 本地 JSON 配置 | 保存相对于学习库的路径 |
| 自动续读位置 | 本地 JSON 配置 | 保存上次打开文章的滚动比例，不对用户显示进度 |
| 当前输入框内容 | React 页面内存 | 未提交前不写入文件 |
| AI 生成结果 | 下一篇 Markdown | 成功生成后直接写入项目文件夹 |

## 3. 学习库文件模型

### 3.1 目录结构

```text
学习库/
├── yet-to-start/
│   └── Thinking, Fast and Slow/
│       ├── sources/
│       │   ├── 00-contents.md
│       │   └── part-1/
│       │       └── 01-the-characters-of-the-story.md
│       ├── 00-原文索引.md
│       ├── 00-学习计划.md
│       └── 01.md
├── on-going/
│   └── 维特根斯坦十讲/
│       └── 学习课题/
│           └── 维特根斯坦第九讲：驳斥罗素的归纳理论/
│               ├── 00-学习计划.md
│               ├── 01.md
│               └── 02.md
└── archived/
    └── 阿德勒心理学/
```

学习库的文件夹层级不是固定格式。后端递归返回文件夹，并只返回 `.md` 文件；例如 `.txt`、`.json` 等普通文件不出现在阅读树中。

### 3.2 路径规则

- `libraryPath` 是学习库在当前电脑上的绝对路径，只保存在后端配置中。
- 前端和 API 只传相对于学习库的 `relativePath`。
- API 中的相对路径统一使用 `/`，例如 `on-going/维特根斯坦十讲/维特根斯坦十讲.md`。
- 后端负责把相对路径转换为当前系统的真实路径。
- 后端必须拒绝任何试图访问学习库之外的路径。
- P0 的文章读取和写入只接受 `.md` 文件。
- `sources/` 下的 Markdown 可以读取，生成流程不能改写或覆盖其中的文件。
- AI 生成的学习文章写入项目根目录的编号文件，例如 `01.md`、`02.md`。

相对路径同时充当 P0 的资源标识，不额外生成数据库数字 ID。

## 4. 核心数据模型

以下 TypeScript 只描述数据应当长什么样，不代表数据存进了数据库。

### 4.1 应用配置

```ts
interface LastReadingPosition {
  articlePath: string
  scrollRatio: number
}

interface AppConfig {
  libraryPath: string | null
  lastOpenedArticlePath: string | null
  lastReadingPosition: LastReadingPosition | null
}
```

- `libraryPath`：学习库绝对路径。
- `lastOpenedArticlePath`：相对于学习库的文章路径。
- `lastReadingPosition.articlePath`：自动续读所属文章的相对路径，应与最近打开文章一致。
- `lastReadingPosition.scrollRatio`：文章可滚动范围中的位置，取值在 `0` 到 `1` 之间；只用于恢复阅读位置，不显示为百分比进度。
- 未选择学习库或没有打开过文章时使用 `null`。
- 包含绝对路径的本地配置文件不能提交到 GitHub。

### 4.2 学习库树

```ts
interface LibraryTree {
  entries: LibraryEntry[]
}

type LibraryEntry = FolderNode | MarkdownFileNode
```

### 4.3 文件夹节点

```ts
interface FolderNode {
  type: 'folder'
  name: string
  relativePath: string
  children: LibraryEntry[]
}
```

### 4.4 Markdown 文件节点

```json
{
  "type": "article",
  "fileName": "01.md",
  "relativePath": "on-going/维特根斯坦十讲/学习课题/维特根斯坦第九讲：驳斥罗素的归纳理论/01.md"
}
```

`FolderNode` 与 `MarkdownFileNode` 都使用相对于学习库根目录的路径。前端用 `fileName` 显示文章，不需要为了显示目录树而读取 Markdown 正文中的标题。

### 4.5 打开文章后的摘要

```ts
type ArticleKind = 'plan' | 'lesson' | 'source' | 'other'

interface ArticleSummary {
  fileName: string
  title: string
  relativePath: string
  kind: ArticleKind
}
```

- `fileName`：例如 `01.md`。
- `title`：优先读取 Markdown 中第一个一级标题；不存在时使用文件名。
- `relativePath`：例如 `on-going/维特根斯坦十讲/维特根斯坦十讲.md`。
- `kind`：`00-学习计划.md` 为 `plan`，项目根目录的编号文章为 `lesson`，`sources/` 下的文件为 `source`，无法识别时为 `other`。

### 4.6 文章内容

```ts
interface ArticleContent extends ArticleSummary {
  markdown: string
  latestFeedback: {
    feedback: string
    submissionId: string
  } | null
  nextArticlePath: string | null
  nextArticleExists: boolean
  generationInProgress: boolean
}
```

后端返回原始 Markdown 字符串，前端负责渲染成阅读页面。`latestFeedback` 用于刷新后恢复最近一次已经写入文章的反馈；`nextArticleExists` 和 `generationInProgress` 用于避免刷新后重复生成下一篇。生成时优先使用输入框中的新内容；输入框为空时回退到 `latestFeedback`。

### 4.7 原文映射

```ts
interface SourceReference {
  relativePath: string
  heading?: string
}

interface LessonSourceMapping {
  lessonPath: string
  sourceRefs: SourceReference[]
}
```

映射保存在 `00-学习计划.md`。一篇学习文章可以对应多个原文文件；第一版以文件路径为主要单位，`heading` 暂作为可选字段。

### 4.8 保存反馈（当前实现）

```ts
interface SaveFeedbackRequest {
  articlePath: string
  feedback: string
  submissionId: string
}

interface SaveFeedbackResponse {
  feedbackSaved: true
  currentArticlePath: string
  submissionId: string
  alreadySaved: boolean
}
```

- `articlePath`：当前文章的相对路径。
- `feedback`：用户输入或语音转文字后的反馈。
- `submissionId`：前端为一次点击生成并在失败重试时复用的唯一字符串。
- `alreadySaved`：首次写入时为 `false`；同一 `submissionId` 的重试已写入时为 `true`，不会再次追加内容。
- 后端在 Markdown 中使用不可见标记 `<!-- interactive-study-boox:feedback-submission-id=<submissionId> -->` 识别同一次提交。标记紧跟在追加的“学习反馈”标题之后；阅读器忽略该 HTML 注释。
- “只保存反馈”要求输入框有新内容；“提交反馈并生成下一篇”可以使用输入框内容，也可以在输入框为空时使用文章中最近一次已经保存的反馈。

`POST /api/feedback` 只完成安全保存，不调用 AI。这是接入生成能力前的独立最小闭环。

### 4.9 提交反馈并生成下一篇

```ts
interface GenerateNextRequest extends SaveFeedbackRequest {}

interface GenerateNextResponse {
  feedbackSaved: boolean
  currentArticlePath: string
  nextArticle: ArticleSummary
}
```

- 后端从 `articlePath` 推导当前项目，不允许前端另传一个可能冲突的项目路径。
- 前端不提交原文内容或 `sourceRefs`；后端从 `00-学习计划.md` 读取映射并在本地加载 `sources/` 文件。

### 4.10 统一错误格式

```ts
interface ApiErrorResponse {
  error: {
    code: string
    message: string
    recoverable: boolean
  }
  feedbackSaved?: boolean
}
```

- `code`：供程序判断错误类型，例如 `ARTICLE_NOT_FOUND`。
- `message`：供页面显示给用户。
- `recoverable`：是否适合直接重试。
- `feedbackSaved`：生成失败时告诉前端反馈是否已经安全保存。

## 5. P0 API 总览

| 用户动作 | 方法 | 路径 | 后端职责 |
| --- | --- | --- | --- |
| 查看当前配置 | `GET` | `/api/config` | 返回学习库、最近文章和自动续读位置 |
| 设置学习库 | `PUT` | `/api/config/library` | 校验并保存学习库路径 |
| 获取学习库列表 | `GET` | `/api/library` | 递归扫描文件夹和 Markdown 文件 |
| 打开一篇文章 | `GET` | `/api/article?path=...` | 读取指定 Markdown |
| 预览学习上下文（开发检查） | `GET` | `/api/learning/context-preview?path=...` | 检查计划、当前文章和映射原文是否能被找到，不调用 AI |
| 保存最近打开文章和续读位置 | `PUT` | `/api/config/last-opened` | 更新本地配置 |
| 保存反馈（当前实现） | `POST` | `/api/feedback` | 校验、去重并追加反馈到当前文章 |
| 提交反馈并生成下一篇 | `POST` | `/api/learning/generate-next` | 追加反馈、调用 AI、创建文章 |

## 6. API 详细约定

### 6.1 获取应用配置

```http
GET /api/config
```

成功响应：`200 OK`

```json
{
  "libraryPath": "D:\\MyStudyLibrary",
  "lastOpenedArticlePath": "on-going/维特根斯坦十讲/维特根斯坦十讲.md",
  "lastReadingPosition": {
    "articlePath": "on-going/维特根斯坦十讲/维特根斯坦十讲.md",
    "scrollRatio": 0.42
  }
}
```

前端使用这个接口判断是否已经选择学习库、启动后应优先打开哪篇文章，以及渲染后是否恢复自动续读位置。

### 6.2 设置学习库

```http
PUT /api/config/library
Content-Type: application/json
```

请求：

```json
{
  "libraryPath": "D:\\MyStudyLibrary"
}
```

后端处理：

1. 检查路径是否存在且是文件夹；
2. 检查是否可以读取和写入；
3. 不重命名、创建或删除用户已有的学习库内容；
4. 保存本地配置；
5. 返回更新后的配置。

成功响应：`200 OK`

### 6.3 获取学习库文件树

```http
GET /api/library
```

成功响应：`200 OK`

```json
{
  "entries": [
    {
      "type": "folder",
      "name": "on-going",
      "relativePath": "on-going",
      "children": [
        {
          "type": "folder",
          "name": "维特根斯坦十讲",
          "relativePath": "on-going/维特根斯坦十讲",
          "children": [
            {
              "type": "article",
              "fileName": "维特根斯坦十讲.md",
              "relativePath": "on-going/维特根斯坦十讲/维特根斯坦十讲.md"
            }
          ]
        }
      ]
    }
  ]
}
```

P0 递归扫描学习库中的目录，并返回目录节点与 `.md` 文件节点。`.txt`、`.json` 等非 Markdown 的普通文件被忽略；文件树显示真实文件名，不读取 Markdown 内部标题作为列表名称。

### 6.4 读取一篇文章

```http
GET /api/article?path=on-going%2F维特根斯坦十讲%2F维特根斯坦十讲.md
```

成功响应：`200 OK`

```json
{
  "fileName": "维特根斯坦十讲.md",
  "title": "维特根斯坦十讲",
  "relativePath": "on-going/维特根斯坦十讲/维特根斯坦十讲.md",
  "kind": "other",
  "markdown": "# 浏览器与服务器如何沟通\n\n正文……",
  "latestFeedback": null,
  "nextArticlePath": null,
  "nextArticleExists": false,
  "generationInProgress": false
}
```

后端处理规则：

1. `path` 必须是一个非空字符串，且目标必须是 `.md` 文件；
2. 后端把 API 的 `/` 路径规范化为当前系统可读取的真实路径；
3. 规范化后的路径必须仍在当前学习库内，`../`、绝对路径等越界访问返回 `403`；
4. 文件不存在或目标不是普通文件时返回 `404`；
5. 成功时返回原始 Markdown 字符串、文件名、首个一级标题（没有则使用文件名）、文件类型、最近一次反馈和下一篇生成状态。

### 6.5 保存最近打开的文章和自动续读位置

```http
PUT /api/config/last-opened
Content-Type: application/json
```

请求：

```json
{
  "articlePath": "on-going/示例项目/01.md",
  "scrollRatio": 0.42
}
```

成功响应：`200 OK`

```json
{
  "lastOpenedArticlePath": "on-going/示例项目/01.md",
  "lastReadingPosition": {
    "articlePath": "on-going/示例项目/01.md",
    "scrollRatio": 0.42
  }
}
```

前端在用户停止滚动一小段时间后保存一次，避免随着每个像素滚动频繁写入配置文件。打开文章时，前端先完成 Markdown 渲染，再按 `scrollRatio` 恢复位置。

该接口只记录最近打开文章的自动续读位置，不记录已完成状态、阅读时长或面向用户显示的阅读进度。

### 6.6 保存反馈（当前实现）

```http
POST /api/feedback
Content-Type: application/json
```

请求：

```json
{
  "articlePath": "on-going/示例项目/01.md",
  "feedback": "我理解了 GET 和 POST，但还不明白接口错误应该怎样处理。",
  "submissionId": "4f90e687-39df-43eb-a266-2e52dbd20e32"
}
```

后端处理顺序：

1. 校验文章相对路径、Markdown 后缀、学习库边界、反馈内容与 `submissionId`；
2. 确认目标存在且是普通 Markdown 文件；
3. 同一篇文章的写入请求依次处理，避免并发重试同时通过去重检查；
4. 读取文章，检查是否已有相同 `submissionId` 的内部标记；
5. 首次提交时在文章末尾追加分隔线、“学习反馈”标题、内部标记和反馈正文；重试时不再写入；
6. 返回明确的保存结果，不调用 AI。

成功响应：`200 OK`

```json
{
  "feedbackSaved": true,
  "currentArticlePath": "on-going/示例项目/01.md",
  "submissionId": "4f90e687-39df-43eb-a266-2e52dbd20e32",
  "alreadySaved": false
}
```

追加后的 Markdown 形状如下：

```markdown
---

## 学习反馈

<!-- interactive-study-boox:feedback-submission-id=4f90e687-39df-43eb-a266-2e52dbd20e32 -->

我理解了 GET 和 POST，但还不明白接口错误应该怎样处理。
```

### 6.7 提交反馈并生成下一篇（前后端已接入）

```http
POST /api/learning/generate-next
Content-Type: application/json
```

请求：

```json
{
  "articlePath": "on-going/示例项目/01.md",
  "feedback": "我理解了 GET 和 POST，但还不明白接口错误应该怎样处理。",
  "submissionId": "4f90e687-39df-43eb-a266-2e52dbd20e32"
}
```

后端处理顺序：

1. 校验文章路径和反馈内容；
2. 根据 `articlePath` 找到项目目录；
3. 检查 `00-学习计划.md`；
4. 使用 `submissionId` 判断反馈是否已经写入；
5. 尚未写入时，把反馈追加到当前文章末尾；
6. 从学习计划读取当前文章和下一篇的原文映射；
7. 校验映射路径位于项目的 `sources/` 内，并读取对应原文；
8. 组装固定学习规则、学习计划、当前文章、反馈和原文上下文；
9. 调用 OpenAI，并校验返回的 Markdown 结构；
10. 计算下一篇文章文件名；
11. 确认不会覆盖已有文件后创建新 Markdown；
12. 更新学习计划中的进度、反馈摘要和原文映射；
13. 返回新文章摘要。

成功响应：`201 Created`

```json
{
  "feedbackSaved": true,
  "currentArticlePath": "on-going/示例项目/01.md",
  "nextArticle": {
    "fileName": "02.md",
    "title": "接口错误与失败处理",
    "relativePath": "on-going/示例项目/02.md",
    "kind": "lesson"
  }
}
```

AI 生成失败时，反馈仍然保留。错误响应应明确返回：

```json
{
  "error": {
    "code": "AI_GENERATION_FAILED",
    "message": "反馈已经保存，但下一篇生成失败，可以重新尝试。",
    "recoverable": true
  },
  "feedbackSaved": true
}
```

同一篇文章同时只能有一个生成请求。刷新页面后，如果后端仍在生成，文章读取接口会返回 `generationInProgress: true`；如果下一篇已经写入，则返回 `nextArticleExists: true`，前端不再开放生成按钮。

## 7. HTTP 状态码约定

| 状态码 | 使用场景 |
| --- | --- |
| `200` | 读取或更新成功 |
| `201` | 下一篇文章创建成功 |
| `400` | 请求字段缺失或格式错误 |
| `403` | 请求试图读取学习库之外的文件 |
| `404` | 学习项目或文章不存在 |
| `409` | 下一篇文件已存在，继续写入会产生冲突 |
| `422` | 文件存在，但不满足生成条件，例如缺少学习计划 |
| `500` | 本地文件读取或写入失败 |
| `502` | AI 服务调用失败 |

生成前缺少原文映射、原文文件不存在或映射不在 `sources/` 时，使用 `422`，不调用 OpenAI。

## 8. 第一条开发功能链

第一条功能链只实现读取，不立即接入反馈和 AI：

```text
用户打开页面
  ↓
前端调用 GET /api/library
  ↓
后端扫描学习库
  ↓
前端显示文件列表
  ↓
用户点击文章
  ↓
前端调用 GET /api/article
  ↓
后端读取 Markdown
  ↓
前端渲染文章
```

计划中的函数职责：

| 层级 | 暂定函数 | 职责 |
| --- | --- | --- |
| React 前端 | `loadLibrary()` | 请求学习库文件树 |
| React 前端 | `openArticle(path)` | 请求并显示文章 |
| Express 路由 | `getLibrary()` | 接收学习库请求 |
| Express 路由 | `getArticle()` | 接收文章读取请求 |
| 文件服务 | `scanLibrary()` | 递归扫描文件夹和 Markdown 文件 |
| 文件服务 | `readArticle()` | 校验路径并读取 Markdown |

这些是计划名称；实际文件和函数创建后，以代码为准并回写本文档。

## 9. P0 数据边界

P0 不定义以下数据：

- 用户账号；
- 文章完成状态；
- 阅读开始和结束时间；
- 阅读时长；
- 学习统计；
- 中途问答记录；
- 多设备同步记录；
- 数据库 ID 和数据库表。

P0 可以保存一个最近打开文章的自动续读位置；它只是本机恢复阅读所需的 UI 偏好，不构成阅读进度、阅读统计或跨设备同步记录。

当出现阅读统计、多设备同步、冲突处理或大量查询需求时，再重新评估是否引入数据库。

## 10. 尚未确认

- 固定提示词的最终内容。
- 遇到不规范文章文件名时如何计算下一篇编号。
- 原文映射是否细化到 Markdown 标题或小节。
- 学习库使用系统文件夹选择器还是先手动填写路径。
