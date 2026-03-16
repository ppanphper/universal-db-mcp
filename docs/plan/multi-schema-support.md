# 多 Schema 支持方案 — 完整实施计划

## 一、问题描述

当数据库包含多个 Schema 时，`get_schema`、`get_table_info`、`list_tables`、`get_enum_values`、`get_sample_data` 等工具只能获取默认 Schema 下的表信息，无法访问其他 Schema 中的表。

**Issue 来源**: [PostgreSQL 数据库中 get_table_info 无法获取非 public schema 的表信息](https://github.com)

**复现步骤**:
1. PostgreSQL 数据库中创建非 `public` schema（如 `analytics`）并在其中建表
2. 调用 `get_schema` 或 `get_table_info` 工具
3. 返回结果中仅包含 `public` schema 的表，非 `public` 的表不可见

---

## 二、问题分析

### 2.1 问题根因

问题分布在 **4 个层次**，形成完整的阻断链：

#### 层次 1：Adapter 层 — SQL 查询硬编码默认 Schema（核心根因）

各适配器的 `_getSchemaImpl()` 中，所有元数据查询 SQL 都硬编码了默认 Schema 过滤条件：

| 数据库类型 | 硬编码过滤条件 | 默认 Schema |
|-----------|--------------|------------|
| PostgreSQL 系 | `nspname = 'public'` / `table_schema = 'public'` | `public` |
| SQL Server | `SCHEMA_NAME()` / `SCHEMA_ID()` | `dbo` |
| Oracle | `OWNER = USER` | 当前用户 |
| 达梦 (DM) | `USER_*` 视图 | 当前用户 |

每个受影响的适配器中有 **5 条 SQL 查询**被硬编码（列信息、主键、索引、行数/注释、外键）。

#### 层次 2：类型定义层 — `TableInfo` 缺少 schema 字段

`src/types/adapter.ts` 中 `TableInfo` 接口只有 `name: string`，没有 `schema` 字段：

```typescript
export interface TableInfo {
  name: string;       // 只有表名，无 schema
  comment?: string;
  columns: ColumnInfo[];
  // ...
}
```

即使适配器返回了多 Schema 的表，也无法区分 `public.users` 和 `analytics.users`。

#### 层次 3：DatabaseService 层 — SQL 构建不支持 Schema 限定名

`src/core/database-service.ts` 中的 `quoteIdentifier()` 将表名作为单一标识符处理：

```typescript
private quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;  // "analytics.users" 而非 "analytics"."users"
}
```

`get_enum_values` 和 `get_sample_data` 构建的 SQL 均无法正确引用带 Schema 前缀的表名。

#### 层次 4：工具/API 层 — 缺少 schema 参数

- **MCP 工具**（`src/mcp/mcp-server.ts`）：`get_table_info`、`get_enum_values`、`get_sample_data` 的 inputSchema 中只有 `tableName`，无 `schema` 参数
- **HTTP API**（`src/http/routes/schema.ts`）：`/api/schema/:table`、`/api/enum-values`、`/api/sample-data` 同样缺少 schema 参数

### 2.2 影响链路

```
用户调用 get_table_info("analytics.users")
  → MCP/HTTP 层传递 tableName="analytics.users"
    → DatabaseService.getTableInfo() 调用 getSchema()
      → Adapter.getSchema() 只查默认 Schema
        → 返回的 tables[] 中不含 analytics schema 的表
      → schema.tables.find(t.name === "analytics.users") → 找不到
    → 抛出 "表 analytics.users 不存在"
```

### 2.3 传输模式影响

所有传输模式共享同一条代码路径：

```
┌───────────────┐     ┌──────────────────┐     ┌──────────┐
│ stdio (MCP)   │────→│                  │     │          │
│ SSE (MCP)     │────→│ DatabaseService  │────→│ Adapter  │
│ Streamable    │────→│ (核心业务层)      │     │ (数据库层)│
│ REST (HTTP)   │────→│                  │     │          │
└───────────────┘     └──────────────────┘     └──────────┘
```

因此，**修复 Adapter + DatabaseService 层即可覆盖全部 4 种传输模式**。

---

## 三、受影响的适配器

### 3.1 存在问题的适配器（8 个）

| # | 适配器文件 | 数据库类型 | 硬编码条件 | 严重程度 |
|---|-----------|-----------|-----------|---------|
| 1 | `src/adapters/postgres.ts` | PostgreSQL | `nspname = 'public'` | **高** |
| 2 | `src/adapters/gaussdb.ts` | GaussDB/OpenGauss | `nspname = 'public'` | **高** |
| 3 | `src/adapters/kingbase.ts` | KingbaseES | `nspname = 'public'` | **高** |
| 4 | `src/adapters/vastbase.ts` | Vastbase | `nspname = 'public'` | **高** |
| 5 | `src/adapters/highgo.ts` | HighGo | `nspname = 'public'` | **高** |
| 6 | `src/adapters/sqlserver.ts` | SQL Server | `SCHEMA_NAME()` / `SCHEMA_ID()` | **高** |
| 7 | `src/adapters/oracle.ts` | Oracle | `OWNER = USER` | **中** |
| 8 | `src/adapters/dm.ts` | 达梦 | `USER_*` 视图 | **中** |

### 3.2 不受影响的适配器（9 个）

| # | 适配器文件 | 数据库类型 | 原因 |
|---|-----------|-----------|------|
| 9 | `src/adapters/mysql.ts` | MySQL | `DATABASE()` = schema，无多 schema 概念 |
| 10 | `src/adapters/tidb.ts` | TiDB | MySQL 兼容，同上 |
| 11 | `src/adapters/oceanbase.ts` | OceanBase | MySQL 兼容，同上 |
| 12 | `src/adapters/polardb.ts` | PolarDB | MySQL 兼容，同上 |
| 13 | `src/adapters/goldendb.ts` | GoldenDB | MySQL 兼容，同上 |
| 14 | `src/adapters/clickhouse.ts` | ClickHouse | 按 database 隔离，无 schema 概念 |
| 15 | `src/adapters/sqlite.ts` | SQLite | 单文件数据库，无 schema 概念 |
| 16 | `src/adapters/mongodb.ts` | MongoDB | NoSQL，不适用 |
| 17 | `src/adapters/redis.ts` | Redis | NoSQL，不适用 |

### 3.3 各 SQL 查询硬编码位置汇总

**PostgreSQL 系（5 个适配器 x 5 条 SQL = 25 处）**：

| 查询 | postgres.ts | gaussdb.ts | kingbase.ts | vastbase.ts | highgo.ts |
|------|:-----------:|:----------:|:-----------:|:-----------:|:---------:|
| 列信息 | L185 | L175 | L181 | L182 | L187 |
| 主键 | L200 | L190 | L196 | L197 | L202 |
| 索引 | L217 | L207 | L213 | L214 | L219 |
| 行数/注释 | L231 | L221 | L227 | L228 | L233 |
| 外键 | L266 | L256 | L262 | L263 | L268 |

**SQL Server（5 处）**：`sqlserver.ts` L205, L218, L235, L250, L271

**Oracle（6 处）**：`oracle.ts` L211, L219, L230, L241, L251, L272

**达梦（5 处）**：`dm.ts` L287-333（使用 `USER_*` 视图本身就是限制）

---

## 四、最佳最优解决方案

### 4.1 设计原则

1. **向后兼容**：public/dbo/当前用户 Schema 的表名保持不变，不影响现有用户
2. **最小侵入**：核心改动集中在 Adapter SQL 和 DatabaseService，不改变整体架构
3. **统一方案**：所有适配器遵循同一套 Schema 处理逻辑
4. **安全可控**：使用排除系统 Schema 的方式，自动适配用户自定义 Schema
5. **全模式兼容**：修复自动覆盖 stdio、SSE、Streamable、REST 全部传输模式

### 4.2 修改概览

```
修改文件                            改动说明
─────────────────────────────────────────────────────────────
src/types/adapter.ts               TableInfo 增加 schema 可选字段
src/core/database-service.ts       quoteIdentifier 支持 schema 限定名
                                   getTableInfo 支持 schema.table 查找
src/adapters/postgres.ts           SQL 去掉 public 硬编码，按 schema 分组
src/adapters/gaussdb.ts            同上
src/adapters/kingbase.ts           同上
src/adapters/vastbase.ts           同上
src/adapters/highgo.ts             同上
src/adapters/sqlserver.ts          SQL 去掉 SCHEMA_NAME() 硬编码
src/adapters/oracle.ts             SQL 改用 ALL_* + 排除系统用户
src/adapters/dm.ts                 SQL 改用 ALL_* 视图 + 排除系统用户
src/mcp/mcp-server.ts              MCP 工具增加可选 schema 参数
src/http/routes/schema.ts          HTTP API 增加可选 schema 参数
─────────────────────────────────────────────────────────────
共 12 个文件
```

### 4.3 实施步骤

---

#### 步骤 1：修改 `src/types/adapter.ts` — TableInfo 增加 schema 字段

**改动**：给 `TableInfo` 接口增加可选的 `schema` 字段。

```typescript
export interface TableInfo {
  /** 表名（非默认 schema 时格式为 schema.table_name） */
  name: string;
  /** 所属 Schema（可选，不同数据库含义不同：PG=schema, Oracle=owner, SQLServer=schema） */
  schema?: string;
  /** 表注释/描述 */
  comment?: string;
  // ... 其余字段不变
}
```

**兼容性说明**：
- `schema` 是可选字段，不影响不支持多 Schema 的适配器（MySQL 系、SQLite、ClickHouse、NoSQL）
- 不支持多 Schema 的适配器无需任何改动，`schema` 字段自然为 `undefined`

---

#### 步骤 2：修改 `src/core/database-service.ts` — 核心服务层适配

**改动 2a**：`quoteIdentifier()` 支持 Schema 限定名

```typescript
private quoteIdentifier(identifier: string): string {
  const dbType = this.config.type;

  // 检查是否包含 schema 限定（schema.table 格式）
  const dotIndex = identifier.indexOf('.');
  if (dotIndex > 0) {
    const schema = identifier.substring(0, dotIndex);
    const name = identifier.substring(dotIndex + 1);
    return `${this.quoteSimpleIdentifier(schema)}.${this.quoteSimpleIdentifier(name)}`;
  }

  return this.quoteSimpleIdentifier(identifier);
}

/**
 * 引用单个标识符（不含 schema 前缀）
 */
private quoteSimpleIdentifier(identifier: string): string {
  const dbType = this.config.type;

  switch (dbType) {
    case 'mysql':
    case 'tidb':
    case 'oceanbase':
    case 'polardb':
    case 'goldendb':
      return `\`${identifier}\``;
    case 'sqlserver':
      return `[${identifier}]`;
    default:
      return `"${identifier}"`;
  }
}
```

**改动 2b**：`getTableInfo()` 增强表名匹配逻辑

```typescript
async getTableInfo(tableName: string, forceRefresh: boolean = false): Promise<TableInfo> {
  const schema = await this.getSchema(forceRefresh);

  // 优先精确匹配 name 字段（已包含 schema 前缀）
  let table = schema.tables.find(t =>
    t.name === tableName ||
    t.name.toLowerCase() === tableName.toLowerCase()
  );

  // 如果没找到，尝试用 schema + name 组合匹配
  if (!table && tableName.includes('.')) {
    const [schemaName, tblName] = tableName.split('.', 2);
    table = schema.tables.find(t =>
      t.schema?.toLowerCase() === schemaName.toLowerCase() &&
      (t.name === tblName || t.name.toLowerCase() === tblName.toLowerCase() ||
       t.name.toLowerCase() === tableName.toLowerCase())
    );
  }

  // 如果还没找到，尝试只匹配表名部分（不含 schema 前缀）
  if (!table) {
    const baseName = tableName.includes('.') ? tableName.split('.').pop()! : tableName;
    const matches = schema.tables.filter(t => {
      const tBaseName = t.name.includes('.') ? t.name.split('.').pop()! : t.name;
      return tBaseName.toLowerCase() === baseName.toLowerCase();
    });
    if (matches.length === 1) {
      table = matches[0];
    }
    // 多个匹配时不自动选择，让用户明确指定 schema
  }

  if (!table) {
    throw new Error(`表 "${tableName}" 不存在`);
  }

  return table;
}
```

---

#### 步骤 3：修改 PostgreSQL 系适配器（5 个文件）

以 `src/adapters/postgres.ts` 为例（其余 4 个适配器做相同改动）：

**改动 3a**：修改 `_getSchemaImpl()` 中的 5 条 SQL 查询

将所有 `WHERE c.table_schema = 'public'` 和 `AND n.nspname = 'public'` 替换为排除系统 Schema：

```sql
-- 列信息查询（改前）
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'

