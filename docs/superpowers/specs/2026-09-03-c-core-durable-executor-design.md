# C-Core Durable Local Executor 设计

> 日期：2026-09-03
> 状态：已完成设计讨论，等待书面规格复核
> 基线：`dev` 分支 `16194f34`，应用版本 1.4.7，schema v5

## 1. 目标

C-Core 将现有的直接 submit、轮询和下载调用改造成 SQLite 驱动的 durable operations。应用在网络超时、后台调度重入或进程被杀后能够恢复工作，同时绝不因为无法确认远端提交结果而自动创建第二个可能计费的 provider 任务。

完成后，SQLite 中的 job snapshot、append-only event、operation queue 和应用私有文件是唯一权威状态。UI 只读取 snapshot/projection，不依赖内存锁或扫描事件日志重建当前状态。

## 2. 范围和非目标

本设计覆盖六个顺序执行的 C-Core 任务：v6 migration、Operation/Lease/Job CAS repository、durable submit 与 UNKNOWN 对账、Artifact CAS、有界调度及发布级验收。

C-Core 不实现完整 Android foreground service、MediaStore delivery/delete 重构、Batch/Variant、成本策略、原生 ComfyUI 队列/取消语义、复杂 workflow UI 或动态 provider 主机授权收紧。动态主机权限收紧保留给 C-Extended；D-Core 继续受 C-Core 完整验收门禁约束。

## 3. 方案选择

采用依赖门禁式六任务方案，保留现有 Task 1→6 顺序，但重写为可独立验收的 TDD 单元。

未采用垂直切片方案，因为先打通 submit 全链路会迫使后续 Task 2/4 再次修改 schema 和持久化接口。未采用只修补旧计划的方案，因为旧计划没有给出完整测试代码、精确文件职责、生产备份接线、启动 recovery 数据流和 CAS schema，无法直接安全执行。

## 4. 架构边界

### 4.1 存储与启动

`mobile/src/storage/schema.ts` 成为所有 app-owned tables 和 indexes 的唯一 DDL owner。Task、job、media、registry、draft、thread 和 scheduler repository 构造函数不再创建表或索引；它们只接收已经初始化的数据库句柄。

`mobile/src/storage/migrations/runner.ts` 按 `fromVersion` 逐级执行 migration，不允许跳级盖版本号。v4→v5 固化当前 registry 加性迁移，v5→v6 引入 C-Core 完整 schema。fresh v0 直接创建当前 v6 schema；含任意 app-owned table 的 legacy v0 保持确认门，不自动 stamp 或覆盖。

非 fresh migration 在事务开始前调用生产备份实现。备份使用 Expo SQLite 的备份 API 写入应用私有数据库目录，文件名带来源版本、目标版本和时间戳。备份失败时不得开始 migration。

Migration 失败时事务回滚，随后写入脱敏 recovery marker 并抛出 typed error。`databaseClient` 捕获该错误、保留数据库句柄和 recovery 状态；RootLayout 展示只读恢复页，不加载会写数据库的业务导航。恢复页允许复制或分享脱敏诊断、退出应用，以及经二次确认后执行现有 reset；不得默认清库。所有 repository 写方法统一调用 write guard，读方法仍可用于诊断导出。

### 4.2 v6 数据模型

v6 一次性建立 C-Core 后续任务需要的全部 schema，避免 Task 4 再以无版本 DDL 偷渡 CAS 表：

- `workflow_operations`：operation id、kind、job/owner id、稳定 idempotency key、payload、state、attempt、next retry、lease owner/expiry、last error、created/updated timestamps；`(kind, idempotency_key)` 唯一。
- `workflow_job_events`：event id、job id、递增 sequence、event type、payload、created timestamp；`(job_id, sequence)` 唯一，只允许 append。
- `artifact_blobs`：SHA-256、字节数、MIME、相对私有路径、创建/校验时间。
- `artifact_blob_refs`：blob hash、owner type、owner id、创建时间；复合主键防止重复引用，并作为 GC 的引用依据。
- `workflow_jobs` 增加 `revision`、`provider_handle_json`、`last_error_json`、`next_sync_at`。迁移将现有 `remote_json`/`error_json` 回填到新列；旧列保留兼容，不 DROP。

