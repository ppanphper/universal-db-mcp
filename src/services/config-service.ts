/**
 * 配置服务 - 管理多数据库连接配置
 * 借鉴 DatabaseMcpServer 的设计，支持 JSON 配置文件和环境变量
 */

import { readFileSync, existsSync } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import type { DbConfig } from '../types/adapter.js';
import type { SSHConfig } from '../types/ssh.js';

/**
 * 单个数据库连接配置
 */
export interface DatabaseConnection {
  /** 连接名称（唯一标识） */
  name: string;
  /** 数据库类型 */
  type: DbConfig['type'];
  /** 主机地址 */
  host?: string;
  /** 端口 */
  port?: number;
  /** 用户名 */
  user?: string;
  /** 密码（支持 ${ENV_VAR} 格式的环境变量引用） */
  password?: string;
  /** 数据库名称 */
  database?: string;
  /** SQLite 文件路径 */
  filePath?: string;
  /** MongoDB 认证数据库 */
  authSource?: string;
  /** 连接描述 */
  description?: string;
  /** 是否为默认连接 */
  isDefault?: boolean;
  /** SSH 隧道配置 */
  ssh?: SSHConfig;
}

/**
 * 完整配置文件结构
 */
export interface DatabasesConfig {
  /** 数据库连接列表 */
  databases: DatabaseConnection[];
  /** 全局设置 */
  settings?: {
    /** 是否允许写操作（默认 false） */
    allowWrite?: boolean;
    /** DDL 白名单正则表达式列表 */
    ddlWhitelist?: string[];
    /** 日志级别 */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  };
}

/**
 * 配置服务类
 * 负责加载、解析和管理多数据库配置
 */
export class ConfigService {
  private connections: Map<string, DatabaseConnection> = new Map();
  private currentDatabaseName: string | null = null;
  private settings: DatabasesConfig['settings'] = {};
  // 配置文件路径（用于调试和日志）