-- 列信息查询（改后）
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND t.table_type = 'BASE TABLE'
```

```sql
-- pg_catalog 查询（改前）
AND n.nspname = 'public'

-- pg_catalog 查询（改后）
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
```

**改动 3b**：修改列信息查询，额外返回 `table_schema` 列

```sql
SELECT
  c.table_schema,    -- 新增
  c.table_name,
  c.column_name,
  -- ... 其余列不变
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND t.table_type = 'BASE TABLE'
ORDER BY c.table_schema, c.table_name, c.ordinal_position
```

**改动 3c**：修改其余 4 条 pg_catalog 查询，额外返回 `nspname`

```sql
-- 主键、索引、行数、外键查询都需要额外 SELECT n.nspname as schema_name
SELECT
  n.nspname as schema_name,  -- 新增
  t.relname as table_name,
  -- ... 其余列不变
```

**改动 3d**：修改 `assembleSchema()` — 按 schema + table_name 分组

核心逻辑：

```typescript
// 构建带 schema 前缀的表名键
// 默认 schema (public) 的表：直接用表名，保持向后兼容
// 非默认 schema 的表：使用 schema.table_name 格式
function makeTableKey(schemaName: string, tableName: string): string {
  return schemaName === 'public' ? tableName : `${schemaName}.${tableName}`;
}
```

在 `assembleSchema` 中组装 `TableInfo` 时设置 `schema` 字段：

```typescript
tableInfos.push({
  name: tableKey,       // public 的表: "users", 非 public 的表: "analytics.users"
  schema: schemaName,   // "public" / "analytics" / ...
  comment: ...,
  columns,
  // ... 其余不变
});
```

---

#### 步骤 4：修改 SQL Server 适配器

**文件**：`src/adapters/sqlserver.ts`

**改动 4a**：修改 5 条 SQL 查询，去掉 `SCHEMA_NAME()` / `SCHEMA_ID()` 限制

```sql
-- 列信息（改前）
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND t.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
  AND t.TABLE_SCHEMA = SCHEMA_NAME()

