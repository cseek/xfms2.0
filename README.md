
# XFMS 2.0

简体中文说明文档（Chinese）。

## 项目简介

XFMS（Firmware Management System）2.0 是一个基于 Node.js 的固件与模块管理系统，包含后端服务与前端管理界面。适用于本地小型部署与开发调试。

## 主要特性

- 仪表盘、固件列表、模块管理、项目管理、发布固件、系统设置与用户管理（见前端页面）。
- 简单的文件上传与固件发布流程。
- 使用 SQLite 作为内置数据库，便于快速部署与测试。

## 运行环境

- Node.js >= 14
- npm

（生产环境请根据需要调整 Node 版本与部署方式）

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 初始化数据库（只需在首次部署时运行）：

```bash
npm run init-db
```

3. 启动服务：

```bash
npm start
# 或开发时使用：
npm run dev
```

服务默认入口： [server/app.js](server/app.js)

前端管理界面位于 [www/](www/)

## 系统服务（可选）

仓库中包含一个 systemd 单元文件示例： [xfms.service](xfms.service)。可用于将服务注册为系统服务（需按需修改工作目录与用户）。

## 项目结构

- [server/](server/) — 后端代码，主入口 `server/app.js`，数据库初始化脚本 `server/init-db.js`。
- [www/](www/) — 前端静态文件（HTML/CSS/JS），包含页面与脚本目录。
- [database/](database/) — 数据库及持久化相关文件。
- pack.sh — 打包发布脚本（示例）。

## 开发

- 修改后端代码后，使用 `npm run dev` 自动重启（依赖 `nodemon`）。
- 前端静态资源直接放在 `www/`，开发时可使用浏览器打开 `www/index.html` 进行本地调试。

## 打包与发布

- 使用仓库根目录下的 `pack.sh`（如存在）生成发布包，或按你的 CI/CD 流程打包 `www/` 与后端代码。发布时请排除开发依赖。

## 贡献

欢迎提交 Issue 与 PR。请在更改前先创建 Issue 讨论主要设计与接口变更。

## 许可证

本项目采用 Apache-2.0 许可，详见 `package.json` 中的 `license` 字段。

