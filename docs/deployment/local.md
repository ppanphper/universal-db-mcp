# 本地部署

本文档介绍如何在本地环境部署 Universal DB MCP。

## 前置要求

- Node.js >= 20.0.0
- npm 或 yarn

## 方式一：直接运行

### 安装

```bash
npm install -g universal-db-mcp
```

### 启动 MCP 模式

```bash
universal-db-mcp \
  --type mysql \
  --host localhost \
  --port 3306 \
  --user root \
  --password your_password \
  --database your_database
```

### 启动 HTTP API 模式

```bash
# 设置环境变量
export MODE=http
export HTTP_PORT=3000
export API_KEYS=your-secret-key

# 启动
universal-db-mcp
```

## 方式二：从源码运行

### 克隆项目

```bash
git clone https://github.com/yourusername/universal-db-mcp.git
cd universal-db-mcp
```

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

### 运行

```bash
# MCP 模式
npm run start:mcp -- --type mysql --host localhost --port 3306 --user root --password xxx --database mydb

# HTTP API 模式
npm run start:http
```

## 方式三：PM2 部署

PM2 是 Node.js 的进程管理器，适合生产环境。

### 安装 PM2

```bash
npm install -g pm2
```

### 创建配置文件

创建 `ecosystem.config.cjs`：

```javascript
module.exports = {
  apps: [{
    name: 'universal-db-mcp',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      MODE: 'http',
      HTTP_PORT: 3000,
      API_KEYS: 'your-secret-key'
    },
    max_memory_restart: '500M',
    error_file: '/var/log/universal-db-mcp/error.log',
    out_file: '/var/log/universal-db-mcp/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false
  }]
};
```

### 启动服务

```bash
# 创建日志目录
sudo mkdir -p /var/log/universal-db-mcp
sudo chown $USER:$USER /var/log/universal-db-mcp

# 启动
pm2 start ecosystem.config.cjs

# 设置开机自启
pm2 startup
pm2 save
```

### PM2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs universal-db-mcp

# 重启
pm2 restart universal-db-mcp

# 停止
pm2 stop universal-db-mcp

# 监控
pm2 monit
```

## 方式四：systemd 部署

适合 Linux 服务器的系统级服务管理。

### 创建系统用户

```bash
sudo useradd --system --no-create-home --shell /bin/false universal-db-mcp
```

### 创建服务文件

创建 `/etc/systemd/system/universal-db-mcp.service`：

```ini
[Unit]
Description=Universal DB MCP Server
After=network.target

[Service]
Type=simple
User=universal-db-mcp
Group=universal-db-mcp
WorkingDirectory=/opt/universal-db-mcp
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=MODE=http
EnvironmentFile=/opt/universal-db-mcp/.env

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/universal-db-mcp

MemoryMax=512M
CPUQuota=80%

StandardOutput=journal
StandardError=journal
SyslogIdentifier=universal-db-mcp

[Install]
WantedBy=multi-user.target
```

### 启动服务

```bash
# 重新加载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start universal-db-mcp

# 设置开机自启
sudo systemctl enable universal-db-mcp

# 查看状态
sudo systemctl status universal-db-mcp

# 查看日志
sudo journalctl -u universal-db-mcp -f
```

## 开发模式

### 监听文件变化

```bash
npm run dev
```

### 在 Claude Desktop 中使用本地版本

编辑 Claude Desktop 配置文件，使用本地路径：

```json
{
  "mcpServers": {
    "local-db": {
      "command": "node",
      "args": [
        "/path/to/universal-db-mcp/dist/index.js",
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "password",
        "--database", "test"
      ]
    }
  }
}
```

## 验证部署

### MCP 模式

启动后应看到：

```
🔌 Starting MCP mode...
🔧 配置信息:
   数据库类型: mysql
   主机地址: localhost:3306
   数据库名: test
   安全模式: ✅ 只读模式
🔌 正在连接数据库...
✅ 数据库连接成功
🚀 MCP 服务器已启动，等待 Claude Desktop 连接...
```

### HTTP API 模式

```bash
# 健康检查
curl http://localhost:3000/api/health

# 预期返回
{"status":"ok","timestamp":"..."}
```

## 下一步

- [Docker 部署](./docker.md) - 容器化部署
- [HTTPS 配置](./https-domain.md) - 配置域名和 SSL
- [运维指南](../operations/guide.md) - 日常运维操作
