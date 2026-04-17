#!/usr/bin/env node

/**
 * MCP 数据库万能连接器 - 入口文件
 * 
 * 支持两种模式：
 * 1. 单数据库模式：通过 --type, --host 等参数连接单个数据库（向后兼容）
 * 2. 多数据库模式：通过 --config 参数加载 JSON 配置文件，支持多数据库切换
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { DatabaseMCPServer } from './server.js';
import type { DbAdapter, DbConfig } from './types/adapter.js';
import { configService, sshTunnelService } from './services/index.js';
import { MySQLAdapter } from './adapters/mysql.js';
// ... adapters ...
import { PostgreSQLAdapter } from './adapters/postgres.js';
import { RedisAdapter } from './adapters/redis.js';
import { OracleAdapter } from './adapters/oracle.js';
import { DMAdapter } from './adapters/dm.js';
import { SQLServerAdapter } from './adapters/sqlserver.js';
import { MongoDBAdapter } from './adapters/mongodb.js';
import { SQLiteAdapter } from './adapters/sqlite.js';
import { KingbaseAdapter } from './adapters/kingbase.js';
import { GaussDBAdapter } from './adapters/gaussdb.js';
import { OceanBaseAdapter } from './adapters/oceanbase.js';
import { TiDBAdapter } from './adapters/tidb.js';
import { ClickHouseAdapter } from './adapters/clickhouse.js';
import { PolarDBAdapter } from './adapters/polardb.js';

async function main() {
  const program = new Command();
  try {
    program
      .name('universal-db-mcp')
      .description('MCP 数据库万能连接器 - 让 Claude Desktop 直接连接你的数据库')
      .version('0.2.0')
      // ========== 多数据库配置模式 ==========
      .option('--config <path>', '多数据库配置文件路径（JSON 格式）')
      // ========== 单数据库模式参数 ==========
      .option('--type <type>', '数据库类型 (mysql|postgres|redis|oracle|dm|sqlserver|mssql|mongodb|sqlite|kingbase|gaussdb|opengauss|oceanbase|tidb|clickhouse|polardb)')
      .option('--host <host>', '数据库主机地址')
      .option('--port <port>', '数据库端口', parseInt)
      .option('--user <user>', '用户名')
      .option('--password <password>', '密码')
      .option('--database <database>', '数据库名称')
      .option('--file <file>', 'SQLite 数据库文件路径')
      .option('--auth-source <authSource>', 'MongoDB 认证数据库（默认为 admin）') // ========== SSH 隧道参数 ========== 
      .option('--ssh-host <host>', 'SSH 跳板机主机地址')
      .option('--ssh-port <port>', 'SSH 跳板机端口', parseInt)
      .option('--ssh-user <user>', 'SSH 用户名')
      .option('--ssh-password <password>', 'SSH 密码')
      .option('--ssh-key <path>', 'SSH 私钥文件路径')
      .option('--ssh-passphrase <passphrase>', 'SSH 私钥密码')
      .option('--danger-allow-write', '启用写入模式（危险！默认为只读模式）', false)
      .action(async (options) => {
        try {
          // ========== 多数据库配置模式 ========== 
          let configPath = options.config || process.env.DB_CONFIG_PATH;

          // 自动检测配置文件 (优先级: json > yaml > yml)
          if (!configPath && !options.type) {
            const potentialFiles = ['databases.json', 'databases.yaml', 'databases.yml'];
            for (const file of potentialFiles) {
              if (existsSync(file)) {
                configPath = file;
                console.error(`ℹ️ 自动检测到配置文件: ${file}`);
                break;
              }
            }
          }

          if (configPath) {
            await startMultiDatabaseMode(configPath, options.dangerAllowWrite);
            return;
          }

          // ========== 单数据库模式 ========== 
          if (!options.type) {
            console.error('❌ 错误: 必须指定 --type 参数或使用 --config 配置文件');
            console.error('');
            console.error('用法示例:');
            console.error('  # 单数据库模式');
            console.error('  npx universal-db-mcp --type mysql --host localhost --port 3306');
            console.error('');
            console.error('  # 启用 SSH 隧道');
            console.error('  npx universal-db-mcp --type mysql --host 10.0.0.1 --ssh-host bastion.example.com --ssh-user deploy');
            console.error('');
            console.error('  # 多数据库模式');
            console.error('  npx universal-db-mcp --config ./databases.json');
            console.error('  # 或通过环境变量');
            console.error('  DB_CONFIG_PATH=./databases.json npx universal-db-mcp');
            process.exit(1);
          }

          await startSingleDatabaseMode(options);

        } catch (error) {
          console.error('❌ 启动失败:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });



    /**
     * 多数据库配置模式启动
     */
    async function startMultiDatabaseMode(configPath: string, allowWriteOverride?: boolean): Promise<void> {
      console.error('🔧 多数据库配置模式');
      console.error(`   配置文件: ${configPath}`);

      // 检查配置文件是否存在
      if (!existsSync(configPath)) {
        console.error(`❌ 错误: 配置文件不存在: ${configPath}`);
        console.error('');
        console.error('请创建配置文件，参考 databases.json.example 示例');
        process.exit(1);
      }

      // 加载配置
      configService.loadFromFile(configPath);

      // 显示配置信息
      const databases = configService.listDatabases();
      console.error(`   已配置数据库: ${databases.length} 个`);
      databases.forEach((db, index) => {
        const marker = db.isCurrent ? '→' : ' ';
        console.error(`   ${marker} ${index + 1}. ${db.name} (${db.type})${db.description ? ` - ${db.description}` : ''}`);
      });

      const settings = configService.getSettings();
      const allowWrite = allowWriteOverride ?? settings?.allowWrite ?? false;
      console.error(`   安全模式: ${allowWrite ? '❌ 写入已启用' : '✅ 只读模式'}`);
      console.error('');

      // 创建并启动服务器
      const config: DbConfig = {
        type: 'mysql', // 占位符，实际使用 configService
        allowWrite,
      };

      const server = new DatabaseMCPServer(config);
      server.enableMultiDatabaseMode();
      await server.start();

      // 优雅退出处理
      setupGracefulShutdown(server);
    }


    /**
     * 单数据库模式启动
     */
    async function startSingleDatabaseMode(options: Record<string, unknown>): Promise<void> {
      // 验证数据库类型
      const supportedTypes = ['mysql', 'postgres', 'redis', 'oracle', 'dm', 'sqlserver', 'mssql', 'mongodb', 'sqlite', 'kingbase', 'gaussdb', 'opengauss', 'oceanbase', 'tidb', 'clickhouse', 'polardb'];

      if (!supportedTypes.includes(options.type as string)) {
        console.error('❌ 错误: 不支持的数据库类型');
        console.error(`   支持的类型: ${supportedTypes.join(', ')}`);
        process.exit(1);
      }

      // 规范化别名
      let dbType = options.type as string;
      if (dbType === 'mssql') dbType = 'sqlserver';
      if (dbType === 'opengauss') dbType = 'gaussdb';

      // SQLite 特殊处理
      if (dbType === 'sqlite') {
        if (!options.file) {
          console.error('❌ 错误: SQLite 数据库需要指定 --file 参数');
          process.exit(1);
        }
      } else {
        // 其他数据库需要 host 和 port
        // 优先使用环境变量
        const host = process.env.DB_HOST || options.host;
        const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : options.port;

        if (!host || !port) {
          console.error('❌ 错误: 需要指定 --host 和 --port 参数');
          console.error('   也可以通过环境变量 DB_HOST 和 DB_PORT 设置');
          process.exit(1);
        }

        options.host = host;
        options.port = port;
      }

      // 优先使用环境变量获取敏感信息 
      const user = process.env.DB_USER || options.user;
      const password = process.env.DB_PASSWORD || options.password;
      const database = process.env.DB_DATABASE || options.database;

      // 构建 SSH 配置
      let sshConfig = undefined;
      if (options.sshHost) {
        sshConfig = {
          enabled: true,
          host: options.sshHost as string,
          port: options.sshPort as number || 22,
          username: options.sshUser as string || process.env.USER || 'root',
          password: options.sshPassword as string,
          privateKey: options.sshKey as string,
          passphrase: options.sshPassphrase as string,
        };
      }

      // 构建配置 
      const config: DbConfig = {
        type: dbType as DbConfig['type'],
        host: options.host as string,
        port: options.port as number,
        user: user as string,
        password: password as string,
        database: database as string,
        filePath: options.file as string,
        allowWrite: options.dangerAllowWrite as boolean,
        ssh: sshConfig,
      };

      console.error('🔧 单数据库模式');
      console.error(`   数据库类型: ${config.type}`);
      if (config.type === 'sqlite') {
        console.error(`   数据库文件: ${config.filePath}`);
      } else {
        console.error(`   主机地址: ${config.host}:${config.port}`);
        console.error(`   数据库名: ${config.database || '(默认)'}`);
      }
      console.error(`   安全模式: ${config.allowWrite ? '❌ 写入已启用' : '✅ 只读模式'}`);
      console.error('');

      // 如果启用了 SSH 隧道，先建立隧道
      if (config.ssh && config.ssh.enabled) {
        try {
          console.error(`🔒 正在建立 SSH 隧道: default -> ${config.ssh.host}`);
          const localPort = await sshTunnelService.createTunnel(
            'default',
            config.ssh,
            config.host || 'localhost',
            config.port || 3306
          );

          // 更新配置使用本地端口
          config.host = '127.0.0.1';
          config.port = localPort;
          console.error(`✅ SSH 隧道已建立，本地端口: ${localPort}`);
        } catch (error) {
          console.error(`❌ SSH 隧道建立失败: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      }

      // 创建服务器
      const server = new DatabaseMCPServer(config);

      // 根据数据库类型创建适配器
      const adapter = createAdapter(config, options);
      server.setAdapter(adapter);
      await server.start();

      // 优雅退出处理
      setupGracefulShutdown(server);
    }

    /**
     * 优雅退出处理
     */
    function setupGracefulShutdown(server: DatabaseMCPServer) {
      let shuttingDown = false;

      async function shutdown(reason: string) {
        if (shuttingDown) return;
        shuttingDown = true;

        console.error(`\n⏹️  正在关闭服务器 (${reason})...`);

        try {
          await Promise.race([
            (async () => {
              await server.stop();
              await sshTunnelService.closeAll();
            })(),
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
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));

      // stdin 关闭处理
      // MCP 客户端（Claude Desktop、Cursor 等）关闭对话时会断开 stdin 管道
      process.stdin.resume();
      process.stdin.on('end', () => shutdown('stdin-end'));
      process.stdin.on('close', () => shutdown('stdin-close'));
    }

    /**
     * 根据配置创建数据库适配器
     */
    function createAdapter(config: DbConfig, options: Record<string, unknown>): DbAdapter {
      switch (config.type) {
        case 'mysql':
          return new MySQLAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'postgres':
          return new PostgreSQLAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'redis':
          return new RedisAdapter({
            host: config.host!,
            port: config.port!,
            password: config.password,
            database: config.database,
          });

        case 'oracle':
          return new OracleAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'dm':
          return new DMAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'sqlserver':
          return new SQLServerAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'mongodb':
          return new MongoDBAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
            authSource: options.authSource as string,
          });

        case 'sqlite':
          return new SQLiteAdapter({
            filePath: config.filePath!,
            readonly: !config.allowWrite,
          });

        case 'kingbase':
          return new KingbaseAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'gaussdb':
          return new GaussDBAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'oceanbase':
          return new OceanBaseAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'tidb':
          return new TiDBAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'clickhouse':
          return new ClickHouseAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        case 'polardb':
          return new PolarDBAdapter({
            host: config.host!,
            port: config.port!,
            user: config.user,
            password: config.password,
            database: config.database,
          });

        default:
          throw new Error(`不支持的数据库类型: ${config.type}`);
      }
    }





    await program.parseAsync();

  } catch (error) {
    console.error('❌ 未捕获的错误:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});
