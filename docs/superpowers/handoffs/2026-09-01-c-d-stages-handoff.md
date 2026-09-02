# A/B 闭环与 C/D 阶段交接

> 更新时间：2026-09-02
> 交接基线：`main` 与 `dev` 同步于本文所在提交；固定发布基线 `v1.4.5` 指向 `e69c7fd274b1c8d6c6251bff820f020083ffad0b`。

## 1. 接手后先看什么

1. 本文件：当前状态、验收证据和 C/D 执行顺序。
2. `docs/superpowers/plans/2026-09-01-c-core.md`：C-Core 唯一执行计划。
3. `docs/superpowers/plans/2026-09-01-d-core.md`：C-Core 验收通过后的 D-Core 计划。
4. `docs/superpowers/specs/2026-09-01-local-first-workflow-architecture-design.md`：不可突破的架构约束。

下一项具体动作：先在 Android 设备上完成 B 热修复的带凭据验收（见第 4 节「B 发布热修复」待执行项）；验收通过后，再从 `dev` 创建隔离 worktree，为 C-Core Task 1（版本化 durable schema migration）写真实 SQLite RED 测试。

## 2. 当前发布与分支状态

- v1.4.5 发布时 `main`、`dev`、`origin/main`、`origin/dev` 均指向同一交接提交；此后 B 发布热修复（见第 4 节）提交在本地 `dev`，尚未合并回 `main` 或推送。
- `v1.4.5` 标签已推送，GitHub Release 已创建：<https://github.com/czh869452912/autodl_minimax_h3/releases/tag/v1.4.5>。
- Release 资产：`AutoDL-H3-v1.4.5-apk-universal.apk`。
- 正式发布 Actions 运行 `33523226885` 成功：类型检查、单元测试、签名 universal APK、四 ABI、`apksigner` 和 Release 创建均通过。
- 主工作区当前在 `main`，工作区应保持干净；用户本地 `local.properties` 必须继续保持未提交、未修改。
- 已保留的 `.worktrees/codex-b1-closure` 是既有工作目录，不要擅自删除。

## 3. 阶段 A：架构与边界闭环

阶段 A 的结论已固化在本地优先架构设计中：

- SQLite、任务队列、Workflow Registry、项目/资产索引和应用私有文件是唯一权威状态。
- 不引入业务后端、云端数据库、云端队列、webhook receiver、Temporal/Argo 或对象存储。
- 外部网络只允许用户配置的 LLM/生成 API，以及用户明确批准的固定 Git 仓库。
- Git 内容只能作为签名的声明式 workflow 数据；禁止下载/执行脚本、JavaScript、插件二进制、动态 adapter 或任意 URL。
- provider adapter 必须随审核过的应用版本发布；`UNKNOWN` 状态只能使用原始 provider handle 对账，不能默认重新提交。
- PromptRevision、AssetVersion、WorkflowPackage、WorkflowJob 均为不可变语义；编辑只能产生新版本。

阶段 A 没有待补的产品后端工作；后续 C/D 实现必须以这些约束为门禁。

## 4. 阶段 B：Workflow Kernel 与 B.1 安全可靠性闭环

### 已交付

- `WorkflowPackage` envelope、canonical hash、签名/能力/限制边界和危险 JSON Pointer 校验。
- Registry 的 immutable `(workflowId, version, contentHash)` 记录、`active/previous` 指针、回滚、兼容性检查和 builtin bootstrap。
- 固定 Git 仓库/ref/commit 的 Ed25519 `commit-attestation` 校验；远程内容不执行代码。
- Runtime provenance 校验：提交前必须匹配 active workflow 的 id/version/content hash，job 固化 workflow provenance 与 adapter version。
- provider artifact 默认拒绝空 allowlist；AutoDL host allowlist、HTTPS、状态码、MIME、超时、重定向和大小限制已接线。
- artifact 采用单一有界读取路径、手动重定向、`.part` 失败清理，避免先写后验和超大响应耗尽磁盘。
- Registry fetch 同样具备逐跳 allowlist、最多三跳重定向和 body timeout。
- Registry schema 已纳入事务 migration/recovery；不再由 repository 构造函数独立建表；旧表保留。
- SQLite 保留字问题已修复，provenance 使用 `commit_sha`。

