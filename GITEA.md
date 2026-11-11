# 发布维护

当前仓库：`https://github.com/GCUSMS-AI-ProJect/OpenClaw_Sub.git`。

源文件通过 Git 管理。完整安装包与 SHA-256 文件通过 GitHub Release 附件分发，避免把几百 MB 制品写进普通 Git 历史。

重新打包：从已有完整安装包取回 `runtime.tar.gz` 和 `packages/*.deb` 到本目录，修改定制代码或文档后执行 `python3 build.py`。校验通过后，把 `dist/` 下完整包及 SHA-256 上传到新 Release。发布新版本应同步调整 `build.py` 的 NAME 以及安装器中的版本常量。

本文件沿用原有文件名，当前发布目标已从 Gitea 改为 GitHub。账号密码和 API Key 不写入 remote URL、仓库文件或 Git 历史。
