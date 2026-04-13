# 🔌 MCP 数据库万能连接器 (Universal DB MCP Plus)

> **增强版特性**：原生支持多数据库动态切换、生产级 Schema 性能优化、SSH 隧道直连以及国产数据库适配。让 Claude Desktop 直接连接并管理您的整个数据基础设施。

[![npm version](https://img.shields.io/npm/v/universal-db-mcp-plus.svg)](https://www.npmjs.com/package/universal-db-mcp-plus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **关于本项目**：
> 本仓库 (`ppanphper/universal-db-mcp`) 是基于社区版 [universal-db-mcp](https://github.com/Anarkh-Lee/universal-db-mcp) 独立维护的增强版本，专注于国产数据库适配与企业级功能增强。

## 🌟 核心增强特性 (Vs Community)

本项目基于社区版增强，提供以下独家能力：

1.  **⚡️ 生产级性能优化**：独创 `get_schema(tableNames)` 按需加载机制，轻松应对 1000+ 表的大型数据库，杜绝 Token 爆炸。
2.  **🔄 多库动态切换**：支持配置多个数据库连接（Config Pool），在对话中通过 `switch_database` 毫秒级切换上下文，无需重启 MCP。
3.  **🇨🇳 国产数据库全适配**：原生支持 GoldenDB (中兴)、HighGo (瀚高)、Vastbase (海量数据)、Dameng (达梦)、KingbaseES, GaussDB (高斯) 等国产信创数据库。
4.  **🔐 原生 SSH 隧道**：内置 SSH 隧道管理，无需系统级端口转发即可直连跳板机后的内网数据库。

## 🎯 场景示例

- 📊 **跨库关联分析**：先查 MySQL 里的订单，再切到 ClickHouse 查相关日志，最后切到 Redis 验缓存。
- 🔍 **大库精准查询**：面对几千张表的 ERP 库，AI 先看表名列表，再精准加载需要的 3 张表结构，响应速度提升 10 倍。
- 🛡️ **内网安全穿透**：通过跳板机直接安全审计生产库数据。

## 📦 支持数据库矩阵

| 数据库 | 类型参数 | 说明 |
|--------|---------|------|
| **关系型** | MySQL, PostgreSQL, Oracle, SQLServer | 核心支持 |
| **国产信创** | **GoldenDB**, **HighGo**, **Vastbase**, Dameng, KingbaseES, GaussDB | **增强版独占** |
| **分布式/OLAP** | TiDB, OceanBase, PolarDB, ClickHouse | 原生支持 |
| **NoSQL** | Redis, MongoDB | 原生支持 |
| **嵌入式** | SQLite | 本地文件支持 |

✅ **智能缓存** - Schema 信息自动缓存，大幅提升大型数据库的响应速度

## 🌐 双模式支持

本项目支持两种运行模式：

### 1. MCP 模式（默认）
- 通过 stdio 协议与 Claude Desktop 通信
- 适用于本地开发和 Claude Desktop 集成
- 启动命令：`npm start` 或 `npm run start:mcp`

### 2. HTTP API 模式（NEW!）
- 提供 REST API 接口
- 适用于 Coze、n8n、Dify 等第三方平台集成
- 支持 Docker、Serverless、PaaS 等多种部署方式
- 启动命令：`npm run start:http`

**快速切换模式**：
```bash
# MCP 模式（Claude Desktop）
npm run start:mcp -- --type mysql --host localhost --port 3306 --user root --password xxx --database mydb

# HTTP API 模式（REST API）
MODE=http npm start
```

📖 **详细文档**:
- [HTTP API 参考文档（中文）](docs/http-api/API_REFERENCE.zh-CN.md) | [English](docs/http-api/API_REFERENCE.md)
- [部署指南（中文）](docs/http-api/DEPLOYMENT.zh-CN.md) | [English](docs/http-api/DEPLOYMENT.md)
- [Coze 集成指南（中文）](docs/integrations/COZE.zh-CN.md) | [English](docs/integrations/COZE.md)
- [n8n 集成指南（中文）](docs/integrations/N8N.zh-CN.md) | [English](docs/integrations/N8N.md)
- [Dify 集成指南（中文）](docs/integrations/DIFY.zh-CN.md) | [English](docs/integrations/DIFY.md)
- [中文文档索引](docs/README.zh-CN.md) - 所有中文文档导航

## 🚀 快速开始（HTTP API 模式）

### 1. 安装依赖
```bash
npm install -g universal-db-mcp-plus-plus
```

### 2. 配置环境变量
创建 `.env` 文件：
```bash
MODE=http
HTTP_PORT=3000
API_KEYS=your-secret-key
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=your_database
```

### 3. 启动服务
```bash
npm run start:http
```

### 4. 测试 API
```bash
# 健康检查
curl http://localhost:3000/api/health

# 连接数据库
curl -X POST http://localhost:3000/api/connect \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"type":"mysql","host":"localhost","port":3306,"user":"root","password":"xxx","database":"test"}'

# 执行查询
curl -X POST http://localhost:3000/api/query \
  -H "X-API-Key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","query":"SELECT * FROM users LIMIT 10"}'
```

### 5. Docker 部署
```bash
# 使用 Docker Compose
cd docker
docker-compose up -d

# 或使用 Docker 直接运行
docker build -t universal-db-mcp-plus-plus -f docker/Dockerfile .
docker run -p 3000:3000 \
  -e MODE=http \
  -e API_KEYS=your-key \
  universal-db-mcp-plus-plus
```


## 🚀 快速开始

本项目支持两种使用模式，**强烈推荐使用多数据库配置模式**，以获得最佳体验（支持动态切换、SSH 隧道、持久化配置）。

### 方式一：多数据库配置模式（🔥 推荐）

通过一个配置文件管理所有数据库连接，支持在对话中动态切换。

#### 1. 创建配置文件
支持 JSON 或 YAML 格式。推荐使用 YAML (`databases.yaml`)，支持注释且更易读。

```yaml
# databases.yaml
databases:
  # MySQL 生产库
  - name: production-db
    type: mysql
    host: localhost
    port: 3306
    user: root
    password: "${DB_PASSWORD}" # 支持环境变量
    database: production
    description: "核心业务库"
    isDefault: true

  # PostgreSQL 分析库
  - name: analytics-db
    type: postgres
    host: localhost
    port: 5432
    user: postgres
    password: "${PG_PASSWORD}"
    database: analytics

  # 内网数据库 (通过 SSH 隧道直连)
  - name: internal-db
    type: mysql
    host: 10.0.1.5
    port: 3306
    user: admin
    password: "${INTERNAL_PASS}"
    ssh:
      enabled: true
      host: bastion.example.com
      username: deploy
      privateKey: ~/.ssh/id_rsa

settings:
  allowWrite: false # 全局只读模式（安全）
```

#### 2. 启动服务
```bash
# 自动加载当前目录下的 databases.yaml 或 databases.json
npx universal-db-mcp-plus-plus

# 或指定配置文件路径
npx universal-db-mcp-plus-plus --config ./my-configs/db.yaml
```

#### 3. MCP 客户端配置

> **重要**：MCP 客户端（Claude Desktop、Cursor 等）会自动启动 MCP Server 进程，你不需要手动启动。
> 只需在客户端配置文件中声明好命令和参数即可。
>
> `--config` 参数**必须使用绝对路径**，因为客户端启动进程的工作目录不确定。

**Claude Desktop** — 编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）：

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp-plus",
        "--config", "/absolute/path/to/databases.yaml"
      ],
      "env": {
        "DB_MYSQL_PASSWORD": "your_mysql_password",
        "DB_MONGODB_USER": "mongo_user",
        "DB_MONGODB_PASSWORD": "mongo_password"
      }
    }
  }
}
```

**Cursor** — 编辑 `.cursor/mcp.json`（项目级）或 `~/.cursor/mcp.json`（全局）：

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp-plus",
        "--config", "/absolute/path/to/databases.yaml"
      ],
      "env": {
        "DB_MYSQL_PASSWORD": "your_mysql_password",
        "DB_MONGODB_USER": "mongo_user",
        "DB_MONGODB_PASSWORD": "mongo_password"
      }
    }
  }
}
```