对应闭环提交包括：

`f3456dc0`、`8bfea500`、`ce85ea57`、`45098948`、`d042d98b`、`5af595db`、`e62f09d9`、`c26ca47d`、`7f2d197a`、`196d27da`、`ce87b4e0`、`a884dfa5`、`49b8c50c`、`13dcd3c9`、`30895e06`、`23d7eabe`，最终由 `e69c7fd2` 发布合并。

### B 阶段验收证据

- `cd mobile; npm run typecheck`：通过。
- `cd mobile; npm test -- --runInBand`：82 suites 通过，318 tests 通过，1 skipped，0 failed。
- 主工作区 Android：使用 Temurin JDK 21 和匹配模拟器 ABI 执行 `:app:assembleDebug -PreactNativeArchitectures=x86_64`，`BUILD SUCCESSFUL`。
- `emulator-5554`：Debug APK 安装成功，`MainActivity` 冷启动成功，`adb logcat -b crash` 未发现 NativeDatabase/SQLite/SoLoader 崩溃。
- 用户已在 Android Studio 完成冒烟测试并确认通过。
- v1.4.5 hosted release workflow：signed APK 构建、版本号、`arm64-v8a`/`armeabi-v7a`/`x86`/`x86_64`、`apksigner verify` 和 GitHub Release 均通过。

### B 的有意保留项（不是本轮阻塞）

- builtin 当前只有 H3；CreateForm 仍默认使用 `records[0]`，多 workflow 选择器属于 D/UI 工作。
- renderer 主要覆盖扁平字段；复杂嵌套 JSON Pointer、条件 UI、附件 semantic binding 以后补齐。
- 当前 Git 验证是设备端 Ed25519 `commit-attestation`，不是原生 GPG/SSH `git verify-commit`；原生 verifier 作为未来可替换实现。
- AutoDL 仍是 POST 提交 + GET 轮询；不能假设其 wrapper 具备 ComfyUI WebSocket、上传、队列或取消语义。
- 当前 `workflow_jobs` 仍是 snapshot，不是完整 durable Operation/Event executor；这正是 C-Core 的起点。

### B 发布热修复：媒体并发与导出（2026-09-02）

针对 v1.4.5 发布后发现的三个回归（并发事务干扰、同步快照覆盖本地媒体状态、导出误报 `域名不在允许列表`），按 `docs/superpowers/plans/2026-09-02-b-release-media-concurrency-hotfix.md` 执行完毕，设计与边界见同名 spec。修复内容：

- **独占事务**：`replaceArtifacts` 改用 Expo SQLite `withExclusiveTransactionAsync`，所有语句经由事务对象执行，消除并发 `cannot rollback - no transaction is active`；Jest/非原生环境保留同步事务 fallback（`bdb1c1bf`）。
- **Workflow 投影所有权**：新增 `upsertWorkflowProjection`，同步仍持久化完整 Workflow 字段（状态、artifact URL、计时、provenance、sync 元数据），但冲突更新只写 Workflow 拥有的列，`local_uri`/下载/导出等媒体列不被旧快照覆盖（`af3cc8f4`）。
- **物化非破坏性合并**：`upsertArtifactProjection` 用 `COALESCE`/`CASE` 合并 artifact 元数据，已下载资产的 `local_path`、poster、`downloaded` 状态和导出状态不会被远程刷新降级（`259f2b47`）。
- **私有文件解析与修复**：新增 `resolveLocalVideoSource`，按 asset `localPath` → task `localUri` → 确定性私有路径 `documentDirectory/media/<taskId>.mp4` 顺序验证文件存在性，远程 URL 永不作为本地导出源（`c40c5ef3`）。
- **详情/导出收敛**：详情页加载时解析并修复本地媒体投影，`已下载` 标签基于验证后的有效本地源；有私有文件时直接导出到相册、不再走远程校验；失败时展示 `保存失败` 与真实错误；手动重试下载/导出通过 `getBuiltinArtifactDownloadPolicy` 获得与自动投递一致的 fail-closed 策略（`e6cec99d`）。

