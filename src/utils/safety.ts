/**
 * 安全检查工具
 * 用于防止误操作删库等危险行为
 * 增强功能：DDL 白名单、密码脱敏、更完善的危险操作检测
 */

/**
 * 危险的 SQL 关键字列表
 * 这些操作会修改或删除数据
 */
const DANGEROUS_KEYWORDS = [
  'DELETE',
  'DROP',
  'TRUNCATE',
  'UPDATE',
  'INSERT',
  'ALTER',
  'CREATE',
  'RENAME',
  'REPLACE',
] as const;

/**
 * 危险的 SQL 模式（借鉴 DatabaseMcpServer）
 * 使用正则表达式进行更精确的匹配
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bDELETE\s+FROM\s+\w+\s*;?\s*$/i,  // DELETE without WHERE
  /\bUPDATE\s+\w+\s+SET\s+[^;]*(?!WHERE)/i,  // UPDATE without WHERE (basic check)
];

/**
 * DDL 白名单正则表达式列表
 * 匹配白名单的 SQL 语句将被允许执行
 */
let ddlWhitelistPatterns: RegExp[] = [];

/**
 * 加载 DDL 白名单
 * @param patterns 正则表达式字符串列表
 */
export function loadDdlWhitelist(patterns: string[]): void {
  ddlWhitelistPatterns = patterns.map(pattern => {
    try {
      return new RegExp(pattern, 'i');
    } catch (error) {
      console.error(`⚠️ 无效的白名单正则表达式: ${pattern}`);
      return null;
    }
  }).filter((r): r is RegExp => r !== null);

  if (ddlWhitelistPatterns.length > 0) {
    console.error(`✅ 已加载 ${ddlWhitelistPatterns.length} 个 DDL 白名单规则`);
  }
}

/**
 * 检查 SQL 是否匹配白名单
 * @param sql SQL 语句
 * @returns 是否匹配白名单
 */
export function isSqlWhitelisted(sql: string): boolean {
  if (ddlWhitelistPatterns.length === 0) {
    return false;
  }
  return ddlWhitelistPatterns.some(pattern => pattern.test(sql));
}

/**
 * 检测 SQL 语句中是否包含危险操作（高危 DDL）
 * @param sql SQL 语句
 * @returns 是否包含危险操作
 */
export function detectDangerousOperation(sql: string): boolean {
  if (!sql || typeof sql !== 'string') {
    return false;
  }

  // 如果匹配白名单，则允许执行
  if (isSqlWhitelisted(sql)) {
    console.error(`🔓 SQL 命中白名单，跳过危险检测`);
    return false;
  }

  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      console.error(`⚠️ 检测到危险 SQL 模式: ${pattern.toString()}`);
      return true;
    }
  }

  return false;
}

/**
 * 检查 SQL 语句是否包含写操作
 * @param query - 待检查的 SQL 语句
 * @returns 如果包含写操作返回 true
 */
export function isWriteOperation(query: string): boolean {
  const upperQuery = query.trim().toUpperCase();

  return DANGEROUS_KEYWORDS.some(keyword => {
    // 检查是否以该关键字开头（忽略前导空格和注释）
    const pattern = new RegExp(`^(\\s|--.*|/\\*.*?\\*/)*${keyword}\\b`, 'i');
    return pattern.test(upperQuery);
  });
}

/**
 * 验证查询是否允许执行
 * @param query - 待执行的查询
 * @param allowWrite - 是否允许写操作
 * @throws 如果查询被拒绝，抛出带有中文提示的错误
 */
export function validateQuery(query: string, allowWrite: boolean): void {
  // 检查白名单
  if (isSqlWhitelisted(query)) {
    return; // 白名单放行
  }

  if (!allowWrite && isWriteOperation(query)) {
    throw new Error(
      '❌ 操作被拒绝：当前处于只读安全模式。\n' +
      '检测到危险操作（DELETE/UPDATE/DROP/TRUNCATE 等）。\n' +
      '如需执行写入操作，请在启动时添加 --danger-allow-write 参数。\n' +
      '⚠️  警告：启用写入模式后，AI 可以修改你的数据库，请谨慎使用！'
    );
  }
}

/**
 * 获取查询中的危险关键字（用于日志记录）
 * @param query - SQL 查询语句
 * @returns 找到的危险关键字数组
 */
