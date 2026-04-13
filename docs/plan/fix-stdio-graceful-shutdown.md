# Fix: stdio MCP Server 进程无法正常退出

> Issue 来源: GitHub Issue — "stdio MCP server does not exit cleanly when Codex CLI session closes"

---

## 一、问题描述

当 `universal-db-mcp` 作为 **stdio MCP server** 被 Codex CLI 调用时，数据库查询功能一切正常，但用户在 Codex 中执行 `/exit` 后：

- Codex 打印了正常的会话结束信息（token 用量、resume 提示）
- **终端提示符不返回**，进程挂起
- 必须手动按 `Ctrl+C` 才能回到 shell

用户已验证：移除 MCP 配置后 `/exit` 正常工作，说明问题出在 MCP server 的进程生命周期管理上。

### 复现环境

| 项目 | 值 |
|------|-----|
| universal-db-mcp | 2.9.0+（当前 2.12.0 仍存在） |
| Codex CLI | 0.114.0+ |
| OS | Windows |
| 数据库 | PostgreSQL |
| MCP 模式 | stdio |

---

## 二、问题分析

### 2.1 代码审计结果

#### 文件 1: `src/mcp/mcp-index.ts` (第 94-105 行)

当前 graceful shutdown 仅处理了两种 POSIX 信号：

```typescript
// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\n⏹️  收到退出信号，正在关闭服务器...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n⏹️  收到终止信号，正在关闭服务器...');
  await server.stop();
  process.exit(0);
});
```

**缺失：** 没有监听 `process.stdin` 的 `end` / `close` 事件。

#### 文件 2: `src/mcp/mcp-server.ts` (第 392-401 行)

`stop()` 方法只清理了数据库层，没有关闭 MCP Server 本身：

```typescript
async stop(): Promise<void> {
  if (this.databaseService) {
    this.databaseService.clearSchemaCache();
  }
  if (this.adapter) {
    await this.adapter.disconnect();
    console.error('👋 数据库连接已关闭');
  }
  // ❌ 缺少: await this.server.close()
}
```

#### 文件 3: SDK `StdioServerTransport` (node_modules)

SDK 的 stdio transport 只监听了 `data` 和 `error`，**没有监听 `end`/`close`**：

```javascript
async start() {
    this._stdin.on('data', this._ondata);
    this._stdin.on('error', this._onerror);
    // ❌ 没有监听 stdin 的 end/close
}
```

### 2.2 根因链路

```
Codex CLI 执行 /exit
  → Codex 关闭子进程的 stdin 管道（EOF）
  → 但不一定发送 SIGINT/SIGTERM（尤其在 Windows 上）
  → universal-db-mcp 没有监听 stdin.end / stdin.close
  → MCP Server 实例未被 close()（transport 层仍持有 stdin/stdout 引用）
  → 数据库连接池仍然活跃（pg.Pool keepAlive: true, idleTimeoutMillis: 60000）
  → Node.js 事件循环中存在活跃 handle，无法自动退出
  → 进程挂起 ❌
```

### 2.3 影响范围

| 传输模式 | 是否受影响 | 原因 |
|----------|-----------|------|
| **stdio** | ✅ 受影响 | 直接命中：缺少 stdin 关闭监听 + stop() 不完整 |
| **SSE** | ⚠️ 间接受影响 | `stop()` 不调用 `server.close()`，资源清理不完整 |
| **Streamable HTTP** | ⚠️ 间接受影响 | 同上，`cleanupSession()` 调用 `stop()` 但 MCP Server 未关闭 |
| **REST API** | ✅ 不受影响 | HTTP 模式有独立的 shutdown 逻辑（`fastify.close()`） |

所有 17 种数据库适配器均受影响，因为问题出在传输层和进程生命周期管理，不在适配器层。

---

## 三、问题原因总结

1. **stdin 生命周期未监听**：stdio 模式下没有监听 `process.stdin` 的 `end`/`close` 事件，当 MCP 客户端关闭 stdin 管道时服务器无感知
2. **MCP Server 未正确关闭**：`stop()` 方法缺少 `this.server.close()` 调用，导致 transport 层资源（stdin/stdout 监听器）未被释放
3. **无超时保护**：shutdown 过程中如果数据库断连或 `server.close()` 挂起，没有超时兜底机制
4. **无重入保护**：多个退出信号可能同时触发（如 stdin close + SIGINT），导致 `stop()` 被重复执行
5. **Windows 兼容性**：Windows 上 SIGTERM 支持有限，更依赖 stdin 关闭来检测父进程退出

---

## 四、最佳解决方案

### 4.1 设计原则

