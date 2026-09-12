# Project Status

> 更新时间：2026-09-06
>
> 当前阶段：P0/P0.1 已完成；P1 本地学习库、手动 GitHub 同步、VPS HTTPS 远程阅读和自适应生成链已完成；P2 远程加载 HTTPS 网站的 WebView APK Release 版已构建；当前正在处理 BOOX 真机发现的认证保持和滚动刷新交互问题

## 1. 当前结论

当前版本已经达到“可以开始正式个人学习”的最低闭环。项目暂时不继续扩展功能，先进入真实使用观察期：网页、后端和学习资料问题按实际反馈处理；分页、离线阅读、应用内登录迁移等增强项不作为当前启动前置条件。APK 的 BOOX 真机核对留待首次使用时完成，不阻塞本次归档。

项目目前已经完成了“要做什么、第一版不做什么、采用什么技术栈、数据如何流动、前后端通过哪些 API 沟通”的初步设计。

React 前端已从 Vite 默认页面替换为可点击的学习阅读器，并已根据首轮浏览器体验反馈完成必要修订。页面现在会从后端读取开发期的真实测试学习库、递归显示真实文件夹和 Markdown 文件；点击文件后会安全读取其原始 Markdown 正文，并渲染为适合连续阅读的标题、段落、引用、列表、链接和代码样式。文末反馈已能安全追加回当前 Markdown 文件；前后端已经能够按学习计划读取映射原文，并根据反馈自动选择推进课或补充课后生成下一篇。

根据 2026-08-20 的实际使用反馈，电脑端、同一局域网内的手机和 BOOX 已经能够完成基本闭环：读取电脑上的学习库、提交学习反馈、把生成请求发送回电脑、由电脑调用配置的 AI 服务商，并将返回结果写回本地学习文件。这个结果说明 P0 已经从“电脑浏览器原型”进入“个人局域网可用版本”，但还不是可以无保护长期运行的稳定版本。

当前已经完成的最小“读取、阅读与反馈保存”链如下：

```text
用户打开页面
  → React 请求 /api/library
  → Vite 开发代理转发到本机 Express
  → Express 扫描配置的学习库根路径并返回真实文件夹树
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
  → 页面保留当前反馈，用户可以直接继续提交生成
```

当前已经补上并实测前后端生成链：

```text
用户提交反馈并点击“生成下一篇”
  → POST /api/learning/generate-next
  → 后端先保存反馈
  → 读取 00-学习计划.md、当前文章、原文索引和当前映射的 sources 原文
  → 第一次 AI 判断推进课/补充课并选择本次原文
  → 第二次 AI 生成文章并校验固定 Markdown 结构
  → 创建生成操作记录并保存学习计划快照
  → 校验路径后，以原子方式写入下一篇和学习计划映射
  → 返回下一篇文章摘要与修改文件；页面仍停留在当前文章
```

### 自适应生成路径（2026-09-05）

生成下一篇不再要求用户或外部 AI 预先把 `02.md`、`03.md` 等全部原文映射写进学习计划。只要当前文章有映射，项目保留 `sources/00-原文索引.md`，系统就会：

- 根据真实反馈选择 `advance`（推进主线）或 `supplement`（补充当前卡点）；
- 从原文索引中选择 1—4 个素材文件；
- 仍按连续编号创建下一篇文章；
- 把本次路径、理由和原文映射自动写回 `00-学习计划.md`；
- 在页面成功提示中显示“推进课”或“补充课”。

这保留了 `dbs-learning` 的反馈驱动节奏：预先写好的路线只是候选，下一次生成仍会重新读取新的反馈并重新判断。该生成链已经在本地构建，并在 VPS 完成构建、重启和健康检查验证；本次文档归档提交只记录现状，不改变运行时链路。

