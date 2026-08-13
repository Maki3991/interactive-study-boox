# Project Status

> 更新时间：2026-08-13
>
> 当前阶段：P0 电脑端 Web Prototype——后端只读接口已验证，下一步将静态前端接入真实本地 Markdown 数据

## 1. 当前结论

项目目前已经完成了“要做什么、第一版不做什么、采用什么技术栈、数据如何流动、前后端通过哪些 API 沟通”的初步设计。

React 前端已从 Vite 默认页面替换为可点击的静态学习阅读器原型，并已根据首轮浏览器体验反馈完成必要修订。当前界面仍使用假学习库、假文章和浏览器本地存储演示交互；后端已能递归扫描开发期的真实测试学习库，并可安全读取一篇 Markdown 文章，但尚未接入前端、保存反馈或调用 AI。

当前已经完成的最小“读取”链停在后端返回数据这一步：

```text
测试浏览器请求 GET /api/library
  → Express 扫描 sample-library/
  → 返回真实文件夹树与 Markdown 文件列表

测试浏览器请求 GET /api/article?path=...
  → Express 校验路径不能越出学习库
  → 读取指定 Markdown 正文并返回
```

下一阶段的目标是让 React 前端替换假数据来源，实际调用这两个接口并显示结果；尚未进入反馈保存或 AI 生成。

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
- 已完成 UI Spec v0.3：电脑双栏阅读、可折叠侧栏、Obsidian 式文件树、BOOX 窄屏阅读控制面板、约三分之二宽的学习库抽屉、文末反馈和页面状态规则；取消正文底部常驻小节标题，改为纯滚动阅读。
- 已统一电脑端学习库与阅读区顶部栏的高度和分隔线位置。
- 已确认阅读排版采用固定 CSS 预设；P0 不制作字体、行距、字间距等应用内调节面板。之后可按用户选定的 Obsidian 主题手动移植正文样式。
- 已审查 Solarized for Obsidian：该仓库的核心是 Obsidian 配色与编辑器状态上色，不包含可直接复用的阅读排版方案；P0 暂不移植其 CSS。之后若调整排版，应以用户实际习惯的 Neo Reader 阅读效果为主要参考。

### 技术方案

- 前端：React + Vite + TypeScript。
- 后端：Node.js + Express + TypeScript。
- 包管理器：npm。
- 数据保存：本地 Markdown 文件与简单 JSON 配置。
- 数据库：P0 不使用数据库。
- 已形成 P0 数据模型和 API 草案，共规划 6 个业务接口。
- 已确定第一条开发功能链先只实现“读取学习库并打开 Markdown 文章”，暂不接入反馈和 AI。

### 开发环境与代码

- 已确认本机安装 Node.js、npm、Git、GitHub CLI 和 VS Code。
- 已在 `client/` 初始化 React + Vite + TypeScript 项目。
- 已安装前端依赖并生成 `package-lock.json`。
- 已通过 `npm run dev` 启动开发服务器，并在 `http://localhost:5173` 看到 Vite 默认页面。
- 已替换 Vite 默认页，完成静态前端原型：电脑双栏阅读、可收起侧栏、可展开假学习库树、假 Markdown 阅读区、文末反馈区和窄屏阅读菜单。
- 已用浏览器本地存储暂时演示学习库展开状态、最近打开的假文章和自动续读位置；后端接入后会改由真实配置 API 保存。
- 已运行 `npm run build` 与 `npm run lint`，均通过。
- 已初始化 `server/`：Node.js + Express + TypeScript，并创建后端入口 `server/src/index.ts`。
- 已实现并手动验证 `GET /api/health`，返回 `{ "status": "ok" }`。
- 已实现并验证 `GET /api/library`：递归扫描 `sample-library/`，返回真实文件夹树和 `.md` 文件，忽略 `.txt`、`.json` 等非 Markdown 普通文件；响应已确认包含 `archived`、`on-going`、`yet-to-start` 三个顶层文件夹。
- 已实现并验证 `GET /api/article?path=...`：读取指定 Markdown 的原始正文和摘要信息；请求路径会被规范化并校验在学习库边界内。真实文章 `archived/阿德勒心理学/01_目的论.md` 已成功读取；越界的 `../outside.md` 返回 `403`。
- 已运行 `npx.cmd tsc --noEmit`，后端 TypeScript 检查通过。

当前后端入口 `server/src/index.ts` 的职责边界：

- 启动 Express 本地服务；
- 提供开发检查接口 `GET /api/health`；
- 提供真实目录树接口 `GET /api/library`；
- 提供单篇 Markdown 读取接口 `GET /api/article`；
- 在同一文件中暂存目录扫描、路径安全校验和文章摘要等后端内部函数。后续函数增多时再按职责拆分文件。

