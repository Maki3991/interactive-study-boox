# Project Status

> 更新时间：2026-08-14
>
> 当前阶段：P0 电脑端 Web Prototype——真实本地 Markdown 的读取、阅读与反馈安全保存已贯通，下一步是 AI 生成方案

## 1. 当前结论

项目目前已经完成了“要做什么、第一版不做什么、采用什么技术栈、数据如何流动、前后端通过哪些 API 沟通”的初步设计。

React 前端已从 Vite 默认页面替换为可点击的学习阅读器，并已根据首轮浏览器体验反馈完成必要修订。页面现在会从后端读取开发期的真实测试学习库、递归显示真实文件夹和 Markdown 文件；点击文件后会安全读取其原始 Markdown 正文，并渲染为适合连续阅读的标题、段落、引用、列表、链接和代码样式。文末反馈已能安全追加回当前 Markdown 文件；AI 生成尚未接入。

当前已经完成的最小“读取、阅读与反馈保存”链如下：

```text
用户打开页面
  → React 请求 /api/library
  → Vite 开发代理转发到本机 Express
  → Express 扫描 sample-library/ 并返回真实文件夹树
  → React 显示任意深度的真实目录
  → 用户点击一个 Markdown 文件
  → React 请求 /api/article?path=...
  → Express 校验路径并读取 Markdown
  → ReaderPane 将原始 Markdown 字符串交给 react-markdown
  → 浏览器显示阅读排版；相对路径的 .md 链接继续走已有的打开文章流程

用户在文末输入反馈并点击“保存反馈”
  → React 为本次提交生成或复用 submissionId，并请求 POST /api/feedback
  → Express 校验 Markdown 路径、反馈内容和 submissionId
  → 后端检查内部标记，首次请求才把反馈追加到文章末尾
  → 返回反馈已保存；同一 submissionId 的重试不重复追加
  → 页面清空输入框并提示保存结果
```

下一阶段是决定 AI 服务、模型与密钥保存方式，再实现“生成并保存下一篇”。

## 2. 已完成

### 产品与范围

- 已形成 P0 初版 PRD，明确最小闭环：

  ```text
  选择学习库 → 浏览项目和文章 → 阅读 Markdown → 提交反馈 → AI 生成并保存下一篇
  ```

- 已确认学习库是用户指定的本地文件夹；P0 保留真实目录树，当前测试库顶层为 `yet-to-start`、`on-going`、`archived`。
- 已确认 Markdown 文件是学习内容的主要真源。
- 已确认用户反馈追加到当前文章末尾，不单独建立反馈数据库。
- 已确认生成成功后停留在当前文章，只提示下一篇文章名称。
- 已确认 P0 保存最近打开文章的自动续读位置，但不显示阅读进度，也不记录阅读时长、完成状态或学习统计。
- 已确认 P0 不集成 Neo Reader，不制作 Android APK。
- 已完成 UI Spec v0.4：电脑双栏阅读、可折叠侧栏、Obsidian 式文件树、BOOX 窄屏阅读控制面板、约三分之二宽的学习库抽屉、文末反馈保存和后续生成状态规则；取消正文底部常驻小节标题，改为纯滚动阅读。
- 已统一电脑端学习库与阅读区顶部栏的高度和分隔线位置。
- 已修复长目录的滚动边界：电脑宽屏下学习库树和文章阅读区分别在一屏内独立滚动；BOOX 窄屏下学习库抽屉固定标题、由目录区域独立滚动，避免长目录无法继续下滑或把页面撑高。
- 已确认阅读排版采用固定 CSS 预设；P0 不制作字体、行距、字间距等应用内调节面板。之后可按用户选定的 Obsidian 主题手动移植正文样式。
- 已完成真实 Markdown 阅读排版：支持标题、段落、引用、无序/有序列表、行内与块级代码、分隔线和链接的基础展示；原始 HTML 不渲染。
- Markdown 中相对路径的 `.md` 链接会在应用内打开目标文章，不会把用户带离学习阅读器。
- 已审查 Solarized for Obsidian：该仓库的核心是 Obsidian 配色与编辑器状态上色，不包含可直接复用的阅读排版方案；P0 暂不移植其 CSS。之后若调整排版，应以用户实际习惯的 Neo Reader 阅读效果为主要参考。

### 技术方案

- 前端：React + Vite + TypeScript。
- 后端：Node.js + Express + TypeScript。
- 包管理器：npm。
- 数据保存：本地 Markdown 文件与简单 JSON 配置。
- 数据库：P0 不使用数据库。
- 已在前端加入 `react-markdown`，用于把后端返回的 Markdown 字符串安全转换为 React 阅读元素。
- 已形成 P0 数据模型和 API 草案，共规划 7 个业务接口；其中 `POST /api/feedback` 已作为 AI 之前的独立保存接口实现。
- 已完成“读取学习库并打开 Markdown 文章”与“保存反馈”两条最小功能链；AI 仍未接入。