当前生成链已经具备以下保护：反馈使用 `submissionId` 去重；同一文件的反馈写入会排队；同一篇文章同时只允许一个生成请求；生成操作持久化记录每个阶段；学习计划会在生成前保存快照；每个目标文件先写临时文件再原子重命名；创建下一篇不会覆盖已经存在的文件；AI 返回内容会先经过 Markdown 结构校验；成功后可以查询操作并手动回滚。反馈在生成失败或回滚时保留。

### 应用内单用户会话功能（PR #8 已合并，生产部署待定）

这条功能链只解决“本人访问学习库时减少重复输入密码”，不改变 AI、GitHub、域名、备案或 Nginx 的凭据：

```text
用户打开应用
  → 前端请求 GET /api/auth/status
  → 若已启用且未登录，显示 LoginScreen
  → 用户输入应用密码并选择是否记住 7 天
  → 前端请求 POST /api/auth/login
  → Express 校验服务端 AUTH_PASSWORD_HASH，创建持久化会话并设置 HttpOnly Cookie
  → 后续学习库、文章、反馈、生成和同步 API 统一检查会话
  → 用户退出或会话过期后，前端回到登录页
```

- 应用登录由 `AUTH_ENABLED` 控制；代码和部署模板已经切换到 HTTPS + 应用登录方案，但当前 VPS 仍需按部署步骤关闭旧的 Nginx Basic Auth 并重启服务。
- 密码只保存为服务端 scrypt 哈希；更换密码只需重新生成哈希并替换服务端环境变量，不会改动其他服务配置。
- 勾选“记住登录”时默认有效 7 天；未勾选时是较短的浏览器会话。会话哈希和过期时间现在写入 `AUTH_SESSION_FILE`，服务重启后可以恢复未过期会话。
- 用户已完成本地手动测试：临时密码登录、退出登录、记住 7 天和更换密码均可用；真实密码不记录在仓库或文档中。
- PR #8 已合并到 `main`；当前工作区为干净的 `main`，代码合并不等于已自动部署到 VPS。

### P0.1 AI 写入安全与恢复验收

- 已验证没有 API key 时：反馈仍然保存，生成失败，不产生空白的下一篇文章。
- 已验证生成过程中强制停止前后端：操作被记录为 `interrupted`，没有留下半成品文章，学习计划保持原状。
- 已验证真实 OpenAI 请求成功：操作记录为 `committed`，下一篇 Markdown 与学习计划均成功写入。
- 已验证手动撤销：新生成文章被删除，学习计划恢复到生成前版本，当前文章反馈保留，操作记录变为 `rolled-back`。
- 已验证撤销后重新生成，以及从 `04.md` 继续生成 `05.md` 的连续学习链路。
- 已通过后端 TypeScript 检查、前端 `lint`、前端生产构建和 `git diff --check`。

### P1 远程访问与手动 GitHub 同步方案（已完成，P2 APK Release 版已构建）

当前形成以下 P1 方向。本地后端与前端同步闭环已经实现并完成真实验证；VPS 的 Nginx、Basic Auth、systemd、私有学习工作区、HTTPS 和远程阅读链路已经验证；P2 的独立 Android WebView 外壳 Release 版已经构建：