### 项目文档

- `docs/PRD.md`：P0 产品需求初稿。
- `docs/ARCHITECTURE.md`：技术栈、系统边界和核心数据流。
- `docs/DATA_MODEL_AND_API.md`：数据模型、API 草案和第一条功能链。
- `docs/UI_SPEC.md`：页面结构、响应式布局、交互规则和静态原型验收点。
- `docs/STATUS.md`：记录当前进度、未完成事项和下一步。

## 3. 尚未完成

- 尚未完成电脑宽屏与窄屏交互的完整验收；已根据首轮布局体验反馈完成必要修订。
- 除开发检查接口 `GET /api/health`、读取接口 `GET /api/library` 与 `GET /api/article` 外，其余业务 API 仍处于设计状态。
- 测试学习库路径暂时固定为项目根目录的 `sample-library/`；尚未实现用户选择、保存和更换学习库路径。
- 尚未将前端的 `mockLibrary.ts` 假数据替换为真实 API 数据。
- 尚未决定开发环境中的跨端口通信方案（Vite 开发代理或后端 CORS 设置）。
- 尚未安装和接入 Markdown 渲染库。
- 尚未实现反馈追加、重复提交保护和下一篇文件创建。
- 尚未选择 AI 服务、模型、提示词和 API 密钥保存方式。
- 尚未在 BOOX Leaf 5 真机上验证页面尺寸、触摸操作、语音输入和刷新表现。
- 尚未决定电脑与 BOOX 之间的同步或远程访问方案。

## 4. 当前结论与边界

静态原型的首轮布局体验已经完成：底部常驻标题会遮挡滚动正文的问题已移除，电脑端顶部栏分隔线也已对齐。当前不继续投入样式细节；保留现有固定 CSS 阅读预设。

- 暂不单独创建 `DESIGN.md`。
- 电纸书约束已经写入 `docs/UI_SPEC.md`：黑白灰、无动画、大触摸区域、轻量渲染、不依赖悬停操作。
- Solarized 可继续作为电脑端个人审美偏好，但不作为 BOOX 阅读器的样式实现来源；其主要价值是语义化 CSS 变量的组织方式，项目当前已采用类似做法。

## 5. 推荐的下一步

### 下一项任务：让前端读取真实学习库和文章

继续只实现“读取”这一条功能链，不接入反馈、AI、数据库、同步或 BOOX 安装包。

暂定实现流程：

```text
用户打开页面
  → 前端请求真实文件夹树并显示
  → 用户点击一个 Markdown 文件
  → 前端请求指定 Markdown
  → 后端读取并返回 Markdown
  → 前端渲染文章
```

暂定实现顺序：

1. 在 `client/vite.config.ts` 配置开发期转发规则（暂定优先 Vite 开发代理），让前端的 `/api/...` 请求能到本机 `3001` 后端。
2. 新建 `client/src/api.ts`，集中定义 `loadLibrary()` 与 `loadArticle(path)` 两个前端请求函数。
3. 修改 `client/src/types.ts`，以真实“文件夹节点 / Markdown 文件节点 / 文章正文”数据类型替换当前以 `Mock` 命名的假数据类型。
4. 修改 `client/src/App.tsx`：页面启动时加载文件树；用户点击文章时加载正文；维护加载中与读取失败状态。
5. 修改 `client/src/components/LibraryTree.tsx`，使其能渲染任意深度的真实文件夹树；点击文件夹只在前端展开或收起，不重复请求后端。
6. 修改 `client/src/components/ReaderPane.tsx`，使其接收并显示后端返回的原始 Markdown。具体 Markdown 渲染库尚待确认。
7. 暂时停用 `client/src/components/FeedbackPanel.tsx` 中伪造的“生成下一篇”成功状态；真实反馈提交功能要等后端写入与 AI 生成功能完成后再接入。
8. 验证真实阅读后，再开发反馈保存与 AI 生成。

`client/src/mockLibrary.ts` 在迁移期间暂时保留，作为可回退的静态原型数据；真实 API 接入并验证完成后再决定是否删除。

## 6. 待确认但不阻塞当前读取功能链

- 学习库首版使用系统文件夹选择器，还是先在配置中手动填写路径。
- AI 服务供应商、模型和提示词模板。
- 不规范文章文件名的下一篇编号规则。
- `submissionId` 在 Markdown 中的具体保存标记。
- P1 的同步、远程访问和 Android 封装方式。

## 7. 仓库状态提醒

当前工作区存在尚未提交到 Git 的项目变更，包括文档更新、新初始化的 `server/` 和测试学习库。完成“目录扫描 + 单篇文章读取”的小闭环后，应检查变更范围并提交、推送到 GitHub。
