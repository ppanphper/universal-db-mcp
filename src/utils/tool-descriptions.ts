/**
 * 根据数据库类型动态生成 MCP 工具描述
 *
 * 不同数据库有完全不同的查询语法（SQL vs MongoDB JSON vs Redis 命令），
 * 通过动态生成工具描述，让 AI 准确了解当前数据库的查询方式。
 */

type DbType = string | undefined;

interface ToolDescription {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * 多库模式上下文信息，用于在工具描述中标注当前活跃数据库
 */
export interface MultiDbContext {
  currentDbName: string;
  currentDbType: string;
}

// ========== MongoDB ==========

const MONGODB_EXECUTE_QUERY: ToolDescription = {
  name: 'execute_query',
  description: `执行 MongoDB 查询命令。支持两种格式：

【JSON 格式（推荐，功能完整）】
{"collection": "集合名", "operation": "操作类型", "query": {过滤条件}, "options": {选项}, "update": {更新内容}, "pipeline": [聚合管道]}

字段说明：
- collection（必需）: 集合名称
- operation（必需）: 操作类型，支持 find / findOne / count / countDocuments / distinct / aggregate / insertOne / insertMany / updateOne / updateMany / deleteOne / deleteMany
- query: 过滤条件，支持所有 MongoDB 查询操作符（$gt, $lt, $gte, $lte, $in, $nin, $regex, $exists, $or, $and, $not 等）
- options: 查询选项，支持 projection（字段投影，如 {"name": 1, "_id": 0}）、sort（排序，如 {"createdAt": -1}）、limit（限制条数）、skip（跳过条数）；distinct 操作时用 {"field": "字段名"} 指定字段
- update: 更新内容（updateOne / updateMany 时必需），如 {"$set": {"status": "active"}}
- pipeline: 聚合管道数组（aggregate 时必需），如 [{"$match": {...}}, {"$group": {...}}]

常用示例：
- 条件查询带投影：{"collection": "users", "operation": "find", "query": {"age": {"$gt": 18}}, "options": {"projection": {"name": 1, "email": 1, "_id": 0}, "sort": {"age": -1}, "limit": 10}}
- 聚合统计：{"collection": "orders", "operation": "aggregate", "pipeline": [{"$match": {"status": "paid"}}, {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}]}

【Shell 格式（仅支持基本过滤，不支持 projection/sort/limit 等选项）】
db.集合名.操作({"过滤条件"})
示例：db.users.find({"age": {"$gt": 18}})`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'MongoDB 查询命令，使用 JSON 格式或 db.collection.operation() 格式',
      },
    },
    required: ['query'],
  },
};

const MONGODB_GET_SCHEMA: ToolDescription = {
  name: 'get_schema',
  description: '获取 MongoDB 数据库结构信息，包括所有集合名称及其字段（通过采样文档推断）。由于 MongoDB 是无模式数据库，字段信息基于采样，可能不完整。在执行查询前调用此工具可以帮助理解数据结构。结果会被缓存以提高性能。',
  inputSchema: {
    type: 'object',
    properties: {
      forceRefresh: {
        type: 'boolean',
        description: '是否强制刷新缓存（可选，默认 false）',
      },
    },
  },
};

const MONGODB_GET_TABLE_INFO: ToolDescription = {
  name: 'get_table_info',
  description: '获取指定 MongoDB 集合的详细信息，包括字段定义（基于采样推断）、预估文档数量等。',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: '集合名称',
      },
      forceRefresh: {
        type: 'boolean',
        description: '是否强制刷新缓存（可选，默认 false）',
      },
    },
    required: ['tableName'],
  },
};

// ========== Redis ==========

const REDIS_EXECUTE_QUERY: ToolDescription = {
  name: 'execute_query',
  description: `执行 Redis 命令。直接输入原生 Redis 命令即可。

常用命令：
- 字符串: GET key / SET key value / MGET key1 key2 / INCR key / DECR key
- 哈希: HGET key field / HSET key field value / HGETALL key / HMGET key f1 f2 / HDEL key field
- 列表: LRANGE key start stop / LPUSH key value / RPUSH key value / LLEN key / LPOP key / RPOP key
- 集合: SMEMBERS key / SADD key member / SREM key member / SCARD key / SISMEMBER key member
- 有序集合: ZRANGE key start stop / ZADD key score member / ZRANK key member / ZCARD key / ZSCORE key member
- 通用: KEYS pattern / EXISTS key / TYPE key / TTL key / EXPIRE key seconds / DEL key / SCAN cursor [MATCH pattern] [COUNT count]
- 服务器: INFO [section] / DBSIZE / PING

示例：
- GET user:1001:name
- HGETALL user:1001
- KEYS user:*
- ZRANGE leaderboard 0 9 WITHSCORES`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Redis 命令，如 "GET mykey"、"HGETALL myhash"、"KEYS pattern*"',
      },
    },
    required: ['query'],
  },
};