热修复验收证据（2026-09-02，主工作区）：

- `cd mobile; npm run typecheck`：通过。
- `cd mobile; npm test -- --runInBand`：83 suites 通过，332 tests 通过，1 skipped，0 failed（基线为 82 suites / 318 tests，新增 14 个热修复回归测试全部转绿）。
- `git diff --check` 通过；`local.properties` 保持未跟踪、无 diff。
- Android：JDK 21（`jbr-21.0.11`）+ `x86_64` 执行 `:app:assembleDebug -PreactNativeArchitectures=x86_64`，`BUILD SUCCESSFUL`；`emulator-5554` 安装成功、`MainActivity` 冷启动并进入前台（pid 存在、`topResumedActivity`）；`adb logcat -b crash` 中仅有模拟器预存的 `com.google.android.bluetooth` 系统崩溃，无 `com.example.autodlh3` 应用崩溃。
- **待用户执行的设备验收**：双任务同一轮询窗口并发完成且无 NativeDatabase 事务错误、两个私有下载完成、详情页显示 `已下载`、手动导出到 `Movies/AutoDL-H3`、自动导出投递、存在私有文件时两类导出均不报告 `域名不在允许列表`。该项完成前 **C-Core/D-Core 保持阻塞**。

## 5. C 阶段：C-Core Durable Local Executor

C 的目标是：submit、status sync、artifact download 变成可跨进程恢复的数据库 operation，在网络超时或进程被杀时不重复产生可能计费的 provider 任务。

执行顺序（详见 `docs/superpowers/plans/2026-09-01-c-core.md`）：

1. **Task 1：版本化 schema migration** — 当前 B.1 已占用 schema v5，C 必须提升到 `APP_SCHEMA_VERSION=6`；新增 `workflow_operations`、`workflow_job_events`，为 job 增加 revision、provider handle、last error、next sync；事务、备份、可重复 migration 和 read-only recovery 必须先有 RED 测试。
2. **Task 2：Operation/Lease/CAS repository** — 稳定幂等键、唯一约束、claim/renew/release、过期 lease 回收、`nextRetryAt` 过滤、revision/CAS 冲突返回当前 snapshot。
3. **Task 3：Durable submit 与 UNKNOWN 对账** — `VALIDATED → SUBMITTING → QUEUED/RUNNING` 事件化；超时进入 `UNKNOWN`，只用 opaque provider handle reconcile，禁止自动 resubmit。
4. **Task 4：有界 Artifact CAS** — SHA-256 内容寻址、`.part`、原子 rename、hash/MIME/字节/超时限制、引用安全 GC；status snapshot 不等待媒体下载。
5. **Task 5：有界调度与进程恢复** — foreground/background/headless 统一 tick，每轮有界 operation 数量，status/download/export 独立 lease，进程启动回收过期 lease。
6. **Task 6：C-Core 验收** — duplicate submit、lease contention/expiry、UNKNOWN reconciliation、CAS conflict、restart recovery、bounded queue 自动化测试，加 Android force-stop 恢复验证。

C-Core 通过前不得开始 D 的 Project UI 或产品域迁移。每个 task 单独提交，遵守 RED → GREEN → REFACTOR；使用隔离 worktree，不直接在 `dev` 上开发。

C-Core 明确不做：完整 foreground service、MediaStore delivery/delete、Batch/Variant、成本策略、原生 ComfyUI 语义和复杂 workflow UI；这些属于 C-Extended 或 D。

## 6. D 阶段：D-Core Product Domain

D 只在 C-Core 的 job/artifact snapshot 稳定后开始，目标是建立离线可用、版本不可变且可追溯的创作项目模型：

