# 中文文档索引

本目录包含 Universal Database MCP Server 的所有中文文档。

## 📚 HTTP API 文档

### API 参考
- [API 参考文档（中文）](http-api/API_REFERENCE.zh-CN.md) - 完整的 API 端点文档，包含请求/响应示例
- [API Reference (English)](http-api/API_REFERENCE.md) - Complete API endpoint documentation with request/response examples

### 部署指南
- [部署指南（中文）](http-api/DEPLOYMENT.zh-CN.md) - 7 种部署方式的详细指南
- [Deployment Guide (English)](http-api/DEPLOYMENT.md) - Detailed guide for 7 deployment methods

## 🔌 集成指南

### Coze 平台
- [Coze 集成指南（中文）](integrations/COZE.zh-CN.md) - Coze 平台集成步骤和示例
- [Coze Integration Guide (English)](integrations/COZE.md) - Coze platform integration steps and examples

### n8n 工作流
- [n8n 集成指南（中文）](integrations/N8N.zh-CN.md) - n8n 工作流自动化集成
- [n8n Integration Guide (English)](integrations/N8N.md) - n8n workflow automation integration

### Dify 应用
- [Dify 集成指南（中文）](integrations/DIFY.zh-CN.md) - Dify AI 应用开发平台集成
- [Dify Integration Guide (English)](integrations/DIFY.md) - Dify AI application platform integration

## 🗄️ 数据库指南

以下数据库有专门的使用指南：

- [ClickHouse 使用指南](CLICKHOUSE_GUIDE.md)
- [达梦数据库使用指南](DAMENG_GUIDE.md)
- [GoldenDB 使用指南](GOLDENDB_GUIDE.md)
- [HighGo（瀚高）使用指南](HIGHGO_GUIDE.md)
- [MongoDB 使用指南](MONGODB_GUIDE.md)
- [PolarDB 使用指南](POLARDB_GUIDE.md)
- [SQL Server 使用指南](SQLSERVER_GUIDE.md)
- [TiDB 使用指南](TIDB_GUIDE.md)
- [Vastbase 使用指南](VASTBASE_GUIDE.md)

## 📖 快速开始

### MCP 模式（Claude Desktop）

```bash
# 安装
npm install -g universal-db-mcp

# 配置 Claude Desktop
# 编辑 claude_desktop_config.json
{
  "mcpServers": {
    "mysql-db": {
      "command": "npx",
      "args": [
        "universal-db-mcp",
        "--type", "mysql",
        "--host", "localhost",
        "--port", "3306",
        "--user", "root",
        "--password", "your_password",
        "--database", "your_database"
      ]
    }
  }
}
```

### HTTP API 模式

```bash
# 1. 配置环境变量
export MODE=http
export HTTP_PORT=3000
export API_KEYS=your-secret-key

# 2. 启动服务
npm run start:http

# 3. 测试 API
curl http://localhost:3000/api/health
```

### Docker 部署

```bash
# 使用 Docker Compose
cd docker
docker-compose up -d

# 或直接运行
docker run -p 3000:3000 \
  -e MODE=http \
  -e API_KEYS=your-key \
  universal-db-mcp
```

## 🎯 支持的数据库

本项目支持 **17 种**数据库类型：

### 关系型数据库
- MySQL
- PostgreSQL
- Oracle
- SQL Server
- SQLite

### 国产数据库
- 达梦（DM）
- 人大金仓（KingbaseES）
- 华为高斯（GaussDB/OpenGauss）
- 瀚高（HighGo）
- 中兴 GoldenDB
- 海量数据 Vastbase

### 分布式数据库
- OceanBase
- TiDB
- PolarDB

### 分析型数据库
- ClickHouse

### NoSQL 数据库
- MongoDB
- Redis

## 🔒 安全特性

- ✅ API Key 认证
- ✅ CORS 配置
- ✅ 速率限制
- ✅ SQL 注入防护
- ✅ 查询超时控制
- ✅ 会话管理
- ✅ 默认只读模式

## 🚀 部署选项

### 本地部署
- Node.js 直接运行
- PM2 进程管理
- systemd 服务

### 容器化部署
- Docker
- Docker Compose

### Serverless 部署
- 阿里云函数计算（Aliyun FC）
- 腾讯云 SCF
- AWS Lambda
- Vercel

### PaaS 平台部署
- Railway
- Render
- Fly.io

## 📞 获取帮助

### 文档
- [主 README](../README.md) - 项目概述和快速开始
- [实现总结](../IMPLEMENTATION_SUMMARY.md) - 技术实现细节
- [完成报告](../COMPLETION_REPORT.md) - 项目完成状态

### 支持渠道
- **GitHub Issues**: https://github.com/Anarkh-Lee/universal-db-mcp/issues
- **项目主页**: https://github.com/Anarkh-Lee/universal-db-mcp

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何参与项目。

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](../LICENSE) 文件。

---

**最后更新**: 2026-01-27
**版本**: 1.0.0