const REDIS_GET_SCHEMA: ToolDescription = {
  name: 'get_schema',
  description: '获取 Redis 数据库概览信息，包括各数据类型的键分布统计。Redis 没有固定的表结构，返回的是基于键采样的类型分布信息。',
  inputSchema: {
    type: 'object',
    properties: {
      forceRefresh: {
        type: 'boolean',
        description: '是否强制刷新缓存（可选，默认 false）',
      },
    },
  },
};

const REDIS_GET_TABLE_INFO: ToolDescription = {
  name: 'get_table_info',
  description: '获取 Redis 中指定键类型分组的详细信息。tableName 为键类型分组名（如 keys_string、keys_hash 等）。',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: '键类型分组名，如 keys_string, keys_hash, keys_list, keys_set, keys_zset',
      },
      forceRefresh: {
        type: 'boolean',
        description: '是否强制刷新缓存（可选，默认 false）',
      },
    },
    required: ['tableName'],
  },
};

// ========== SQL 类数据库（默认） ==========

function getSqlExecuteQuery(dbType?: string): ToolDescription {
  let dialectHint = '';

  switch (dbType) {
    case 'oracle':
    case 'dm':
      dialectHint = ' Oracle/达梦方言：使用 ROWNUM 或 FETCH FIRST N ROWS ONLY 限制行数，双引号引用标识符，序列用 seq.NEXTVAL，字符串连接用 ||，伪表为 DUAL。';
      break;
    case 'sqlserver':
      dialectHint = ' SQL Server 方言：使用 TOP N 限制行数，方括号 [] 引用标识符，字符串连接用 +，分页用 OFFSET...FETCH NEXT。';
      break;
    case 'clickhouse':
      dialectHint = ' ClickHouse 方言：列式 OLAP 数据库，支持标准 SQL，使用 LIMIT N 限制行数。特有功能：数组函数、近似聚合（uniq/uniqExact）、物化视图、采样查询（SAMPLE）。不支持 UPDATE/DELETE（使用 ALTER TABLE...UPDATE/DELETE 替代）。';
      break;
    case 'sqlite':
      dialectHint = ' SQLite 方言：使用 LIMIT N 限制行数，支持 AUTOINCREMENT，类型亲和性系统，无原生 DATE 类型（存为 TEXT/INTEGER/REAL）。';
      break;
    case 'postgres':
    case 'kingbase':
    case 'gaussdb':
    case 'vastbase':
    case 'highgo':
    case 'polardb':
      dialectHint = ' PostgreSQL 方言：使用 LIMIT N 限制行数，支持 ILIKE（不区分大小写匹配）、ARRAY 类型、JSON/JSONB 操作符（->、->>、@>）、CTE（WITH 子句）、窗口函数。';
      break;
    case 'mysql':
    case 'tidb':
    case 'oceanbase':
    case 'goldendb':
      dialectHint = ' MySQL 方言：使用 LIMIT N 限制行数，反引号 ` 引用标识符，支持 IFNULL、GROUP_CONCAT、ON DUPLICATE KEY UPDATE。';
      break;
  }

  return {
    name: 'execute_query',
    description: `执行 SQL 查询或数据库命令。支持 SELECT、JOIN、子查询、聚合（GROUP BY / HAVING）、窗口函数等查询操作。如果启用了写入模式，也可以执行 INSERT、UPDATE、DELETE 等操作。${dialectHint}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要执行的 SQL 语句',
        },
        params: {
          type: 'array',
          description: '查询参数（可选，用于参数化查询防止 SQL 注入）',
          items: {
            type: 'string',
          },
        },
      },
      required: ['query'],
    },
  };
}

const DEFAULT_GET_SCHEMA: ToolDescription = {
  name: 'get_schema',
  description: '获取数据库结构信息，包括所有 Schema 中用户可访问的表名、列名、数据类型、主键、索引等元数据。在执行查询前调用此工具可以帮助理解数据库结构。结果会被缓存以提高性能。',
  inputSchema: {
    type: 'object',
    properties: {
      forceRefresh: {
        type: 'boolean',
        description: '是否强制刷新缓存（可选，默认 false）。设为 true 可获取最新的数据库结构。',
      },
    },
  },
};

const DEFAULT_GET_TABLE_INFO: ToolDescription = {
  name: 'get_table_info',
  description: '获取指定表的详细信息，包括列定义、索引、预估行数等。用于深入了解某个表的结构。',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: '表名。支持 schema.table_name 格式指定 Schema（如 analytics.users）。不指定 Schema 时查询默认 Schema。',
      },
      forceRefresh: {
        type: 'boolean',
        description: '是否强制刷新缓存（可选，默认 false）',
      },
    },
    required: ['tableName'],
  },
};

// ========== 对外接口 ==========

/**
 * 根据数据库类型获取 execute_query 工具描述
 * @param dbType 数据库类型
 * @param multiDbCtx 多库模式上下文（可选），提供时会在描述中标注当前活跃数据库
 */
export function getExecuteQueryTool(dbType: DbType, multiDbCtx?: MultiDbContext): ToolDescription {
  let base: ToolDescription;

  switch (dbType) {
    case 'mongodb':
      base = MONGODB_EXECUTE_QUERY;
      break;
    case 'redis':
      base = REDIS_EXECUTE_QUERY;
      break;
    default:
      base = getSqlExecuteQuery(dbType);
      break;
  }

  if (multiDbCtx) {
    return {
      ...base,
      description: `【当前活跃数据库: ${multiDbCtx.currentDbName} (${multiDbCtx.currentDbType})】查询将发送到此数据库。如需操作其他数据库，请先调用 switch_database({"name": "目标数据库名"}) 切换。\n\n${base.description}`,
    };
  }

  return base;
}

/**
 * 根据数据库类型获取 get_schema 工具描述
 * @param dbType 数据库类型
 * @param options.tableNamesFilter 是否支持 tableNames 过滤参数（多库模式使用）
 */
export function getGetSchemaTool(dbType: DbType, options?: { tableNamesFilter?: boolean }): ToolDescription {
  let base: ToolDescription;

  switch (dbType) {
    case 'mongodb':
      base = MONGODB_GET_SCHEMA;
      break;
    case 'redis':
      base = REDIS_GET_SCHEMA;
      break;
    default:
      base = DEFAULT_GET_SCHEMA;
      break;
  }

  if (options?.tableNamesFilter) {
    return {
      ...base,
      description: base.description + ' 建议在数据库表较多（超过 50 张）时使用 tableNames 参数进行过滤，以避免超时。',
      inputSchema: {
        ...base.inputSchema,
        properties: {
          ...(base.inputSchema.properties as Record<string, unknown>),
          tableNames: {
            type: 'array',
            description: '可选，指定要获取的表名/集合名列表（只获取这些表的元数据）。强烈建议在大规模数据库中使用。',
            items: { type: 'string' },
          },
        },
      },
    };
  }

  return base;
}

const SQL_DB_TYPES = new Set([
  'mysql', 'postgres', 'oracle', 'dm', 'sqlserver', 'sqlite',
  'kingbase', 'gaussdb', 'oceanbase', 'tidb', 'clickhouse',
  'polardb', 'vastbase', 'highgo', 'goldendb',
]);

/**
 * 检测查询格式是否与当前数据库类型不匹配
 * 返回 null 表示匹配（或无法判断），返回对象表示不匹配
 *
 * queryCategory: 用于显示的查询类别名（如 "MongoDB"、"Redis"、"SQL"）
 * matchDbTypes: 用于过滤可用数据库的类型集合
 */
export function detectQueryTypeMismatch(
  query: string,
  currentDbType: string,
): { queryCategory: string; matchDbTypes: string[] } | null {
  const trimmed = query.trim();

  const looksLikeMongo = (trimmed.startsWith('{') && /"collection"\s*:/.test(trimmed))
    || /^db\.\w+\.\w+\(/.test(trimmed);

  if (looksLikeMongo && currentDbType !== 'mongodb') {
    return { queryCategory: 'MongoDB', matchDbTypes: ['mongodb'] };
  }

  const looksLikeRedis = /^(GET|SET|DEL|HGET|HSET|HGETALL|KEYS|LPUSH|RPUSH|LRANGE|SMEMBERS|SADD|ZADD|ZRANGE|SCAN|INFO|PING|DBSIZE|TTL|EXISTS|TYPE|EXPIRE|MGET|INCR|DECR)\s/i.test(trimmed);

  if (looksLikeRedis && currentDbType !== 'redis') {
    return { queryCategory: 'Redis', matchDbTypes: ['redis'] };
  }

  const looksLikeSql = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|SHOW|DESCRIBE|EXPLAIN)\s/i.test(trimmed);
  if (looksLikeSql && !SQL_DB_TYPES.has(currentDbType)) {
    return { queryCategory: 'SQL', matchDbTypes: [...SQL_DB_TYPES] };
  }

  return null;
}

/**
 * 根据数据库类型获取 get_table_info 工具描述
 */
export function getGetTableInfoTool(dbType: DbType): ToolDescription {
  switch (dbType) {
    case 'mongodb':
      return MONGODB_GET_TABLE_INFO;
    case 'redis':
      return REDIS_GET_TABLE_INFO;
    default:
      return DEFAULT_GET_TABLE_INFO;
  }
}
