# Architecture

> 版本：v0.9
> 更新日期：2026-09-05
> 当前状态：P0/P0.1 已完成；P1 本地同步闭环、VPS HTTPS 远程阅读和自适应生成链已完成；P2 远程 WebView APK Release 版已构建；项目暂时归档，进入真实使用观察期

## 1. 开发阶段

### P0：电脑端 Web Prototype

先在电脑上验证以下完整闭环：

```text
选择学习库 → 浏览 Markdown → 阅读文章 → 提交反馈 → 生成并保存下一篇
```

P0 在本机运行，不要求远程服务器，也不要求安装到 BOOX Leaf 5。

### P1：VPS 远程访问与手动 GitHub 同步（暂定）

P0 验证完成后，先把后端部署到具有持久化磁盘的 VPS：

```text
手机 / BOOX / 电脑浏览器
          ↓ HTTPS API
      VPS Express 后端
          ↓
  VPS 上 learn-everything 的 Git 工作副本
          ↓ 用户点击同步
  GitHub 私有 learn-everything 仓库
```

P1 使用现有阅读、反馈和 AI 生成链路；新增的是可配置工作区、Git 状态查询和手动同步。客户端不直接访问 GitHub，也不保存 OpenAI API Key 或 GitHub 凭据。

### P2：远程 WebView Android APK（首版已实施）

P2 不把整个学习库或前端构建产物固定复制进 APK，而是用 Capacitor Android 外壳加载远程 HTTPS 网站：

```text
BOOX 上的 APK
    ↓ 原生 WebView 外壳
https://www.maki3991.xyz
    ↓ HTTPS
Nginx → Express API → VPS 上的 learn-everything 工作区
```

原生外壳负责沉浸式全屏、无浏览器工具栏、返回行为、下拉刷新和 BOOX 触摸适配；网页阅读、反馈、AI 生成、学习资料和 Git 同步仍由现有 Web/VPS 链路负责。普通网页、后端或 Markdown 更新不需要重新安装 APK；只有原生外壳本身变化时才重新打包。

## 2. 技术栈与运行方案

P0 的技术栈已经确认；P1 的 VPS 临时部署和 Git 同步已实现，正式 HTTPS 与生产访问控制仍标记为暂定方案。

- 前端：React + Vite + TypeScript
- 后端：Node.js + Express + TypeScript
- 包管理器：npm
- 学习内容：P0 本地 Markdown 文件；P1 VPS 上私有仓库工作副本中的 Markdown 文件
- 文件读写：Node.js 文件系统 API
- 简单应用状态：JSON 配置文件
- 版本同步：P1 使用 VPS 上的 Git CLI；用户可以主动 push 本地 Markdown 修改，也可以在工作区干净且历史可快进时 pull GitHub 更新
- 数据库：P0/P1 暂不使用数据库
- AI：后端通过 OpenAI API 调用；密钥保存在服务端 `.env`，模型由 `OPENAI_MODEL` 配置，默认使用 `gpt-5`
- 远程访问：P1 当前通过 HTTPS 暴露后端；当前 VPS 使用 Nginx Basic Auth，应用内单用户会话已作为后续替代方案实现
- Android 外壳：P2 使用 Capacitor Android；默认通过远程 HTTPS URL 加载网站，不把 API Key、GitHub 凭据或 Basic Auth 密码放入 APK

## 3. P0 架构边界

- Markdown 文件是学习内容的主要真源。
- 书籍项目将原始材料放在 `sources/`，将原文索引、学习计划和生成文章放在项目根目录。
- `00-学习计划.md` 记录学习文章与一个或多个原始文件的映射。
- 用户反馈直接追加到当前 Markdown 文件末尾。
- 下一篇文章由后端直接写入当前学习项目文件夹。
- AI 生成使用持久化操作记录；学习计划在生成前保存快照，目标文件使用临时文件加原子重命名写入。
- 生成成功后可以按 `operationId` 查询操作并手动回滚；回滚前会用哈希确认文件没有被其他操作改动。
- 不为反馈单独创建数据库或 `feedback/` 文件夹。
- 不引入 SQLite。
- 不把两个 Markdown 文件伪装成数据库式的一次性事务；跨文件一致性由操作记录、冲突检测和手动恢复保障。
- 不引入后台任务队列；用户点击按钮后直接发起一次生成请求。
- 不在每次请求中发送整本书，不引入向量数据库或复杂全文检索。
- 最近打开的文章、自动续读位置和学习库路径可以保存在简单配置文件中。