- 后端部署到具有持久化磁盘的 VPS，个人电脑不需要持续开机。
- VPS clone 私有的 `learn-everything` 仓库，作为 AI 读取和写入的活动学习工作区。
- 已同步的学习内容由 GitHub 私有仓库保存版本历史；未同步修改先留在 VPS 工作区。
- 客户端只访问 VPS API，不直接接触 GitHub Token 或 OpenAI API Key。
- 用户点击“同步到 GitHub”时，一次性提交自上次同步以来允许同步的 Markdown 修改，并推送一个 commit。
- 首版不使用 SQL 数据库；同步状态由 Git 工作区动态计算，运行时操作记录仍保存在服务端忽略目录。
- 已增加 `server/src/config.ts`：支持 `LIBRARY_ROOT`、`WRITE_SAFETY_ROOT`、`GIT_SYNC_ENABLED`、`GIT_SYNC_REMOTE` 和 `GIT_SYNC_BRANCH`。
- 已增加 `server/src/gitSync.ts` 与同步接口：`GET /api/sync/status`、`POST /api/sync/push`、`POST /api/sync/pull`；同步面板支持刷新远程状态和安全快进拉取。
- 已完成公开代码仓库首轮边界审计：当前公开分支不包含真实 `sample-library` 内容、`.env`、密钥或运行时记录；真实学习资料继续保存在私有 `learn-everything` 仓库。
- 已在本地验证 `GET /api/health`、`GET /api/library` 和 `GET /api/article`。
- 已补充并部署生产 `build/start` 脚本、`HOST/PORT` 配置、systemd 服务和 Nginx Basic Auth 反向代理配置。
- VPS 已完成前端构建、后端构建、systemd 自动启动和 `GET /api/health` 验证；后端仅监听 `127.0.0.1:3001`，由 Nginx 对外提供访问。
- 已通过电脑浏览器验证：Basic Auth 登录、真实私有学习库目录、Markdown 文章和反馈保存链路均可用。
- 生产环境当前使用域名 HTTPS + Nginx Basic Auth；HTTPS 跳转、电脑/手机/BOOX 远程打开已验证，APK 原生 WebView 已加入 Basic Auth 认证弹窗，应用内单用户登录仍未启用。
- `feat/remember-me-session` 已合并到 `main`：增加可选的单用户应用登录、7 天记住登录、服务端 scrypt 密码哈希、HttpOnly 会话 Cookie、登录失败限速和统一 API 鉴权；本地构建、接口集成和手动使用测试均已完成，尚未部署到 VPS。
- 应用登录默认由 `AUTH_ENABLED=false` 关闭；部署时需要确认 `AUTH_COOKIE_SECURE=true`、`AUTH_SESSION_FILE` 可写，并移除 Nginx Basic Auth，避免同时出现两套密码框。
- 本次认证迁移不需要重新安装 APK；之前的滚动冲突修复属于原生外壳变更，仍需在 Java 21 环境重新构建 APK 后安装。
- APK 不直接调用 AI 服务；任何生产 AI 服务的连接测试和密钥配置仍只在 VPS 服务端进行，正式开始学习前再做一次端到端生成回归。
- 已用临时 Git 仓库验证多文件一次 commit/push、Markdown 文件白名单、不允许文件拦截和远程领先冲突保护。
- 已将同步状态面板接入电脑端右侧栏和手机/BOOX 窄屏同步抽屉。
- 已补充 GitHub → VPS 的可视化拉取：仅允许工作区干净、历史可快进且远程更新为允许的 Markdown；本地修改、分叉历史和非 Markdown 更新会被 `409` 阻止，不执行强制覆盖。
- 已在本地 `learn-everything` 工作区完成真实测试：中文目录下的 Markdown 修改能够被识别，并能由后端合并为一个 commit 推送到 GitHub 私有仓库。
- 已修复 Git 中文路径被八进制转义后误判为不允许同步的问题。
- GitHub 同步 UI 与中文路径修复已经分别通过 Pull Request 合并到程序仓库 `main`。
- PR #8 `feat/remember-me-session` 已合并到程序仓库 `main`；合并前已通过前端 lint、前端生产构建、后端构建和 `git diff --check`，并完成登录、退出、记住 7 天、会话失效和鉴权接口集成验证。

## 2. 已完成

### 产品与范围

- 已形成 P0 初版 PRD，明确最小闭环：

  ```text
  选择学习库 → 浏览项目和文章 → 阅读 Markdown → 提交反馈 → AI 生成并保存下一篇
  ```