-- 列信息（改后）
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND t.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
```

```sql
-- 主键（改前）
WHERE tc.TABLE_SCHEMA = SCHEMA_NAME()

-- 主键（改后）
WHERE tc.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
```

```sql
-- 索引（改前）
WHERE t.schema_id = SCHEMA_ID()

-- 索引（改后）
WHERE t.schema_id NOT IN (SCHEMA_ID('sys'), SCHEMA_ID('INFORMATION_SCHEMA'), SCHEMA_ID('guest'))
  AND SCHEMA_NAME(t.schema_id) IS NOT NULL
```

```sql
-- 行数（改前）
WHERE t.schema_id = SCHEMA_ID()

-- 行数（改后）
WHERE t.schema_id NOT IN (SCHEMA_ID('sys'), SCHEMA_ID('INFORMATION_SCHEMA'), SCHEMA_ID('guest'))
  AND SCHEMA_NAME(t.schema_id) IS NOT NULL
```

```sql
-- 外键（改前）
WHERE t.schema_id = SCHEMA_ID()

-- 外键（改后）
WHERE t.schema_id NOT IN (SCHEMA_ID('sys'), SCHEMA_ID('INFORMATION_SCHEMA'), SCHEMA_ID('guest'))
  AND SCHEMA_NAME(t.schema_id) IS NOT NULL