> **提示**：`databases.yaml` 中使用 `${DB_MYSQL_PASSWORD}` 引用环境变量，在客户端 `env` 中赋值，密码不会出现在配置文件里。

---

### 方式二：单数据库模式（仅供快速测试）

仅适用于临时连接单个数据库进行测试。

```bash
# MySQL
npx universal-db-mcp-plus-plus --type mysql --host localhost --port 3306 --user root --password xxx --database test

# PostgreSQL
npx universal-db-mcp-plus-plus --type postgres --host localhost --port 5432 --user postgres --password xxx --database test

# SQLite
npx universal-db-mcp-plus-plus --type sqlite --file ./data.db
```

## 📦 数据库配置参考

以下是所有支持的数据库在 `databases.yaml` 中的配置示例。

### 1. 关系型数据库

#### MySQL / MariaDB / TiDB / GoldenDB / OceanBase / PolarDB
这些数据库均兼容 MySQL 协议，使用 `type: mysql` (或对应特有 type 如 `tidb`, `goldendb`)。

```yaml
- name: my-mysql
  type: mysql # 或 tidb, oceanbase, polardb, goldendb
  host: localhost
  port: 3306 # TiDB: 4000, OceanBase: 2881
  user: root
  password: "password"
  database: test
```

#### PostgreSQL / KingbaseES / GaussDB / HighGo / Vastbase
这些数据库均兼容 PG 协议，使用 `type: postgres` (或对应特有 type 如 `kingbase`, `gaussdb`)。