- 已确认产品目标是用户指定的本地文件夹；P0 保留真实目录树，当前测试库顶层为 `yet-to-start`、`on-going`、`archived`。学习库根路径现在可通过 `LIBRARY_ROOT` 配置；未配置时才回退到项目根目录的 `sample-library/`，当前本地配置已指向私有 `learn-everything` 工作区。
- 已确认 Markdown 文件是学习内容的主要真源。
- 已确认书籍项目使用 `sources/` 保存原始章节，保留 `00-原文索引.md`，一篇学习文章可以对应多个原文文件。
- 已创建 `docs/BOOK_LEARNING_MODE.md`，明确书籍初始化、原文映射、上下文选择和生成前检查规则。
- 已用 `Thinking, Fast and Slow` 完成一次书籍项目初始化示例：41 个原文 Markdown 已移入 `sources/`，并创建 `00-原文索引.md`、`00-学习计划.md` 和第一篇 `01.md`。
- 该示例的初始路线收束为 39 篇学习文章；`01.md` 已按 `dbs-learning` 结构包含正文、小结、下一篇预告和反馈模板。
- 已确认用户反馈追加到当前文章末尾，不单独建立反馈数据库。
- 已确认生成成功后停留在当前文章，只提示下一篇文章名称。
- 已确认 P0 保存最近打开文章的自动续读位置，但不显示阅读进度，也不记录阅读时长、完成状态或学习统计。
- 已确认 P0 不集成 Neo Reader；P2 不制作浏览器快捷方式，而是制作不显示浏览器工具栏的远程 WebView APK。
- 已确认 P2 APK 只作为原生外壳加载 `https://www.maki3991.xyz`：普通网页、后端和学习资料更新不需要重新安装 APK；只有原生外壳变化时才重新打包。
- 已创建 `client/android/` Capacitor Android 外壳：包名为 `xyz.maki3991.interactivestudy`，原生层提供沉浸式全屏、WebView 返回和下拉刷新；Release APK 已构建并通过 APK v2 签名校验。
- 已修复 Android WebView 下拉刷新与文章内部滚动的冲突：原生层通过网页桥接读取 `.reader-scroll` 的滚动位置，仅在阅读区位于顶部时拦截下拉刷新；修复后需要重新构建 APK 并在 BOOX 真机复测。
- 当前 Release APK 位于 `client/android/app/build/outputs/apk/release/app-release.apk`；本机未连接 BOOX 的 ADB 设备，因此仍需手动传输或连接设备完成真机验收。Release 密钥位于本机 `client/android/keystore/`，密码配置位于被忽略的 `client/android/keystore.properties`，两者都需要单独备份。
- 已把 P1 暂定方向明确为 VPS 后端 + 私有 `learn-everything` 学习资料仓库 + 用户主动触发的 Git 同步；P0 本地模式仍保留。
- 已完成 UI Spec v0.6：电脑双栏阅读、可折叠侧栏、Obsidian 式文件树、BOOX 窄屏阅读控制面板、约三分之二宽的学习库抽屉、文末反馈保存、后续生成状态和可选单用户登录页规则；取消正文底部常驻小节标题，改为纯滚动阅读。
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
- 数据保存：P0 本地 Markdown 文件与简单 JSON 配置；P1 VPS 工作区与私有 GitHub 仓库。
- 数据库：P0/P1 暂不使用数据库；Git 状态和操作记录分别承担同步状态与安全恢复职责。
- AI：已安装 OpenAI SDK 和 `dotenv`；API 密钥只由服务端从 `.env` 读取，前端不接触 API key；`POST /api/learning/generate-next` 已完成一次真实 OpenAI 生成验证。
- 已在前端加入 `react-markdown`，用于把后端返回的 Markdown 字符串安全转换为 React 阅读元素。
- 已形成 P0 数据模型和 API 草案，共规划 10 个业务接口；其中配置接口仍待实现，另有一个开发期上下文预览接口。
- 已完成“读取学习库并打开 Markdown 文章”“保存反馈”和“提交反馈并生成下一篇”三条最小功能链；`Thinking, Fast and Slow/02.md` 已通过一次实际生成创建。
- 已更新 P0/P1 的产品、架构和数据/API 文档，记录远程工作区、手动同步、凭据边界和数据库边界；同步接口与前端状态面板、手动同步按钮已经接入。

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
- 已实现并验证 `GET /api/library`：递归扫描配置的学习库根路径，返回真实文件夹树和 `.md` 文件，忽略 `.txt`、`.json` 等非 Markdown 普通文件；响应已确认包含 `archived`、`on-going`、`yet-to-start` 三个顶层文件夹。
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
- 已修改 `client/src/components/FeedbackPanel.tsx`：空反馈不可保存；保存期间禁用输入与按钮；保存成功后保留反馈，允许直接继续生成；生成完成或后台生成时显示对应状态。
- 已补充反馈使用规则：生成按钮可以使用输入框中的新反馈，也可以在输入框为空时回退使用 Markdown 中最近一次已保存的反馈；保存按钮仍要求输入框有新内容。
- 已实现 `POST /api/feedback`：后端复用 Markdown 路径安全校验，确认目标是学习库内的普通 `.md` 文件后，使用 `submissionId` 内部标记与同文件写入队列避免重复追加；只追加反馈，不调用 AI。
- 已直接验证反馈接口：首次请求返回 `alreadySaved: false`，相同 `submissionId` 的重复请求返回 `alreadySaved: true` 且文件内标记只出现一次；越界路径返回 `403`。
- 已在浏览器中验证：输入反馈后可以保存并生成下一篇；后端文章读取接口能够返回最近反馈、下一篇是否存在和是否正在生成；已完成基本的刷新恢复、服务重启和生成状态验证。
- 已实现 `GET /api/learning/context-preview?path=...`：能从 `01.md` 找到所属学习项目、`00-学习计划.md`、当前/下一篇编号和对应的 `sources/` 原文；已用 `Thinking, Fast and Slow` 的真实目录验证。
- 已实现 `POST /api/learning/generate-next` 的后端流程：反馈优先保存、按映射读取原文、调用 OpenAI、校验生成结构，并使用独占临时文件和原子创建防止覆盖下一篇，再更新学习计划。
- 已实现 AI 写入安全层：`server/src/writeSafety.ts` 保存生成操作记录和学习计划快照，记录文件写入前后的 SHA-256 哈希，并以临时文件加原子重命名写入；服务重启时会把未完成操作标记为 `interrupted`。
- 已实现生成后的恢复入口：`GET /api/learning/operations/:operationId` 查询操作，`POST /api/learning/operations/:operationId/rollback` 在哈希未冲突时恢复学习计划、删除本次新建文章，并保留当前文章反馈；前端成功提示中显示修改文件和“撤销本次生成”。
- 已在前端 `client/src/api.ts` 增加生成请求，在 `App.tsx` 和反馈面板增加生成状态、失败保留草稿和“提交并生成下一篇”按钮；按钮未点击时不会调用 OpenAI。
- 已在前端 `client/src/api.ts` 增加 `loadSyncStatus()`、`pushSync()`；`App.tsx` 与 `SyncPanel.tsx` 会显示 Git 工作区状态、待同步 Markdown、冲突提示，并由用户点击按钮后一次性触发同步。
- 已运行后端 `tsc --noEmit`、前端 `npm.cmd run build`、前端 `npm.cmd run lint` 和 `git diff --check`，均通过。
- 已实际在浏览器中打开 `yet-to-start → Thinking, Fast and Slow → 00-contents.md` 与 `00-introduction.md`，确认真实标题、引用、列表、行内代码和文内文章链接均正常；在 600×800 窄屏下，正文保持独立滚动。前端 `npm run build`、`npm run lint` 均通过。
- 已完成一次个人局域网实测：手机和 BOOX 可以访问电脑提供的页面，读取本地学习库，提交反馈，并触发电脑端转发 OpenAI 和写回本地 Markdown 的流程。

