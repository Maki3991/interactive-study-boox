# VPS 部署模板

这一组模板对应当前的暂定生产方案：

```text
浏览器
  → Nginx（HTTPS 反向代理）
  → 127.0.0.1:3001（Express，仅 VPS 本机可访问）
  → /opt/learn-everything（私有学习资料仓库）
```

## 1. VPS 目录和服务用户

以下路径是模板默认值；如果修改路径，需要同步修改 systemd、Nginx 和环境文件。

```bash
sudo useradd --system --create-home --home /var/lib/studyboox --shell /usr/sbin/nologin studyboox
sudo mkdir -p /opt/interactive-study-boox /opt/learn-everything /etc/interactive-study-boox
sudo chown -R root:studyboox /opt/interactive-study-boox
sudo chown -R studyboox:studyboox /opt/learn-everything
sudo install -d -o studyboox -g studyboox /opt/interactive-study-boox/server/.interactive-study-boox
```

程序仓库放在 `/opt/interactive-study-boox`，私有 `learn-everything` 仓库放在 `/opt/learn-everything`。GitHub 私有仓库的 deploy key 或凭据只配置在 VPS，不写入公开程序仓库。

## 2. 构建程序

在 VPS 中分别安装依赖并构建后端和前端：

```bash
cd /opt/interactive-study-boox/server
npm ci
npm run build

cd /opt/interactive-study-boox/client
npm ci
npm run build
```

如果 `command -v node` 不是 `/usr/bin/node`，需要修改 `deploy/systemd/interactive-study-boox.service.example` 中的 `ExecStart`。

## 3. 创建服务端环境文件

在 VPS 上创建 `/etc/interactive-study-boox/server.env`，不要把真实值写回 Git：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
OPENAI_API_KEY=替换为真实值
OPENAI_MODEL=gpt-5
LIBRARY_ROOT=/opt/learn-everything
WRITE_SAFETY_ROOT=/opt/interactive-study-boox/server/.interactive-study-boox
GIT_SYNC_ENABLED=true
GIT_SYNC_REMOTE=origin
GIT_SYNC_BRANCH=main
AUTH_ENABLED=true
AUTH_PASSWORD_HASH=替换为生成的 scrypt 哈希
AUTH_SESSION_TTL_DAYS=7
AUTH_SESSION_FILE=/opt/interactive-study-boox/server/.interactive-study-boox/auth-sessions.json
AUTH_COOKIE_SECURE=true
```

生成应用登录密码哈希。密码只在 VPS 终端输入，不要写入 Git 或发送到聊天中：

```bash
cd /opt/interactive-study-boox/server
sudo -u studyboox npm run auth:hash
```

把命令输出的整行哈希填入 `AUTH_PASSWORD_HASH`。`AUTH_SESSION_FILE` 只保存哈希后的会话标识和过期时间，服务用户需要对它所在目录拥有写权限。

限制环境文件权限，并让服务用户能够读取：

```bash
sudo chown root:studyboox /etc/interactive-study-boox/server.env
sudo chmod 640 /etc/interactive-study-boox/server.env
```

## 4. 安装并检查 systemd 服务

```bash
sudo install -m 644 deploy/systemd/interactive-study-boox.service.example \
  /etc/systemd/system/interactive-study-boox.service
sudo systemctl daemon-reload
sudo systemctl enable --now interactive-study-boox
sudo systemctl status interactive-study-boox --no-pager
curl --fail http://127.0.0.1:3001/api/health
```

只有看到 `{"status":"ok"}` 后，才继续配置 Nginx。

## 5. 配置 HTTPS 反向代理

应用登录由 Express 处理，Nginx 只负责 HTTPS、静态文件和反向代理。安装配置：

```bash
sudo install -m 644 deploy/nginx/interactive-study-boox.conf.example \
  /etc/nginx/sites-available/interactive-study-boox
sudo ln -sfn /etc/nginx/sites-available/interactive-study-boox \
  /etc/nginx/sites-enabled/interactive-study-boox
sudo nginx -t
sudo systemctl reload nginx
```

模板默认使用 `server_name _`，因此可以先用 VPS IP 做临时连通性检查。正式使用前必须绑定域名并配置 HTTPS；不要在没有 HTTPS 的公网 HTTP 页面中输入应用登录密码。

如果旧配置中存在以下两行，需要删除后再 reload Nginx，否则仍会弹出 Basic Auth 对话框：

```nginx
auth_basic ...;
auth_basic_user_file ...;
```

启用应用登录后重启 Express：

```bash
sudo systemctl restart interactive-study-boox
sudo systemctl status interactive-study-boox --no-pager
```

## 6. 验收顺序

1. VPS 本机请求 `http://127.0.0.1:3001/api/health`。
2. VPS 本机请求 `http://127.0.0.1:3001/api/library`，确认读取的是私有学习库。
3. 电脑浏览器访问 HTTPS 地址，确认出现网页内的应用登录页并能打开页面。
4. 登录后确认网页请求 `/api/library` 和 `/api/article` 成功。
5. 最后再测试手机/BOOX；不再用手机反复判断 Nginx 是否启动。
