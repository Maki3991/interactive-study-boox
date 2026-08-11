# Data Model and API

> 版本：v0.1
> 更新日期：2026-08-11
> 当前状态：P0 数据模型和 API 初稿，可用于指导第一条功能链开发

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
| 学习计划 | `00-学习计划.md` | 每个学习项目的总体计划 |
| 学习文章 | `01.md`、`02.md` 等 | AI 生成或用户手动准备的文章 |
| 用户反馈 | 当前文章末尾 | 不单独创建反馈数据库或文件夹 |
| 项目分类 | 文件夹结构 | `todo`、`ongoing`、`archive` |
| 学习库路径 | 本地 JSON 配置 | 只由后端读取和修改 |
| 上次打开的文章 | 本地 JSON 配置 | 保存相对于学习库的路径 |
| 当前输入框内容 | React 页面内存 | 未提交前不写入文件 |
| AI 生成结果 | 下一篇 Markdown | 成功生成后直接写入项目文件夹 |

## 3. 学习库文件模型

### 3.1 目录结构

```text
学习库/
├── todo/
│   └── 学习项目/
├── ongoing/
│   └── 学习项目/
│       ├── 00-学习计划.md
│       ├── 01.md
│       └── 02.md
└── archive/
    └── 学习项目/
```

### 3.2 路径规则

- `libraryPath` 是学习库在当前电脑上的绝对路径，只保存在后端配置中。
- 前端和 API 只传相对于学习库的 `relativePath`。
- API 中的相对路径统一使用 `/`，例如 `ongoing/Web开发/01.md`。
- 后端负责把相对路径转换为当前系统的真实路径。
- 后端必须拒绝任何试图访问学习库之外的路径。
- P0 的文章读取和写入只接受 `.md` 文件。

相对路径同时充当 P0 的资源标识，不额外生成数据库数字 ID。

## 4. 核心数据模型

以下 TypeScript 只描述数据应当长什么样，不代表数据存进了数据库。

### 4.1 项目分类

```ts
type CategoryName = 'todo' | 'ongoing' | 'archive'
```

### 4.2 应用配置

```ts
interface AppConfig {
  libraryPath: string | null
  lastOpenedArticlePath: string | null
}
```

- `libraryPath`：学习库绝对路径。
- `lastOpenedArticlePath`：相对于学习库的文章路径。
- 未选择学习库或没有打开过文章时使用 `null`。
- 包含绝对路径的本地配置文件不能提交到 GitHub。

### 4.3 学习库树

```ts
interface LibraryTree {
  categories: CategoryNode[]
}

interface CategoryNode {
  name: CategoryName
  projects: ProjectSummary[]
}
```

### 4.4 学习项目

```ts
interface ProjectSummary {
  name: string
  category: CategoryName
  relativePath: string
  articles: ArticleSummary[]
}
```

示例：

```json
{
  "name": "Web开发",
  "category": "ongoing",
  "relativePath": "ongoing/Web开发",
  "articles": []
}
```

### 4.5 文章摘要

```ts
type ArticleKind = 'plan' | 'lesson' | 'other'

interface ArticleSummary {
  fileName: string
  title: string
  relativePath: string
  kind: ArticleKind
}
```

- `fileName`：例如 `01.md`。
- `title`：优先读取 Markdown 中第一个一级标题；不存在时使用文件名。
- `relativePath`：例如 `ongoing/Web开发/01.md`。
- `kind`：`00-学习计划.md` 为 `plan`，正常课程为 `lesson`，无法识别时为 `other`。

### 4.6 文章内容

```ts
interface ArticleContent extends ArticleSummary {
  markdown: string
}
```

后端返回原始 Markdown 字符串，前端负责渲染成阅读页面。

### 4.7 提交反馈并生成下一篇

```ts
interface GenerateNextRequest {
  articlePath: string
  feedback: string
  submissionId: string
}

interface GenerateNextResponse {
  feedbackSaved: boolean
  currentArticlePath: string
  nextArticle: ArticleSummary
}
```

- `articlePath`：当前文章的相对路径。
- `feedback`：用户输入或语音转文字后的反馈。
- `submissionId`：前端为一次提交生成的唯一字符串，用于重试时避免重复追加反馈。
- 后端从 `articlePath` 推导当前项目，不允许前端另传一个可能冲突的项目路径。