当前后端入口 `server/src/index.ts` 的职责边界：

- 启动 Express 本地服务；
- 提供开发检查接口 `GET /api/health`；
- 提供真实目录树接口 `GET /api/library`；
- 提供单篇 Markdown 读取接口 `GET /api/article`；
- 提供反馈保存接口 `POST /api/feedback`；
- 提供书籍上下文检查接口 `GET /api/learning/context-preview`；
- 提供提交反馈并生成下一篇接口 `POST /api/learning/generate-next`；
- 提供生成操作查询和回滚接口 `GET/POST /api/learning/operations/:operationId`；
- 在同一文件中暂存目录扫描、路径安全校验、文章摘要与反馈追加等后端内部函数。后续函数增多时再按职责拆分文件。

### 项目文档

- `docs/PRD.md`：P0 产品需求初稿。
- `docs/ARCHITECTURE.md`：技术栈、系统边界和核心数据流。
- `docs/DATA_MODEL_AND_API.md`：数据模型、当前 API 实现和后续 AI 接口草案。
- `docs/BOOK_LEARNING_MODE.md`：书籍原文、索引、学习计划和 AI 上下文规则。
- `docs/UI_SPEC.md`：页面结构、响应式布局、交互规则和静态原型验收点。
- `docs/STATUS.md`：记录当前进度、未实现项和归档后的重新启动条件。
- `docs/ANDROID_APK.md`：记录 Capacitor Android 外壳的构建、签名和更新规则。

