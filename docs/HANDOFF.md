# Interactive Study Boox｜交接文档

> 给下一次对话使用。先读本文件，再读 `docs/STATUS.md`、`docs/PRD.md`；开始修改代码前还要遵守项目根目录的 `AGENTS.md`。
>
> 更新时间：2026-08-29

## 一句话结论

阅读、反馈保存、AI 生成下一篇、GitHub 手动同步和写入恢复已经形成可用闭环；VPS 临时 HTTP 部署也已经验证。单用户应用登录与“记住 7 天”功能已经由 PR #8 合并到 `main` 并完成本地验证，但尚未部署到 VPS。下一阶段先完成域名/HTTPS 和 VPS 到生产 AI 服务的连接验证，再决定是否启用应用登录。

## 项目目标

这是一个只供本人使用的互动式学习 Web 应用，目标设备包括电脑、手机和 BOOX Leaf 5：

- 阅读本地 Markdown 学习文章；
- 在文章末尾输入或语音转文字写学习反馈；
- 保存反馈到当前 Markdown 文件；
- 根据当前文章、反馈、学习计划和对应原文，生成下一篇学习文章；
- 通过 GitHub 同步个人学习库；
- 最终部署到公网，让 BOOX 只要有网络就能使用。

## 仓库与数据位置

- 应用代码：`D:\Softwares\Programming Projects\interactive-study-boox`
- 当前学习库：`D:\Softwares\Programming Projects\learn-everything`
- GitHub 应用仓库：`Maki3991/interactive-study-boox`
- GitHub 学习内容仓库：`Maki3991/learn-everything`
- `learn-everything` 是当前真正的数据源；`sample-library` 只是旧的示例数据，不应再作为生产数据源。

不要把密码、OpenAI API Key、GitHub Token 或私钥写进此文档、代码仓库或聊天记录。

## 已经实现并验证过的功能

- `archived`、`on-going`、`yet-to-start` 学习目录及嵌套文件夹；
- Markdown 文件树、文章阅读页、电脑端与窄屏布局；
- 学习库侧边栏；
- GitHub 同步侧边栏；
- 记住上次阅读文章/位置的基础能力；
- 保存学习反馈到当前 Markdown 文件；
- “提交并生成下一篇”；
- 生成失败后的重试、操作记录/恢复相关能力（具体以当前代码为准）；
- AI 生成下一篇已在 BOOX 上成功测试，曾成功生成《思考，快与慢》的第三篇；
- GitHub 同步曾用测试 Markdown 文件真实推送验证成功；
- 局域网访问曾在手机和 BOOX 上测试成功；
- 单用户应用登录、退出登录、记住 7 天、会话失效、登录失败限速和统一 API 鉴权；
- 应用密码已通过重新生成服务端哈希的方式更换；真实密码不进入仓库。

## 当前代码结构（概览）

### 前端

- `client/src/App.tsx`：页面总编排和主要状态；
- `client/src/api.ts`：前端请求后端的封装；
- `client/src/components/LoginScreen.tsx`：应用登录页面；
- `client/src/types.ts`：前端数据类型；
- `client/src/components/LibraryTree.tsx`：学习库树；
- `client/src/components/ReaderPane.tsx`：文章阅读区；
- `client/src/components/FeedbackPanel.tsx`：反馈输入与提交；
- `client/src/components/ReaderMenu.tsx`：窄屏/BOOX 阅读菜单；
- `client/src/components/SyncPanel.tsx`：GitHub 同步面板。

### 后端

- `server/src/index.ts`：Express 服务和 API 路由；
- `server/src/auth.ts`：密码哈希校验、会话 Cookie、登录限速和统一鉴权；
- `server/src/generateAuthHash.ts`：生成 `AUTH_PASSWORD_HASH`；
- `server/src/ai.ts`：调用 OpenAI API；
- `server/src/writeSafety.ts`：写入和同步安全检查；
- 后端端口：`3001`；
- Vite 前端端口：`5173`。

后端 API 的功能大致包括：健康检查、读取库目录、读取文章、保存反馈、生成下一篇、生成操作恢复、读取同步状态、推送 GitHub。继续开发前应直接检查当前代码中的实际路由，不要只根据本文件猜路由细节。

## 当前 Git 状态

- 当前分支：`main`；
- 当前工作区为干净的 `main`；
- PR #8 `feat/remember-me-session` 已合并到 `main`；
- 不要为了“清理状态”执行 `git reset --hard`、`git checkout --` 或覆盖这些修改；
- 修改前先运行 `git status --short --branch`，不要把代码合并误认为已经部署到 VPS。

## VPS 当前信息

已经购买阿里云 ECS，约 ¥99/年：

- 地域：华北 2（北京）；
- 公网 IP：`39.105.94.46`；
- Ubuntu 24.04 64 位；
- 2 vCPU、2 GiB 内存；
- 40 GiB ESSD Entry 系统盘；
- 固定公网带宽 3 Mbps；
- 当前实例处于运行中。

这是第一台测试 VPS。以后即使互动学习项目被证明是假需求，也可以在这台 VPS 上部署个人主页或其他小型网站。

## VPS 已完成的操作

在 ECS Workbench 终端执行过：

```bash
apt update && apt upgrade -y
apt install -y nginx
systemctl enable --now nginx
systemctl status nginx --no-pager
```

目前确认：

- Nginx 服务是 `active (running)`；
- Nginx 监听 `0.0.0.0:80` 和 `[::]:80`；
- 在 VPS 内执行 `curl -I http://127.0.0.1` 返回 `HTTP/1.1 200 OK`；
- 已完成项目代码的临时部署、systemd 自动启动、Nginx Basic Auth 反向代理和私有学习库读取链路验证；
- 当前仍是临时 HTTP 环境，域名/HTTPS 和生产环境 AI 连接尚未完成；
- `ufw status verbose` 显示 `Status: inactive`。

