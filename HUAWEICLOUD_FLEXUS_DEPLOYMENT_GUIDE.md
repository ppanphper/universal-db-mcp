# 华为云 Flexus 服务器部署 Universal DB MCP 完整指南

本文档记录了在华为云 Flexus 服务器（Ubuntu 22.04 Server 64bit）上部署 Universal DB MCP 的完整过程。

---

## 目录

- [部署方案概述](#部署方案概述)
- [第一部分：环境检查与准备](#第一部分环境检查与准备)
- [第二部分：Docker Compose 版本问题解决](#第二部分docker-compose-版本问题解决)
- [第三部分：创建部署配置](#第三部分创建部署配置)
- [第四部分：启动服务](#第四部分启动服务)
- [第五部分：端口冲突解决](#第五部分端口冲突解决)
- [第六部分：运维管理](#第六部分运维管理)
- [第七部分：防火墙配置说明](#第七部分防火墙配置说明)
- [第八部分：常见错误解决](#第八部分常见错误解决)
- [第九部分：Nginx 反向代理配置](#第九部分nginx-反向代理配置)
- [第十部分：域名与 HTTPS 配置](#第十部分域名与-https-配置)
- [附录：Nano 编辑器使用指南](#附录nano-编辑器使用指南)

---

## 部署方案概述

推荐使用 **HTTP API 模式 + Docker 部署**，这是最稳定、可维护的方案。

```
用户请求
    ↓
[Nginx :80/443] ←── 反向代理（可选）
    ↓
[MCP 服务 :3001] ←── Docker 容器
```

---

## 第一部分：环境检查与准备

### 1.1 检查 Docker 是否已安装

```bash
# 方法 1: 查看 Docker 版本
docker --version

# 方法 2: 检查 Docker 服务状态
sudo systemctl status docker

# 方法 3: 检查 Docker 是否在运行
docker info

# 方法 4: 检查安装包
dpkg -l | grep docker
```

如果已安装，会显示类似：
```
Docker version 24.0.7, build afdd53b
```

如果未安装，会显示：
```
Command 'docker' not found
```

### 1.2 安装 Docker（如未安装）

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要工具
sudo apt install -y curl wget git vim

# 安装 Docker
curl -fsSL https://get.docker.com | sudo sh

# 将当前用户添加到 docker 组
sudo usermod -aG docker $USER

# 重新登录使权限生效
exit
# 重新 SSH 连接
```

### 1.3 检查 Docker Compose 版本

```bash
docker-compose --version
# 或
docker compose version
```

---

## 第二部分：Docker Compose 版本问题解决

### 2.1 问题描述

执行 `docker-compose up -d --build` 时报错：

```
Error response from daemon: client version 1.43 is too old. 
Minimum supported API version is 1.44, please upgrade your client to a newer version
```

### 2.2 原因分析

Docker 版本较新（如 29.2.0），但 Docker Compose 版本较旧（如 v2.20.3），两者不兼容。

### 2.3 解决方案：升级 Docker Compose

**无需卸载，直接覆盖安装即可**（不会影响正在运行的服务如 FastGPT）：

```bash
# 下载最新版本并覆盖
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose

# 添加执行权限
sudo chmod +x /usr/local/bin/docker-compose

# 确保插件目录存在
sudo mkdir -p /usr/libexec/docker/cli-plugins

# 复制到插件目录
sudo cp /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose

# 验证版本
docker compose version
```

### 2.4 对现有服务的影响

- ✅ 正在运行的容器不受影响
- ✅ 升级只是替换 compose 命令工具
- ✅ 不会重启或停止任何容器

### 2.5 命令变化说明

新版本使用 `docker compose`（空格）替代 `docker-compose`（横杠）：

| 旧版本 (V1) | 新版本 (V2) |
|------------|------------|
| `docker-compose up` | `docker compose up` |
| `docker-compose down` | `docker compose down` |
| `docker-compose logs` | `docker compose logs` |

---

## 第三部分：创建部署配置

### 3.1 创建项目目录

```bash
mkdir -p /opt/universal-db-mcp-plus
cd /opt/universal-db-mcp-plus
mkdir -p logs config
```

### 3.2 创建环境配置文件 (.env)

```bash
cat > .env << 'EOF'
# 运行模式
MODE=http

# HTTP 服务配置
HTTP_PORT=3001
HTTP_HOST=0.0.0.0

# API 密钥（请修改为您自己的安全密钥）
API_KEYS=your-secure-api-key-change-me

# CORS 配置
CORS_ORIGINS=*

# 速率限制
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1m

# 日志级别
LOG_LEVEL=info
NODE_ENV=production
EOF
```

### 3.3 创建 Dockerfile

```bash
cat > Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

# 安装 universal-db-mcp-plus
RUN npm install -g universal-db-mcp-plus

# 设置环境变量
ENV MODE=http
ENV HTTP_PORT=3001
ENV HTTP_HOST=0.0.0.0

EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

CMD ["npx", "universal-db-mcp-plus"]
EOF
```

### 3.4 创建 docker-compose.yml

```bash
cat > docker-compose.yml << 'EOF'
services:
  universal-db-mcp-plus:
    build: .
    container_name: universal-db-mcp-plus
    ports:
      - "3001:3001"
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - mcp-network
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

networks:
  mcp-network:
    driver: bridge
EOF
```

> **注意**：新版 Docker Compose 不需要 `version: '3.8'`，如果有会显示警告（可忽略或删除）。

---

## 第四部分：启动服务

### 4.1 构建并启动

```bash
cd /opt/universal-db-mcp-plus
docker compose up -d --build
```

### 4.2 验证服务状态

```bash
# 检查容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 健康检查
curl http://localhost:3001/api/health
```

预期输出：
```json
{"status":"ok","timestamp":"..."}
```

---

## 第五部分：端口冲突解决

### 5.1 问题描述

启动时报错：
```
Bind for 0.0.0.0:3000 failed: port is already allocated
```

### 5.2 原因分析

端口 3000 已被其他服务占用（如 FastGPT）。

### 5.3 查看端口占用

```bash
sudo lsof -i :3000
# 或
sudo netstat -tlnp | grep 3000
```

### 5.4 解决方案：修改端口

**方法 1：使用 sed 命令直接替换**

```bash
# 修改 .env 文件中的端口
sed -i 's/HTTP_PORT=3000/HTTP_PORT=3001/' /opt/universal-db-mcp-plus/.env

# 修改 docker-compose.yml 中的端口映射
sed -i 's/3000:3000/3001:3001/' /opt/universal-db-mcp-plus/docker-compose.yml
```

**方法 2：直接覆盖 .env 文件**

```bash
cat > /opt/universal-db-mcp-plus/.env << 'EOF'
MODE=http
HTTP_PORT=3001
HTTP_HOST=0.0.0.0
API_KEYS=your-secure-api-key-change-me
CORS_ORIGINS=*
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1m
LOG_LEVEL=info
NODE_ENV=production
EOF
```

### 5.5 重启服务

```bash
cd /opt/universal-db-mcp-plus
docker compose down
docker compose up -d
```

---

## 第六部分：运维管理

### 6.1 基础操作

```bash
# 进入项目目录
cd /opt/universal-db-mcp-plus
```

### 6.2 启动 / 停止 / 重启

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 停止但不删除容器
docker compose stop

# 启动已停止的容器
docker compose start
```

### 6.3 查看状态

```bash
# 查看容器运行状态
docker compose ps

# 查看所有容器（包括停止的）
docker ps -a | grep universal-db-mcp-plus

# 查看资源占用（CPU、内存）
docker stats universal-db-mcp-plus
```

### 6.4 查看日志

```bash
# 查看实时日志
docker compose logs -f

# 查看最近 100 行日志
docker compose logs --tail 100

# 查看指定时间内的日志
docker compose logs --since 1h
```

### 6.5 更新版本

```bash
cd /opt/universal-db-mcp-plus

# 停止服务
docker compose down

# 重新构建（拉取最新 npm 包）
docker compose build --no-cache

# 启动服务
docker compose up -d
```

### 6.6 健康检查

```bash
# 本地检查
curl http://localhost:3001/api/health

# 外网检查（使用服务器公网 IP）
curl http://YOUR_SERVER_IP:3001/api/health
```

### 6.7 清理操作

```bash
# 停止并删除容器、网络
docker compose down

# 停止并删除容器、网络、镜像
docker compose down --rmi all

# 清理未使用的镜像（释放磁盘空间）
docker image prune -f
```

### 6.8 快速命令速查表

| 操作 | 命令 |
|------|------|
| 启动 | `docker compose up -d` |
| 停止 | `docker compose down` |
| 重启 | `docker compose restart` |
| 状态 | `docker compose ps` |
| 日志 | `docker compose logs -f` |
| 健康检查 | `curl http://localhost:3001/api/health` |

### 6.9 设置开机自启

Docker 服务默认开机自启，由于配置了 `restart: unless-stopped`，服务器重启后容器会自动启动。

```bash
# 确认 Docker 开机自启
sudo systemctl enable docker
```

---

## 第七部分：防火墙配置说明

### 7.1 UFW 防火墙作用

防火墙控制哪些网络连接可以进入服务器。

| 命令 | 作用 |
|------|------|
| `sudo ufw allow 22/tcp` | 允许 SSH 连接（端口 22） |
| `sudo ufw allow 3001/tcp` | 允许访问 MCP API 服务 |
| `sudo ufw enable` | 启用防火墙 |
| `sudo ufw status` | 查看防火墙规则 |

### 7.2 是否需要配置？

**情况 1：华为云已有安全组（推荐）**

如果已在华为云控制台配置了安全组规则，**UFW 可以不配置**。云安全组已在云平台层面做了网络隔离。

**情况 2：需要双重保护**

如果想要更高安全性，可以配置 UFW：

```bash
# 允许 SSH（必须先执行！）
sudo ufw allow 22/tcp

# 允许 MCP 端口
sudo ufw allow 3001/tcp

# 如果有其他服务（如 FastGPT）
sudo ufw allow 3000/tcp

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status
```

> ⚠️ **重要**：一定要先允许 SSH（22端口）再启用防火墙，否则会被锁在服务器外面！

---

## 第八部分：常见错误解决

### 8.1 SSL 错误

**错误信息：**
```
Error: write EPROTO ... SSL routines:OPENSSL_internal:WRONG_VERSION_NUMBER
```

**原因：** 使用了 HTTPS 协议访问 HTTP 服务。

**解决方案：** 确保 URL 使用 `http://` 而不是 `https://`

```
❌ https://YOUR_SERVER_IP:3001/api/health
✅ http://YOUR_SERVER_IP:3001/api/health
```

### 8.2 外网无法访问

**检查步骤：**

1. 确认本地可以访问：
   ```bash
   curl http://localhost:3001/api/health
   ```

2. 检查华为云安全组是否放行了端口 3001

3. 检查 UFW 防火墙（如果启用）：
   ```bash
   sudo ufw status
   ```

---

## 第九部分：Nginx 反向代理配置

### 9.1 Nginx 反向代理的作用

```
用户请求
    ↓
[Nginx :80/443] ←── 前台接待（统一入口）
    ↓
[MCP 服务 :3001] ←── 实际服务（内部）
```

| 作用 | 说明 |
|------|------|
| **统一入口** | 用户访问 80 端口，不需要记 3001 |
| **隐藏内部端口** | 服务端口不需要对外暴露，更安全 |
| **支持 HTTPS** | 可以在 Nginx 上配置 SSL 证书 |
| **负载均衡** | 如果有多个服务，可以分发请求 |
| **域名绑定** | 可以使用域名访问 |

### 9.2 是否需要配置？

**建议配置的情况：**
- 有域名，想用域名访问
- 需要 HTTPS 加密
- 想隐藏内部端口
- 服务器上有多个服务需要统一管理

**可以跳过的情况：**
- 只是测试使用
- 直接用 IP + 端口访问即可
- 暂时不需要 HTTPS

---

## 第十部分：域名与 HTTPS 配置

### 10.1 配置概览

```
用户访问 mcp.yourdomain.com
        ↓
[腾讯云 DNS 解析] → 指向华为云服务器 IP
        ↓
[华为云 Nginx :80/443] → 反向代理
        ↓
[MCP 服务 :3001]
```

### 10.2 步骤 1：配置 DNS 解析

在腾讯云 DNS 解析控制台添加记录：

| 字段 | 值 |
|------|-----|
| 主机记录 | `mcp` |
| 记录类型 | `A` |
| 线路类型 | `默认` |
| 记录值 | `华为云服务器公网 IP` |
| TTL | `600` |

验证解析：
```bash
ping mcp.yourdomain.com
```

### 10.3 步骤 2：华为云安全组配置

放行端口：

| 协议 | 端口 | 源地址 |
|------|------|--------|
| TCP | 80 | 0.0.0.0/0 |
| TCP | 443 | 0.0.0.0/0 |

### 10.4 步骤 3：配置 Nginx

```bash
# 创建配置文件
sudo tee /etc/nginx/sites-available/universal-db-mcp-plus << 'EOF'
server {
    listen 80;
    server_name mcp.yourdomain.com;  # 替换为您的域名

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/universal-db-mcp-plus /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重新加载
sudo systemctl reload nginx
```

### 10.5 步骤 4：配置 HTTPS

**检查 Certbot 是否已安装：**

```bash
certbot --version
```

**如未安装：**

```bash
sudo apt install -y certbot python3-certbot-nginx
```

**申请 SSL 证书：**

```bash
sudo certbot --nginx -d mcp.yourdomain.com -m your-email@example.com --agree-tos
```

**关于邮箱：**
- 任何有效邮箱都可以（QQ、163、Gmail 等）
- 用于接收证书到期提醒
- 建议使用常用邮箱

**测试自动续期：**

```bash
sudo certbot renew --dry-run
```

### 10.6 验证访问

```bash
# HTTP 访问
curl http://mcp.yourdomain.com/api/health

# HTTPS 访问
curl https://mcp.yourdomain.com/api/health
```

### 10.7 Nginx 常用命令

```bash
# 查看状态
sudo systemctl status nginx

# 测试配置
sudo nginx -t

# 重新加载配置
sudo systemctl reload nginx

# 重启
sudo systemctl restart nginx

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 查看访问日志
sudo tail -f /var/log/nginx/access.log
```

### 10.8 Certbot 常用命令

```bash
# 查看已申请的证书
sudo certbot certificates

# 手动续期
sudo certbot renew

# 测试续期
sudo certbot renew --dry-run
```

---

## 附录：Nano 编辑器使用指南

### 打开文件

```bash
nano /path/to/file
```

### 基本操作

1. **移动光标**：使用方向键（↑↓←→）
2. **编辑内容**：直接输入文字
3. **删除字符**：使用 Backspace 键

### 保存并退出

1. 按 **Ctrl + O**（保存）
2. 按 **Enter** 确认文件名
3. 按 **Ctrl + X**（退出）

### 快捷键速查

| 快捷键 | 功能 |
|--------|------|
| Ctrl + O | 保存文件 |
| Ctrl + X | 退出编辑器 |
| Ctrl + K | 剪切当前行 |
| Ctrl + U | 粘贴 |
| Ctrl + W | 搜索 |
| Ctrl + G | 显示帮助 |

---

## 最终目录结构

```
/opt/universal-db-mcp-plus/
├── .env                    # 环境配置
├── docker-compose.yml      # Docker Compose 配置
├── Dockerfile              # Docker 镜像构建文件
├── logs/                   # 日志目录
└── config/                 # 配置目录（扩展用）
```

---

## API 使用示例

### 健康检查

```bash
curl http://localhost:3001/api/health
```

### 连接数据库

```bash
curl -X POST http://localhost:3001/api/connect \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "mysql",
    "host": "your-db-host",
    "port": 3306,
    "user": "your-user",
    "password": "your-password",
    "database": "your-database"
  }'
```

### 执行查询

```bash
curl -X POST http://localhost:3001/api/query \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM users LIMIT 10"
  }'
```

---

## 安全提醒

1. **修改默认 API 密钥**：务必将 `.env` 中的 `API_KEYS` 修改为强密码
2. **限制访问来源**：生产环境中将 `CORS_ORIGINS` 设置为具体域名
3. **使用 HTTPS**：配置 SSL 证书保护数据传输
4. **定期更新**：定期更新 Docker 镜像和系统补丁
5. **监控日志**：定期检查日志文件

---

*文档创建日期：2026年1月28日*
