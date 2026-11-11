# 本机安装检查

检查日期：2026-11-10。

- 当前系统 Ubuntu 22.04.5，安装包目标 Linux amd64 的 Ubuntu / Debian 桌面环境。
- 桌面入口 `/usr/bin/openclaw-desktop`，deb 包名 `open-claw`，版本 2026.10.5。
- 核心位于 `~/.openclaw/tools/node-v24.21.0/lib/node_modules/openclaw`，package.json 声明版本 2026.10.5，MIT 许可。
- CLI 包装器位于 `~/.openclaw/bin/openclaw`，调用桌面运行时的 Bun 和核心 dist/entry.js。
- 个人配置位于 `~/.openclaw/openclaw.json`；状态、会话、缓存独立于程序目录。
- 定制包含本地头像、清屏/恢复、隐藏单条消息与预设脚本模式，源文件在 customizations。
- 已有迁移包提供桌面 deb 和 runtime.tar.gz，本项目沿用这些制品，并附上打包脚本、校验和与 Gitea 上传说明。

包不复制个人配置、模型供应商密钥、聊天状态数据库、媒体、浏览器数据、系统用户服务配置。安装时生成全新随机 Gateway token。安装器拒绝覆盖已有 .openclaw 数据。系统依赖可能需要 apt 联网安装，所以这不是完全离线系统安装镜像。

验证只在隔离目录准备安装并运行 CLI；未替换当前程序、未重启服务。新电脑上的完整桌面启动、apt 依赖安装与 systemd 启动仍需实际验证。
