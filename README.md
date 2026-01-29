# 🔌 MCP 数据库万能连接器

> 让 Claude Desktop 直接连接你的数据库，用自然语言查询和分析数据

[![npm version](https://img.shields.io/npm/v/universal-db-mcp.svg)](https://www.npmjs.com/package/universal-db-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 为什么使用本项目

作为开发者，你是否遇到过这些场景：

- 📊 **临时数据分析**：想快速查看生产数据库的某些指标，但不想写 SQL？
- 🔍 **问题排查**：需要跨多个表关联查询，但记不清表结构？
- 🤖 **AI 辅助开发**：希望 Claude 能直接理解你的数据库结构，生成准确的查询？

**MCP 数据库万能连接器** 通过 Model Context Protocol (MCP) 协议，让 Claude Desktop 成为你的数据库助手：

✅ **自然语言查询** - 用中文描述需求，Claude 自动生成并执行 SQL

✅ **智能表结构理解** - 自动获取数据库 Schema，提供精准建议

✅ **多数据库支持** - MySQL、PostgreSQL、Redis、Oracle、达梦、SQL Server、MongoDB、SQLite、KingbaseES、GaussDB/OpenGauss、OceanBase、TiDB、ClickHouse、PolarDB 一键切换

✅ **安全第一** - 默认只读模式，防止误操作删库

✅ **开箱即用** - 无需复杂配置，一行命令启动



## 🚀 快速开始

### 前置要求

- Node.js >= 20
- Claude Desktop 应用
- 至少一个数据库实例（MySQL/PostgreSQL/Redis/Oracle/达梦/SQL Server/MongoDB/SQLite/KingbaseES/GaussDB/OceanBase/TiDB/ClickHouse/PolarDB）

### 安装

```bash
npm install -g universal-db-mcp
```

或使用 npx 直接运行（无需安装）：

```bash
npx universal-db-mcp
```

### 配置 Claude Desktop

编辑 Claude Desktop 配置文件：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

添加以下配置：

#### MySQL 示例

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "your_password",
        "--database", "your_database"
      ]
    }
  }
}
```

#### SQLite 示例

```json
{
  "mcpServers": {
    "universal-db-sqlite": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "sqlite",
        "--file", "/path/to/your/database.db"
      ]
    }
  }
}
```

**注意**：
- SQLite 不需要 `--host`、`--port`、`--user`、`--password` 参数
- 使用 `--file` 参数指定数据库文件的绝对路径
- Windows 路径示例：`"C:\\Users\\YourName\\data\\mydb.db"`
- macOS/Linux 路径示例：`"/Users/YourName/data/mydb.db"`

#### KingbaseES 示例

```json
{
  "mcpServers": {
    "kingbase-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "kingbase",
        "--host", "localhost",
        "--port", "54321",
        "--user", "system",
        "--password", "your_password",
        "--database", "test"
      ]
    }
  }
}
```

**说明**：
- KingbaseES 基于 PostgreSQL 开发，兼容 PostgreSQL 协议
- 默认端口为 54321
- 使用与 PostgreSQL 相同的驱动（pg）

#### GaussDB / OpenGauss 示例

```json
{
  "mcpServers": {
    "gaussdb-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "gaussdb",
        "--host", "localhost",
        "--port", "5432",
        "--user", "gaussdb",
        "--password", "your_password",
        "--database", "postgres"
      ]
    }
  }
}
```

**说明**：
- GaussDB 和 OpenGauss 基于 PostgreSQL 开发，兼容 PostgreSQL 协议
- 默认端口为 5432
- 可以使用 `--type gaussdb` 或 `--type opengauss`
- 使用与 PostgreSQL 相同的驱动（pg）

#### OceanBase 示例

```json
{
  "mcpServers": {
    "oceanbase-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "oceanbase",
        "--host", "localhost",
        "--port", "2881",
        "--user", "root@test",
        "--password", "your_password",
        "--database", "test"
      ]
    }
  }
}
```

**说明**：
- OceanBase 兼容 MySQL 协议
- 默认端口为 2881（直连端口）或 2883（代理端口）
- 用户名格式：`用户名@租户名`（如 `root@test`）
- 使用与 MySQL 相同的驱动（mysql2）

#### TiDB 示例

```json
{
  "mcpServers": {
    "tidb-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "tidb",
        "--host", "localhost",
        "--port", "4000",
        "--user", "root",
        "--password", "your_password",
        "--database", "test"
      ]
    }
  }
}
```

**说明**：
- TiDB 兼容 MySQL 5.7 协议
- 默认端口为 4000
- 支持分布式事务和水平扩展
- 使用与 MySQL 相同的驱动（mysql2）

#### ClickHouse 示例

```json
{
  "mcpServers": {
    "clickhouse-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "clickhouse",
        "--host", "localhost",
        "--port", "8123",
        "--user", "default",
        "--password", "",
        "--database", "default"
      ]
    }
  }
}
```

**说明**：
- ClickHouse 是高性能列式 OLAP 数据库
- 默认 HTTP 端口为 8123（原生 TCP 端口为 9000）
- 默认用户为 default，默认数据库为 default
- 适合大数据分析和实时查询场景

#### PolarDB 示例

```json
{
  "mcpServers": {
    "polardb-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "polardb",
        "--host", "pc-xxxxx.mysql.polardb.rds.aliyuncs.com",
        "--port", "3306",
        "--user", "your_username",
        "--password", "your_password",
        "--database", "your_database"
      ]
    }
  }
}
```

**说明**：
- PolarDB 是阿里云的云原生数据库
- 完全兼容 MySQL 5.6/5.7/8.0 协议
- 支持一写多读架构，读写分离
- 使用与 MySQL 相同的驱动（mysql2）

### 🆕 多数据库配置（推荐）

对于需要管理多个数据库的场景，推荐使用 JSON 配置文件：

**1. 创建配置文件** `databases.json`：

```json
{
  "databases": [
    {
      "name": "mysql-production",
      "type": "mysql",
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "password": "${DB_MYSQL_PASSWORD}",
      "database": "production",
      "description": "生产 MySQL",
      "isDefault": true
    },
    {
      "name": "postgres-analytics",
      "type": "postgres",
      "host": "localhost",
      "port": 5432,
      "user": "postgres",
      "password": "${DB_PG_PASSWORD}",
      "database": "analytics",
      "description": "分析 PostgreSQL"
    },
    {
      "name": "redis-cache",
      "type": "redis",
      "host": "localhost",
      "port": 6379,
      "description": "缓存 Redis"
    }
  ],
  "settings": {
    "allowWrite": false,
    "ddlWhitelist": []
  }
}
```

**2. 配置 Claude Desktop**：

```json
{
  "mcpServers": {
    "universal-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--config", "/path/to/databases.json"
      ],
      "env": {
        "DB_MYSQL_PASSWORD": "your_mysql_password",
        "DB_PG_PASSWORD": "your_postgres_password"
      }
    }
  }
}
```

**3. 使用环境变量**：

配置文件支持 `${ENV_VAR}` 格式的环境变量引用，敏感信息（如密码）可以通过环境变量传入，避免明文存储。

**4. 动态切换数据库**：

在对话中可以使用以下命令：
- "列出所有数据库" → 调用 `list_databases`
- "切换到 postgres-analytics" → 调用 `switch_database`
- "检查所有数据库健康状态" → 调用 `health_check`

### 🆕 YAML 配置支持（推荐）

除了 JSON，还支持使用 YAML 格式的配置文件（`.yaml` 或 `.yml`），YAML 更易读且支持注释：

```yaml
# databases.yaml - 带注释的配置示例
databases:
  # MySQL 生产数据库
  - name: mysql-production
    type: mysql
    host: localhost
    port: 3306
    user: root
    password: "${DB_MYSQL_PASSWORD}"  # 使用环境变量
    database: production
    description: 生产 MySQL
    isDefault: true

  # 通过 SSH 隧道连接
  - name: mysql-via-ssh
    type: mysql
    host: 127.0.0.1
    port: 3306
    user: app_user
    password: "${DB_APP_PASSWORD}"
    ssh:
      enabled: true
      host: bastion.example.com
      username: deploy
      privateKey: ~/.ssh/id_rsa

