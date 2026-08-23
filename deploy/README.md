# VPS 部署模板

这一组模板对应当前的暂定生产方案：

```text
浏览器
  → Nginx（Basic Auth，公开入口）
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
```

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

## 5. 配置最小访问保护

Basic Auth 的密码哈希保存在 VPS 的 `/etc`，不进入仓库：

```bash
sudo apt-get update
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.interactive-study-boox.htpasswd studyboox
sudo chmod 640 /etc/nginx/.interactive-study-boox.htpasswd
sudo chown root:www-data /etc/nginx/.interactive-study-boox.htpasswd
```

然后安装 Nginx 配置：

```bash
sudo install -m 644 deploy/nginx/interactive-study-boox.conf.example \
  /etc/nginx/sites-available/interactive-study-boox
sudo ln -sfn /etc/nginx/sites-available/interactive-study-boox \
  /etc/nginx/sites-enabled/interactive-study-boox
sudo nginx -t
sudo systemctl reload nginx
```

模板默认使用 `server_name _`，因此可以先用 VPS IP 做临时连通性检查。正式使用前必须绑定域名并配置 HTTPS；不要在没有 HTTPS 的公网 HTTP 页面中输入真实 Basic Auth 密码。

## 6. 验收顺序

1. VPS 本机请求 `http://127.0.0.1:3001/api/health`。
2. VPS 本机请求 `http://127.0.0.1:3001/api/library`，确认读取的是私有学习库。
3. 电脑浏览器访问 Nginx 地址，确认出现登录框并能打开页面。
4. 登录后确认网页请求 `/api/library` 和 `/api/article` 成功。
5. 最后再测试手机/BOOX；不再用手机反复判断 Nginx 是否启动。