```

**改动 4b**：额外 SELECT schema 列

```sql
-- INFORMATION_SCHEMA 查询额外返回 TABLE_SCHEMA
SELECT c.TABLE_SCHEMA, c.TABLE_NAME, ...

-- sys 查询额外返回 SCHEMA_NAME(t.schema_id)
SELECT SCHEMA_NAME(t.schema_id) AS table_schema, t.name AS table_name, ...
```

**改动 4c**：`assembleSchema()` 使用 `dbo` 作为默认 schema

```typescript
function makeTableKey(schemaName: string, tableName: string): string {
  return schemaName === 'dbo' ? tableName : `${schemaName}.${tableName}`;
}
```

---

#### 步骤 5：修改 Oracle 适配器

**文件**：`src/adapters/oracle.ts`

**改动 5a**：将 `OWNER = USER` 改为排除系统用户，改用 `ALL_*` 视图的完整能力

```sql
-- 列信息（改前）
FROM ALL_TAB_COLUMNS WHERE OWNER = USER

-- 列信息（改后）
FROM ALL_TAB_COLUMNS
WHERE OWNER NOT IN (
  'SYS', 'SYSTEM', 'DBSNMP', 'APPQOSSYS', 'DBSFWUSER',
  'OUTLN', 'GSMADMIN_INTERNAL', 'GGSYS', 'XDB', 'WMSYS',
  'MDSYS', 'ORDDATA', 'CTXSYS', 'ORDSYS', 'OLAPSYS',
  'LBACSYS', 'DVSYS', 'AUDSYS', 'OJVMSYS', 'REMOTE_SCHEDULER_AGENT'
)
```

对 `ALL_COL_COMMENTS`、`ALL_CONSTRAINTS`、`ALL_INDEXES`、`ALL_TABLES` 查询做同样的改动，并额外 SELECT `OWNER` 列。

**改动 5b**：`assembleSchema()` 使用当前用户名作为默认 schema

```typescript
// 当前用户的表直接用表名，其他用户的表加 owner 前缀
function makeTableKey(owner: string, tableName: string, currentUser: string): string {
  return owner === currentUser ? tableName : `${owner}.${tableName}`;
}
```

---

#### 步骤 6：修改达梦（DM）适配器

**文件**：`src/adapters/dm.ts`

**改动 6a**：将 `USER_*` 视图改为 `ALL_*` 视图 + 排除系统用户

```sql
-- 改前
FROM USER_TAB_COLUMNS