```yaml
- name: my-postgres
  type: postgres # 或 kingbase, gaussdb, highgo, vastbase
  host: localhost
  port: 5432 # HighGo: 5866, Kingbase: 54321
  user: postgres
  password: "password"
  database: postgres
```

### 2. NoSQL 数据库

#### Redis
```yaml
- name: my-redis
  type: redis
  host: localhost
  port: 6379
  password: "password"
  database: 0 # Redis 数据库编号
```

#### MongoDB

**单机模式**（host/port 配置）：
```yaml
- name: my-mongo
  type: mongodb
  host: localhost
  port: 27017
  user: admin
  password: "${DB_MONGO_PASSWORD}"
  database: test
  authSource: admin # 可选，默认为 admin
```

**集群 / Replica Set 模式**（使用完整连接字符串）：
```yaml
# uri 字段优先于 host/port，支持多节点、replicaSet、authSource 等所有参数
- name: my-mongo-cluster
  type: mongodb
  uri: "mongodb://user:password@node1:27017,node2:27017/mydb?replicaSet=rs0&authSource=admin"
  database: mydb
```

**MongoDB + SSH 隧道**（本地通过跳板机访问线上内网集群）：
```yaml
- name: my-mongo-via-ssh
  type: mongodb
  uri: "mongodb://user:password@172.16.0.1:27017,172.16.0.2:27017/mydb?replicaSet=rs0&authSource=admin"
  database: mydb
  ssh:
    enabled: true
    host: bastion.example.com  # 跳板机地址
    port: 22
    username: deploy
    privateKey: ~/.ssh/id_rsa
```

> **说明**：当同时使用 `uri` + `ssh` 时，程序会从 URI 中提取第一个节点地址建立 SSH 隧道，并将 URI 中所有节点地址替换为本地隧道入口 `127.0.0.1:localPort`，对 MongoDB 驱动透明。

### 3. 其他数据库

#### Oracle
```yaml
- name: my-oracle
  type: oracle
  host: localhost
  port: 1521
  user: system
  password: "password"
  database: ORCL # Service Name
```

#### SQL Server
```yaml
- name: my-mssql
  type: sqlserver
  host: localhost
  port: 1433
  user: sa
  password: "password"
  database: master
```

#### ClickHouse
```yaml
- name: my-clickhouse
  type: clickhouse
  host: localhost
  port: 8123 # HTTP 端口
  user: default
  password: ""
  database: default
```

#### SQLite
```yaml
- name: my-sqlite
  type: sqlite
  file: /absolute/path/to/data.db
```



### 配置 Cherry Studio

Cherry Studio 也支持 MCP 协议。在 Cherry Studio 中配置 MCP 主要是配置命令。

以下是所有 17 个数据库的 Cherry Studio 配置命令：

#### 1. MySQL

```bash
npx universal-db-mcp-plus-plus@latest --type mysql --host localhost --port 3306 --user root --password your_password --database your_database
```

#### 2. PostgreSQL

```bash
npx universal-db-mcp-plus-plus@latest --type postgres --host localhost --port 5432 --user postgres --password your_password --database your_database
```

#### 3. Redis

```bash
npx universal-db-mcp-plus-plus@latest --type redis --host localhost --port 6379 --password your_password
```

#### 4. Oracle

```bash
npx universal-db-mcp-plus-plus@latest --type oracle --host localhost --port 1521 --user system --password your_password --database ORCL
```

