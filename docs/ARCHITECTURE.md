# Architecture

> 当前状态：初稿，以下内容属于候选方案，尚未全部确认。

## 当前方向

- 先做 Web 版本，验证阅读、反馈和生成下一篇的完整闭环。
- 后续将 Web 版本包装成可以安装到 BOOX Leaf 5 的 Android APK。
- 第一阶段先在本机运行，确认功能后再考虑远程服务器。
- 学习文章以 Markdown 文件作为主要内容来源。

## 候选技术栈

- 前端：React + Vite + TypeScript
- 后端：Node.js + Express + TypeScript
- 状态数据：SQLite
- 学习内容：Markdown 文件
- AI：由后端调用 AI API
- 电纸书 App：后续使用 Android WebView 外壳包装 Web 界面

## 预期数据流

```text
Leaf 5 提交反馈
  ↓
前端提交函数
  ↓
后端 API
  ↓
保存反馈和学习状态
  ↓
调用 AI 生成下一篇
  ↓
写入新的 Markdown 文章
  ↓
前端显示下一篇已准备好
```

## 待讨论的架构问题

- 第一版是否使用 React，还是先使用更简单的 HTML、CSS 和 JavaScript。
- SQLite 保存哪些内容，哪些内容只保留在 Markdown 文件中。
- 反馈是否同时写入数据库和 `feedback/` 文件夹。
- AI 生成任务是否需要后台队列。
- APK 包装放在第一个可用版本之前，还是在 Web 闭环验证后进行。