### 3.1 P1 远程工作区边界（暂定）

- P0 的本地学习库和 P1 的 VPS 工作区使用同一套文件读写逻辑，只通过配置切换根路径。
- P1 的活动工作区暂定为 VPS 上 `learn-everything` 的 clone；未同步的修改保存在 VPS 持久化磁盘。
- GitHub 私有仓库保存已经同步的学习资料版本；VPS 工作区可能暂时领先于 GitHub。
- 用户点击同步后，后端使用 Git CLI 把允许同步的 Markdown 修改合并为一个 commit 并 push，不为每个文件单独提交。
- 客户端只调用 VPS API；GitHub Token、SSH 凭据和 OpenAI API Key 只存在 VPS 的密钥或环境变量中。
- 同步范围默认排除 `.env`、`node_modules/`、构建产物和 `server/.interactive-study-boox/` 运行时记录。
- 远程仓库领先、工作区存在冲突或 push 失败时不执行强制覆盖；先返回状态供页面处理。
- P1 不因为 Git 版本历史而引入 SQL 数据库；数据库只有在多用户、统计、复杂查询或更复杂同步需求出现时重新评估。

### 3.2 P2 Android 外壳边界

- APK 是远程网站的原生容器，不是第二套学习库，也不直接访问 GitHub。
- WebView 只加载允许的 HTTPS 网站；不使用浏览器地址栏、主页键、书签栏或外部浏览器作为主要阅读界面。
- 下拉刷新由原生层处理；页面刷新后重新读取当前 VPS 版本。
- WebView 需要保留安全的 Cookie、会话和必要的本地存储，但不在 APK 中硬编码服务端密码或 API Key。
- 当前保留 Nginx Basic Auth；Android 外壳通过 WebView 的 HTTP Basic Auth 回调弹出原生用户名/密码框，不把凭据硬编码进 APK。后续仍可迁移到已实现的应用内单用户登录。
- APK 依赖网络和 VPS；P2 第一版不承诺离线阅读、后台同步或本地 AI。
- 发行方式为手动分发签名 APK，不接入 Google Play；当前 Release 外壳已构建，项目暂时不继续扩展原生能力。

### 3.3 单用户应用会话（已合并到 main，生产启用待定）

- `AUTH_ENABLED` 默认关闭；只有服务端明确配置后，前端才显示应用登录页，因此当前已有环境不会被突然锁定。
- 个人登录密码只以 scrypt 哈希形式保存于服务端环境变量 `AUTH_PASSWORD_HASH`，不进入前端、Markdown 或 Git。
- 登录成功后由后端保存内存会话，浏览器只保存 `HttpOnly`、`SameSite=Lax` Cookie；勾选“记住 7 天”时 Cookie 设置 7 天有效期，否则为 8 小时浏览器会话。
- `/api/health` 和 `/api/auth/*` 保持可访问；学习库、文章、反馈、生成和 Git 同步接口统一经过应用会话校验。
- 当前会话保存在 Node 进程内存中，服务重启会让已有登录失效；这是个人单实例 MVP 的暂定方案，扩展多实例前再评估持久化会话存储。
- 生产环境默认要求 `AUTH_COOKIE_SECURE=true`；当前已具备 HTTPS，是否启用应用登录留待 APK 实施前决定。

## 4. 计划中的代码职责

```text
浏览器 / 手机 / BOOX 上的 React 页面
  ↓ /api HTTP 请求
P0 本机 Express 或 P1 VPS Express 后端
  ↓
读取或写入配置的 Markdown 学习工作区
  ↓
需要生成下一篇时调用 OpenAI
  ↓
P1 用户主动点击同步时调用 VPS Git CLI
  ↓
推送到私有 learn-everything 仓库
```

