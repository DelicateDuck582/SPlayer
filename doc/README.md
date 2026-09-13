# 文档索引（doc/）

本目录存放本 fork 的**详细**记录；仓库根目录的 [README](../README.md) 仅保留摘要与入口链接。

| 文档 | 内容 |
| --- | --- |
| [AUDIT.md](./AUDIT.md) | 审计报告（安全 / 性能 / 密钥 / 移动端）：问题、证据、修复状态、待办与复审建议 |
| [CHANGELOG.md](./CHANGELOG.md) | 详细更新日志：每次变更的背景、实现要点与验证方式 |

## 说明

- 审计与日志中**不保存任何真实凭据**。涉及凭据链路的验证统一使用无害标记串（如 `_TEST_LEAK_MARKER_`），且只做只读探测（`curl -I`、匿名请求、本地复现）。
- 关联仓库：主仓库 [SPlayer](https://github.com/DelicateDuck582/SPlayer)（工作分支 `feat/api-enhanced`）、API 服务 [api-enhanced](https://github.com/DelicateDuck582/api-enhanced)（分支 `main`）。
- 审计时间线：2026-09-12（第一、二轮安全审计）→ 2026-09-13（安全 / 性能 / 密钥 / 移动端全量审计与落地）。
- 本仓库的变更仅记录在 `feat/api-enhanced` 分支；上游已归档，本项目不做上游贡献。