- 改动最小化：只修改必要的文件，不影响现有功能
- 全模式兼容：stdio / SSE / Streamable HTTP / REST 四种传输模式均正常工作
- 全适配器兼容：17 种数据库适配器无需任何修改
- 超时兜底：防止 shutdown 过程本身挂起
- 重入安全：多信号并发时只执行一次 shutdown
- Windows 友好：不依赖 POSIX-only 的信号机制

### 4.2 修改文件清单

| 文件 | 修改内容 | 影响范围 |
|------|---------|---------|
| `src/mcp/mcp-server.ts` | `stop()` 中增加 `this.server.close()` | 所有模式（stdio/SSE/Streamable HTTP） |
| `src/mcp/mcp-index.ts` | 添加统一 graceful shutdown + stdin 监听 | 仅 stdio 模式 |

**不需要修改的文件：**
- 17 个数据库适配器 — 问题不在适配器层
- `src/http/http-index.ts` — HTTP 模式有独立的 shutdown 逻辑，已正常工作
- `src/http/routes/mcp-sse.ts` — SSE/Streamable 的 `cleanupSession()` 调用 `stop()`，修复 `stop()` 后自动受益
- `src/index.ts` — 入口文件无需修改

### 4.3 具体修改方案

#### 修改 1: `src/mcp/mcp-server.ts` — 完善 `stop()` 方法

**修改位置：** 第 392-401 行

**修改前：**
```typescript
async stop(): Promise<void> {
  if (this.databaseService) {
    this.databaseService.clearSchemaCache();
  }
  if (this.adapter) {
    await this.adapter.disconnect();
    console.error('👋 数据库连接已关闭');
  }
}
```

**修改后：**
```typescript
async stop(): Promise<void> {
  // 1. 关闭 MCP Server（释放 transport 层资源：stdin/stdout 监听器等）
  try {
    await this.server.close();
  } catch (err) {
    console.error('关闭 MCP Server 时出错:', err instanceof Error ? err.message : String(err));
  }

  // 2. 清理 Schema 缓存
  if (this.databaseService) {
    this.databaseService.clearSchemaCache();
  }

  // 3. 断开数据库连接
  if (this.adapter) {
    await this.adapter.disconnect();
    console.error('👋 数据库连接已关闭');
  }
}
```

**修改理由：**
- 先关闭 MCP Server，释放 transport 层持有的 stdin/stdout 引用
- `server.close()` 内部会调用 `transport.close()`，移除 stdin 上的 `data`/`error` 监听器并 pause stdin
- 这使得 SSE 和 Streamable HTTP 模式的 `cleanupSession()` 也能正确释放 transport 资源
- 用 try-catch 包裹，防止 close 失败阻塞后续的数据库断连

#### 修改 2: `src/mcp/mcp-index.ts` — 统一 graceful shutdown + stdin 监听

**修改位置：** 第 84-111 行（`action` 回调内部）

**修改前：**
```typescript
// Set adapter and start server
server.setAdapter(adapter);
await server.start();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\n⏹️  收到退出信号，正在关闭服务器...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n⏹️  收到终止信号，正在关闭服务器...');
  await server.stop();
  process.exit(0);
});
```

**修改后：**
```typescript
// Set adapter and start server
server.setAdapter(adapter);
await server.start();

// 统一的 graceful shutdown（防重入 + 超时保护）
let shuttingDown = false;

async function gracefulShutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.error(`\n⏹️  正在关闭服务器 (${reason})...`);

  try {
    await Promise.race([
      server.stop(),
      new Promise<void>((resolve) => setTimeout(() => {
        console.error('⚠️  关闭超时，强制退出');
        resolve();
      }, 5000)),
    ]);
  } catch (err) {
    console.error('关闭过程中出错:', err instanceof Error ? err.message : String(err));
  } finally {
    process.exit(0);
  }
}

// 信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// stdin 关闭处理（核心修复）
// 当 MCP 客户端（如 Codex CLI）关闭 stdin 管道时触发
process.stdin.resume();
process.stdin.on('end', () => gracefulShutdown('stdin-end'));
process.stdin.on('close', () => gracefulShutdown('stdin-close'));
```

**修改理由：**

1. **`process.stdin.resume()`**：确保 stdin 处于流动模式（flowing mode），否则 `end` 事件可能不会触发。虽然 `StdioServerTransport.start()` 内部会调用 `stdin.on('data', ...)` 使 stdin 进入流动模式，但显式调用 `resume()` 更安全，确保即使 SDK 行为变化也能正确工作。

2. **`stdin.on('end', ...)`**：当 MCP 客户端关闭 stdin 管道（发送 EOF）时触发。这是 Codex CLI `/exit` 的主要退出路径。

3. **`stdin.on('close', ...)`**：当 stdin 流被完全销毁时触发。作为 `end` 的补充保障。

4. **`shuttingDown` 标志**：防止多个事件（如 `end` + `close` 同时触发，或 `stdin-end` + `SIGINT`）导致 `stop()` 被重复执行。