### 开发环境与代码

- 已确认本机安装 Node.js、npm、Git、GitHub CLI 和 VS Code。
- 已在 `client/` 初始化 React + Vite + TypeScript 项目。
- 已安装前端依赖并生成 `package-lock.json`。
- 已通过 `npm run dev` 启动开发服务器，并在 `http://localhost:5173` 看到 Vite 默认页面。
- 已替换 Vite 默认页，完成静态前端原型：电脑双栏阅读、可收起侧栏、可展开假学习库树、假 Markdown 阅读区、文末反馈区和窄屏阅读菜单。
- 已用浏览器本地存储暂时演示学习库展开状态、最近打开的假文章和自动续读位置；后端接入后会改由真实配置 API 保存。
- 已运行 `npm run build` 与 `npm run lint`，均通过。
- 已初始化 `server/`：Node.js + Express + TypeScript，并创建后端入口 `server/src/index.ts`。
- 已在 `server/package.json` 增加后端开发脚本：在 `server/` 中运行 `npm run dev` 会执行 `tsx watch src/index.ts`；后续修改后端 TypeScript 文件时，服务会自动重启。
- 已实现并手动验证 `GET /api/health`，返回 `{ "status": "ok" }`。
- 已实现并验证 `GET /api/library`：递归扫描 `sample-library/`，返回真实文件夹树和 `.md` 文件，忽略 `.txt`、`.json` 等非 Markdown 普通文件；响应已确认包含 `archived`、`on-going`、`yet-to-start` 三个顶层文件夹。
- 已实现并验证 `GET /api/article?path=...`：读取指定 Markdown 的原始正文和摘要信息；请求路径会被规范化并校验在学习库边界内。真实文章 `archived/阿德勒心理学/01_目的论.md` 已成功读取；越界的 `../outside.md` 返回 `403`。
- 已运行 `npx.cmd tsc --noEmit`，后端 TypeScript 检查通过。
- 已新建 `client/src/api.ts`：定义前端读取函数 `loadLibrary()`、`loadArticle(relativePath)` 和保存函数 `saveFeedback()`；公共请求、成功 JSON 解析和失败信息提取统一由内部 `requestJson()` 处理。
- 已在 `client/src/types.ts` 增加真实接口的数据模型：文件夹节点、Markdown 文件节点、学习库响应与文章正文；当前的 `Mock*` 类型和假数据仍保留，仅作为可回退的静态原型数据，页面不再使用它们。
- 在新增前端 API 文件后，已运行 `npm.cmd run build` 与 `npm.cmd run lint`，均通过。
- 已安装 `server/` 的项目依赖，并通过 `npx tsc --noEmit` 检查后端 TypeScript。
- 已在 `client/vite.config.ts` 配置开发期 `/api` 代理到 `http://localhost:3001`；通过 `http://127.0.0.1:5173/api/health`、`/api/library` 与 `/api/article` 实测代理可用。
- 已修改 `client/src/App.tsx`：启动时读取真实目录；点击文件时异步读取文章；页面具有目录加载、目录失败、文章加载和文章失败状态；并保留当前文章与滚动位置的浏览器本地存储。
- 已修改 `client/src/components/LibraryTree.tsx`：使用递归组件显示后端返回的任意深度文件夹树，不再依赖静态分类和项目层级。
- 已修改 `client/src/components/ReaderPane.tsx`：接收后端返回的 `ArticleContent.markdown`，通过 `react-markdown` 渲染为阅读文章；相对 `.md` 链接会回到现有 `handleOpenArticle()` 流程，原始 HTML 被忽略。
- 已修改 `client/src/components/FeedbackPanel.tsx`：空反馈不可保存；保存期间禁用输入与按钮；成功后清空输入框并显示结果，失败时保留草稿。
- 已实现 `POST /api/feedback`：后端复用 Markdown 路径安全校验，确认目标是学习库内的普通 `.md` 文件后，使用 `submissionId` 内部标记与同文件写入队列避免重复追加；只追加反馈，不调用 AI。
- 已直接验证反馈接口：首次请求返回 `alreadySaved: false`，相同 `submissionId` 的重复请求返回 `alreadySaved: true` 且文件内标记只出现一次；越界路径返回 `403`。
- 已在浏览器中验证：输入反馈后“保存反馈”按钮可用，保存成功显示提示并清空输入框；刷新页面后反馈仍出现在 Markdown 正文中；浏览器控制台无错误。
- 已实际在浏览器中打开 `yet-to-start → Thinking, Fast and Slow → 00-contents.md` 与 `00-introduction.md`，确认真实标题、引用、列表、行内代码和文内文章链接均正常；在 600×800 窄屏下，正文保持独立滚动。前端 `npm run build`、`npm run lint` 均通过。