## 3. 未实现或留待需要时再做

以下项目不是开始学习的前置条件；它们保留在这里，只有真实使用中确有需要时才重新打开开发：

- 已完成电脑端与手机/BOOX 的基本可用性验证；不同屏幕尺寸、输入法、断网和服务重启的完整验收矩阵仍未建立。
- 配置相关 API（选择学习库、保存最近打开位置）仍处于设计状态；目录、文章、反馈和书籍生成相关接口已有后端实现。
- 学习库根路径已经可以通过 `LIBRARY_ROOT` 配置，但尚未实现用户在应用界面中选择、保存和更换学习库路径；未配置时仍使用 `sample-library/` 作为回退路径。
- 当前已覆盖常用 Markdown 阅读语法；GitHub 风格表格、任务列表和代码语法高亮尚未接入，等真实学习材料需要时再扩展。
- 书籍项目初始化示例已经完成；应用目前已实现符合当前格式的学习计划解析和原文映射读取，通用初始化自动化仍未实现。
- AI 生成前后端链路和第一版写入保护已经实现并完成核心故障回归；尚未实现真正的多文件数据库式事务、自动清理策略和完整断网/并发故障注入测试。
- 已在 BOOX 上完成基本网页闭环验证；APK 的页面尺寸、触摸操作、语音输入、断网和刷新核对留待首次使用，暂不阻塞归档。
- 生产模板当前使用 Nginx Basic Auth 保护网页和 API；应用内单用户会话已经合并到 `main` 并完成本地验证，但尚未部署。HTTPS 已稳定，是否迁移到应用登录留待 APK 实施前决定；API key 仍只保存在服务端，不能下发到手机或 BOOX。
- 已形成并实现 P1 的可配置学习工作区、本地 Git 同步后端和客户端手动同步界面；生产启动配置、访问保护、VPS HTTPS 和远程阅读链路已完成，P2 APK 首次真机核对留待实际使用。
- 当前程序仓库最新工作树和公开分支历史不再包含 `sample-library/` 中的真实 Markdown 内容；本地配置已接入私有 `learn-everything` 工作区，首轮边界审计已完成。百炼/Qwen 的真实 API Key 只保存在本地或 VPS 的服务端环境变量中，不进入代码仓库。VPS 运行与后续更新过程中仍需复核 `.env`、Git 凭据和运行时记录的存放位置。
- 公开代码仓库与私有学习资料仓库的内容边界已按当前方案划定：公开仓库保存程序，私有仓库保存真实学习资料；部署时继续保持两者分离。

## 4. 当前结论与边界