生成上下文由后端从配置的工作区组装：固定学习规则、学习计划、当前文章、用户反馈、原文索引和计划映射的 `sources/` 原始材料。生成时先由 AI 选择“推进课”或“补充课”以及 1—4 个原文文件，再由第二次 AI 请求生成文章。前端只提交当前文章路径、反馈和提交标识；P1 的同步凭据不会下发到前端。

计划按前后端职责组织代码：

```text
interactive-study-boox/
├── client/        # React 页面、Markdown 展示、登录、反馈输入和按钮
├── server/        # Express API、文件读写、AI 调用、登录和配置
├── docs/          # PRD、架构和开发状态
├── AGENTS.md
└── README.md
```

实际初始化时可以根据脚手架生成结果微调文件位置，但应保留清楚的前后端职责边界。

当前应用会话相关职责位于：

- `client/src/components/LoginScreen.tsx`：显示密码输入、记住登录选项和登录错误。
- `client/src/api.ts`：封装登录状态、登录和退出请求，并为失效会话发出前端事件。
- `client/src/App.tsx`：根据登录状态决定显示登录页还是学习阅读器。
- `server/src/auth.ts`：生成/校验 scrypt 密码哈希、创建内存会话、设置 Cookie 和拦截受保护 API。
- `server/src/generateAuthHash.ts`：在服务端终端交互生成 `AUTH_PASSWORD_HASH`，不回显明文密码。

## 5. 核心数据流

### 5.1 浏览文章

```text
用户点击文章
  ↓
React 前端请求文章内容
  ↓
Express 后端校验文件路径
  ↓
后端读取 Markdown 文件
  ↓
前端渲染为阅读页面
```

### 5.2 自动保存与恢复续读位置

```text
用户在阅读区域停止滚动
  ↓
React 前端计算当前文章的滚动比例
  ↓
前端请求保存最近文章和自动续读位置
  ↓
Express 后端校验文章路径并更新本地 JSON 配置

下次启动时
  ↓
前端读取最近文章和续读位置
  ↓
前端读取并渲染 Markdown
  ↓
渲染完成后滚动到保存的位置
```

自动续读位置仅用于恢复阅读，不作为面向用户显示的阅读进度或学习统计。

### 5.3 保存反馈（已实现）

```text
用户在文末输入反馈并点击“保存反馈”
  ↓
React 前端提交当前文章路径、反馈文本与 submissionId
  ↓
Express 校验学习库边界和请求字段
  ↓
后端检查 submissionId 是否已写入当前 Markdown
  ↓
首次请求追加反馈；同一次重试不重复追加
  ↓
前端显示保存结果，页面停留在当前文章
```

### 5.4 提交反馈并生成下一篇（后端已实现）

```text
用户点击“提交并生成下一篇”
  ↓
前端提交当前文章和反馈
  ↓
后端先把反馈追加到当前 Markdown
  ↓
后端读取学习计划、当前文章、反馈和原文索引
  ↓
第一次 AI 请求判断“推进课”或“补充课”，并选择原文路径
  ↓
后端校验路径位于项目的 `sources/` 内并读取选中的原文
  ↓
第二次 AI 请求根据路径判断和原文生成文章
  ↓
后端校验返回结构
  ↓
后端以原子方式创建下一篇 Markdown
  ↓
后端以原子方式更新学习计划、原文映射并写入操作记录
  ↓
两个文件确认写入后，操作标记为 `committed`
  ↓
前端提示下一篇文章名称、修改文件和“撤销本次生成”入口
```

当前后端实现拆成三块：

- `server/src/learningContext.ts`：根据当前文章找到学习项目、学习计划和映射的 `sources/` 原文；
- `server/src/learningRoute.ts`：解析和校验 AI 返回的推进/补充路径与原文选择；
- `server/src/generationPrompt.ts`：分别组装路径判断提示词和文章生成提示词；
- `server/src/writeSafety.ts`：管理生成操作记录、学习计划快照、SHA-256 哈希、原子写入和恢复相关冲突；
- `server/src/index.ts`：保存反馈、调用 AI、校验 Markdown、协调安全写入、查询操作和回滚请求。