### 4.8 统一错误格式

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
| 查看当前配置 | `GET` | `/api/config` | 返回学习库和最近文章配置 |
| 设置学习库 | `PUT` | `/api/config/library` | 校验并保存学习库路径 |
| 获取学习库列表 | `GET` | `/api/library` | 扫描三个分类及项目文章 |
| 打开一篇文章 | `GET` | `/api/article?path=...` | 读取指定 Markdown |
| 保存最近打开文章 | `PUT` | `/api/config/last-opened` | 更新本地配置 |
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
  "lastOpenedArticlePath": "ongoing/Web开发/01.md"
}
```

前端使用这个接口判断是否已经选择学习库，以及启动后应优先打开哪篇文章。

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
3. 检查或创建 `todo`、`ongoing`、`archive`；
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
  "categories": [
    {
      "name": "ongoing",
      "projects": [
        {
          "name": "Web开发",
          "category": "ongoing",
          "relativePath": "ongoing/Web开发",
          "articles": [
            {
              "fileName": "00-学习计划.md",
              "title": "Web 开发学习计划",
              "relativePath": "ongoing/Web开发/00-学习计划.md",
              "kind": "plan"
            },
            {
              "fileName": "01.md",
              "title": "浏览器与服务器如何沟通",
              "relativePath": "ongoing/Web开发/01.md",
              "kind": "lesson"
            }
          ]
        }
      ]
    }
  ]
}
```

P0 只扫描三个固定分类中的直接项目文件夹，不递归解释项目内部更深层的任意文件夹结构。

### 6.4 读取一篇文章

```http
GET /api/article?path=ongoing%2FWeb开发%2F01.md
```

成功响应：`200 OK`

```json
{
  "fileName": "01.md",
  "title": "浏览器与服务器如何沟通",
  "relativePath": "ongoing/Web开发/01.md",
  "kind": "lesson",
  "markdown": "# 浏览器与服务器如何沟通\n\n正文……"
}
```

后端必须先校验路径仍在当前学习库内，再读取文件。

### 6.5 保存最近打开的文章

```http
PUT /api/config/last-opened
Content-Type: application/json
```

请求：

```json
{
  "articlePath": "ongoing/Web开发/01.md"
}
```

成功响应：`200 OK`

```json
{
  "lastOpenedArticlePath": "ongoing/Web开发/01.md"
}
```

该接口只记录最近打开位置，不记录已完成状态或阅读时长。

### 6.6 提交反馈并生成下一篇

```http
POST /api/learning/generate-next
Content-Type: application/json
```

请求：

```json
{
  "articlePath": "ongoing/Web开发/01.md",
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
6. 读取学习计划、当前文章和本次反馈；
7. 调用 AI 服务；
8. 计算下一篇文章文件名；
9. 确认不会覆盖已有文件后创建新 Markdown；
10. 返回新文章摘要。

成功响应：`201 Created`

```json
{
  "feedbackSaved": true,
  "currentArticlePath": "ongoing/Web开发/01.md",
  "nextArticle": {
    "fileName": "02.md",
    "title": "接口错误与失败处理",
    "relativePath": "ongoing/Web开发/02.md",
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

## 7. HTTP 状态码约定

| 状态码 | 使用场景 |
| --- | --- |
| `200` | 读取或更新成功 |
| `201` | 下一篇文章创建成功 |
| `400` | 请求字段缺失或格式错误 |
| `404` | 学习项目或文章不存在 |
| `409` | 下一篇文件已存在，继续写入会产生冲突 |
| `422` | 文件存在，但不满足生成条件，例如缺少学习计划 |
| `500` | 本地文件读取或写入失败 |
| `502` | AI 服务调用失败 |

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
| 文件服务 | `scanLibrary()` | 扫描分类、项目和文章 |
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

当出现阅读统计、多设备同步、冲突处理或大量查询需求时，再重新评估是否引入数据库。

## 10. 尚未确认

- AI 服务供应商和具体模型。
- 固定提示词的最终内容。
- 遇到不规范文章文件名时如何计算下一篇编号。
- 学习库使用系统文件夹选择器还是先手动填写路径。
- 反馈在 Markdown 中保存 `submissionId` 的具体标记格式。