> 状态更新（2026-09-05）：上面的阶段记录保留历史背景；当前 VPS 已通过 HTTPS 验证，手机、BOOX 和电脑均可远程打开，P2 Release APK 已构建并保留签名配置。项目现在暂时归档，优先开始真实学习；只有出现可复现问题或需要修改原生外壳时再恢复开发。

静态原型的首轮布局体验已经完成：底部常驻标题会遮挡滚动正文的问题已移除，电脑端顶部栏分隔线也已对齐；接入真实长目录后发现的电脑与 BOOX 窄屏滚动边界问题也已修复。真实 Markdown 已从原始文本变为阅读排版；局域网基本闭环也已经跑通。P0.1 AI 写入安全与恢复已经完成核心实现和真实操作验收。P1 的本地手动同步闭环也已完成并合并到程序仓库 `main`：前端先查看状态，用户点击同步后由后端把允许的 Markdown 修改合并为一个 commit 并 push；中文目录路径也已完成真实验证。公开仓库边界审计、本地只读 API 冒烟验证和生产配置模板也已完成。当前 VPS 已完成 HTTPS 部署并验证 Nginx → Express → 私有学习库链路；本地百炼/Qwen AI 适配和真实生成链也已验收。应用内单用户登录已由 PR #8 合并到 `main`，并完成本地验证；当前保留 Nginx Basic Auth，项目进入真实学习观察期。

- 暂不单独创建 `DESIGN.md`。
- 电纸书约束已经写入 `docs/UI_SPEC.md`：黑白灰、无动画、大触摸区域、轻量渲染、不依赖悬停操作。
- Solarized 可继续作为电脑端个人审美偏好，但不作为 BOOX 阅读器的样式实现来源；其主要价值是语义化 CSS 变量的组织方式，项目当前已采用类似做法。

## 5. 归档期的使用方式

### 当前任务：开始真实学习并记录实际问题

当前执行口径：不复制后端或学习库到 APK；APK 只作为无浏览器工具栏的远程 HTTPS WebView 外壳。Release APK 已生成并保留签名密钥，可以直接安装到 BOOX；首次使用时顺手确认认证、阅读、反馈、生成和刷新即可。

P0 的“阅读 → 反馈 → AI → 写入下一篇”在本地已经可以使用，P0.1 的写入安全与恢复也已完成核心验收。P1 的本地 Git 同步闭环已经真实跑通并合并到 `main`；VPS 的 HTTPS、Basic Auth、systemd、私有学习库访问和远程阅读链路已经完成。应用内会话功能保留为后续选项，当前不迁移 Basic Auth，也不把它作为开始学习的条件。

暂定任务顺序：

1. 已完成：把当前固定的 `sample-library/` 改为可配置的学习工作区路径。
2. 已完成：增加 Git 工作区服务和 `GET /api/sync/status`、`POST /api/sync/push`。
3. 已完成：用临时本地仓库测试多文件一次同步一个 commit、白名单和远程领先冲突保护。
4. 已完成：接入 `client/src/api.ts` 的同步函数和前端同步状态展示/按钮。
5. 已完成：审计公开代码仓库与私有 `learn-everything` 内容仓库的边界。
6. 已完成：在本地验证健康检查、学习库目录和 Markdown 文章读取 API。
7. 已完成：确定并实现最小生产访问保护、服务端启动配置和部署模板。
8. 已完成：VPS 临时部署、Nginx Basic Auth、systemd 自动启动和 Nginx → Express → 私有学习库链路验证。
9. 已完成：在 `feat/ai-provider-adapter` 分支中增加可切换的 AI 服务商适配层，并在本地验证百炼/Qwen OpenAI 兼容 API。
10. 已完成基础验证：VPS 服务可启动、健康检查通过；正式开始学习前，再做一次远程反馈、生成和同步端到端回归。
11. 已完成：配置域名和 HTTPS；手机、BOOX 和电脑可以在个人电脑关闭时远程打开网站并完成基本阅读验证。
12. 已完成首版 P2 外壳：配置 Capacitor Android、远程 HTTPS 地址、沉浸式全屏、下拉刷新和返回行为；Release APK 构建并签名成功。
13. 归档期首次使用时，在 BOOX 上顺手确认 Nginx Basic Auth、阅读、反馈、生成、下拉刷新和返回行为；若无问题，不需要继续开发。