5. **`Promise.race` 超时保护**：5 秒超时兜底。如果数据库连接池断连挂起（如远程数据库网络不可达），不会导致进程永远无法退出。

### 4.4 修改后的调用链路

```
场景 A: Codex CLI /exit（stdin 关闭）
  → process.stdin 'end' 事件触发
  → gracefulShutdown('stdin-end')
  → server.stop()
    → this.server.close()        ← 释放 transport（移除 stdin 监听器）
    → this.adapter.disconnect()  ← 关闭数据库连接池
  → process.exit(0)
  → 进程正常退出 ✅

场景 B: Ctrl+C（SIGINT）
  → process 'SIGINT' 事件触发
  → gracefulShutdown('SIGINT')
  → 同上 ✅

场景 C: 系统终止（SIGTERM）
  → process 'SIGTERM' 事件触发
  → gracefulShutdown('SIGTERM')
  → 同上 ✅

场景 D: 数据库断连超时
  → gracefulShutdown(任意原因)
  → server.stop() 中 adapter.disconnect() 挂起
  → 5 秒后超时保护触发
  → process.exit(0)
  → 进程强制退出 ✅
```

### 4.5 对各传输模式的影响

| 传输模式 | 影响 | 说明 |
|----------|------|------|
| **stdio** | ✅ 直接修复 | 新增 stdin 监听 + 完善 stop() |
| **SSE** | ✅ 间接受益 | `cleanupSession()` → `stop()` 现在会正确调用 `server.close()` |
| **Streamable HTTP** | ✅ 间接受益 | 同上 |
| **REST API** | ✅ 无影响 | HTTP 模式不经过 `mcp-server.ts`，有独立的 shutdown 逻辑 |

### 4.6 对 17 种数据库适配器的影响

**零影响。** 所有适配器的 `disconnect()` 方法签名和行为不变，修改仅在传输层和进程生命周期管理层。

| 适配器 | disconnect() 实现 | 影响 |
|--------|-------------------|------|
| PostgreSQL | `pool.end()` | 无 |
| MySQL | `pool.end()` | 无 |
| SQLite | `db.close()` | 无 |
| Redis | `client.quit()` | 无 |
| Oracle | `pool.close(0)` | 无 |
| SQL Server | `pool.close()` | 无 |
| MongoDB | `client.close()` | 无 |
| ClickHouse | `client.close()` | 无 |
| 达梦 (DM) | `connection.close()` | 无 |
| 人大金仓 (KingBase) | `pool.end()` | 无 |
| 华为高斯 (GaussDB) | `pool.end()` | 无 |
| OceanBase | `pool.end()` | 无 |
| TiDB | `pool.end()` | 无 |
| PolarDB | `pool.end()` | 无 |
| 海量 (VastBase) | `pool.end()` | 无 |
| 瀚高 (HighGo) | `pool.end()` | 无 |
| 中兴 (GoldenDB) | `pool.end()` | 无 |

---

## 五、验证方案

### 5.1 stdio 模式验证

```bash
# 1. 构建项目
npm run build

# 2. 用 Codex CLI 注册并测试
codex mcp add test-pg -- universal-db-mcp --type postgres --host <host> --port 5432 --user <user> --password <pass> --database <db>

# 3. 启动 Codex，执行查询，然后 /exit
# 预期：进程正常退出，终端提示符立即返回
```

### 5.2 手动 stdin 关闭测试

```bash
# 模拟 stdin 关闭
echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":1}' | node dist/index.js --type sqlite --file test.db

# 预期：stdin EOF 后进程在几秒内自动退出
```

### 5.3 SSE / Streamable HTTP 模式验证

```bash
# 启动 HTTP 模式
MODE=http node dist/index.js

# 建立 SSE 连接，执行操作，然后断开
# 预期：cleanupSession 正确释放所有资源
```

---

## 六、风险评估

| 风险项 | 等级 | 缓解措施 |
|--------|------|---------|
| `server.close()` 抛异常 | 低 | 已用 try-catch 包裹 |
| stdin end/close 在某些平台不触发 | 低 | 保留 SIGINT/SIGTERM 作为后备 |
| 超时时间不够（大型连接池） | 低 | 5 秒对单连接池足够；可按需调整 |
| `process.stdin.resume()` 副作用 | 极低 | SDK 的 `StdioServerTransport` 已经在监听 data 事件，stdin 本就处于流动模式 |

---

## 七、执行计划

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 修改 `stop()` 方法，增加 `this.server.close()` | `src/mcp/mcp-server.ts` |
| 2 | 重构 shutdown 逻辑，添加统一 gracefulShutdown + stdin 监听 | `src/mcp/mcp-index.ts` |
| 3 | 执行 `npm run build` 验证编译通过 | — |
| 4 | 运行现有测试 `npm test` | — |