#### 5. 达梦（DM）

```bash
npx universal-db-mcp-plus-plus@latest --type dm --host localhost --port 5236 --user SYSDBA --password your_password --database DAMENG
```

#### 6. SQL Server

```bash
npx universal-db-mcp-plus-plus@latest --type sqlserver --host localhost --port 1433 --user sa --password your_password --database master
```

#### 7. MongoDB

```bash
npx universal-db-mcp-plus-plus@latest --type mongodb --host localhost --port 27017 --user admin --password your_password --database test
```

#### 8. SQLite

```bash
npx universal-db-mcp-plus-plus@latest --type sqlite --file /path/to/your/database.db
```

#### 9. KingbaseES

```bash
npx universal-db-mcp-plus-plus@latest --type kingbase --host localhost --port 54321 --user system --password your_password --database test
```

#### 10. GaussDB / OpenGauss

```bash
npx universal-db-mcp-plus-plus@latest --type gaussdb --host localhost --port 5432 --user gaussdb --password your_password --database postgres
```

#### 11. OceanBase

```bash
npx universal-db-mcp-plus-plus@latest --type oceanbase --host localhost --port 2881 --user root@test --password your_password --database test
```

#### 12. TiDB

```bash
npx universal-db-mcp-plus-plus@latest --type tidb --host localhost --port 4000 --user root --password your_password --database test
```

#### 13. ClickHouse

```bash
npx universal-db-mcp-plus-plus@latest --type clickhouse --host localhost --port 8123 --user default --password "" --database default
```

#### 14. PolarDB

```bash
npx universal-db-mcp-plus-plus@latest --type polardb --host pc-xxxxx.mysql.polardb.rds.aliyuncs.com --port 3306 --user your_username --password your_password --database your_database
```

#### 15. Vastbase

```bash
npx universal-db-mcp-plus-plus@latest --type vastbase --host localhost --port 5432 --user vastbase --password your_password --database postgres
```

#### 16. HighGo

```bash
npx universal-db-mcp-plus-plus@latest --type highgo --host localhost --port 5866 --user highgo --password your_password --database highgo
```

#### 17. GoldenDB

```bash
npx universal-db-mcp-plus-plus@latest --type goldendb --host localhost --port 3306 --user root --password your_password --database test
```

**注意**：
- 将命令中的参数替换为你的实际数据库连接信息
- 如需启用写入模式，在命令前添加 `--danger-allow-write` 参数
>>>>>>> feat/optimize-mysql-schema

### 启动使用

1. 重启 Claude Desktop
2. 在对话中直接询问：
   - "帮我查看 users 表的结构"
   - "统计最近 7 天的订单数量"
   - "找出消费金额最高的 10 个用户"

Claude 会自动调用数据库工具完成查询！

### 🔐 SSH 隧道支持

Universal DB MCP 支持通过 SSH 隧道连接远程数据库，适用于数据库位于防火墙内或只允许本地连接（127.0.0.1）的场景。

**CLI 方式**：

```bash
npx universal-db-mcp-plus-plus \
  --type mysql \
  --host 127.0.0.1 \
  --port 3306 \
  --user root \
  --password mypassword \
  --ssh-host 1.2.3.4 \
  --ssh-port 22 \
  --ssh-user myuser \
  --ssh-key ~/.ssh/id_rsa
```

**JSON 配置方式**：

```json
{
  "name": "prod-mysql-via-ssh",
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "user": "root",
  "password": "${DB_PASSWORD}",
  "database": "production",
  "ssh": {
    "enabled": true,
    "host": "bastion-host.example.com",
    "port": 22,
    "username": "op_user",
    "privateKey": "/path/to/id_rsa"
  }
}
```

支持的 SSH 认证方式：
- 私钥文件 (`privateKey`)
- 密码 (`password`)
- 私钥内容 (`privateKeyContent`)
- 私钥密码 (`passphrase`)

## 🛡️ 安全模式

**默认情况下，本工具运行在只读模式**，会拒绝所有写入操作（DELETE、UPDATE、DROP、TRUNCATE）。

如果你需要执行写入操作（请谨慎！），需要显式添加参数：

```json
{
  "args": [
    "universal-db-mcp-plus-plus",
    "--danger-allow-write",
    "--type", "mysql",
    ...
  ]
}
```

