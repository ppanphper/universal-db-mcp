/**
 * PostgreSQL 数据库适配器
 * 使用 pg 驱动实现 DbAdapter 接口
 *
 * 性能优化：使用批量查询获取 Schema 信息，避免 N+1 查询问题
 */

import pg from 'pg';
import type {
  DbAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
} from '../types/adapter.js';
import { isWriteOperation as checkWriteOperation } from '../utils/safety.js';

const { Client } = pg;

export class PostgreSQLAdapter implements DbAdapter {
  private client: pg.Client | null = null;
  private config: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database?: string;
  };

  constructor(config: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database?: string;
  }) {
    this.config = config;
  }

  /**
   * 连接到 PostgreSQL 数据库
   */
  async connect(): Promise<void> {
    try {
      this.client = new Client({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
      });

      await this.client.connect();

      // 测试连接
      await this.client.query('SELECT 1');
    } catch (error) {
      throw new Error(
        `PostgreSQL 连接失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  /**
   * 执行 SQL 查询
   */
  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();

    try {
      const result = await this.client.query(query, params);
      const executionTime = Date.now() - startTime;

      return {
        rows: result.rows,
        affectedRows: result.rowCount || 0,
        executionTime,
        metadata: {
          command: result.command,
          fields: result.fields?.map(f => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          })),
        },
      };
    } catch (error) {
      throw new Error(
        `查询执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取数据库结构信息（批量查询优化版本）
   *
   * 优化前：每个表需要 4 次查询（列、主键、索引、行数）
   * 优化后：只需要 4 次查询获取所有表的信息
   */
  async getSchema(): Promise<SchemaInfo> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    try {
      // 获取数据库版本
      const versionResult = await this.client.query('SELECT version()');
      const version = versionResult.rows[0]?.version || 'unknown';

      // 获取当前数据库名
      const dbResult = await this.client.query('SELECT current_database()');
      const databaseName = dbResult.rows[0]?.current_database || this.config.database || 'unknown';

      // 批量获取所有表的列信息
      const allColumnsResult = await this.client.query(`
        SELECT
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.ordinal_position
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.ordinal_position
      `);

      // 批量获取所有表的主键信息
      const allPrimaryKeysResult = await this.client.query(`
        SELECT
          t.relname as table_name,
          a.attname as column_name
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE i.indisprimary
          AND n.nspname = 'public'
        ORDER BY t.relname, a.attnum
      `);

<<<<<<< HEAD
      // 并行获取所有表的详细信息，提升性能
      const tableNames = tablesResult.rows.map(row => row.table_name);
      const tableInfoResults = await Promise.all(
        tableNames.map(tableName => this.getTableInfo(tableName))
      );
      tableInfos.push(...tableInfoResults);
=======
      // 批量获取所有表的索引信息（排除主键）
      const allIndexesResult = await this.client.query(`
        SELECT
          t.relname as table_name,
          i.relname as index_name,
          a.attname as column_name,
          ix.indisunique as is_unique
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE t.relkind = 'r'
          AND n.nspname = 'public'
          AND NOT ix.indisprimary
        ORDER BY t.relname, i.relname, a.attnum
      `);
>>>>>>> feat/optimize-mysql-schema

      // 批量获取所有表的行数估算
      const allStatsResult = await this.client.query(`
        SELECT
          c.relname as table_name,
          c.reltuples::bigint as estimated_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
      `);

      // 在内存中组装数据
      return this.assembleSchema(
        databaseName,
        version,
        allColumnsResult.rows,
        allPrimaryKeysResult.rows,
        allIndexesResult.rows,
        allStatsResult.rows
      );
    } catch (error) {
      throw new Error(
        `获取数据库结构失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 组装 Schema 信息
   */
  private assembleSchema(
    databaseName: string,
    version: string,
    allColumns: any[],
    allPrimaryKeys: any[],
    allIndexes: any[],
    allStats: any[]
  ): SchemaInfo {
    // 按表名分组列信息
    const columnsByTable = new Map<string, ColumnInfo[]>();

    for (const col of allColumns) {
      const tableName = col.table_name;

      if (!columnsByTable.has(tableName)) {
        columnsByTable.set(tableName, []);
      }

      let dataType = col.data_type;
      // 添加长度/精度信息
      if (col.character_maximum_length) {
        dataType += `(${col.character_maximum_length})`;
      } else if (col.numeric_precision) {
        dataType += `(${col.numeric_precision}${col.numeric_scale ? `,${col.numeric_scale}` : ''})`;
      }

      columnsByTable.get(tableName)!.push({
        name: col.column_name,
        type: dataType,
        nullable: col.is_nullable === 'YES',
        defaultValue: col.column_default || undefined,
      });
    }

    // 按表名分组主键信息
    const primaryKeysByTable = new Map<string, string[]>();
    for (const pk of allPrimaryKeys) {
      const tableName = pk.table_name;
      if (!primaryKeysByTable.has(tableName)) {
        primaryKeysByTable.set(tableName, []);
      }
      primaryKeysByTable.get(tableName)!.push(pk.column_name);
    }

    // 按表名分组索引信息
    const indexesByTable = new Map<string, Map<string, { columns: string[]; unique: boolean }>>();

    for (const idx of allIndexes) {
      const tableName = idx.table_name;
      const indexName = idx.index_name;

      if (!indexesByTable.has(tableName)) {
        indexesByTable.set(tableName, new Map());
      }

      const tableIndexes = indexesByTable.get(tableName)!;

      if (!tableIndexes.has(indexName)) {
        tableIndexes.set(indexName, {
          columns: [],
          unique: idx.is_unique,
        });
      }

      tableIndexes.get(indexName)!.columns.push(idx.column_name);
    }

    // 按表名分组行数统计
    const rowsByTable = new Map<string, number>();
    for (const stat of allStats) {
      rowsByTable.set(stat.table_name, Number(stat.estimated_rows) || 0);
    }

    // 组装表信息
    const tableInfos: TableInfo[] = [];

    for (const [tableName, columns] of columnsByTable.entries()) {
      const tableIndexes = indexesByTable.get(tableName);
      const indexInfos: IndexInfo[] = [];

      if (tableIndexes) {
        for (const [indexName, indexData] of tableIndexes.entries()) {
          indexInfos.push({
            name: indexName,
            columns: indexData.columns,
            unique: indexData.unique,
          });
        }
      }

      tableInfos.push({
        name: tableName,
        columns,
        primaryKeys: primaryKeysByTable.get(tableName) || [],
        indexes: indexInfos,
        estimatedRows: rowsByTable.get(tableName) || 0,
      });
    }

    // 按表名排序
    tableInfos.sort((a, b) => a.name.localeCompare(b.name));

    return {
      databaseType: 'postgres',
      databaseName,
      tables: tableInfos,
      version,
    };
  }

  /**
   * 检查是否为写操作
   */
  isWriteOperation(query: string): boolean {
    return checkWriteOperation(query);
  }

  // ========== 事务支持 ==========

  /**
   * 开始事务
   */
  async beginTransaction(): Promise<void> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }
    await this.client.query('BEGIN');
    console.error('🔒 PostgreSQL 事务已开始');
  }

  /**
   * 提交事务
   */
  async commit(): Promise<void> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }
    await this.client.query('COMMIT');
    console.error('✅ PostgreSQL 事务已提交');
  }

  /**
   * 回滚事务
   */
  async rollback(): Promise<void> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }
    await this.client.query('ROLLBACK');
    console.error('↩️ PostgreSQL 事务已回滚');
  }

  // ========== 查询增强 ==========

  /**
   * 执行查询返回单条记录
   */
  async querySingle(query: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
    const result = await this.executeQuery(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * 获取标量值（第一行第一列）
   */
  async getScalar(query: string, params?: unknown[]): Promise<unknown> {
    const result = await this.executeQuery(query, params);
    if (result.rows.length === 0) {
      return null;
    }
    const firstRow = result.rows[0];
    const keys = Object.keys(firstRow);
    return keys.length > 0 ? firstRow[keys[0]] : null;
  }

  /**
   * 批量执行多条 SQL
   */
  async batchExecute(queries: string[]): Promise<{
    results: QueryResult[];
    totalAffectedRows: number;
    errors: Array<{ index: number; error: string; query: string }>;
    totalExecutionTime: number;
  }> {
    const startTime = Date.now();
    const results: QueryResult[] = [];
    const errors: Array<{ index: number; error: string; query: string }> = [];
    let totalAffectedRows = 0;

    for (let i = 0; i < queries.length; i++) {
      try {
        const result = await this.executeQuery(queries[i]);
        results.push(result);
        totalAffectedRows += result.affectedRows ?? 0;
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
          query: queries[i],
        });
      }
    }

    return {
      results,
      totalAffectedRows,
      errors,
      totalExecutionTime: Date.now() - startTime,
    };
  }
}