`Project → PromptRevision → Asset/AssetVersion → WorkflowJob → Delivery`

执行顺序（详见 `docs/superpowers/plans/2026-09-01-d-core.md`）：

1. **Task 1：v7 migration + legacy projection** — C-Core 使用 v6 后，D 提升到 `APP_SCHEMA_VERSION=7`；新增 `projects`、`prompt_revisions`、`assets`、`asset_versions`、`project_links`；保留旧 `tasks`/media 表，旧任务只作为 read-only projection。
2. **Task 2：Project/PromptRevision repository** — 离线创建、归档、游标分页、同项目 parent 校验、稳定 content hash；历史 revision 不更新。
3. **Task 3：Asset/AssetVersion + CAS 引用** — 同 hash 去重、不可变 metadata、project/job/delivery 引用计数、活跃引用阻止 GC。
4. **Task 4：显式 Project links** — 关联现有 WorkflowJob/Delivery snapshot，保留 workflow id/version/hash provenance，不回写历史 job。
5. **Task 5：最小离线 Project UI** — 只调用 domain repository，展示 prompt revision、asset 和 job provenance；不在此阶段加入 Batch/Variant 或导出 UI。
6. **Task 6：D-Core 验收** — 断网创建/编辑/查看历史、迁移失败 read-only recovery、诊断脱敏、旧 tasks 保留、全量 Jest/typecheck/emulator 回归。

D-Core 之后再规划 Batch/Variant、项目包导出/导入、备份/同步/协作；不得反向破坏本地权威模型。

## 7. 通用门禁与陷阱

- 所有后续 schema 变更必须提升明确版本，在事务内可重复执行；migration 前保留备份；失败进入 read-only recovery；普通升级不得 DROP legacy 表。
- 新 SQL 标识符避开 SQLite 保留字；DDL 至少做一次真实 SQLite/emulator 验证，不能只依赖 Jest mock。
- 每个提交前运行：

  ```powershell
  cd mobile
  npm run typecheck
  npm test -- --runInBand
  git diff --check
  git status --short
  ```

- Android 变更需使用 JDK 17/21 与目标 emulator ABI 匹配的构建；隔离 worktree 的 CMake/Ninja 绝对路径失败是已知环境问题，Android 证据应从主工作区或干净短路径工作区采集。
- 不要使用 `--forceExit` 掩盖真实测试资源泄漏；当前 desktop runner 的残留仅为 stdio handle，hosted CI 已通过。
- 不要重提 `UNKNOWN` provider job；先对账原始 handle。
- 不要把 C/D 合并成一次性大重构，也不要在 C-Core 门禁通过前引入 D 的产品 UI。

## 8. 下一次接手的执行清单

1. `git status --short --branch`，确认 `main`/`dev` 状态，不要改动 `local.properties`。
2. 确认 B 热修复（第 4 节）的设备验收已由用户在带凭据设备上完成并补记证据；未完成前不得开始 C-Core。
3. 验收通过后，从 `dev` 创建 `codex/c-core-schema` 隔离 worktree。
4. 阅读 `docs/superpowers/plans/2026-09-01-c-core.md` Task 1 和现有 `mobile/src/storage/database*` 实现。
5. 先写真实 SQLite migration RED 测试：repeatable migration、legacy table 保留、注入 DDL 失败后 rollback + recovery state。
6. 运行 focused Jest 看到预期失败，再实现 `runner.ts`/`v6DurableExecutor.ts`，随后运行 typecheck、全量 Jest 和 Android 门禁。
7. 完成并记录 C-Core Task 1 后，才继续 Task 2；C-Core 全部验收通过后再切换到 D-Core Task 1。

交接结论：A/B 已闭环并以 v1.4.5 发布；B 发布热修复（媒体并发与导出）已完成实现与自动化验收并提交在 `dev`，剩余带凭据双任务并发与手动/自动相册导出的设备验收待用户执行，验收通过并补记证据前 C-Core/D-Core 保持阻塞。