Operation state 使用 `PENDING | CLAIMED | SUCCEEDED | FAILED | BLOCKED`。`UNKNOWN` 是 job 的业务状态，不与 operation state 混用。Operation kind 初始为 `SUBMIT | STATUS_SYNC | ARTIFACT_DOWNLOAD | EXPORT`；C-Core 中 EXPORT handler 可以保持受测 no-op，但其 lease lane 必须独立。

### 4.3 Repository 与并发

Operation repository 负责幂等创建、due query、原子 claim、renew、owner-safe release 和过期 lease 回收。重复 `(kind, idempotencyKey)` 返回既有 operation，不抛裸 UNIQUE 错误。

Job state repository 使用 `revision` 做 compare-and-swap。每次成功转换令 `revision + 1`，对应 event 的 sequence 等于新 revision；同一事务内更新 job snapshot、追加恰好一个 event，并按需创建下一 operation。CAS 冲突返回当前 snapshot，调用方重新决策，不能覆盖较新状态。

Lease 使用调用方注入的 epoch-millisecond 时间和显式 owner。过期 claim 可以被回收；未过期 claim 不能被其他 owner 抢占；renew/release 必须同时匹配 operation id 和 owner。所有 handler 使用 `try/finally` 释放仍属于自己的 lease。可重试错误增加 attempt、设置退避后的 `next_retry_at` 并回到 `PENDING`；确定性失败进入 `FAILED`；需要人工决策的状态进入 `BLOCKED`。

### 4.4 Durable submit 与 UNKNOWN

CreateForm 不再直接调用 provider。它先完成 provenance/definition/input 校验，再以一次本地事务创建 job、`VALIDATED` event 和 SUBMIT operation，并立即返回可展示的 snapshot。前台入口随后触发一次有界 tick；进程在远端请求前退出时，PENDING operation 可安全恢复。

SUBMIT handler 在发起网络请求前以 CAS 将 job 转为 `SUBMITTING` 并追加 event。provider 返回 opaque handle 后必须先持久化 handle，再安排 STATUS_SYNC。已获得 handle 的 job 后续只能调用 status/reconcile，绝不能重新 submit。进程在 job 已进入 `SUBMITTING` 后退出时，即使无法证明请求已经发出，lease recovery 也必须按不确定结果处理，不能回到可提交的 `PENDING`。

错误分类如下：

- auth、schema、明确的非重试 4xx：job `FAILED`，SUBMIT operation `FAILED`。
- 网络、timeout、5xx 或响应无法证明远端未创建任务：job `UNKNOWN`。
- UNKNOWN 且已有 handle：SUBMIT operation 结束，创建 STATUS_SYNC operation，用原 handle 对账。
- UNKNOWN 且没有 handle：SUBMIT operation `BLOCKED`，不创建自动 submit retry。C-Core 暴露显式的“确认风险后创建新尝试”领域动作；新尝试使用新的 job/operation id，并保留原 UNKNOWN job 与审计事件。

AutoDL 当前没有服务端 idempotency key 或按客户端请求 ID 查询能力，因此本地稳定幂等键只能阻止本应用重复执行，不能把无 handle 的不确定提交伪装成可安全重试。

### 4.5 Artifact CAS

Status handler只更新 job/artifact snapshot并创建 ARTIFACT_DOWNLOAD operation，不等待媒体下载。下载写入应用私有 `cas/sha256/<prefix>/<hash>`；未知 hash 时先写随机 `.part`，流式计算 SHA-256，完成所有检查后再原子发布。

下载逐跳执行 HTTPS、凭据、私网/保留地址和 provider policy 校验。限制包括 MIME、Content-Length、实际字节数、最大重定向数和逐块 idle timeout。移除与 2GB 上限冲突的固定 30 秒总 deadline；仍允许调用方配置独立的连接超时和 idle timeout。

