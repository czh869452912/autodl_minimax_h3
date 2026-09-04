# C 阶段收尾热修复 v1.4.9 验证记录

日期：2026-09-04

分支：`codex/c-closure-hotfix`

验证代码 HEAD：`41b4a32b`

## 当前结论

v1.4.9 的实现和自动化门禁已经完成。它修复创建参数越界仍入队、任务列表热路径全量扫描、长时间离线后不主动恢复、损坏视频进入成功投影/画廊、坏本地副本无法可靠重下、相册同名陈旧内容、Android 13+ 通知权限与终态通知去重，以及 scoped 前台监控误停等问题。

本记录不把尚未执行的真实 AutoDL 账号端到端场景标为通过。发布、tag 和 D 阶段实现仍需用户完成并确认下文“人工发布门”。

## 自动化门禁

- `CI=true npm run typecheck`：PASS。
- `CI=true npm test -- --runInBand`：111/112 suites passed，1 skipped；603/605 tests passed，2 skipped，0 failed。
- 唯一预期 console error 是 `aguiAgent.test.ts` 注入的 `provider failed`。
- `npx expo install --check`：`Dependencies are up to date`。
- Android：JBR 21.0.11，`gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --console=plain`，`BUILD SUCCESSFUL in 2m 24s`，393 actionable tasks（83 executed，310 up-to-date）。
- Android JVM：3 个 XML suite、11 tests、0 failures/errors/skips。
- Android instrumentation：API 37 x86_64 模拟器，1 test；覆盖真实 AVC MP4、截断/文本媒体和篡改 `mdat` NAL length 的拒绝路径。
- schema 保持 `APP_SCHEMA_VERSION=6`，没有 migration。
- 版本一致：package/app `1.4.9`，Android `versionName 1.4.9`、`versionCode 19`。

## 最新 APK 与 fresh install

- APK：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- 大小：126,032,207 bytes。
- SHA-256：`9F49CCA176743AA4EBA9DBCC9F87C1A9086F79EE8E5F0045676C66931761DA8A`。
- 设备：`emulator-5554`，API 37，`x86_64`。
- 干净安装后冷启动：`Status: ok`，`LaunchState: COLD`，`MainActivity` 为 `topResumedActivity` 且 task visible。
- SQLite：`integrity_check=ok`，`user_version=6`，15 张 app-owned 表齐全。
- 启动后 `FATAL EXCEPTION|SQLiteException|ReactNativeJS.*Error` 零命中，crash buffer 为空。

## 本轮行为证据

- Prompt 合同升级为 immutable workflow `1.0.1`；Prompt 10,001 字符以及非法 duration/resolution/seed 在读取 token、写 job 或 enqueue 前被拒绝，并显示字段级中文原因；10,000 字符边界可提交。
- operation due/summary/outstanding 查询下推 SQLite；普通 poll 不执行 reconciliation/file probe，maintenance 有持久 cooldown，service 使用 scoped 查询。
- 离线→在线边沿会提前已有、可重试的 STATUS/DOWNLOAD 网络 operation 并主动 poll；不会重放 UNKNOWN submit。
- 下载内容先写 operation-attempt 独占 part，重读 SHA-256 后在 part 上做原生视频 probe，通过后才发布 CAS final 并提交成功投影。
- AVC/HEVC Annex-B 与 length-prefixed sample framing 会逐 sample 检查；零长度、越界/逃逸 NAL length 和不可解码视频不会进入 DOWNLOADED/EXPORTED。
- CAS 会修复预存错大小、同大小错 hash、rename/copy race 和 partial-copy 目标；quarantine 具备所有权 fence，不删除并发合法内容。
- 播放器确认本地副本无效时发 durable redownload command；事务清除旧投影和精确 artifact ref，其他引用不受影响。
- MediaStore 以内容 SHA-256 判断复用/替换，不再仅按同名文件判断成功。
- Android 13+ 权限拒绝不会启动前台监控；允许后显示 scoped 数量。终态通知先持久化 event-ID 去重，持久化失败不发通知；重复 headless tick 不重复通知。
- service remaining 同时考虑 scoped 活跃任务与 `PENDING/CLAIMED` operation；真实 SQLite 双连接回归覆盖另一连接持有 CLAIMED 时不误停服务。

## 模拟器交互证据

- fresh 权限初始为 denied；点击监控出现系统通知权限弹窗，拒绝后应用提示“需要通知权限”，服务未启动。
- 授权并注入 ASCII synthetic active task 后，前台服务存在，常驻通知显示“正在监控 1 个任务”。
- 注入 synthetic terminal event 后，event ID 持久化、结果通知出现、服务停止；重复执行两次 headless cycle 仍只有一条结果通知。
- 以上 synthetic 数据仅用于验证通知/停服编排，不等价于真实 provider 端到端验收。

## 独立审查

首轮审查发现 3 项 Important 和 1 项 Minor：CLAIMED/scoped work 被 remaining 漏计、损坏 CAS final 可永久毒化、probe 失败产生 GC 不可见孤儿、通知 dedupe commit 失败仍发通知。四项均已按失败测试修复。

最终复审：Critical 0、Important 0；独立执行 typecheck、6 suites/62 Jest 和 Android `TaskNotificationPolicyTest` 均通过。代码层面 merge-ready，可作为 v1.4.9 RC。

剩余 1 项非阻塞 Minor：极端文件系统删除/恢复失败时，`cas/parts/quarantine-*` 可能残留，当前没有陈旧 parts 按龄清扫器。正常和受控并发/失败路径未发现误删唯一合法 blob。该项进入 D 阶段的存储维护与遥测工作，不阻塞 RC，但不能替代下述人工发布门。

## M6：Accepted Constraint

AutoDL 实测会从集群内动态可用存储节点分发，URL 不含稳定 AutoDL 前缀，因此不能建立可靠固定 host allowlist。当前边界是 trusted adapter origin、HTTPS、逐跳重定向校验、literal private/reserved address 拒绝、不转发凭据、MIME/大小/连接与 idle timeout、SHA-256/视频完整性验证及诊断脱敏。本版本不声称具备 DNS resolution pinning，也不声称固定域名白名单覆盖所有动态节点。

## 人工发布门（尚未执行）

- [ ] 使用真实 AutoDL 账号生成有效视频：下载后应用内与系统相册均可播放。
- [ ] 真实坏产物/既有坏副本：不会误报成功；重新下载后可播放，相册同名只保留一个有效条目。
- [ ] 活跃任务断网超过 60 秒再联网：不重启、不提交新任务即可恢复轮询并下载仍有效结果。
- [ ] 真实 100+ 历史任务列表：普通刷新无明显卡顿，行为与自动化的“零 maintenance probe”一致。
- [ ] 在创建页实际输入 10,001 字符及非法 duration/resolution/seed：显示明确原因、任务列表/数据库无新增；修正后只提交一次。
- [ ] 回归 auto-export on/off、keep-private-copy on/off、manual save/retry 和 Prompt/Timeline 携带项。
- [ ] 合并后创建 annotated `v1.4.9` tag，运行 Android Release workflow，并复核签名、四 ABI、版本与发布资产 SHA-256。

## D 阶段入口

D Task 1 必须从最终已验证并发布的 v1.4.9 merge/tag commit 开始，schema 基线为 v6。在上述人工发布门确认前，不开始 D 实现。UNKNOWN UI 与低优先级 query/cursor 观察项继续延期到 D。
