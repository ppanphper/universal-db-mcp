/**
 * SSH 配置接口
 * 用于定义通过 SSH 隧道连接数据库的参数
 */
export interface SSHConfig {
    /** 是否启用 SSH 隧道 */
    enabled: boolean;
    /** SSH 服务器地址 */
    host: string;
    /** SSH 端口（默认 22） */
    port?: number;
    /** SSH 用户名 */
    username: string;
    /** SSH 密码（不推荐，建议使用 privateKey） */
    password?: string;
    /** 私钥文件路径 */
    privateKey?: string;
    /** 私钥内容（直接传入，优先级高于 privateKey） */
    privateKeyContent?: string;
    /** 私钥密码（如果私钥有加密） */
    passphrase?: string;
    /** 是否启用 keepAlive（默认 true） */
    keepAlive?: boolean;
    /** keepAlive 间隔（默认 60000 毫秒） */
    keepAliveInterval?: number;
    /** 连接超时（毫秒，默认 10000） */
    timeout?: number;
}