⚠️ **警告**：启用写入模式后，Claude 可以修改你的数据库。请仅在开发环境使用，或确保你完全理解操作的后果。

## 📦 Schema 缓存

为了提升大型数据库的性能，本项目实现了智能 Schema 缓存机制。

### 缓存特性

- **自动缓存**: 首次获取 Schema 后自动缓存，后续请求直接返回缓存数据
- **默认 TTL**: 缓存有效期为 5 分钟，过期后自动刷新
- **强制刷新**: 支持手动强制刷新缓存，获取最新的数据库结构
- **缓存统计**: 提供缓存命中率等统计信息，便于监控和调优

### MCP 模式

在 MCP 模式下，新增了以下工具：

| 工具名 | 描述 |
|--------|------|
| `get_schema` | 获取数据库结构（支持 `forceRefresh` 参数强制刷新） |
| `get_table_info` | 获取表信息（支持 `forceRefresh` 参数强制刷新） |
| `clear_cache` | 清除 Schema 缓存 |

**使用示例**（在 Claude Desktop 中）：
- "获取数据库结构" - 使用缓存
- "强制刷新数据库结构" - 忽略缓存，重新获取
- "清除 Schema 缓存" - 手动清除缓存

### HTTP API 模式

在 HTTP API 模式下，Schema 相关端点支持 `forceRefresh` 参数：

```bash
# 使用缓存（默认，推荐）
curl "http://localhost:3000/api/schema?sessionId=xxx"

# 强制刷新缓存
curl "http://localhost:3000/api/schema?sessionId=xxx&forceRefresh=true"

# 清除缓存
curl -X DELETE "http://localhost:3000/api/cache?sessionId=xxx"

# 查看缓存状态
curl "http://localhost:3000/api/cache/status?sessionId=xxx"
```

### 性能提升

对于表数量较多的数据库，Schema 缓存可以显著提升性能：

| 场景 | 无缓存 | 有缓存 | 提升 |
|------|--------|--------|------|
| 100 张表 | ~2-5 秒 | <10 毫秒 | 200-500x |
| 500 张表 | ~10-30 秒 | <10 毫秒 | 1000-3000x |
| 1000+ 张表 | 可能超时 | <10 毫秒 | ∞ |

### 批量查询优化

除了缓存机制，本项目还对 Schema 获取进行了批量查询优化：

**优化前（N+1 查询问题）**：
```
100 张表 = 1次获取表列表 + 100次获取列信息 + 100次获取主键 + 100次获取索引 + 100次获取行数
         = 401 次数据库查询
```

**优化后（批量查询）**：
```
100 张表 = 1次获取所有列 + 1次获取所有主键 + 1次获取所有索引 + 1次获取所有行数
         = 4 次数据库查询
```

**首次加载性能提升**：

| 表数量 | 优化前 | 优化后 | 提升 |
|--------|--------|--------|------|
| 50 张表 | ~5 秒 | ~200 毫秒 | 25x |
| 100 张表 | ~10 秒 | ~300 毫秒 | 33x |
| 500 张表 | ~50 秒 | ~500 毫秒 | 100x |

已优化的数据库适配器：
- MySQL、TiDB、OceanBase、PolarDB、GoldenDB（MySQL 兼容）
- PostgreSQL、KingbaseES、GaussDB、Vastbase、HighGo（PostgreSQL 兼容）
- SQL Server
- Oracle（使用 ALL_* 视图批量查询）
- 达梦 DM（使用 USER_* 视图批量查询）

共 **13 个**适配器已完成批量查询优化。

未修改的适配器（4 个）：
  - SQLite: 本地文件数据库，PRAGMA 查询已经很快
  - ClickHouse: 使用 system 表查询，已经是批量方式
  - Redis: 键值存储，无传统表结构
  - MongoDB: 文档数据库，需要采样推断结构

### 何时需要刷新缓存

以下情况建议强制刷新或清除缓存：
- 新增或删除了表
- 修改了表结构（新增/删除/修改列）
- 新增或删除了索引
- 数据库版本升级后

## 🏗️ 架构设计

### 双模式架构

本项目采用双模式架构，支持 MCP 和 HTTP API 两种运行模式，共享核心业务逻辑：