当前 VPS 后端仍只监听本机端口，对外访问由 Nginx 提供；不要公开开放 `3001` 或 `5173`。

## 阿里云安全组当前情况

已经确认入方向有一条 Web HTTP 规则：

- 允许；
- TCP；
- 端口 `80`；
- 来源 `0.0.0.0/0`。

当前不要公开开放 `3001` 或 `5173`。应用正式部署后，Nginx 对外提供 80/443，Express 只监听本机端口。

安全方面后续要处理：

- 删除或关闭 Ubuntu 不需要的 RDP `3389` 公网规则；
- SSH `22` 暂时可用于管理，但后续应限制来源或使用更安全的方式；
- 域名和 HTTPS 配好后，再开放 `443`，并考虑把 HTTP 重定向到 HTTPS。

## 当前公网、域名和备案状态

- `maki3991.xyz` 已购买并完成实名认证；ICP备案流程仍在审核中，以阿里云和管局最终状态为准。
- VPS 已完成临时 HTTP 部署，Nginx 对外提供访问，Express 只监听本机端口；正式 HTTPS 尚未完成。
- ICP 审核属于域名/网站合规流程，不会阻塞本地继续开发，也不要求每个新功能都重新开一个代码分支。
- DNS、HTTPS、备案和应用是否真正对公网开放是不同层次的问题；下一次处理公网时要分别记录“域名解析是否生效”“HTTPS 是否可用”“应用是否部署”三个结果。

## 公网与生产部署下一步

1. 等待并跟踪 ICP 审核，同时准备域名 DNS 和 HTTPS 配置。
2. 配置 HTTPS 后，从电脑、手机和 BOOX 验收域名访问；不要把代码已合并等同于 VPS 已更新。
3. 测试 VPS 到已在本地验证的百炼/Qwen 兼容 API 的出站连接；成功后再安全更新服务端环境变量。
4. 拉取 `main`、分别构建 `client` 和 `server`、重启 systemd 服务，然后检查 `/api/health`、登录状态和页面访问。
5. HTTPS 稳定后，决定继续使用 Nginx Basic Auth，还是启用应用内单用户登录；两套凭据不要混淆。
6. 若启用应用登录，在 VPS 设置 `AUTH_ENABLED` 和新的服务端密码哈希，测试登录、退出、记住 7 天、过期和服务重启后的重新登录。
7. 最后从电脑、手机和 BOOX 完整测试阅读、反馈、AI 生成、失败恢复和 GitHub 同步。

注意：客户端能否访问 VPS，和 VPS 能否访问 AI 服务是两条不同的网络链路。前者正常不代表后者正常，需要分别测试。

## 新功能交接模板

以后开启新对话时，把下面模板复制给新的 Agent，并把方括号内容填完整。无需重新粘贴整个历史对话。

```markdown
# 新功能需求：［功能名称］

请先阅读：
- AGENTS.md
- docs/HANDOFF.md
- docs/STATUS.md
- docs/PRD.md
- 与本功能直接相关的 docs/ARCHITECTURE.md、docs/DATA_MODEL_AND_API.md、docs/UI_SPEC.md

## 1. 背景和要解决的问题

［现在遇到了什么问题？为什么要做这个功能？］

## 2. 用户动作和预期结果

用户会：
1. ［动作 1］
2. ［动作 2］
3. ［动作 3］

我希望看到：
- ［成功结果］
- ［失败时的提示或保留行为］

## 3. 已有行为

- 当前已经可以：［列出现有功能］
- 当前不可以或有问题：［列出现有缺口］
- 不要破坏：［列出必须保留的行为］

## 4. 本次范围

本次必须完成：
- ［功能点 1］
- ［功能点 2］

本次明确不做：
- ［不要顺手加入的功能］

## 5. 验收标准

- ［可以通过页面观察的结果］
- ［接口或错误处理结果］
- ［刷新/重启/重复点击后的结果］
- ［如果涉及持久化，数据应保存在哪里］

## 6. 约束和安全边界

- 这是单用户个人项目，不引入多用户/支付/复杂基础设施，除非本次明确要求。
- 不要把密码、API Key、Token 或私钥写入代码、文档或聊天。
- ［其他约束，例如 BOOX 窄屏、必须兼容现有 Markdown、不能覆盖旧文件］

## 7. 当前开发状态

- 分支：［例如 feat/xxx］
- 是否已有未提交修改：［是/否；如果是，列出文件］
- 已经测试过：［命令或手动场景］
- 尚未测试：［剩余场景］

## 8. 工作方式

请先用 3—6 个步骤说明实现计划，并先检查实际代码；修改后说明：
- 用户动作 → 前端组件/函数 → API 请求 → 后端处理 → 数据保存 → 页面结果；
- 修改了哪些文件以及各自职责；
- 执行了哪些验证，哪些仍未验证；
- 不要自动提交、推送或部署，除非我明确要求。
```

## 给下一次 AI 的工作约束

- 先读本文件、`docs/STATUS.md`、`docs/PRD.md`；
- 不要要求用户粘贴密码、API Key、GitHub Token 或私钥；
- 不要擅自修改工作区外文件；
- 不要覆盖用户对 `PRD.md`、`STATUS.md` 的本地修改；
- 不要把 ICP 审核、DNS、HTTPS、应用部署和 AI 出站连接混成一个问题；
- 每次只推进一个短步骤，并告诉用户该步骤成功/失败意味着什么；
- 若用户说“继续测试”，先确认他要测试的是域名解析、HTTPS、应用服务还是 AI 出站连接，再执行对应的最小检查。