当前后端入口 `server/src/index.ts` 的职责边界：

- 启动 Express 本地服务；
- 提供开发检查接口 `GET /api/health`；
- 提供真实目录树接口 `GET /api/library`；
- 提供单篇 Markdown 读取接口 `GET /api/article`；
- 提供反馈保存接口 `POST /api/feedback`；
- 在同一文件中暂存目录扫描、路径安全校验、文章摘要与反馈追加等后端内部函数。后续函数增多时再按职责拆分文件。

### 项目文档

- `docs/PRD.md`：P0 产品需求初稿。
- `docs/ARCHITECTURE.md`：技术栈、系统边界和核心数据流。
- `docs/DATA_MODEL_AND_API.md`：数据模型、当前 API 实现和后续 AI 接口草案。
- `docs/UI_SPEC.md`：页面结构、响应式布局、交互规则和静态原型验收点。
- `docs/STATUS.md`：记录当前进度、未完成事项和下一步。

## 3. 尚未完成

- 尚未完成电脑宽屏与窄屏交互的完整验收；已根据首轮布局体验反馈完成必要修订。
- 除开发检查接口 `GET /api/health`、读取接口 `GET /api/library` 与 `GET /api/article`、反馈接口 `POST /api/feedback` 外，其余业务 API 仍处于设计状态。
- 测试学习库路径暂时固定为项目根目录的 `sample-library/`；尚未实现用户选择、保存和更换学习库路径。
- 当前已覆盖常用 Markdown 阅读语法；GitHub 风格表格、任务列表和代码语法高亮尚未接入，等真实学习材料需要时再扩展。
- 尚未实现 AI 调用、下一篇文件编号与安全创建。
- 尚未选择 AI 服务、模型、提示词和 API 密钥保存方式。
- 尚未在 BOOX Leaf 5 真机上验证页面尺寸、触摸操作、语音输入和刷新表现。
- 尚未决定电脑与 BOOX 之间的同步或远程访问方案。

## 4. 当前结论与边界

静态原型的首轮布局体验已经完成：底部常驻标题会遮挡滚动正文的问题已移除，电脑端顶部栏分隔线也已对齐；接入真实长目录后发现的电脑与 BOOX 窄屏滚动边界问题也已修复。真实 Markdown 已从原始文本变为阅读排版；当前不继续投入样式细节，保留现有固定 CSS 阅读预设。

- 暂不单独创建 `DESIGN.md`。
- 电纸书约束已经写入 `docs/UI_SPEC.md`：黑白灰、无动画、大触摸区域、轻量渲染、不依赖悬停操作。
- Solarized 可继续作为电脑端个人审美偏好，但不作为 BOOX 阅读器的样式实现来源；其主要价值是语义化 CSS 变量的组织方式，项目当前已采用类似做法。

## 5. 推荐的下一步

### 下一项任务：确认并实现 AI 生成下一篇的最小闭环

反馈已经可以安全保存。下一步需要先确认 AI 服务供应商、模型、API 密钥保存位置和提示词边界；这些决定会影响后端如何读取学习计划、当前文章与刚保存的反馈。

暂定流程：

```text
用户在文末保存反馈后，主动点击“生成下一篇”
  → 前端带着当前文章路径、反馈文本和 submissionId 发出请求
  → 后端确认反馈已存在，读取学习计划、当前文章和反馈
  → 后端调用 AI，确认文件名不冲突后创建下一篇 Markdown
  → 页面停留在当前文章，并提示下一篇文章名称
```

实现前仍需沿用 `docs/DATA_MODEL_AND_API.md` 中“保存反馈优先于 AI 调用、重试不重复追加”的约束；AI 服务、模型与密钥保存方案仍待讨论。

`client/src/mockLibrary.ts` 在迁移期间暂时保留，作为可回退的静态原型数据；真实 API 接入并验证完成后再决定是否删除。

## 6. 待确认但不阻塞当前保存功能链

- 学习库首版使用系统文件夹选择器，还是先在配置中手动填写路径。
- AI 服务供应商、模型和提示词模板。
- 不规范文章文件名的下一篇编号规则。
- P1 的同步、远程访问和 Android 封装方式。

## 7. 仓库状态提醒

当前分支存在尚未提交到 Git 的“反馈安全保存”功能与文档变更。完成检查后，应在 `feat/save-feedback` 分支提交、推送并创建指向 `main` 的 Pull Request。