```
┌─────────────────────────────────────────────────────────────┐
│                      入口层 (index.ts)                       │
│                    根据 MODE 环境变量选择模式                  │
└──────────────────┬──────────────────────┬───────────────────┘
                   │                      │
         ┌─────────▼─────────┐  ┌────────▼──────────┐
         │   MCP 模式         │  │  HTTP API 模式     │
         │  (stdio 传输)      │  │  (REST API)       │
         └─────────┬─────────┘  └────────┬──────────┘
                   │                      │
                   │    ┌─────────────────▼──────────────────┐
                   │    │      HTTP 服务器 (Fastify)         │
                   │    │  ┌──────────────────────────────┐  │
                   │    │  │  中间件层                     │  │
                   │    │  │  - API Key 认证               │  │
                   │    │  │  - CORS 配置                  │  │
                   │    │  │  - 速率限制                   │  │
                   │    │  │  - 错误处理                   │  │
                   │    │  └──────────────────────────────┘  │
                   │    │  ┌──────────────────────────────┐  │
                   │    │  │  路由层                       │  │
                   │    │  │  - /api/connect              │  │
                   │    │  │  - /api/query                │  │
                   │    │  │  - /api/schema               │  │
                   │    │  │  - /api/health               │  │
                   │    │  └──────────────────────────────┘  │
                   │    └────────┬──────────────────────────┘
                   │             │
         ┌─────────▼─────────────▼──────────────────┐
         │         核心业务逻辑层                     │
         │  ┌────────────────────────────────────┐  │
         │  │  DatabaseService                   │  │
         │  │  - executeQuery()                  │  │
         │  │  - getSchema()                     │  │
         │  │  - getTableInfo()                  │  │
         │  │  - validateQuery()                 │  │
         │  └────────────────────────────────────┘  │
         │  ┌────────────────────────────────────┐  │
         │  │  ConnectionManager                 │  │
         │  │  - connect()                       │  │
         │  │  - disconnect()                    │  │
         │  │  - 会话管理 (HTTP 模式)            │  │
         │  └────────────────────────────────────┘  │
         │  ┌────────────────────────────────────┐  │
         │  │  AdapterFactory                    │  │
         │  │  - createAdapter()                 │  │
         │  │  - validateConfig()                │  │
         │  └────────────────────────────────────┘  │
         └──────────────────┬────────────────────────┘
                            │
         ┌──────────────────▼────────────────────────┐
         │           数据库适配器层                   │
         │  ┌──────────────────────────────────────┐ │
         │  │  DbAdapter 接口                       │ │
         │  │  - connect()                         │ │
         │  │  - disconnect()                      │ │
         │  │  - executeQuery()                    │ │
         │  │  - getSchema()                       │ │
         │  └──────────────────────────────────────┘ │
         │                                            │
         │  17 个数据库适配器实现:                     │
         │  MySQL, PostgreSQL, Redis, Oracle, DM,    │
         │  SQL Server, MongoDB, SQLite, KingbaseES, │
         │  GaussDB, OceanBase, TiDB, ClickHouse,    │
         │  PolarDB, Vastbase, HighGo, GoldenDB      │
         └────────────────────────────────────────────┘
```

### 目录结构

```
src/
├── index.ts                    # 入口文件，模式选择器
├── server.ts                   # 向后兼容导出
├── types/
│   ├── adapter.ts              # 数据库适配器类型定义
│   └── http.ts                 # HTTP API 类型定义
├── utils/
│   ├── safety.ts               # 查询安全验证
│   ├── adapter-factory.ts      # 适配器工厂
│   └── config-loader.ts        # 配置加载器
├── core/                       # 核心业务逻辑（MCP 和 HTTP 共享）
│   ├── database-service.ts     # 数据库服务
│   └── connection-manager.ts   # 连接管理器
├── mcp/                        # MCP 模式特定代码
│   ├── mcp-server.ts           # MCP 服务器
│   └── mcp-index.ts            # MCP 入口
├── http/                       # HTTP API 模式特定代码
│   ├── server.ts               # Fastify 服务器
│   ├── http-index.ts           # HTTP 入口
│   ├── routes/                 # API 路由
│   │   ├── connection.ts       # 连接管理端点
│   │   ├── query.ts            # 查询执行端点
│   │   ├── schema.ts           # Schema 端点
│   │   ├── health.ts           # 健康检查端点
│   │   └── index.ts            # 路由聚合器
│   └── middleware/             # 中间件
│       ├── auth.ts             # API Key 认证
│       ├── error-handler.ts    # 错误处理
│       └── index.ts            # 中间件聚合器
└── adapters/                   # 数据库适配器（17 个）
    ├── mysql.ts
    ├── postgres.ts
    ├── redis.ts
    ├── oracle.ts
    ├── dm.ts
    ├── sqlserver.ts
    ├── mongodb.ts
    ├── sqlite.ts
    ├── kingbase.ts
    ├── gaussdb.ts
    ├── oceanbase.ts
    ├── tidb.ts
    ├── clickhouse.ts
    ├── polardb.ts
    ├── vastbase.ts
    ├── highgo.ts
    └── goldendb.ts
```

