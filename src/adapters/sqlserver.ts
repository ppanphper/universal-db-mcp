/**
 * SQL Server 数据库适配器
 * 使用 mssql 驱动实现 DbAdapter 接口
 * 支持 SQL Server 2012+ 和 Azure SQL Database
 */

import sql from 'mssql';
import type {
  DbAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
} from '../types/adapter.js';
import { isWriteOperation as checkWriteOperation } from '../utils/safety.js';

export class SQLServerAdapter implements DbAdapter {
  private pool: sql.ConnectionPool | null = null;
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
   * 连接到 SQL Server 数据库
   */
  async connect(): Promise<void> {
    try {
      // 检测是否为 Azure SQL Database
      const isAzure = this.config.host.includes('.database.windows.net');

      const poolConfig: sql.config = {
        server: this.config.host,
        port: this.config.port || 1433,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        options: {
          encrypt: isAzure,  // Azure SQL 需要加密
          trustServerCertificate: !isAzure,  // 仅本地开发信任证书
          enableArithAbort: true,
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000,
        },
      };

      this.pool = await sql.connect(poolConfig);

      // 测试连接
      await this.pool.request().query('SELECT 1');
    } catch (error: any) {
      // 翻译常见错误
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (error.number === 18456) {
        throw new Error('SQL Server 连接失败: 身份验证失败，请检查用户名和密码');
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        throw new Error('SQL Server 连接失败: 无法连接到数据库服务器，请检查主机地址和端口');
      } else if (errorMessage.includes('database') && errorMessage.includes('does not exist')) {
        throw new Error('SQL Server 连接失败: 数据库不存在');
      }

      throw new Error(`SQL Server 连接失败: ${errorMessage}`);
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.close();  // 正确关闭连接池，排空所有连接
      } catch (error) {
        console.error('关闭连接池时出错:', error);
      }
      this.pool = null;
    }
  }

  /**
   * 执行 SQL 查询
   */
  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();

    try {
      const request = this.pool.request();

      // 处理参数 - SQL Server 使用 @param0, @param1 语法
      if (params && params.length > 0) {
        params.forEach((param, index) => {
          request.input(`param${index}`, param);
        });

        // 替换 ? 占位符为 @param0, @param1, ...
        let paramIndex = 0;
        query = query.replace(/\?/g, () => `@param${paramIndex++}`);
      }

      const result = await request.query(query);
      const executionTime = Date.now() - startTime;

      // 处理 SELECT 查询
      if (result.recordset && result.recordset.length > 0) {
        return {
          rows: result.recordset,
          executionTime,
          metadata: {
            columnCount: Object.keys(result.recordset[0]).length,
          },
        };
      }

      // 处理 DML 操作 (INSERT/UPDATE/DELETE)
      if (result.rowsAffected && result.rowsAffected.length > 0) {
        const affectedRows = result.rowsAffected.reduce((sum, count) => sum + count, 0);
        return {
          rows: [],
          affectedRows,
          executionTime,
        };
      }

      // 其他操作或空结果
      return {
        rows: [],
        executionTime,
      };
    } catch (error: any) {
      // 翻译常见 SQL Server 错误
      if (error.number === 208) {
        throw new Error('查询执行失败: 表或视图不存在');
      } else if (error.number === 2627 || error.number === 2601) {
        throw new Error('查询执行失败: 违反唯一约束');
      } else if (error.number === 547) {
        throw new Error('查询执行失败: 违反外键约束');
      } else if (error.number === 18456) {
        throw new Error('查询执行失败: 身份验证失败');
      }

      throw new Error(`查询执行失败: ${error.message || String(error)}`);
    }
  }

  /**
   * 获取数据库结构信息
   */
  async getSchema(): Promise<SchemaInfo> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    try {
      // 获取 SQL Server 版本
      const versionResult = await this.pool.request().query('SELECT @@VERSION AS version');
      const version = versionResult.recordset?.[0]?.version || 'unknown';

      // 获取数据库名
      const dbNameResult = await this.pool.request().query('SELECT DB_NAME() AS database_name');
      const databaseName = dbNameResult.recordset?.[0]?.database_name || 'unknown';

      // 获取所有表（过滤系统表）
      const tablesResult = await this.pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
          AND TABLE_SCHEMA = SCHEMA_NAME()
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);

      const tableInfos: TableInfo[] = [];

      if (tablesResult.recordset) {
        // 并行获取所有表的详细信息，提升性能
        const tableNames = tablesResult.recordset.map(row => row.TABLE_NAME);
        const tableInfoResults = await Promise.all(
          tableNames.map(tableName => this.getTableInfo(tableName))
        );
        tableInfos.push(...tableInfoResults);
      }

      return {
        databaseType: 'sqlserver',
        databaseName,
        tables: tableInfos,
        version,
      };
    } catch (error) {
      throw new Error(
        `获取数据库结构失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取单个表的详细信息
   */
  private async getTableInfo(tableName: string): Promise<TableInfo> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    // 获取列信息
    const columnsResult = await this.pool.request()
      .input('param0', tableName)
      .query(`
        SELECT
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.CHARACTER_MAXIMUM_LENGTH,
          c.NUMERIC_PRECISION,
          c.NUMERIC_SCALE,
          c.IS_NULLABLE,
          c.COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = @param0
          AND c.TABLE_SCHEMA = SCHEMA_NAME()
        ORDER BY c.ORDINAL_POSITION
      `);

    const columnInfos: ColumnInfo[] = [];
    if (columnsResult.recordset) {
      for (const col of columnsResult.recordset) {
        columnInfos.push({
          name: col.COLUMN_NAME.toLowerCase(),
          type: this.formatSQLServerType(
            col.DATA_TYPE,
            col.CHARACTER_MAXIMUM_LENGTH,
            col.NUMERIC_PRECISION,
            col.NUMERIC_SCALE
          ),
          nullable: col.IS_NULLABLE === 'YES',
          defaultValue: col.COLUMN_DEFAULT?.trim() || undefined,
        });
      }
    }

    // 获取主键
    const primaryKeysResult = await this.pool.request()
      .input('param0', tableName)
      .query(`
        SELECT c.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE c
          ON tc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = @param0
          AND tc.TABLE_SCHEMA = SCHEMA_NAME()
          AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        ORDER BY c.ORDINAL_POSITION
      `);

    const primaryKeys: string[] = [];
    if (primaryKeysResult.recordset) {
      for (const row of primaryKeysResult.recordset) {
        primaryKeys.push(row.COLUMN_NAME.toLowerCase());
      }
    }

    // 获取索引信息
    const indexesResult = await this.pool.request()
      .input('param0', tableName)
      .query(`
        SELECT
          i.name AS index_name,
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS column_names,
          i.is_unique
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID(@param0)
          AND i.is_primary_key = 0
          AND i.type > 0
        GROUP BY i.name, i.is_unique
        ORDER BY i.name
      `);

    const indexInfos: IndexInfo[] = [];
    if (indexesResult.recordset) {
      for (const row of indexesResult.recordset) {
        const columns = row.column_names.split(', ').map((col: string) => col.toLowerCase());
        indexInfos.push({
          name: row.index_name,
          columns,
          unique: row.is_unique,
        });
      }
    }

    // 获取行数估算
    const rowCountResult = await this.pool.request()
      .input('param0', tableName)
      .query(`
        SELECT SUM(p.rows) AS row_count
        FROM sys.partitions p
        JOIN sys.tables t ON p.object_id = t.object_id
        WHERE t.name = @param0
          AND t.schema_id = SCHEMA_ID()
          AND p.index_id IN (0, 1)
      `);

    const estimatedRows = rowCountResult.recordset?.[0]?.row_count || 0;

    return {
      name: tableName.toLowerCase(),
      columns: columnInfos,
      primaryKeys,
      indexes: indexInfos,
      estimatedRows,
    };
  }

  /**
   * 格式化 SQL Server 数据类型
   */
  private formatSQLServerType(
    dataType: string,
    length?: number,
    precision?: number,
    scale?: number
  ): string {
    switch (dataType.toUpperCase()) {
      case 'NVARCHAR':
      case 'VARCHAR':
      case 'NCHAR':
      case 'CHAR':
        if (length === -1) return `${dataType}(MAX)`;
        if (length) return `${dataType}(${length})`;
        return dataType;

      case 'DECIMAL':
      case 'NUMERIC':
        if (precision && scale !== undefined && scale !== null) {
          return `${dataType}(${precision},${scale})`;
        }
        if (precision) return `${dataType}(${precision})`;
        return dataType;

      case 'DATETIME2':
      case 'DATETIMEOFFSET':
      case 'TIME':
        if (scale !== undefined && scale !== null) {
          return `${dataType}(${scale})`;
        }
        return dataType;

      case 'VARBINARY':
      case 'BINARY':
        if (length === -1) return `${dataType}(MAX)`;
        if (length) return `${dataType}(${length})`;
        return dataType;

      default:
        return dataType;
    }
  }

  /**
   * 检查是否为写操作
   */
  isWriteOperation(query: string): boolean {
    // 首先使用通用的写操作检测
    if (checkWriteOperation(query)) {
      return true;
    }

    // SQL Server 特定的写操作检测
    const trimmedQuery = query.trim().toUpperCase();

    // MERGE 语句（SQL Server 的 upsert 操作）
    if (trimmedQuery.startsWith('MERGE')) {
      return true;
    }

    // 存储过程执行
    if (trimmedQuery.startsWith('EXEC') || trimmedQuery.startsWith('EXECUTE')) {
      return true;
    }

    // 事务控制语句
    if (trimmedQuery.startsWith('BEGIN TRANSACTION') ||
      trimmedQuery.startsWith('BEGIN TRAN') ||
      trimmedQuery.startsWith('COMMIT') ||
      trimmedQuery.startsWith('ROLLBACK')) {
      return true;
    }

    return false;
  }
}
