/**
 * Oracle 数据库适配器
 * 使用 oracledb 驱动实现 DbAdapter 接口
 */

import oracledb from 'oracledb';
import type {
  DbAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
} from '../types/adapter.js';
import { isWriteOperation as checkWriteOperation } from '../utils/safety.js';

export class OracleAdapter implements DbAdapter {
  private connection: oracledb.Connection | null = null;
  private config: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database?: string;
    serviceName?: string;
    sid?: string;
    connectString?: string;
  };

  constructor(config: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database?: string;
    serviceName?: string;
    sid?: string;
    connectString?: string;
  }) {
    this.config = config;
    // 配置 oracledb 全局设置
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    oracledb.fetchAsString = [oracledb.CLOB];
  }

  /**
   * 构建 Oracle 连接字符串
   */
  private buildConnectionString(): string {
    // 优先级: connectString > serviceName > sid > database
    if (this.config.connectString) {
      return this.config.connectString;
    }

    const host = this.config.host;
    const port = this.config.port || 1521;
    const service = this.config.serviceName || this.config.sid || this.config.database;

    if (!service) {
      throw new Error('必须提供 database、serviceName 或 sid');
    }

    // 构建 Easy Connect 字符串
    return `${host}:${port}/${service}`;
  }

  /**
   * 连接到 Oracle 数据库
   */
  async connect(): Promise<void> {
    try {
      const connectionString = this.buildConnectionString();

      this.connection = await oracledb.getConnection({
        user: this.config.user,
        password: this.config.password,
        connectString: connectionString,
      });

      // 测试连接
      await this.connection.execute('SELECT 1 FROM DUAL');
    } catch (error: any) {
      // 翻译常见的 Oracle 错误
      if (error.errorNum === 1017) {
        throw new Error('Oracle 连接失败: 用户名或密码无效');
      } else if (error.errorNum === 12154) {
        throw new Error('Oracle 连接失败: 无法解析连接标识符，请检查 TNS 配置');
      } else if (error.errorNum === 12541) {
        throw new Error('Oracle 连接失败: TNS 无监听程序');
      }
      throw new Error(
        `Oracle 连接失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
      } catch (error) {
        // 忽略关闭连接时的错误
      }
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
      // 执行查询，autoCommit 设置为 false（只读安全）
      const result = await this.connection.execute(query, params || [], {
        autoCommit: false,
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      const executionTime = Date.now() - startTime;

      // 处理查询结果
      if (result.rows && result.rows.length > 0) {
        // SELECT 查询 - 将列名转换为小写
        const rows = result.rows.map((row: any) => {
          const lowerCaseRow: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            lowerCaseRow[key.toLowerCase()] = value;
          }
          return lowerCaseRow;
        });

        return {
          rows,
          executionTime,
          metadata: {
            columnCount: result.metaData?.length || 0,
          },
        };
      } else if (result.rowsAffected !== undefined && result.rowsAffected > 0) {
        // DML 操作 (INSERT/UPDATE/DELETE)
        return {
          rows: [],
          affectedRows: result.rowsAffected,
          executionTime,
        };
      } else {
        // 其他操作或空结果
        return {
          rows: [],
          executionTime,
        };
      }
    } catch (error: any) {
      // 翻译常见的 Oracle 错误
      if (error.errorNum === 942) {
        throw new Error('查询执行失败: 表或视图不存在');
      } else if (error.errorNum === 1) {
        throw new Error('查询执行失败: 违反唯一约束');
      }
      throw new Error(
        `查询执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取数据库结构信息
   */
  async getSchema(): Promise<SchemaInfo> {
    if (!this.connection) {
      throw new Error('数据库未连接');
    }

    try {
      // 获取 Oracle 版本
      const versionResult = await this.connection.execute(
        `SELECT banner FROM v$version WHERE banner LIKE 'Oracle%'`
      );
      const version = versionResult.rows?.[0]
        ? Object.values(versionResult.rows[0])[0] as string
        : 'unknown';

      // 获取当前用户
      const userResult = await this.connection.execute('SELECT USER FROM DUAL');
      const databaseName = userResult.rows?.[0]
        ? Object.values(userResult.rows[0])[0] as string
        : 'unknown';

      // 获取所有表
      const tablesResult = await this.connection.execute(
        `SELECT table_name, num_rows, tablespace_name
         FROM all_tables
         WHERE owner = USER
           AND temporary = 'N'
         ORDER BY table_name`
      );

      const tableInfos: TableInfo[] = [];

      if (tablesResult.rows) {
        for (const tableRow of tablesResult.rows) {
          const tableName = (tableRow as any).TABLE_NAME;
          const tableInfo = await this.getTableInfo(tableName);
          tableInfos.push(tableInfo);
        }
      }

      return {
        databaseType: 'oracle',
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
    if (!this.connection) {
      throw new Error('数据库未连接');
    }

    // 获取列信息
    const columnsResult = await this.connection.execute(
      `SELECT column_name, data_type, data_length, data_precision,
              data_scale, nullable, data_default, column_id
       FROM all_tab_columns
       WHERE owner = USER
         AND table_name = :tableName
       ORDER BY column_id`,
      [tableName]
    );

    const columnInfos: ColumnInfo[] = [];
    if (columnsResult.rows) {
      for (const col of columnsResult.rows) {
        const colData = col as any;
        columnInfos.push({
          name: colData.COLUMN_NAME.toLowerCase(),
          type: this.formatOracleType(
            colData.DATA_TYPE,
            colData.DATA_LENGTH,
            colData.DATA_PRECISION,
            colData.DATA_SCALE
          ),
          nullable: colData.NULLABLE === 'Y',
          defaultValue: colData.DATA_DEFAULT?.trim() || undefined,
        });
      }
    }

    // 获取列注释
    const commentsResult = await this.connection.execute(
      `SELECT column_name, comments
       FROM all_col_comments
       WHERE owner = USER
         AND table_name = :tableName
         AND comments IS NOT NULL`,
      [tableName]
    );

    const commentsMap = new Map<string, string>();
    if (commentsResult.rows) {
      for (const row of commentsResult.rows) {
        const rowData = row as any;
        commentsMap.set(
          rowData.COLUMN_NAME.toLowerCase(),
          rowData.COMMENTS
        );
      }
    }

    // 将注释添加到列信息中
    for (const col of columnInfos) {
      if (commentsMap.has(col.name)) {
        col.comment = commentsMap.get(col.name);
      }
    }

    // 获取主键
    const primaryKeysResult = await this.connection.execute(
      `SELECT cols.column_name, cols.position
       FROM all_constraints cons
       JOIN all_cons_columns cols
         ON cons.constraint_name = cols.constraint_name
         AND cons.owner = cols.owner
       WHERE cons.constraint_type = 'P'
         AND cons.owner = USER
         AND cons.table_name = :tableName
       ORDER BY cols.position`,
      [tableName]
    );

    const primaryKeys: string[] = [];
    if (primaryKeysResult.rows) {
      for (const row of primaryKeysResult.rows) {
        primaryKeys.push((row as any).COLUMN_NAME.toLowerCase());
      }
    }

    // 获取索引信息
    const indexesResult = await this.connection.execute(
      `SELECT i.index_name, i.uniqueness, ic.column_name, ic.column_position
       FROM all_indexes i
       JOIN all_ind_columns ic
         ON i.index_name = ic.index_name
         AND i.owner = ic.index_owner
       WHERE i.owner = USER
         AND i.table_name = :tableName
         AND i.index_type != 'LOB'
       ORDER BY i.index_name, ic.column_position`,
      [tableName]
    );

    const indexMap = new Map<string, { columns: string[]; unique: boolean }>();
    if (indexesResult.rows) {
      for (const row of indexesResult.rows) {
        const rowData = row as any;
        const indexName = rowData.INDEX_NAME;

        // 跳过主键索引
        if (indexName.includes('PK_') || indexName.includes('SYS_')) {
          continue;
        }

        if (!indexMap.has(indexName)) {
          indexMap.set(indexName, {
            columns: [],
            unique: rowData.UNIQUENESS === 'UNIQUE',
          });
        }

        indexMap.get(indexName)!.columns.push(rowData.COLUMN_NAME.toLowerCase());
      }
    }

    const indexInfos: IndexInfo[] = Array.from(indexMap.entries()).map(
      ([name, info]) => ({
        name,
        columns: info.columns,
        unique: info.unique,
      })
    );

    // 获取表行数估算
    const rowCountResult = await this.connection.execute(
      `SELECT num_rows FROM all_tables WHERE owner = USER AND table_name = :tableName`,
      [tableName]
    );

    const estimatedRows = rowCountResult.rows?.[0]
      ? ((rowCountResult.rows[0] as any).NUM_ROWS || 0)
      : 0;

    return {
      name: tableName.toLowerCase(),
      columns: columnInfos,
      primaryKeys,
      indexes: indexInfos,
      estimatedRows,
    };
  }

  /**
   * 格式化 Oracle 数据类型
   */
  private formatOracleType(
    dataType: string,
    length?: number,
    precision?: number,
    scale?: number
  ): string {
    switch (dataType) {
      case 'NUMBER':
        if (precision !== null && precision !== undefined) {
          if (scale !== null && scale !== undefined && scale > 0) {
            return `NUMBER(${precision},${scale})`;
          }
          return `NUMBER(${precision})`;
        }
        return 'NUMBER';

      case 'VARCHAR2':
      case 'CHAR':
        if (length) {
          return `${dataType}(${length})`;
        }
        return dataType;

      case 'TIMESTAMP':
        if (scale !== null && scale !== undefined) {
          return `TIMESTAMP(${scale})`;
        }
        return 'TIMESTAMP';

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

    // 添加 Oracle 特定的写操作检测
    const trimmedQuery = query.trim().toUpperCase();

    // MERGE 语句（Oracle 的 upsert 操作）
    if (trimmedQuery.startsWith('MERGE')) {
      return true;
    }

    // PL/SQL 块（可能包含写操作）
    if (trimmedQuery.startsWith('BEGIN') || trimmedQuery.startsWith('DECLARE')) {
      return true;
    }

    // CALL 存储过程（可能包含写操作）
    if (trimmedQuery.startsWith('CALL')) {
      return true;
    }

    // 事务控制语句
    if (trimmedQuery.startsWith('COMMIT') || trimmedQuery.startsWith('ROLLBACK')) {
      return true;
    }

    return false;
  }
}