### 核心设计原则

1. **关注点分离**: MCP 和 HTTP 模式各自独立，共享核心业务逻辑
2. **适配器模式**: 统一的 DbAdapter 接口，支持 17 种数据库
3. **工厂模式**: AdapterFactory 集中管理适配器创建
4. **服务层**: DatabaseService 封装业务逻辑，被两种模式复用
5. **会话管理**: HTTP 模式支持多并发连接，MCP 模式单连接
6. **安全第一**: 默认只读模式，查询验证，API Key 认证

### 数据流

#### MCP 模式数据流
```
Claude Desktop → stdio → MCP Server → DatabaseService → Adapter → Database
```

#### HTTP API 模式数据流
```
HTTP Client → REST API → Middleware → Routes → DatabaseService → Adapter → Database
```

### 扩展性

- **添加新数据库**: 实现 DbAdapter 接口，在 AdapterFactory 中注册
- **添加新端点**: 在 `src/http/routes/` 中添加新路由文件
- **添加新中间件**: 在 `src/http/middleware/` 中添加新中间件
- **自定义认证**: 修改 `src/http/middleware/auth.ts`

## 📖 支持的数据库

| 数据库 | 类型参数 | 默认端口 | 状态 | 说明 |
|--------|---------|---------|------|------|
| MySQL | `--type mysql` | 3306 | ✅ 已支持 | - |
| PostgreSQL | `--type postgres` | 5432 | ✅ 已支持 | - |
| Redis | `--type redis` | 6379 | ✅ 已支持 | - |
| Oracle（12c以上） | `--type oracle` | 1521 | ✅ 已支持 | - |
| 达梦（DM7/DM8） | `--type dm` | 5236 | ✅ 已支持 | 驱动自动安装 |
| SQL Server (2012+) | `--type sqlserver` 或 `--type mssql` | 1433 | ✅ 已支持 | 支持 Azure SQL Database |
| MongoDB | `--type mongodb` | 27017 | ✅ 已支持 | 支持 MongoDB 4.0+ |
| SQLite | `--type sqlite` | - | ✅ 已支持 | 本地文件数据库 |
| KingbaseES（人大金仓） | `--type kingbase` | 54321 | ✅ 已支持 | 兼容 PostgreSQL 协议 |
| GaussDB / OpenGauss | `--type gaussdb` 或 `--type opengauss` | 5432 | ✅ 已支持 | 华为高斯数据库，兼容 PostgreSQL |
| OceanBase | `--type oceanbase` | 2881 | ✅ 已支持 | 蚂蚁金服分布式数据库，兼容 MySQL |
| TiDB | `--type tidb` | 4000 | ✅ 已支持 | PingCAP 分布式数据库，兼容 MySQL 5.7 |
| ClickHouse | `--type clickhouse` | 8123 | ✅ 已支持 | 高性能列式 OLAP 数据库 |
| PolarDB | `--type polardb` | 3306 | ✅ 已支持 | 阿里云云原生数据库，兼容 MySQL |
| Vastbase | `--type vastbase` | 5432 | ✅ 已支持 | 海量数据国产数据库，兼容 PostgreSQL |
| HighGo | `--type highgo` | 5866 | ✅ 已支持 | 瀚高国产数据库，兼容 PostgreSQL |
| GoldenDB | `--type goldendb` | 3306 | ✅ 已支持 | 中兴分布式数据库，兼容 MySQL |

**注意**:
- 达梦数据库驱动 `dmdb` 会作为可选依赖自动安装。如果安装失败，请手动运行 `npm install -g dmdb`。
- SQLite 驱动 `better-sqlite3` 需要编译。在 Windows 上，需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)。如果安装失败，可以使用预编译版本或在支持的平台上使用。

## 🔧 命令行参数

