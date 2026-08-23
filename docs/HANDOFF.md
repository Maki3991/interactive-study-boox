# Interactive Study Boox｜交接文档

> 给下一次对话使用。先读本文件，再读 `docs/STATUS.md`、`docs/PRD.md`。

## 一句话结论

当前不是应用代码部署失败，而是公网请求似乎还没有到达阿里云 ECS。下一步先证明外部请求能否抵达 ECS 的 80 端口，再继续部署应用；暂时不要继续改 Nginx 或前端代码。

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
- 局域网访问曾在手机和 BOOX 上测试成功。

## 当前代码结构（概览）

### 前端

- `client/src/App.tsx`：页面总编排和主要状态；
- `client/src/api.ts`：前端请求后端的封装；
- `client/src/types.ts`：前端数据类型；
- `client/src/components/LibraryTree.tsx`：学习库树；
- `client/src/components/ReaderPane.tsx`：文章阅读区；
- `client/src/components/FeedbackPanel.tsx`：反馈输入与提交；
- `client/src/components/ReaderMenu.tsx`：窄屏/BOOX 阅读菜单；
- `client/src/components/SyncPanel.tsx`：GitHub 同步面板。

### 后端

- `server/src/index.ts`：Express 服务和 API 路由；
- `server/src/ai.ts`：调用 OpenAI API；
- `server/src/writeSafety.ts`：写入和同步安全检查；
- 后端端口：`3001`；
- Vite 前端端口：`5173`。

后端 API 的功能大致包括：健康检查、读取库目录、读取文章、保存反馈、生成下一篇、生成操作恢复、读取同步状态、推送 GitHub。继续开发前应直接检查当前代码中的实际路由，不要只根据本文件猜路由细节。

## 当前 Git 状态

- 当前分支：`main`；
- `docs/PRD.md` 和 `docs/STATUS.md` 有本地修改；
- 不要为了“清理状态”执行 `git reset --hard`、`git checkout --` 或覆盖这些修改；
- 本交接文件是新增文件，后续是否提交、如何提交由用户决定。

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
- 仍是 Nginx 默认页面；
- 还没有部署项目代码；
- 还没有配置反向代理、域名或 HTTPS；
- `ufw status verbose` 显示 `Status: inactive`。

所以当前不能把浏览器看到的 502 归因于项目代码。

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

## 当前公网访问问题

用户从浏览器访问：

```text
http://39.105.94.46/
```

目前手机和电脑都无法正常打开，浏览器曾显示 HTTP 502 或长时间等待。

已经收集到的关键证据：

1. VPS 本机访问 Nginx 成功；
2. Nginx 正常监听 80；
3. `ufw` 没有启用；
4. 安全组已有 TCP 80 入方向规则；
5. 手机测试时，VPS 上的 Nginx access log 没有出现对应的外部请求；
6. `tcpdump -ni any 'tcp port 80'` 主要看到的是阿里云内部管理流量，例如 `100.100.30.26`、`100.100.100.10`，没有看到手机访问公网 IP 时应有的外部 SYN；
7. 因此当前最可能的问题发生在请求到达 Nginx 之前：代理/TUN/VPN、手机网络路径、公网 IP/实例网络设置或运营商路径，而不是应用代码。

用户电脑此前经常打开系统代理、TUN、全局模式梯子。后续测试必须明确关闭这些因素，否则结果可能被代理改变。

## 下一次对话的第一步：只做公网链路诊断

### 1. 在 VPS 上启动抓包

在 ECS Workbench 终端执行：

```bash
tcpdump -ni eth0 'tcp[tcpflags] & tcp-syn != 0 and dst port 80'
```

让它保持运行。

### 2. 用 Windows 电脑测试

关闭系统代理、TUN 和全局模式梯子，然后在 PowerShell 执行：

```powershell
Test-NetConnection 39.105.94.46 -Port 80
```

记录 `TcpTestSucceeded` 是 `True` 还是 `False`。

### 3. 用手机做干净测试

优先使用手机移动数据，不连接 Wi-Fi；关闭手机 VPN/代理，然后打开：

```text
http://39.105.94.46/
```

等待 5–10 秒。

### 4. 回到 VPS 停止抓包

按 `Ctrl+C`，把完整输出发给下一次对话。

### 结果判断

- **抓包没有外部 SYN**：请求没有到 ECS。继续查公网 IP、实例网络、安全组、代理/TUN 或手机/运营商路径；不要继续改 Nginx 或项目代码。
- **抓包有 SYN，但浏览器仍失败**：再查安全组、监听地址、Nginx、系统防火墙。
- **能看到请求并返回 HTTP**：公网链路打通，才进入应用部署。

不要把 `curl -4 ifconfig.me` 当成主要诊断。它测试的是 VPS 的出站访问，和手机访问 VPS 的入站问题不是一回事；此前它超时不能证明公网入站不可用。

## 公网链路打通后的部署顺序

暂时不要执行，等 80 端口外部访问确认后再做：

1. 在 VPS 安装 Git 和 Node.js LTS；
2. 拉取应用仓库；
3. 以安全方式获取私有的 `learn-everything` 内容仓库；
4. 配置服务器端环境变量：内容库路径、OpenAI Key、GitHub 认证信息、端口等；
5. 构建前端静态文件；
6. 用 systemd 或其他进程管理方式运行 Express；
7. 配置 Nginx：静态页面由 Nginx 提供，`/api/` 反向代理到本机 Express；
8. 先用公网 IP 做 HTTP 冒烟测试；
9. 再购买/绑定域名，配置 HTTPS；
10. 从电脑、手机、BOOX 完整测试：阅读、保存反馈、AI 生成、失败恢复、GitHub 同步。

注意：客户端能否访问 VPS，和 VPS 能否访问 OpenAI 是两条不同的网络链路。即使 BOOX 能打开网站，服务器本身仍可能无法访问 OpenAI；那时要单独决定使用可达的模型服务或服务器网络方案。

## 给下一次 AI 的工作约束

- 先读本文件、`docs/STATUS.md`、`docs/PRD.md`；
- 不要要求用户粘贴密码、API Key、GitHub Token 或私钥；
- 不要擅自修改工作区外文件；
- 不要覆盖用户对 `PRD.md`、`STATUS.md` 的本地修改；
- 不要在公网链路未确认前部署应用或修改大量代码；
- 每次只推进一个短步骤，并告诉用户该步骤成功/失败意味着什么；
- 若用户说“继续测试”，优先从上面的 `tcpdump + Test-NetConnection + 手机移动数据` 流程开始。

