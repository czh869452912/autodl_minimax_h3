# 任务状态滞留与 SQLite 锁冲突修复

日期：2026-09-05。基线：`dev@480e879a`。本轮直接在主工作区 inline 排查、修复，未使用子代理。

## 实测根因

从报告问题的 Android 模拟器读取数据库副本，确认同一条任务存在以下持久化分歧：

| 字段 | 修复前 |
|---|---|
| `workflow_jobs.status` | `SUCCEEDED` |
| `tasks.status` | `RUNNING` |
| `tasks.download_state` | `DOWNLOADED` |
| `tasks.export_state` | `EXPORTED` |
| job 更新时间 | 1788599035662 |
| task 更新时间 | 1788599037033 |

因此不是 React 缓存未重绘：列表忠实显示了过期的 `tasks` 投影。`JobStateRepository.transition()` 原来只提交 job、event、artifact、operation，不更新 tasks；后者依赖受五分钟冷却限制、只扫描最近 32 条 job 的维护修复。媒体写入又使 task 时间比 job 更新，时间戳本身不能作为状态一致性的判据。

手动刷新报错来自并发写入。安装的 Expo SQLite `withExclusiveTransactionAsync()` 使用独立连接和 `BEGIN`，并不把应用的其他写入串行化；其源码明确说明写事务竞争会产生 `database is locked`。设备使用 `journal_mode=delete`。原来的 Node 测试辅助器通过全局 Promise 队列串行所有事务，未复现实际的独立连接锁竞争。

两个新增回归先验证失败：成功的 job 转换没有改变 task 状态；另一个连接持有写锁 60 ms 时，刷新命令立即失败。

## 修复

- job 创建与每次状态转换在同一个异步事务中提交 task 工作流投影。保留已有本地文件、相册 URI、下载与导出状态。投影写失败时，job/event/operation 同时回滚。
- `JobStateRepository` 全部数据库查询、写入与通知读取改为异步，并更新执行器及 Headless 调用方。测试将同步查询设为直接抛错，验证生产路径不再调用它们。
- 所有相关异步写事务使用 `withWriteTransaction`：只针对 SQLite BUSY/LOCKED，在事务完整回滚后让出 JS 线程并重试整个事务；总等待期限约三秒。其他错误原样传播，不重复执行网络请求或文件发布。
- 应用共享连接的独立 `runAsync/getFirstAsync/getAllAsync` 也对暂时锁冲突做有界重试。事务回调仍得到原始事务连接，避免在过期事务快照中单独重试 SQL。
- 每个执行器周期先做最多 32 条旧状态修复，扫描实际状态不一致的 job，不依赖最近历史或维护冷却；剩余批次通过既有预算后续唤醒处理。无需重提任务或重下视频。
- 分页在刷新中到达时等待并合并为一次后续加载；页面 revision fence 冲突后刷新游标，再补齐请求的页面。

不通过清空业务数据库或降低下载安全策略修复故障。schema 版本仍为 8，无结构变更。

## 复审文档的新发现

对 `docs/reviews/2026-09-05-task-list-refresh-review.md` 的复审部分逐项核对，结论如下：

| 项目 | 本轮结论 |
|---|---|
| N1 同步 job SQLite | 确认，已异步化；同时补齐 job → task 原子投影，不能仅视为少量同步调用的性能问题。 |
| N2 分页请求丢失与 fence 冲突 | 确认，已修复并覆盖两种回归。 |
| N3 数据库重置后 revision 回退 | 确认该边界存在；当前重置/恢复会重建应用运行时，本轮保留拒绝旧 revision 的保护，不把回退快照当作正常更新。 |
| N4 claim fence mismatch | 确认仍会抛错；内事务 mismatch 会回滚，提交后复读 mismatch 则取决于当前所有权，不能一概认为本方 claim 必定残留 120 秒。本轮未修改抢占/租约恢复语义。 |
| N5 仅 Android 原生传输 | 符合当前产品范围，未扩展 iOS。 |
| N6 下载进度仅 0/1 | 确认是未完成的体验项，非本次状态滞留根因，本轮未加入增量进度事件。 |