```bash
universal-db-mcp-plus-plus [选项]

选项：
  --config <path>          多数据库配置文件路径 (支持 .json, .yaml, .yml)
  --type <db>              数据库类型 (mysql|postgres|redis|oracle|dm|sqlserver|mssql|mongodb|sqlite|kingbase|gaussdb|opengauss|oceanbase|tidb|clickhouse|polardb|vastbase|highgo|goldendb)
  --host <host>            数据库主机地址 (默认: localhost)
  --port <port>            数据库端口
  --user <user>            用户名
  --password <password>    密码
  --database <database>    数据库名称
  --file <file>            SQLite 数据库文件路径
  --danger-allow-write     启用写入模式（危险！）
  --help                   显示帮助信息

环境变量：
  DB_CONFIG_PATH           配置文件路径（替代 --config）
  DB_HOST                  数据库主机（替代 --host）
  DB_PORT                  数据库端口（替代 --port）
  DB_USER                  用户名（替代 --user）
  DB_PASSWORD              密码（替代 --password）
  DB_PASSWORD              密码（替代 --password）
  DB_DATABASE              数据库名（替代 --database）

SSH 选项：
  --ssh-host <host>       SSH 跳板机主机地址
  --ssh-port <port>       SSH 端口 (默认: 22)
  --ssh-user <user>       SSH 用户名
  --ssh-password <pwd>    SSH 密码
  --ssh-key <path>        SSH 私钥路径
  --ssh-passphrase <pass> SSH 私钥密码
```

## 🛠️ MCP 工具列表

本项目提供以下 MCP 工具供 Claude 调用：

### 基础查询工具

| 工具 | 描述 |
|------|------|
| `execute_query` | 执行 SQL 查询或数据库命令 |
| `get_schema` | 获取数据库结构信息 |
| `get_table_info` | 获取指定表的详细信息 |

### 查询增强工具

| 工具 | 描述 |
|------|------|
| `query_single` | 执行查询返回单条记录 |
| `get_scalar` | 获取标量值（COUNT、SUM 等） |
| `batch_execute` | 批量执行多条 SQL |

### 连接管理工具

| 工具 | 描述 |
|------|------|
| `list_databases` | 列出所有已配置的数据库 |
| `switch_database` | 切换到指定数据库 |
| `get_current_database` | 获取当前活动数据库 |
| `test_connection` | 测试数据库连接 |
| `health_check` | 所有数据库健康检查 |

### 事务管理工具

| 工具 | 描述 |
|------|------|
| `begin_transaction` | 开始事务（仅 MySQL/PostgreSQL） |
| `commit_transaction` | 提交事务 |
| `rollback_transaction` | 回滚事务 |

### SSH 管理工具

| 工具 | 描述 |
|------|------|
| `list_tunnels` | 列出所有活动的 SSH 隧道 |
| `get_tunnel_status` | 获取指定连接的 SSH 隧道详情 |

## 🏗️ 架构设计

本项目采用模块化适配器模式，方便社区贡献新的数据库支持：

```
src/
├── adapters/          # 数据库适配器
│   ├── mysql.ts
│   ├── postgres.ts
│   ├── redis.ts
│   ├── oracle.ts
│   ├── dm.ts
│   ├── sqlserver.ts
│   ├── mongodb.ts
│   ├── sqlite.ts
│   ├── kingbase.ts
│   ├── gaussdb.ts
│   ├── oceanbase.ts
│   ├── tidb.ts
│   ├── clickhouse.ts
│   ├── polardb.ts
│   ├── vastbase.ts
│   ├── highgo.ts
│   └── goldendb.ts
├── types/             # TypeScript 类型定义
│   └── adapter.ts
├── utils/             # 工具函数
│   └── safety.ts      # 安全检查逻辑
└── server.ts          # MCP 服务器主逻辑
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

如果你想添加新的数据库支持，只需：

1. 在 `src/adapters/` 下实现 `DbAdapter` 接口
2. 添加对应的数据库驱动依赖
3. 更新 README 文档

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 📄 开源协议

MIT License - 自由使用，欢迎 Star ⭐

## 🙏 致谢

- [Original universal-db-mcp](https://github.com/Anarkh-Lee/universal-db-mcp) - 感谢原社区版提供的坚实基础
- [Model Context Protocol](https://modelcontextprotocol.io/) - Anthropic 提供的强大协议
- 所有贡献者和使用者

---

**如果这个项目对你有帮助，请给个 Star ⭐ 支持一下！**
