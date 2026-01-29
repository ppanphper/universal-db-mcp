import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { createServer, Server } from 'net';
import type { SSHConfig } from '../types/ssh.js';

export interface TunnelInfo {
    /** 本地监听端口 */
    localPort: number;
    /** 远程目标主机 */
    remoteHost: string;
    /** 远程目标端口 */
    remotePort: number;
    /** SSH 客户端实例 */
    client: Client;
    /** 本地转发服务 */
    server: Server;
    /** 隧道名称（通常与数据库连接名称一致） */
    name: string;
}

/**
 * SSH 隧道服务
 * 管理 SSH 连接和端口转发
 */
export class SSHTunnelService {
    private tunnels: Map<string, TunnelInfo> = new Map();

    /**
     * 创建 SSH 隧道
     * @param name 隧道名称（通常是数据库连接名称）
     * @param sshConfig SSH 配置
     * @param remoteHost 目标数据库主机
     * @param remotePort 目标数据库端口
     * @returns 本地监听端口
     */
    async createTunnel(
        name: string,
        sshConfig: SSHConfig,
        remoteHost: string,
        remotePort: number
    ): Promise<number> {
        // 检查是否已存在同名隧道，如果存在则复用
        if (this.tunnels.has(name)) {
            const tunnel = this.tunnels.get(name)!;
            // 检查隧道是否活跃，如果不活跃则关闭并重新创建
            // 这里简单处理：如果已存在，假设它是好的，或者在调用方处理重试
            //为了更健壮，我们可以在这里做简单的健康检查，或者让调用方决定是否强制重建
            console.error(`🔒 复用现有的 SSH 隧道: ${name} (localhost:${tunnel.localPort} -> ${remoteHost}:${remotePort})`);
            return tunnel.localPort;
        }

        return new Promise((resolve, reject) => {
            const client = new Client();
            let localServer: Server | null = null;
            let localPort = 0;

            // 准备连接配置
            const connectConfig: any = {
                host: sshConfig.host,
                port: sshConfig.port || 22,
                username: sshConfig.username,
                readyTimeout: sshConfig.timeout || 10000,
                keepaliveInterval: sshConfig.keepAlive !== false ? (sshConfig.keepAliveInterval || 60000) : 0,
                keepaliveCountMax: 3, // 默认重试次数
            };

            // 处理认证方式
            if (sshConfig.privateKeyContent) {
                connectConfig.privateKey = sshConfig.privateKeyContent;
                if (sshConfig.passphrase) {
                    connectConfig.passphrase = sshConfig.passphrase;
                }
            } else if (sshConfig.privateKey) {
                // 展开 ~ 为用户 home 目录
                const expandedPath = sshConfig.privateKey.startsWith('~')
                    ? sshConfig.privateKey.replace(/^~/, process.env.HOME || '')
                    : sshConfig.privateKey;

                if (existsSync(expandedPath)) {
                    connectConfig.privateKey = readFileSync(expandedPath);
                    if (sshConfig.passphrase) {
                        connectConfig.passphrase = sshConfig.passphrase;
                    }
                } else {
                    reject(new Error(`SSH 私钥文件不存在: ${expandedPath}`));
                    return;
                }
            } else if (sshConfig.password) {
                connectConfig.password = sshConfig.password;
            } else {
                // 尝试默认私钥 ~/.ssh/id_rsa
                const defaultKeyPath = `${process.env.HOME}/.ssh/id_rsa`;
                if (existsSync(defaultKeyPath)) {
                    console.error(`🔑 使用默认私钥: ${defaultKeyPath}`);
                    connectConfig.privateKey = readFileSync(defaultKeyPath);
                } else {
                    // 如果没有密码也没有私钥，ssh2 client 可能会尝试 agent，或者直接失败
                    // 这里不做额外处理，让 ssh2 决定
                }
            }

            client.on('ready', () => {
                console.error(`🔐 SSH 连接已建立: ${sshConfig.username}@${sshConfig.host}:${connectConfig.port}`);

                // 创建本地服务器进行转发
                localServer = createServer((userConnection) => {
                    client.forwardOut(
                        '127.0.0.1',
                        userConnection.remotePort || 0,
                        remoteHost,
                        remotePort,
                        (err, stream) => {
                            if (err) {
                                console.error(`❌ SSH 转发失败: ${err.message}`);
                                userConnection.end();
                                return;
                            }
                            // 双向管道连接
                            userConnection.pipe(stream);
                            stream.pipe(userConnection);
                        }
                    );
                });

                // 获取可用的本地端口并监听
                this.findAvailablePort().then((port) => {
                    localPort = port;
                    localServer!.listen(localPort, '127.0.0.1', () => {
                        console.error(`🌐 SSH 隧道本地监听: localhost:${localPort} forwarded to ${remoteHost}:${remotePort}`);

                        // 保存隧道信息
                        this.tunnels.set(name, {
                            localPort,
                            remoteHost,
                            remotePort,
                            client,
                            server: localServer!,
                            name,
                        });

                        resolve(localPort);
                    });

                    localServer!.on('error', (err) => {
                        console.error(`❌ 本地转发服务器错误: ${err.message}`);
                        client.end();
                        reject(err);
                    });
                }).catch((err) => {
                    client.end();
                    reject(err);
                });
            });

            client.on('error', (err) => {
                console.error(`❌ SSH 连接错误: ${err.message}`);
                if (localServer) {
                    localServer.close();
                }
                // 如果隧道已保存，移除它
                if (this.tunnels.has(name)) {
                    this.tunnels.delete(name);
                }
                reject(err);
            });

            client.on('end', () => {
                console.error(`🔌 SSH 连接断开: ${name}`);
                if (localServer) {
                    localServer.close();
                }
                this.tunnels.delete(name);
            });

            client.on('close', () => {
                // close 事件也会在 end 之后触发
                if (this.tunnels.has(name)) {
                    this.tunnels.delete(name);
                }
            })

            try {
                client.connect(connectConfig);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 关闭指定隧道
     */
    async closeTunnel(name: string): Promise<void> {
        const tunnel = this.tunnels.get(name);
        if (tunnel) {
            return new Promise<void>((resolve) => {
                tunnel.server.close(() => {
                    tunnel.client.end();
                    this.tunnels.delete(name);
                    console.error(`🛑 SSH 隧道已关闭: ${name}`);
                    resolve();
                });
            });
        }
    }

    /**
     * 关闭所有隧道
     */
    async closeAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const name of this.tunnels.keys()) {
            promises.push(this.closeTunnel(name));
        }
        await Promise.all(promises);
    }

    /**
     * 获取所有活跃隧道信息
     */
    getTunnels(): TunnelInfo[] {
        return Array.from(this.tunnels.values());
    }

    /**
     * 查找可用的本地端口
     */
    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = createServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address !== 'string') {
                    const port = address.port;
                    server.close(() => resolve(port));
                } else {
                    server.close();
                    reject(new Error('无法获取端口'));
                }
            });
            server.on('error', (err) => {
                reject(err);
            });
        });
    }
}

// 导出单例，方便全局使用
export const sshTunnelService = new SSHTunnelService();
