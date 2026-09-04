# C 阶段收尾热修复 v1.4.9 验证记录

日期：2026-09-04

## 范围与结论

本次热修复将手动下载/保存纳入 C-Core 的持久执行器，统一自动与手动媒体路径，并删除 UI 直连下载、MediaStore 与投影写入的旧队列。代码、自动化门禁、Android 构建、fresh install、v1.4.8 覆盖升级与独立审查均已通过；七项媒体设备场景及 Prompt/Timeline 携带项仍需人工验收，完成前不得宣布 C 阶段发布闭环或开始 D 阶段实现。

## 自动化证据

- 分支：`codex/c-closure-hotfix`
- 自动化验证提交：`c5f3a499`（本记录更新前）
- `npm run typecheck`：PASS。
- `CI=true npm test -- --runInBand`：105/106 suites passed，1 skipped；522 passed，2 skipped，0 failed；共 524 tests。
- 预期日志：`aguiAgent.test.ts` 的故障注入输出 `provider failed`；不代表测试失败。
- `git diff --check`：PASS。
- 旧符号扫描：`ensureTaskMedia|ensureTaskDownloaded|exportTaskVideo|createTaskCoordinator|createMediaDeliveryQueue` 零匹配。
- schema：`APP_SCHEMA_VERSION=6`，本热修复无 schema 变更。
- 版本所有者：package、package-lock、Expo 均为 `1.4.9`；Android 为 `versionName 1.4.9`、`versionCode 19`。

## 已覆盖的关键行为

- 结构化 URL、MIME、大小、完整性与网络错误码决定稳定的终态/重试策略。
- 手动下载与保存先持久化 operation，再触发有界 foreground cycle。
- 手动保存可并入已经 CLAIMED 的下载；下载提交前重读最新 delivery intent。
- 导出在 native publish 与 SQLite commit 之间提供仅依赖注入可达的测试中断点；重放使用稳定 display name。
- `keepPrivateCopy=false` 原子清空私有路径投影，并只释放匹配的 workflow-artifact CAS 引用。
- 任务删除继续受活跃媒体 operation fence 保护。
- 页面只发持久命令和读取投影，不直接执行下载、导出或写媒体投影。

## M6：Accepted Constraint

AutoDL 实测会从集群内动态可用存储节点分发，URL 不含稳定的 AutoDL 域名前缀，因此不能建立可靠的固定 host allowlist。本版本明确采用 trusted adapter origin 的受控公网下载能力：强制 HTTPS、逐跳校验重定向、拒绝 URL 中的 literal private/reserved address、不转发凭据，并实施 MIME、大小、连接/idle timeout、SHA-256 完整性与诊断脱敏。这里不声称具备 DNS resolution pinning，也不声称动态节点已被固定域名白名单穷举。

## 待完成发布门

- [x] JBR 21.0.11、x86_64 Debug APK 构建：`BUILD SUCCESSFUL in 3m 34s`，358 actionable tasks；APK 114,347,622 bytes，SHA-256 `058F538FDCCE8B7C13594F11071B284A16F2AF9F4CA475913E473BD33093EB1F`。
- [x] fresh install：`1.4.9 (19)` 冷启动成功，`MainActivity isOnScreen=true/isVisible=true`，数据库 `user_version=6`、15 张当前表齐全，fatal SQLite/ReactNative logcat 零命中。
- [x] v1.4.8 数据保留覆盖升级：正式 v1.4.8 APK 与 Debug APK 证书不同，故从 tag `v1.4.8` 构建同一 debug 签名的 `1.4.8 (18)` 作为 Android 可接受升级基线，再覆盖安装 `1.4.9 (19)`。升级后 task、media asset、delivery URI、workflow operation、blob ref sentinel 均保持，4-byte 私有 CAS sentinel 文件保持；任务页 UI 树可见 `upgrade-sentinel` 与“已保存到相册”；fatal scan 零命中。正式 v1.4.8 Release 资产 SHA-256 另核对为 `1CEBB70CBF45B12986E4F34350D3693983C46D05DECAF6CBCA7D39C9886EFB0B`。
- [ ] 七项媒体设备场景与 Prompt/Timeline 携带项。
- [x] 独立代码审查无 Critical/Important：最终复核无 Critical、Important 或 Minor；真实 SQLite 探针确认 operation family 中 `%`、`_`、`\` 均按字面量匹配；复核聚焦测试 5 suites、46 tests 全部通过。
- [ ] PR 检查、合并、`v1.4.9` annotated tag、Android Release workflow 与签名资产复核。

## D 阶段入口

D Task 1 只能从最终已验证的 v1.4.9 合并/tag 提交启动，schema 基线为 v6。UNKNOWN UI 与低优先级 query/cursor 观察项继续延期到 D，不纳入本热修复。