原复审“均为低风险、不阻塞”的总判断不足以覆盖本次实测：遗漏了原子投影缺口和真实连接竞争。原审查文件保持原样，本报告记录更正依据。

## 验证

- `npm run typecheck`、`npm run verify:workflow-releases`：通过。
- 全量 Jest：123 suites / **701 tests passed**，2 个既有环境门控测试 skipped。
- Android x86_64：`:app:testDebugUnitTest :app:assembleDebug :app:connectedDebugAndroidTest` 通过，35 项 JVM、1 项 instrumentation，构建 2m09s。最终正常入口 `:app:testDebugUnitTest :app:assembleDebug` 再次通过（1m10s），使用 `adb install -r` 覆盖安装。
- 真实 Expo SQLite 并发夹具：[脚本](../../mobile/scripts/task-refresh-contention-device.jsx)、[原始结果](task-refresh-contention-device.json)。设备 `emulator-5554` / AVD `test_phone` / Android 15 / `sdk_gphone64_x86_64`，自包含 debug Hermes APK。
- 10 轮，每轮独立连接持写锁 100 ms，同时 4 个 job 状态事务、3 个刷新命令与投影读：40 个状态转换完成，30 个命令发出 30 次信号，持久化 wake generation 精确为 30。最终 4 个 job 均 `SUCCEEDED`，对应 task 均 `SUCCESS`。
- 额外读写冲突测试：整事务执行 2 次，证明真实原生锁错误走了回滚重试；旧状态修复 1 条。最大 JS 事件循环停顿 **22.0 ms**。这些数字只适用于该并发回归，不代替尚未完成的 HTTPS 大文件性能验收。
- logcat 的 `ANR in|FATAL EXCEPTION|Input dispatching timed out|ReactNativeJS.*Error` 搜索无匹配。
- 恢复原问题数据库后，应用启动自动修复原任务，设备 UI 显示“成功 / 已保存到相册”。完整本地日志、数据库副本与 UI 树位于 `.worktrees/task-refresh-decoupling/.superpowers/refresh-regression/`，不提交业务数据库、凭据或视频。
- 最终正常入口连续点击刷新 12 次，无锁冲突弹窗；列表显示“已更新 09:30:31 / 成功 / 已保存到相册”，结果画廊中仍可见原视频记录。设备截图 `refresh-fixed.png`、UI 树 `ui-after-taps.xml`、`gallery-fixed.xml` 和 `normal-final-logcat.txt` 保留在上述本地证据目录。

复现并发设备测试：使用单独 Gradle init 文件将 `react.entryFile` 指向 `../../scripts/task-refresh-contention-device.jsx`，执行 `:app:assembleDebug -PreactNativeArchitectures=x86_64`，`adb install -r` 后启动主 Activity；读取 `files/refresh-contention-result.json`。脚本使用新命名的独立 fixture 数据库，不读写正常业务数据库。恢复时去掉入口覆盖重新构建并覆盖安装。

## 设备测试意外与恢复

本轮第一次 Gradle connected 测试后发现模拟器应用私有数据被重新初始化。这不是业务修复步骤，且该流程不应再次用于有用户数据的设备。测试前保留了业务 SQLite 副本，已恢复原任务、操作、媒体与引用记录；从仍保留的系统相册复制回私有 CAS，SHA-256 为 `be8e70cc7aa2e01a154bd77d882af2b0bbd130bb1465a70becf4bde8c1ae504e`，与原记录一致，并重新生成海报。

测试前未备份 SecureStore 私有设置，Token/API Key 等不能从数据库副本恢复，需要重新设置。已向用户说明。恢复后另存完整私有目录备份；此后只使用 `adb install -r` 和独立 fixture，避免再次触发 Gradle 安装/清理流程。
