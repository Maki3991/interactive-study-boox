# Architecture

> 版本：v0.3
> 更新日期：2026-08-14
> 当前状态：真实 Markdown 的读取、阅读与反馈安全保存已实现；AI 生成仍待接入

## 1. 开发阶段

### P0：电脑端 Web Prototype

先在电脑上验证以下完整闭环：

```text
选择学习库 → 浏览 Markdown → 阅读文章 → 提交反馈 → 生成并保存下一篇
```

P0 在本机运行，不要求远程服务器，也不要求安装到 BOOX Leaf 5。

### P1：BOOX Leaf 5 可用版本

P0 验证完成后，再决定电脑与 BOOX 之间的同步方式、远程访问方式和 Android APK 包装方案。

## 2. 已确认技术栈

- 前端：React + Vite + TypeScript
- 后端：Node.js + Express + TypeScript
- 包管理器：npm
- 学习内容：本地 Markdown 文件
- 文件读写：Node.js 文件系统 API
- 简单应用状态：JSON 配置文件
- 数据库：P0 不使用数据库
- AI：后端通过独立的 AI 服务接口调用，具体供应商后续确认
- BOOX App：P0 完成后再评估 Android WebView 或其他包装方案

## 3. 第一阶段架构边界

- Markdown 文件是学习内容的主要真源。
- 用户反馈直接追加到当前 Markdown 文件末尾。
- 下一篇文章由后端直接写入当前学习项目文件夹。
- 不为反馈单独创建数据库或 `feedback/` 文件夹。
- 不引入 SQLite。
- 不引入后台任务队列；用户点击按钮后直接发起一次生成请求。
- 最近打开的文章、自动续读位置和学习库路径可以保存在简单配置文件中。

## 4. 计划中的代码职责

```text
浏览器中的 React 页面
  ↓ HTTP 请求
本机 Express 后端
  ↓
读取或写入用户指定的 Markdown 学习库
  ↓
需要生成下一篇时调用 AI 服务
```

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

### 5.4 提交反馈并生成下一篇（后续）

```text
用户点击“提交并生成下一篇”
  ↓
前端提交当前文章和反馈
  ↓
后端先把反馈追加到当前 Markdown
  ↓
后端读取学习计划、当前文章和本次反馈
  ↓
后端调用 AI 服务
  ↓
后端创建下一篇 Markdown
  ↓
前端提示下一篇文章名称并停留在当前页面
```

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

## 7. 后续待确认

- AI 服务供应商、模型和 API 密钥保存方式。
- 电脑学习库与 BOOX Leaf 5 的同步方式。
- BOOX 访问本地文件还是访问远程 API。
- Android APK 的具体包装技术。
- Leaf 5 真机上的 Markdown 渲染和输入法兼容性。
