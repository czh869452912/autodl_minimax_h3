# C-Core 阶段代码审查（含上轮遗留项归零核对）

> 审查时间：2026-09-04
> 审查对象：`dev` @ `e167cd4e`（= `origin/main` = `v1.4.8^{}`，PR #22 merge commit），覆盖 C-Core 六项任务（`cdbd9c46`…`7ef08570`）与 post-merge stabilization（`99891157`…`0301cd37`）。
> 上轮依据：`docs/superpowers/reviews/2026-09-03-a-b-stage-review-for-c-d.md` §6 复审结论。
> 审查方法：逐文件审查 migrations/runner、executor 全部模块、CAS、reconciliation、调度与 UI 接线；用真实 node:sqlite 独立复验迁移矩阵与幂等语义；复跑 typecheck 与全量 Jest。

## 1. 总体结论

**C-Core 六项任务实现完整、质量高，上轮 review 的问题（M1–M5、L1/L2/L3/L6/L7/L8）已实质归零；验收证据经本机独立复验属实。发现 1 个应进入 C-Extended 的设计缺口（手动媒体操作与 durable 双写路径并存）和若干轻微清理项，均不阻塞 D-Core。可以进入 D-Core Task 1。**

## 2. 上轮问题归零核对

| 编号 | 上轮问题 | 状态 | 证据 |
|---|---|---|---|
| M1 | 迁移无列演进、只支持单级 4→5 | ✅ 归零 | `migrations/runner.ts` 显式 step 表（v5Registry/v6DurableExecutor）+ while 逐级推进 + `migration step missing` 守卫；`v6DurableExecutor.ts` 用 `hasColumn` + `ALTER TABLE ADD COLUMN` 真实列演进，并回填 `provider_handle_json ← remote_json`、`last_error_json ← error_json`。本机独立复验 v5→v6 列演进 + 数据回填 PASS |
| M2 | 生产备份未接线 | ✅ 归零 | `storage/backup.ts` 经 `backupDatabaseSync` 生成 `autodl-h3-v{from}-to-v{to}-{ts}.backup.db`；`databaseClient.ts` 传入 runner；备份失败 → markRecovery + `AppMigrationError`；模拟器 v4/v5 fixture 验收记录了实际备份文件 |
| M3 | 只读恢复未产品化 | ✅ 归零 | `databaseClient` 捕获 `AppMigrationError` → `DatabaseStartupState`（writable/legacy/readonly+allowReset）；`DatabaseRecoveryScreen` 渲染诊断（future 版本禁止 reset）；`readOnlyWrites.test.ts` 验证 recovery 状态下 tasks/media/jobs/drafts/threads/registry/lease 全部拒写、读不受限；启动不再 import 崩溃 |
| M4 | DDL 所有权分裂 | ✅ 归零 | `storage/schema.ts` 唯一 owner；`schemaOwnership.test.ts` 全 src 扫描 CREATE/ALTER，白名单仅 schema.ts/recovery.ts/两个 migration step；tasks/jobs/media/scheduler 构造函数 DDL 全部移除 |
| M5 | 下载总超时 30s vs 2GB | ✅ 归零 | `downloadPolicy.ts` 重构为 `connectTimeoutMs` + 逐块 `idleTimeoutMs`（`timeoutMs` 标记 deprecated）；manifest 同步更新；大文件不再受总时长限制 |
| M6 | 动态公网节点开放度过大 | ⏸ 按计划保留 | handoff 明确挂 C-Extended；现状与声明一致 |
| L1 | stale downloaded 投影 | ✅ 归零 | `reconciliation.ts` 每轮 sync 校验文件存在性并修复 tasks/media_assets 投影（带分页 cursor + 上限 32） |
| L2 | export_status 存中文文案 | ✅ 归零 | DB 只存 `QUEUED/EXPORTING/EXPORTED/EXPORT_FAILED` 与错误码；中文仅在 `gallery/presentation.ts` |
| L3 | remove/delivery 无事务 | ✅ 归零 | `tasks/repository.ts:72-98` remove 事务化 + 活动操作 fence（`TASK_OPERATION_IN_PROGRESS`）+ 排除 CAS 路径的文件删除（归 GC 管）；export store 四个操作全部事务化 |
| L4 | registry upsert get→insert 竞态 | ◐ 残余 | 未改动；单进程写 + `installAndActivate` 事务化使实际风险很低，保留观察 |
| L5 | resolveArtifactRedirects 死代码 | ✗ 仍存在 | `downloadPolicy.ts:167-188` 仍为 test-only 且用全局 fetch；建议删除 |
| L6 | lease TTL 120s 不续约 | ✅ 归零 | `scheduler.ts` 加 heartbeat（ttl/3）+ `assertOwned`/`renew` fence，失租抛 `SCHEDULER_LEASE_LOST` |
| L7 | submit 异常一律 UNKNOWN | ✅ 归零 | `errorPolicy.ts`：auth/4xx/provider → TERMINAL；SUBMIT 网络/超时 → UNKNOWN；STATUS/ARTIFACT → RETRYABLE（指数退避封顶 60s） |
| L8 | coordinator 无 CAS/lease | ✅ 归零（被取代） | durable executor 用 revision CAS + operation lease；但旧 `coordinator.ts`/`mediaQueue.ts` 成为死代码（见 New-2） |

