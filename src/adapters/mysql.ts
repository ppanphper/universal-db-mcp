/**
 * MySQL 数据库适配器
 * 使用 mysql2 驱动实现 DbAdapter 接口
 */

import mysql from 'mysql2/promise';
import type {
  DbAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from '../types/adapter.js';
import { isWriteOperation as checkWriteOperation } from '../utils/safety.js';

export class MySQLAdapter implements DbAdapter {
  private connection: mysql.Connection | null = null;
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
   * 连接到 MySQL 数据库
   */
  async connect(): Promise<void> {
    try {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        // 启用多语句查询支持
        multipleStatements: false,
      });

      // 测试连接
      await this.connection.ping();
    } catch (error) {
      throw new Error(
        `MySQL 连接失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  /**
   * 执行 SQL 查询
   */
  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.connection) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();

    try {
      const [rows, fields] = await this.connection.execute(query, params);
      const executionTime = Date.now() - startTime;

      // 处理不同类型的查询结果
      if (Array.isArray(rows)) {
        return {
          rows: rows as Record<string, unknown>[],
          executionTime,
          metadata: {
            fieldCount: fields?.length || 0,
          },
        };
      } else {
        // INSERT/UPDATE/DELETE 等操作
        const result = rows as mysql.ResultSetHeader;
        return {
          rows: [],
          affectedRows: result.affectedRows,
          executionTime,
          metadata: {
            insertId: result.insertId,
            changedRows: result.changedRows,
          },
        };
      }
    } catch (error) {
      throw new Error(
        `查询执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
 * 获取数据库结构信息
 * 优化说明：使用 information_schema 进行批量查询，避免 N+1 查询导致的性能问题
 */
  async getSchema(tableNames?: string[]): Promise<SchemaInfo> {
    if (!this.connection) {
      throw new Error('数据库未连接');
    }

    try {
      // 1. 获取基础信息
      const [versionRows] = await this.connection.query('SELECT VERSION() as version');
      const version = (versionRows as any[])[0]?.version || 'unknown';

      const [dbRows] = await this.connection.query('SELECT DATABASE() as db');
      const databaseName = (dbRows as any[])[0]?.db || this.config.database || 'unknown';

      // 2. 批量获取表信息
      let tableQuery = `
        SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
      `;
      const tableParams: any[] = [databaseName];

      if (tableNames && tableNames.length > 0) {
        tableQuery += ` AND TABLE_NAME IN (?)`;
        tableParams.push(tableNames);
      }

      const [tableRows] = await this.connection.query(
        tableQuery,
        tableParams
      ) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

      // 初始化表映射
      const tableMap = new Map<string, TableInfo>();
      for (const row of tableRows) {
        tableMap.set(row.TABLE_NAME, {
          name: row.TABLE_NAME,
          columns: [],
          primaryKeys: [],
          indexes: [],
          estimatedRows: row.TABLE_ROWS || 0,
        });
      }

      // 如果指定了表名但没有找到任何表，直接返回
      if (tableMap.size === 0) {
        return {
          databaseType: 'mysql',
          databaseName,
          tables: [],
          version,
        };
      }

      // 3. 批量获取列信息
      // 按表名和位置排序，确保列顺序正确
      let columnQuery = `
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT, COLUMN_KEY, EXTRA 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
      `;
      const columnParams: any[] = [databaseName];

      if (tableNames && tableNames.length > 0) {
        columnQuery += ` AND TABLE_NAME IN (?)`;
        columnParams.push(tableNames);
      }

      columnQuery += ` ORDER BY TABLE_NAME, ORDINAL_POSITION`;

      const [columnRows] = await this.connection.query(
        columnQuery,
        columnParams
      ) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

      for (const col of columnRows) {
        const table = tableMap.get(col.TABLE_NAME);
        if (table) {
          // 添加列信息
          table.columns.push({
            name: col.COLUMN_NAME,
            type: col.COLUMN_TYPE,
            nullable: col.IS_NULLABLE === 'YES',
            defaultValue: col.COLUMN_DEFAULT,
            comment: col.COLUMN_COMMENT || undefined,
          });

          // 如果是主键，添加到主键列表
          if (col.COLUMN_KEY === 'PRI') {
            table.primaryKeys.push(col.COLUMN_NAME);
          }
        }
      }

      // 4. 批量获取索引信息
      let indexQuery = `
        SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX 
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? 
      `;
      const indexParams: any[] = [databaseName];

      if (tableNames && tableNames.length > 0) {
        indexQuery += ` AND TABLE_NAME IN (?)`;
        indexParams.push(tableNames);
      }

      indexQuery += ` ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;

      const [indexRows] = await this.connection.query(
        indexQuery,
        indexParams
      ) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

      // 临时存储索引构建过程： TableName -> IndexName -> IndexInfo
      const tempIndexMap = new Map<string, Map<string, { columns: string[]; unique: boolean }>>();

      for (const idx of indexRows) {
        // 跳过主键索引（通常在 Columns 中通过 PRI 标识处理，或者如果需要也可在此处理，但需注意 adapter 接口定义）
        // 这里 Adapter 接口有单独的 primaryKeys 字段，indexes 字段通常包含非主键索引
        if (idx.INDEX_NAME === 'PRIMARY') continue;

        const tableName = idx.TABLE_NAME;
        const indexName = idx.INDEX_NAME;

        if (!tableMap.has(tableName)) continue;

        if (!tempIndexMap.has(tableName)) {
          tempIndexMap.set(tableName, new Map());
        }

        const tableIndexes = tempIndexMap.get(tableName)!;

        if (!tableIndexes.has(indexName)) {
          tableIndexes.set(indexName, {
            columns: [],
            unique: idx.NON_UNIQUE === 0,
          });
        }

        tableIndexes.get(indexName)!.columns.push(idx.COLUMN_NAME);
      }

      // 将构建好的索引填回 TableInfo
      for (const [tableName, indexes] of tempIndexMap.entries()) {
        const table = tableMap.get(tableName);
        if (table) {
          if (!table.indexes) {
            table.indexes = [];
          }
          for (const [name, info] of indexes.entries()) {
            table.indexes.push({
              name,
              columns: info.columns,
              unique: info.unique,
            });
          }
        }
      }

      return {
        databaseType: 'mysql',
        databaseName,
        tables: Array.from(tableMap.values()),
        version,
      };

    } catch (error) {
      throw new Error(
        `获取数据库结构失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
    if (!this.connection) {
      throw new Error('数据库未连接');
    }
    await this.connection.beginTransaction();
    console.error('🔒 MySQL 事务已开始');
  }

  /**
   * 提交事务
   */
  async commit(): Promise<void> {
    if (!this.connection) {
      throw new Error('数据库未连接');
    }
    await this.connection.commit();
    console.error('✅ MySQL 事务已提交');
  }

  /**
   * 回滚事务
   */
  async rollback(): Promise<void> {
    if (!this.connection) {
      throw new Error('数据库未连接');
    }
    await this.connection.rollback();
    console.error('↩️ MySQL 事务已回滚');
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
