# GitHub 配置文件

本目录包含 GitHub Actions 工作流和相关配置。

## 📁 文件说明

### workflows/
- **ci.yml** - 持续集成工作流，在每次推送和 PR 时运行测试和构建
- **publish.yml** - NPM 发布工作流，在创建 Release 时自动发布到 NPM

### 文档
- **ACTIONS_SETUP.md** - GitHub Actions 详细配置指南

## 🚀 快速开始

1. 阅读 [ACTIONS_SETUP.md](./ACTIONS_SETUP.md) 了解如何配置
2. 在 GitHub 仓库设置中添加 `NPM_TOKEN` secret
3. 创建 Release 即可自动发布到 NPM

## 📚 更多信息

查看 [ACTIONS_SETUP.md](./ACTIONS_SETUP.md) 获取完整的配置指南和故障排查。