## 3. C-Core 核心实现审查（正面确认）

- **Operation repository**（operationRepository.ts）：幂等 `enqueue`（INSERT OR IGNORE + 按 `(kind, idempotency_key)` 回读，重复键返回既有 operation）；`claimDue` 在 `BEGIN IMMEDIATE` 内原子 claim；renew/release/retry/finish 全部 owner 守卫；`recoverExpired` 将过期 SUBMIT 隔离返回给对账（绝不自动重置重提）。本机复验幂等去重 PASS。
- **Job state repository**（jobStateRepository.ts）：`transition` 单事务内 revision CAS + 事件插入（`UNIQUE(job_id, sequence)`）+ artifact 替换 + next operations 入队；冲突返回当前 snapshot。`createWithEventAndOperation` 事务化防重复建 job。
- **Durable executor**（durableExecutor.ts）：`queueSubmission` 幂等（`submit:<submissionId>`）；handle 已存在时的 SUBMIT 重放只 reconcile 不重提；SUBMITTING 无 handle → UNKNOWN → `BLOCKED`，仅 `createReplacementAttemptAfterConfirmation` 显式确认后可创建全新尝试；`recover` 处理四类中断（PENDING/SUBMITTING/handle 已存/终态）。
- **Artifact CAS**（cas.ts + artifactOperation.ts）：流式 SHA-256、`.part` 按 `SHA256(operationId+attempt)` 隔离、新 attempt 清理旧 part、每块写入与发布前 `assertLease` 续租、同 hash 去重、move→copy 竞态处理、发布后字节复核、失败清理；commit 在单事务内完成 blob+ref+media/tasks 投影+EXPORT 入队+operation SUCCEEDED；GC 引用安全（removeBlobIfUnreferenced + restoreBlob 回滚）。
- **Export operation**（exportOperation.ts）：源校验（仅私有 file://）、瞬态失败重试、成功提交事务化；`keepPrivateCopy=false` 时释放 blob 引用交 GC。
- **Tick/Cycle**（tick.ts/cycle.ts）：每轮 maxOperations（默认 8，上限 32）、lane 公平（SUBMIT/STATUS/ARTIFACT/EXPORT，并发 1/4/1/1）、单 inFlight、recover 先行、readonly 跳过、cycle 预算封顶。
- **UI 接线**：CreateForm 经 `queueCreateFormSubmission` 走 durable 入队 + provenance 双查 active registry 记录；任务列表/详情删除均有活动操作 fence。

## 4. 本轮新发现

**New-1（Important，建议 C-Extended 收口）：手动媒体操作与 durable executor 双写路径并存**
- `app/(tabs)/tasks.tsx:75,90` 与 `app/video/[id].tsx:85` 仍直接调用旧路径 `ensureTaskDownloaded`/`exportTaskVideo`（tasks/media.ts：直接写 projections、直接 `exportVideo`、不经 CAS 与操作账本），而 executor 走 `ARTIFACT_DOWNLOAD`/`EXPORT` 操作写同一批行。
- 后果：a) 交错时 last-writer-wins（操作 lease 不覆盖手动路径的 `withTaskMediaLock`）；b) 手动重下会改变 `task.local_uri` 使 CAS blob 引用与实际指向脱节，ref 仅在导出（不保留私有副本）或任务删除时释放，期间 blob 无法 GC（有界磁盘滞留）；c) `media_deliveries` 单例检查只存在于 durable 路径。
- 建议：C-Extended 将手动动作改为向 executor 入队（复用幂等键），或在手动路径前置 claimed-operation 检查。