  /**
   * 从 JSON 或 YAML 文件加载配置
   * @param configPath 配置文件路径
   * @throws 如果文件不存在或格式错误
   */
  loadFromFile(configPath: string): void {
    if (!existsSync(configPath)) {
      throw new Error(`配置文件不存在: ${configPath}`);
    }


    try {
      const content = readFileSync(configPath, 'utf-8');
      const ext = path.extname(configPath).toLowerCase();

      let config: DatabasesConfig;

      if (ext === '.yaml' || ext === '.yml') {
        config = yaml.load(content) as DatabasesConfig;
      } else {
        config = JSON.parse(content);
      }

      if (!config.databases || !Array.isArray(config.databases) || config.databases.length === 0) {
        throw new Error('配置文件中未找到有效的数据库配置');
      }

      // 清空现有连接
      this.connections.clear();
      this.currentDatabaseName = null;

      // 加载连接配置
      for (const db of config.databases) {
        // 解析环境变量
        const resolvedDb = this.resolveEnvVariables(db);
        this.connections.set(db.name, resolvedDb);

        // 设置默认数据库
        if (db.isDefault || this.currentDatabaseName === null) {
          this.currentDatabaseName = db.name;
        }
      }

      // 加载全局设置
      this.settings = config.settings || {};

      console.error(`✅ 已加载 ${this.connections.size} 个数据库连接配置`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`配置文件 JSON 格式错误: ${configPath}`);
      }
      if (error instanceof yaml.YAMLException) {
        throw new Error(`配置文件 YAML 格式错误: ${configPath} - ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 从单数据库 CLI 参数创建配置（向后兼容）
   * @param config 单数据库配置
   */
  loadFromSingleConfig(config: DbConfig): void {
    const connection: DatabaseConnection = {
      name: 'default',
      type: config.type,
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      filePath: config.filePath,
      description: '从命令行参数创建',
      isDefault: true,
      ssh: config.ssh,
    };

    this.connections.clear();
    this.connections.set('default', connection);
    this.currentDatabaseName = 'default';
    this.settings = { allowWrite: config.allowWrite };

    console.error('✅ 已加载单数据库配置（命令行模式）');
  }

  /**
   * 获取当前活动的数据库连接配置
   * @returns 当前数据库连接配置
   * @throws 如果没有配置任何数据库
   */
  getCurrentConnection(): DatabaseConnection {
    if (this.connections.size === 0) {
      throw new Error('未配置任何数据库连接');
    }

    if (!this.currentDatabaseName || !this.connections.has(this.currentDatabaseName)) {
      this.currentDatabaseName = this.connections.keys().next().value!;
    }

    return this.connections.get(this.currentDatabaseName)!;
  }

  /**
   * 根据名称获取数据库连接配置
   * @param name 连接名称
   * @returns 数据库连接配置
   * @throws 如果连接不存在
   */
  getConnection(name: string): DatabaseConnection {
    const connection = this.connections.get(name);
    if (!connection) {
      const available = Array.from(this.connections.keys()).join(', ');
      throw new Error(`数据库连接 '${name}' 不存在。可用的连接: ${available}`);
    }
    return connection;
  }

  /**
   * 切换当前活动的数据库
   * @param name 目标数据库连接名称
   * @returns 切换是否成功
   */
  switchDatabase(name: string): boolean {
    if (!this.connections.has(name)) {
      console.error(`⚠️ 数据库连接 '${name}' 不存在`);
      return false;
    }

    const previousName = this.currentDatabaseName;
    this.currentDatabaseName = name;
    console.error(`🔄 已切换数据库: ${previousName} → ${name}`);
    return true;
  }

  /**
   * 获取当前数据库名称
   */
  getCurrentDatabaseName(): string | null {
    return this.currentDatabaseName;
  }

  /**
   * 列出所有可用的数据库连接
   * @returns 数据库连接列表（隐藏密码）
   */
  listDatabases(): Array<{
    name: string;
    type: string;
    description?: string;
    isDefault: boolean;
    isCurrent: boolean;
  }> {
    return Array.from(this.connections.values()).map(conn => ({
      name: conn.name,
      type: conn.type,
      description: conn.description,
      isDefault: conn.isDefault ?? false,
      isCurrent: conn.name === this.currentDatabaseName,
    }));
  }

  /**
   * 获取全局设置
   */
  getSettings(): DatabasesConfig['settings'] {
    return this.settings ?? {};
  }

  /**
   * 是否允许写操作
   */
  isAllowWrite(): boolean {
    return this.settings?.allowWrite ?? false;
  }

  /**
   * 获取 DDL 白名单
   */
  getDdlWhitelist(): string[] {
    return this.settings?.ddlWhitelist ?? [];
  }

  /**
   * 将数据库连接转换为 DbConfig 格式
   * @param connection 数据库连接配置
   * @returns DbConfig 格式的配置
   */
  toDbConfig(connection?: DatabaseConnection): DbConfig {
    const conn = connection ?? this.getCurrentConnection();
    return {
      type: conn.type,
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database: conn.database,
      filePath: conn.filePath,
      allowWrite: this.isAllowWrite(),
    };
  }

  /**
   * 解析配置中的环境变量引用
   * 支持 ${VAR_NAME} 格式
   */
  private resolveEnvVariables(connection: DatabaseConnection): DatabaseConnection {
    const resolved = { ...connection };

    // 解析密码中的环境变量
    if (resolved.password) {
      resolved.password = this.resolveEnvString(resolved.password);
    }

    // 解析用户名中的环境变量
    if (resolved.user) {
      resolved.user = this.resolveEnvString(resolved.user);
    }

    // 解析主机地址中的环境变量
    if (resolved.host) {
      resolved.host = this.resolveEnvString(resolved.host);
    }

    // 解析数据库名称中的环境变量
    if (resolved.database) {
      resolved.database = this.resolveEnvString(resolved.database);
    }

    // 解析 SSH 配置中的环境变量
    if (resolved.ssh) {
      const ssh = { ...resolved.ssh };
      if (ssh.host) ssh.host = this.resolveEnvString(ssh.host);
      if (ssh.username) ssh.username = this.resolveEnvString(ssh.username);
      if (ssh.password) ssh.password = this.resolveEnvString(ssh.password);
      if (ssh.privateKey) ssh.privateKey = this.resolveEnvString(ssh.privateKey);
      if (ssh.passphrase) ssh.passphrase = this.resolveEnvString(ssh.passphrase);
      resolved.ssh = ssh;
    }

    return resolved;
  }

  /**
   * 解析字符串中的环境变量引用
   * @param value 可能包含 ${VAR_NAME} 的字符串
   * @returns 替换后的字符串
   */
  private resolveEnvString(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const envValue = process.env[envVar];
      if (envValue === undefined) {
        console.error(`⚠️ 环境变量 ${envVar} 未设置`);
        return match; // 保留原始引用
      }
      return envValue;
    });
  }
}

// 导出单例
export const configService = new ConfigService();