目标流程（已按暂定方案实现并完成核心验收）：

```text
用户点击“提交并生成下一篇”
  → 前端提交文章路径、反馈和 submissionId
  → 后端创建操作记录，并保存学习计划的生成前快照
  → 后端读取上下文并调用配置的 AI 服务商（生产环境当前 OpenAI 直连超时）
  → 校验生成结果
  → 先写入临时文件，再以原子方式替换目标文件
  → 确认下一篇文章和学习计划都写入成功，记录写入后哈希
  → 返回修改文件摘要；失败时保留原文件并记录操作状态
  → 成功后允许按 operationId 检查冲突并手动回滚
```

第一版安全恢复已经覆盖：生成前备份、AI 失败不产生空白文件、学习计划更新失败时保留操作记录、生成结果的修改摘要、手动回滚入口，以及重复点击和已有文件冲突。当前暂不自动删除历史操作记录和备份，也不把两个文件包装成数据库式事务。

`client/src/mockLibrary.ts` 在迁移期间暂时保留，作为可回退的静态原型数据；真实 API 接入并验证完成后再决定是否删除。

## 6. 待确认但不阻塞当前保存功能链

- 学习库首版使用系统文件夹选择器，还是先在配置中手动填写路径。
- 固定提示词的最终文本和原文映射是否细化到 Markdown 标题。
- 不规范文章文件名的下一篇编号规则。
- 生成操作记录和快照的保留期限、清理入口。
- P1 远程访问当前采用 HTTPS + Nginx Basic Auth；APK 原生层通过认证回调处理 401，后续再决定是否迁移到已实现的单用户应用登录，以及是否需要设备级授权。
- GitHub 远程领先时采用手动拉取、只允许快进，还是增加冲突解决界面。
- P2 APK 的包名、签名密钥保存、WebView 认证处理已经完成；全屏/系统导航栏行为和 BOOX 真机验收只作为首次使用时的观察项，不阻塞当前归档。

## 7. 仓库状态提醒

程序仓库的 Git 同步功能、中文路径修复和 PR #8 应用登录功能已经合并到 `main`。P0.1 已完成真实生成、强制中断、失败保留、撤销和撤销后重新生成测试；P1 本地同步闭环也已完成真实 GitHub 验证；P2 Release APK 已构建并签名。项目当前暂时归档，后续维护仍需确认服务器上的 `.env`、Git 凭据、签名密钥和运行时记录不会进入公开代码仓库或静态发布目录。

## 8. 文章内标记与批注（2026-09-12，第一阶段）

- 已建立功能分支 `feat/text-annotations`。
- 已实现一个或多个连续普通段落内选中文字后的悬浮栏：波浪线、高光、批注；首末段支持部分选择，中间段落按整段保存。
- 已实现自有 Markdown 保存格式、隐藏 JSON 元数据、文章版本校验和原子写入。
- 已实现刷新后恢复波浪线/高光/批注角标，以及点击角标查看批注。
- 已把波浪线和批注接入生成下一篇的 AI 上下文；高光只作为重要/喜欢信号，不默认影响路径判断。
- 当前限制：不支持跨越代码/链接/列表/复杂内联格式的选择、重叠标记和导出。
- 已验证：客户端 build、客户端 lint、服务端 build、`git diff --check`，以及服务端标记数据的创建/更新/删除往返测试。
- 待验证：真实浏览器中的单段/多段选区悬浮栏、视觉样式、批注角标点击和刷新后的界面恢复；当前环境没有可接管的浏览器标签。