生成操作的本地记录位于 `server/.interactive-study-boox/`，已加入 Git 忽略。服务启动时，未完成的旧操作会标记为 `interrupted`，不会自动删除或覆盖学习库文件。

### 5.5 书籍项目初始化

```text
原始书籍
  ↓
拆分到 sources/
  ↓
生成 00-原文索引.md
  ↓
生成 00-学习计划.md 和第一篇文章的原文映射
  ↓
生成 01.md
```

### 5.6 P1 手动同步到 GitHub（暂定）

```text
用户打开同步面板并点击“检查状态”
  ↓
前端请求 GET /api/sync/status?refresh=1，后端 fetch 远程状态
  ├─ VPS 有本地 Markdown 修改 → 用户可以点击“同步到 GitHub”
  │    ↓
  │  POST /api/sync/push → 暂存允许同步的 Markdown → 一次 commit → push
  └─ GitHub 领先且 VPS 工作区干净 → 用户可以点击“从 GitHub 拉取”
       ↓
     POST /api/sync/pull → 检查历史 → 只执行 git merge --ff-only
       ↓
     刷新 VPS 学习工作区和页面目录
```

同步按钮不是逐文件上传接口。P1 以 VPS 本地 clone 加 Git CLI 实现，便于一次操作产生一个有意义的 commit。拉取只允许工作区干净、VPS 没有本地领先提交、远程更新只包含允许的 Markdown 且历史可以快进的情况；如果存在本地修改、双方各有提交、非 Markdown 远程文件或其他冲突，后端返回 `409`，不执行强制覆盖，仍需人工处理。

## 6. 当前电脑开发环境

已经确认安装：

- Node.js 24.16.0（x64，通过 NVM 管理）
- npm 11.13.0
- Git 2.54.0
- GitHub CLI 2.96.0
- Visual Studio Code 1.132.0
- Java/JDK 17.0.11（系统默认）；Android APK 构建使用 Microsoft JDK 21.0.12

P0/P1 不需要安装 SQLite、Android SDK、ADB 或全局 Gradle；P2 已在本机安装 Android SDK、ADB、Gradle Wrapper 和 JDK 21，由 Capacitor/Android 工具链使用。

React、Vite、TypeScript、Express 等属于项目依赖，应在初始化代码项目时安装到项目目录，不进行全局安装。

P1 已具备具有持久化磁盘的 Linux VPS、Node.js、Git 和服务端密钥配置；域名 HTTPS、Nginx 反向代理和基本远程访问已经验证。P2 Release 外壳已经构建并保留签名配置；应用内登录是否启用留待真实使用后决定，当前不作为归档前置条件。

## 7. 后续待确认

- 生成提示词的最终文本和原文映射是否细化到 Markdown 标题。
- 不规范文章文件名的下一篇编号规则。
- `LIBRARY_ROOT` 与私有 `learn-everything` 工作副本的配置接口和更换策略。
- 允许同步的文件范围和复杂冲突的长期处理策略仍需继续确认；push 与只读快进 pull 接口已经实现。
- GitHub 双方各有提交时仍采用人工合并，暂不在个人学习应用中加入在线冲突解决器。
- VPS 正式远程访问保留 Nginx Basic Auth，还是在 HTTPS 后迁移到已实现的单用户应用登录。
- P2 的 release 签名密钥保存位置、WebView 认证处理和 BOOX 系统导航栏策略已经形成首版方案；首版包名已确定为 `xyz.maki3991.interactivestudy`，真机核对留待首次使用。
- Leaf 5 真机上的 Markdown 渲染和输入法兼容性，只有出现实际问题时再处理。
- 项目当前进入真实学习观察期；新增功能、分页阅读和离线阅读暂不作为本次提交范围。