settings:
  allowWrite: false  # 安全模式
```

**使用方式**：
```bash
npx universal-db-mcp --config ./databases.yaml
```

**自动检测**：如果不指定 `--config`，程序会按以下顺序自动检测：
1. `databases.json`
2. `databases.yaml`
3. `databases.yml`

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
npx universal-db-mcp \
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
    "universal-db-mcp",
    "--danger-allow-write",
    "--type", "mysql",
    ...
  ]
}
```

⚠️ **警告**：启用写入模式后，Claude 可以修改你的数据库。请仅在开发环境使用，或确保你完全理解操作的后果。

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

**注意**:
- 达梦数据库驱动 `dmdb` 会作为可选依赖自动安装。如果安装失败，请手动运行 `npm install -g dmdb`。
- SQLite 驱动 `better-sqlite3` 需要编译。在 Windows 上，需要安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)。如果安装失败，可以使用预编译版本或在支持的平台上使用。

## 🔧 命令行参数

```bash
universal-db-mcp [选项]

选项：
  --config <path>          多数据库 JSON 配置文件路径（推荐）
  --type <db>              数据库类型 (mysql|postgres|redis|oracle|dm|sqlserver|mssql|mongodb|sqlite|kingbase|gaussdb|opengauss|oceanbase|tidb|clickhouse|polardb)
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
│   └── polardb.ts
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

- [Model Context Protocol](https://modelcontextprotocol.io/) - Anthropic 提供的强大协议
- 所有贡献者和使用者

---

**如果这个项目对你有帮助，请给个 Star ⭐ 支持一下！**
