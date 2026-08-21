# Architecture

> 版本：v0.6
> 更新日期：2026-08-21
> 当前状态：P0/P0.1 已完成；P1 VPS 远程访问、私有学习库与手动 GitHub 同步方案暂定

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

### P2：Android APK

P2 再评估把访问远程 API 的 Web 客户端封装成 Android APK，具体采用 WebView、Capacitor 或其他技术仍待确认。

## 2. 技术栈与运行方案

P0 的技术栈已经确认；P1 的 VPS、Git 同步和访问控制仍标记为暂定方案。

- 前端：React + Vite + TypeScript
- 后端：Node.js + Express + TypeScript
- 包管理器：npm
- 学习内容：P0 本地 Markdown 文件；P1 VPS 上私有仓库工作副本中的 Markdown 文件
- 文件读写：Node.js 文件系统 API
- 简单应用状态：JSON 配置文件
- 版本同步：P1 暂定使用 VPS 上的 Git CLI，用户主动同步时一次性 commit 并 push
- 数据库：P0/P1 暂不使用数据库
- AI：后端通过 OpenAI API 调用；密钥保存在服务端 `.env`，模型由 `OPENAI_MODEL` 配置，默认使用 `gpt-5`
- 远程访问：P1 暂定通过 HTTPS 暴露后端；访问鉴权方式仍待确认
- BOOX App：P2 再评估 Android WebView 或其他包装方案

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

生成上下文由后端从配置的工作区组装：固定学习规则、学习计划、当前文章、用户反馈和计划映射的 `sources/` 原始材料。前端只提交当前文章路径、反馈和提交标识；P1 的同步凭据不会下发到前端。

计划按前后端职责组织代码：

```text
interactive-study-boox/
├── client/        # React 页面、Markdown 展示、反馈输入和按钮
├── server/        # Express API、文件读写、AI 调用和配置
├── docs/          # PRD、架构和开发状态
├── AGENTS.md
└── README.md
```

实际初始化时可以根据脚手架生成结果微调文件位置，但应保留清楚的前后端职责边界。

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
后端读取学习计划、当前文章、反馈和映射的原始材料
  ↓
后端根据 `dbs-learning` 规则组装提示词并调用 OpenAI
  ↓
后端校验返回结构
  ↓
后端以原子方式创建下一篇 Markdown
  ↓
后端以原子方式更新学习计划并写入操作记录
  ↓
两个文件确认写入后，操作标记为 `committed`
  ↓
前端提示下一篇文章名称、修改文件和“撤销本次生成”入口
```

当前后端实现拆成三块：

- `server/src/learningContext.ts`：根据当前文章找到学习项目、学习计划和映射的 `sources/` 原文；
- `server/src/generationPrompt.ts`：把固定学习规则、计划、当前文章、反馈和原文组装成一次 AI 请求；
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
用户点击“同步到 GitHub”
  ↓
前端请求 GET /api/sync/status（可选，先展示待同步文件）
  ↓
前端请求 POST /api/sync/push
  ↓
后端检查工作区、当前分支和远程是否领先
  ↓
只暂存允许同步的学习 Markdown 文件
  ↓
一次 git commit，包含本次所有修改
  ↓
一次 git push 到私有 learn-everything 仓库
  ↓
返回 commit、同步文件和下一次状态
```

同步按钮不是逐文件上传接口。P1 暂定以 VPS 本地 clone 加 Git CLI 实现，便于一次操作产生一个有意义的 commit；如果远程领先或检测到冲突，后端返回 `409`，不执行强制 push。远程手动编辑、拉取策略和冲突解决界面留待后续确认。

## 6. 当前电脑开发环境

已经确认安装：

- Node.js 24.16.0（x64，通过 NVM 管理）
- npm 11.13.0
- Git 2.54.0
- GitHub CLI 2.96.0
- Visual Studio Code 1.132.0
- Java/JDK 17.0.11（P0 暂不使用）

P0 不需要安装 SQLite、Android SDK、ADB 或全局 Gradle。

React、Vite、TypeScript、Express 等属于项目依赖，应在初始化代码项目时安装到项目目录，不进行全局安装。

P1 还需要一台具有持久化磁盘的 Linux VPS、Node.js、Git 和安全的服务端密钥配置；VPS 尚未部署，具体供应商和运行方式待本地同步原型验证后再决定。

## 7. 后续待确认

- 生成提示词的最终文本和原文映射是否细化到 Markdown 标题。
- 不规范文章文件名的下一篇编号规则。
- `LIBRARY_ROOT` 与私有 `learn-everything` 工作副本的配置接口和更换策略。
- `GET /api/sync/status`、`POST /api/sync/push` 的具体响应字段和允许同步的文件范围。
- GitHub 远程领先时采用手动拉取、只允许快进，还是增加冲突解决界面。
- VPS 远程访问采用公开 HTTPS、VPN、一次性访问码还是反向代理鉴权。
- Android APK 的具体包装技术，以及生产环境 API 地址配置。
- Leaf 5 真机上的 Markdown 渲染和输入法兼容性。