-- 改后
FROM ALL_TAB_COLUMNS
WHERE OWNER NOT IN ('SYS', 'SYSTEM', 'SYSAUDITOR', 'SYSSSO', 'SYSDBA', 'CTISYS')
```

对 `USER_COL_COMMENTS`、`USER_CONSTRAINTS`、`USER_INDEXES`、`USER_TABLES` 做同样的改动。

**改动 6b**：`assembleSchemaFromIndexedRows()` 使用当前用户作为默认 schema

与 Oracle 适配器逻辑一致。

---

#### 步骤 7：修改 MCP 工具定义

**文件**：`src/mcp/mcp-server.ts`

为 `get_table_info`、`get_enum_values`、`get_sample_data` 的 `inputSchema` 更新 `tableName` 的描述，说明支持 `schema.table_name` 格式：

```typescript
// get_table_info
tableName: {
  type: 'string',
  description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。不指定 Schema 时查询默认 Schema。',
},

// get_enum_values
tableName: {
  type: 'string',
  description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。',
},

// get_sample_data
tableName: {
  type: 'string',
  description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。',
},
```

同时更新 `get_schema` 的描述：

```typescript
description: '获取数据库结构信息，包括所有 Schema 中用户可访问的表名、列名、数据类型、主键、索引等元数据。...',
```

---

#### 步骤 8：修改 HTTP API 路由

**文件**：`src/http/routes/schema.ts`

更新 API schema 描述中 `tableName` 的说明，与 MCP 工具保持一致。HTTP API 的 `tableName` 参数同样支持 `schema.table_name` 格式。（实际逻辑已在 DatabaseService 层处理，这里只需更新文档描述。）

---

### 4.4 表名规则总结

| 数据库类型 | 默认 Schema | 默认 Schema 表名格式 | 非默认 Schema 表名格式 |
|-----------|-----------|-------------------|---------------------|
| PostgreSQL 系 | `public` | `users` | `analytics.users` |
| SQL Server | `dbo` | `users` | `sales.orders` |
| Oracle | 当前 USER | `users` | `other_owner.users` |
| 达梦 | 当前 USER | `users` | `other_schema.users` |
| MySQL 系 | N/A | `users`（不变） | N/A |
| 其他 | N/A | `users`（不变） | N/A |

---

### 4.5 各适配器系统 Schema 排除清单

| 数据库类型 | 需排除的系统 Schema |
|-----------|-------------------|
| PostgreSQL 系 | `pg_catalog`, `information_schema`, `pg_toast` |
| SQL Server | `sys`, `INFORMATION_SCHEMA`, `guest` |
| Oracle | `SYS`, `SYSTEM`, `DBSNMP`, `APPQOSSYS`, `DBSFWUSER`, `OUTLN`, `GSMADMIN_INTERNAL`, `GGSYS`, `XDB`, `WMSYS`, `MDSYS`, `ORDDATA`, `CTXSYS`, `ORDSYS`, `OLAPSYS`, `LBACSYS`, `DVSYS`, `AUDSYS`, `OJVMSYS`, `REMOTE_SCHEDULER_AGENT` |
| 达梦 | `SYS`, `SYSTEM`, `SYSAUDITOR`, `SYSSSO`, `SYSDBA`, `CTISYS` |

---

## 五、修改文件清单

| # | 文件路径 | 改动说明 | 预估改动量 |
|---|---------|---------|----------|
| 1 | `src/types/adapter.ts` | `TableInfo` 增加 `schema?: string` | 1 行 |
| 2 | `src/core/database-service.ts` | `quoteIdentifier` 拆分 + `getTableInfo` 增强匹配 | ~30 行 |
| 3 | `src/adapters/postgres.ts` | 5 条 SQL 改 + assembleSchema 适配 | ~50 行 |
| 4 | `src/adapters/gaussdb.ts` | 同 postgres | ~50 行 |
| 5 | `src/adapters/kingbase.ts` | 同 postgres | ~50 行 |
| 6 | `src/adapters/vastbase.ts` | 同 postgres | ~50 行 |
| 7 | `src/adapters/highgo.ts` | 同 postgres | ~50 行 |
| 8 | `src/adapters/sqlserver.ts` | 5 条 SQL 改 + assembleSchema 适配 | ~60 行 |
| 9 | `src/adapters/oracle.ts` | 6 条 SQL 改 + assembleSchema 适配 | ~60 行 |
| 10 | `src/adapters/dm.ts` | 5 条 SQL 改 + assembleSchema 适配 | ~60 行 |
| 11 | `src/mcp/mcp-server.ts` | 工具描述更新 | ~10 行 |
| 12 | `src/http/routes/schema.ts` | API 描述更新 | ~5 行 |

**总计**：12 个文件，约 476 行改动

---

## 六、执行顺序

```
阶段 1: 基础设施（无破坏性）
  ├─ Step 1: 修改 types/adapter.ts（增加 schema 字段）
  └─ Step 2: 修改 database-service.ts（quoteIdentifier + getTableInfo）