发布事务写入 blob metadata、artifact reference 和兼容 media projection。同 hash 并发下载只保留一个最终 blob；失败清理 `.part`。GC 只删除没有 `artifact_blob_refs` 的 blob，并在删文件成功后删除 metadata；活跃引用永远阻止回收。

### 4.6 有界调度与恢复

foreground、Expo background task 和未来 service 入口统一调用 `runExecutorTick({ reason, maxOperations })`。Tick 先回收过期 lease，再只查询到期 operation；不会遍历全部 job 或 event。

SUBMIT、STATUS_SYNC、ARTIFACT_DOWNLOAD 和 EXPORT 使用独立 lane，避免大文件下载阻塞状态同步。每轮处理总数受 `maxOperations` 限制，各 lane 也有并发上限。Handler 完成后创建的新 operation 留给下一 tick，保证单轮工作量有严格上界。

应用启动、回到前台和 background callback 都可触发 tick。进程中断后，未 claim、已到期或 lease 过期的 operation 恢复；未过期 operation 不重复执行。UNKNOWN 的恢复仍遵守“有 handle 只对账、无 handle 保持 BLOCKED”。

## 5. 六项交付边界

1. Task 1 只交付 schema、migration、backup、recovery 和 DDL ownership，不接远端调用。
2. Task 2 只交付 operation/job/event repository 和 lease/CAS 原语，不改变 CreateForm 提交流程。
3. Task 3 将 submit/status 接入 durable executor，并完成 UNKNOWN/error classification。
4. Task 4 接入 CAS 下载、引用与 GC，同时保持 status snapshot 与下载解耦。
5. Task 5 替换现有 coordinator 入口为统一有界 tick并实现 restart recovery。
6. Task 6 不新增产品能力，只补齐自动化、Android migration/force-stop 证据和验收记录。

每个 Task 独立提交，执行 RED → GREEN → REFACTOR；Task 1 未通过前不得开始 Task 2，C-Core 验收未通过前不得开始 D-Core。

## 6. 测试与验收策略

数据库测试必须使用 `node:sqlite` 真库验证 DDL 和事务语义，至少覆盖 fresh v0、legacy v0、v4→v6、v5→v6、重复调用、列/索引存在、数据回填、备份先于 migration、备份失败、注入 DDL 失败回滚和 recovery marker 脱敏。

Repository 测试覆盖重复幂等键、并发 claim、lease expiry/renew/release owner mismatch、due filtering、CAS conflict 返回当前 snapshot、event sequence 唯一及事务回滚。

Executor 测试覆盖重复 submit、进程在请求前退出、handle 落库后退出、无 handle timeout、已有 handle reconcile、确定性失败、状态轮询重试和禁止 UNKNOWN resubmit。

CAS 测试覆盖 hash mismatch、MIME/Content-Length/实际字节上限、idle timeout、重定向、`.part` 清理、原子发布、same-hash dedupe、引用增减和 GC。Scheduler 测试覆盖总量上界、lane 隔离、过期回收、nextRetryAt、下一 tick 执行和多入口竞争。

每个 Task 运行 focused Jest 与 typecheck；Task 5/6 运行全量 Jest、typecheck 和 `git diff --check`。Android 验收使用受支持的 JDK 17/21 和匹配 ABI，在短路径工作区完成 fresh install、v4/v5 数据保留升级、创建任务、force-stop 后恢复以及无 SQLite/NativeDatabase 崩溃验证。

## 7. 安全与诊断

Recovery diagnostic 只保存错误类别、migration step 和安全消息，不记录 token、Authorization header、完整 provider payload、用户 prompt、文件内容或带查询参数的 URL。Operation/event error 同样通过统一 normalizer 落库。

Provider handle 是 opaque JSON，只由对应内置 adapter 解释。Executor 不拼接或执行 handle 中的 URL、脚本或插件。远端 workflow 仍只是签名声明式数据，不能改变应用内 adapter 代码与网络能力。

## 8. 文档落地

本设计获书面复核后，重写 `docs/superpowers/plans/2026-09-01-c-core.md` 为唯一 C-Core 执行计划，并同步 `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md` 中的入口、schema 和验收矩阵。原计划文件不并存第二份“权威计划”。