**New-2（Minor）：死代码**：`tasks/coordinator.ts`、`tasks/mediaQueue.ts` 及其测试已无生产引用（sync.ts 已改走 executor cycle），应删除避免误导后续接手者。

**New-3（Minor）：UNKNOWN 显式重提无 UI 入口**：`createReplacementAttemptAfterConfirmation` 仅测试引用；当前 UNKNOWN 只能靠原 handle 对账自然收敛。符合"禁止自动重提"约束，但需在 D-Core/D UI 规划显式确认入口。

**New-4（Minor）：重试分类与错误文案耦合**：`artifactOperation.ts:164` 用消息正则（`/连接超时|空闲超时|network|fetch failed|CAS_GC_IN_PROGRESS/i`）判定 RETRYABLE；downloadPolicy 文案变更会静默把可重试错误变成 terminal FAILED。建议错误携带结构化 code。

**New-5（Cosmetic）**：`durableExecutor.ts:194-195` handleStatus 先 `finish(SUCCEEDED)` 再检查 transition 结果，CAS 冲突时该 op 仍计 succeeded（poll 本身已完成，语义可接受）。

**New-6（Observation）**：tick 的 `dueSnapshot` 对每个 kind 全表 `list()` 后内存过滤；已建 `idx_workflow_operations_due` 但未用于查询。本地规模无碍，D-Core 数据量增大时改为 SQL 过滤。

**New-7（Observation）**：reconciliation 借用 `app_scheduler_leases` 行存分页 cursor（owner 列存 JSON、expires_at=now）——语义复用略 hacky 但无害；建议 D-Core 若引入 KV 需求时单列表。

## 5. 验收证据核对

| 声明 | 本机复验结果 |
|---|---|
| typecheck PASS | ✅ PASS（0 error） |
| Jest（C-Core 记录 99 suites/462 tests；stabilization 记录 104+1/520+2） | ✅ 当前 HEAD：105 suites passed + 1 skipped（phase-gated `recoveryProcessAcceptance`），523 passed + 2 skipped — 与两次记录间的增量提交一致 |
| 迁移矩阵 14/14 | ✅ 本机独立抽查 5 项全部 PASS（fresh v0 全 schema+registry+operations 可用；v5→v6 列演进与 remote_json/error_json 回填；legacy v1 不动；future mode；幂等键去重） |
| 跨进程恢复 10/10 | ✅ `recoveryProcessAcceptance.test.ts` 独立 seed/recover 双进程设计存在且 phase-gated（默认 skip 需外部驱动，与文档一致） |
| Android/模拟器 | ✅ C-Core 验收记录完整（短路径 worktree、JDK 21、fresh/v4/v5 升级、`user_version=6`、备份文件、fatal scan 0）；⚠️ stabilization 的 5 个设备场景因已知 CMake 路径问题 PENDING（文档如实记录，需短路径 checkout 补做） |
| DDL/secret 扫描 | ✅ schemaOwnership.test 在套件内常驻执行；secret 扫描记录仅 fake/canary 命中 |
| 发布链 | ✅ `v1.4.8^{}` = `e167cd4e`（PR #22 merge），`app.json` 1.4.8，Release 已发布 |

## 6. 准入建议

1. **D-Core Task 1 可以开工**（v7 migration 基于 v6 runner 扩展 step 即可，基础设施已就绪）。
2. 进入 D 前建议完成的小收口（不阻塞）：删除 New-2 死代码；补 stabilization 的 5 个模拟器场景（短路径 checkout）。
3. 带入 C-Extended backlog：New-1（手动媒体动作统一入队）、M6（动态节点收紧）、New-3（UNKNOWN 显式重提 UI）、New-4（错误结构化）。
4. D-Core 验收沿用既定门禁：断网创建/编辑、迁移失败只读恢复、诊断脱敏、legacy 保留、全量回归 + fresh/v6 升级模拟器路径。