阶段 2: 适配器修改（按数据库族分批）
  ├─ Step 3: 修改 PostgreSQL 系 5 个适配器
  │   ├─ postgres.ts
  │   ├─ gaussdb.ts
  │   ├─ kingbase.ts
  │   ├─ vastbase.ts
  │   └─ highgo.ts
  ├─ Step 4: 修改 sqlserver.ts
  ├─ Step 5: 修改 oracle.ts
  └─ Step 6: 修改 dm.ts

阶段 3: 工具/API 层（最后修改，依赖前两阶段）
  ├─ Step 7: 修改 mcp-server.ts（MCP 工具描述）
  └─ Step 8: 修改 schema.ts（HTTP API 描述）

阶段 4: 验证
  └─ Step 9: TypeScript 编译验证
```

---

## 七、向后兼容性保障

| 场景 | 兼容性 | 说明 |
|------|:-----:|------|
| 现有用户使用 `get_table_info("users")` | **兼容** | 默认 Schema 的表名不变 |
| 现有用户使用 `get_schema` | **兼容** | 返回结果新增非默认 Schema 表，但原有表不变 |
| `TableInfo.schema` 字段 | **兼容** | 可选字段，不影响现有消费者 |
| MySQL 系 / SQLite / ClickHouse / NoSQL | **兼容** | 这些适配器不涉及任何改动 |
| MCP 工具参数 | **兼容** | `tableName` 参数不变，仅更新描述文字 |
| HTTP API 参数 | **兼容** | 同上 |
| `get_enum_values` / `get_sample_data` SQL | **兼容** | `quoteIdentifier` 自动处理有无 schema 前缀 |

---

## 八、风险评估

| 风险 | 等级 | 缓解措施 |
|------|:----:|---------|
| Oracle 系统用户排除清单不完整 | 低 | 采用业界通用清单，遗漏的系统用户表不会影响业务功能，仅多返回一些无用表 |
| 同名表在不同 Schema 中冲突 | 低 | `getTableInfo` 多匹配时不自动选择，要求用户用 `schema.table` 明确指定 |
| 大量 Schema 导致返回数据过多 | 低 | 企业环境通常 Schema 数量有限（< 20），且返回的是元数据非实际数据 |
| 达梦 `ALL_*` 视图兼容性 | 低 | 达梦官方文档明确支持 `ALL_TAB_COLUMNS` 等视图 |