export function getDangerousKeywords(query: string): string[] {
  const upperQuery = query.trim().toUpperCase();
  return DANGEROUS_KEYWORDS.filter(keyword =>
    upperQuery.includes(keyword)
  );
}

// ==================== 密码脱敏功能 ====================

/**
 * 脱敏连接字符串中的密码
 * @param connectionString 原始连接字符串
 * @returns 密码被替换为 **** 的连接字符串
 */
export function maskPassword(connectionString: string): string {
  if (!connectionString) {
    return '';
  }

  // 匹配常见的密码参数格式
  return connectionString
    .replace(/(?:password|pwd|passwd)=([^;]*)/gi, (match, _) => {
      const key = match.split('=')[0];
      return `${key}=****`;
    })
    .replace(/:([^:@]+)@/g, ':****@'); // 处理 URI 格式的密码
}

/**
 * 脱敏对象中的密码字段
 * @param obj 可能包含密码的对象
 * @returns 密码字段被替换的新对象
 */
export function maskSensitiveFields<T extends Record<string, unknown>>(obj: T): T {
  const sensitiveKeys = ['password', 'pwd', 'passwd', 'secret', 'token', 'apiKey', 'api_key'];
  const masked = { ...obj };

  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
      masked[key as keyof T] = '****' as T[keyof T];
    }
  }

  return masked;
}

/**
 * 安全日志输出（自动脱敏敏感信息）
 * @param message 日志消息
 * @param data 可选的数据对象
 */
export function safeLog(message: string, data?: Record<string, unknown>): void {
  if (data) {
    console.error(message, maskSensitiveFields(data));
  } else {
    console.error(message);
  }
}

// ==================== Redis 写操作检测 ====================

/**
 * Redis 写命令列表
 */
const REDIS_WRITE_COMMANDS = [
  'SET', 'SETEX', 'SETNX', 'SETRANGE', 'MSET', 'MSETNX', 'PSETEX',
  'APPEND', 'INCR', 'INCRBY', 'INCRBYFLOAT', 'DECR', 'DECRBY',
  'DEL', 'UNLINK', 'EXPIRE', 'EXPIREAT', 'PEXPIRE', 'PEXPIREAT', 'PERSIST',
  'RENAME', 'RENAMENX', 'COPY', 'MOVE',
  'HSET', 'HSETNX', 'HMSET', 'HINCRBY', 'HINCRBYFLOAT', 'HDEL',
  'LPUSH', 'LPUSHX', 'RPUSH', 'RPUSHX', 'LPOP', 'RPOP', 'LSET', 'LINSERT', 'LREM', 'LTRIM',
  'SADD', 'SREM', 'SPOP', 'SMOVE', 'SUNIONSTORE', 'SINTERSTORE', 'SDIFFSTORE',
  'ZADD', 'ZREM', 'ZINCRBY', 'ZUNIONSTORE', 'ZINTERSTORE', 'ZPOPMIN', 'ZPOPMAX',
  'PFADD', 'PFMERGE',
  'XADD', 'XDEL', 'XTRIM',
  'GEOADD', 'GEORADIUS', 'GEORADIUSBYMEMBER',
  'FLUSHDB', 'FLUSHALL',
];

/**
 * 检查 Redis 命令是否为写操作
 * @param command Redis 命令字符串
 * @returns 是否为写操作
 */
export function isRedisWriteCommand(command: string): boolean {
  const upperCommand = command.trim().toUpperCase();
  const firstWord = upperCommand.split(/\s+/)[0];
  return REDIS_WRITE_COMMANDS.includes(firstWord);
}

// ==================== MongoDB 写操作检测 ====================

/**
 * MongoDB 写操作名称列表
 */
const MONGODB_WRITE_OPERATIONS = [
  'insert', 'insertone', 'insertmany',
  'update', 'updateone', 'updatemany', 'replaceone',
  'delete', 'deleteone', 'deletemany',
  'findoneanddelete', 'findoneandreplace', 'findoneandupdate',
  'bulkwrite', 'drop', 'dropcollection', 'dropdatabase',
  'createindex', 'createindexes', 'dropindex', 'dropindexes',
  'rename', 'aggregate', // aggregate with $out or $merge is a write
];

/**
 * 检查 MongoDB 操作是否为写操作
 * @param operation 操作名称
 * @returns 是否为写操作
 */
export function isMongoWriteOperation(operation: string): boolean {
  const lowerOp = operation.trim().toLowerCase();
  return MONGODB_WRITE_OPERATIONS.includes(lowerOp);
}
