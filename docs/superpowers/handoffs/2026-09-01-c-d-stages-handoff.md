# A/B 闭环与 C/D 阶段交接

> 更新时间：2026-09-03
> B 发布基线：`origin/main` 与 `v1.4.7^{}` 指向 `ad7110de87271285affc6750900a12bd0f36acdd`；`dev` 已合并该发布基线，本交接文档继续在 `dev` 维护。

## 1. 接手后先看什么

1. 本文件：当前状态、验收证据和 C/D 执行顺序。
2. `docs/superpowers/plans/2026-09-01-c-core.md`：C-Core 唯一执行计划。
3. `docs/superpowers/plans/2026-09-01-d-core.md`：C-Core 验收通过后的 D-Core 计划。
4. `docs/superpowers/specs/2026-09-01-local-first-workflow-architecture-design.md`：不可突破的架构约束。

下一项具体动作：v1.4.7 fresh-install 发布级热修复已经完成，B 对 C/D 的阻塞重新解除。现在从 `dev` 创建隔离 worktree，按 `docs/superpowers/plans/2026-09-01-c-core.md` 从 Task 1（版本化 durable schema migration）开始；第一批真实 SQLite RED 测试必须覆盖 fresh v0、legacy v0、v4→v6、v5→v6、失败回滚与 recovery。C-Core 验收完成前不得开始 D-Core。

## 2. 当前发布与分支状态

- 媒体并发与导出热修复先通过 PR #20 合并并以 `v1.4.6` 发布：<https://github.com/czh869452912/autodl_minimax_h3/pull/20>、<https://github.com/czh869452912/autodl_minimax_h3/releases/tag/v1.4.6>。
- 状态审查发现的 fresh-install registry 缺表问题随后通过 PR #21 合并回 `main`：<https://github.com/czh869452912/autodl_minimax_h3/pull/21>；merge commit 为 `ad7110de87271285affc6750900a12bd0f36acdd`。
- `v1.4.7` 标签与 GitHub Release 已发布：<https://github.com/czh869452912/autodl_minimax_h3/releases/tag/v1.4.7>。
- Release 资产：`AutoDL-H3-v1.4.7-apk-universal.apk`，大小 `164874442` 字节，SHA-256 `7307e5d51c052f1c62969c38cc18ad977acfa5fe7a19b4fe27a2d72a4bf18163`。
- 正式发布 Actions 运行 `33709797498` 成功：标签属于 `main`、版本一致、类型检查、单元测试、签名 universal APK、四 ABI、`apksigner` 和 Release 创建均通过：<https://github.com/czh869452912/autodl_minimax_h3/actions/runs/33709797498>。
- 2026-09-03 同步时，`origin/main` 与 `v1.4.7^{}` 均为 `ad7110de`；主工作区 `dev` 已合并该提交，并在其上更新本 handoff。
- 主工作区当前在用户指定的开发分支 `dev`；用户本地 `local.properties` 与 `mobile/.expo/` 必须继续保持未提交、未修改。
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

随后按修正设计 `docs/superpowers/specs/2026-09-02-b-release-media-hotfix-correction-design.md` 和修正计划 `docs/superpowers/plans/2026-09-02-b-release-media-hotfix-correction.md` 对崩溃 agent 留下的半成品进行了逐项复核和修复：

- task 媒体写入收敛为字段级、只更新既有记录的 `updateMediaProjection`；删除中的任务不会被迟到的下载回调重新插入，下载与导出字段也不会因旧的完整快照互相覆盖。私有源解析会逐个验证 asset、task 和确定性路径候选，并拒绝目录与零字节文件；任务列表、详情和结果列表都会修复失效的“已下载”投影。
- 下载重试会先清除未经验证的旧 `localUri`；Android 下载改用 Expo 原生 fetch 暴露真实响应头和 body，逐跳重定向继续执行安全校验，响应 MIME、大小、超时、`Content-Length` 和最终临时文件大小都在正式发布前验证。
- AutoDL adapter 明确允许 provider 返回的动态公开 HTTPS 产物节点，不再把近期 COS 节点写死进 allowlist；每次重定向都重新校验，HTTP、带凭据 URL、localhost、文本形式的私有/保留 IPv4 与 IPv6、危险重定向以及未明确声明为 `video/mp4` 的响应仍 fail closed。该动态能力只由内置 AutoDL adapter opt-in，其他 provider 仍要求固定 allowlist。
- 同一任务的自动投递、手动下载和手动导出共享串行锁，同一任务的重复下载还会合并为一个 in-flight operation，避免固定 `.part` 路径竞争和状态覆盖。
- Android 临时文件发布先尝试 rename，失败后使用 copy，并在发布目标处复核准确字节数；所有失败路径清理 `.part`，不会把不完整文件标为 `DOWNLOADED`。

最终收口提交为 `17e42a7e`（动态节点安全校验）、`35fcd240`（同任务媒体串行化与失效状态修复）、`a2dc207c`（验收记录）和 `1acfba9d`（版本提升至 1.4.6），通过 PR #20 的 merge commit `536934fc` 进入 `main`。

修正后验收证据（2026-09-02，主工作区）：

- `cd mobile; npm run typecheck`：通过。
- `cd mobile; npm test -- --runInBand`：84 suites 通过，364 tests 通过，1 skipped，0 failed；包括真实 node:sqlite 投影所有权、删除竞态、同任务媒体串行化、独占事务重叠、失效私有源修复、动态节点下载、IPv4/IPv6 地址边界、重定向、MIME、大小、超时和写盘完整性回归。
- `git diff --check` 通过；`local.properties` 与 `mobile/.expo/` 保持用户自有未跟踪状态、无修改。
- Android：Temurin JDK 17 + `x86_64` 执行 `:app:assembleDebug -PreactNativeArchitectures=x86_64`，`BUILD SUCCESSFUL`；`emulator-5554` 覆盖安装成功。实际截图和 UI 树确认任务队列可见、可交互，不是仅凭 pid 推断启动成功；WindowManager 对 `MainActivity` 报告 `isOnScreen=true`、`isVisible=true`；ReactNativeJS/AndroidRuntime error 过滤无本应用崩溃。（本机 Android Studio JBR 已升级为 25.0.2，当前 Gradle/Kotlin 不能解析该版本，因此验收固定使用受支持的 JDK 17。）
- 在保留真实任务数据的模拟器上，原先显示 `域名不在允许列表` 的 AutoDL COS 任务点击“重试”后变为 `已下载到应用`，并出现“保存到相册”；服务器 `Content-Length=1395282`，应用私有文件实际大小同为 `1395282` 字节，设备端 MD5 `7a3efcd47b9e824bccb14ae1657ce2fc` 与 COS ETag 一致。最终 APK 还先识别出另一个任务已丢失的私有文件，将虚假的“已下载”纠正为可下载状态；实际点击下载后文件为 `1378774` 字节，设备端 MD5 `a119b57cfc329064a338f55275fe47ba` 与 COS ETag 一致。用户提供的同类动态节点 URL 返回 `video/mp4` 和 `Content-Length=6661972`，策略无需增加固定节点域名即可接受。
- 用户已在带真实凭据的设备上完成剩余手动验收：双任务同一轮询窗口并发完成且无 NativeDatabase 事务错误、两个私有下载完成、详情页正确显示 `已下载`、手动导出到 `Movies/AutoDL-H3`、自动导出投递均成功；存在已验证私有文件时，两类导出均不再报告 `域名不在允许列表`。
- **B 阶段结论**：实现、自动化、模拟器、用户手动验收和 v1.4.6 正式发布均已完成，B 对 C/D 的阻塞已解除。B 的有意保留项仍按上文边界进入 C-Extended、D-Core 或更晚阶段，不在 C-Core Task 1 前追加新范围。

### B 发布热修复：fresh-install 数据库初始化（2026-09-03）

2026-09-03 的 A/B 阶段状态审查发现 v1.4.6 的发布级回归：全新 Expo SQLite 库从 `user_version=0` 启动时，`ensureAppDatabase` 只接受 v4→v5，导致 `workflow_registry` 永不创建，CreateForm builtin bootstrap 报 `no such table: workflow_registry`。该问题已按 `docs/superpowers/specs/2026-09-03-fresh-install-database-hotfix-design.md` 与同名 plan 完成独立 hotfix：

- 真正空的 v0 数据库现在在单一事务内创建当前完整 schema（包括 registry、active、jobs、artifacts、media、tasks、drafts、threads、scheduler lease 和 recovery），并写入 `user_version=5`；fresh 路径不执行无意义备份。
- legacy v0 确认门保留：只要存在任意 app-owned 表，包括仅有旧 `workflow_registry` 或 recovery 表，都不会被误判为空库或自动盖上 v5。
- 既有 v4→v5 的备份、事务、数据保留和失败 recovery 行为不变；reset 现在也会清理 recovery marker。
- 独立代码审查先发现“空库判定遗漏部分 app-owned 表”的 P1，修复后复审无阻塞问题。

v1.4.7 验收证据：

- `cd mobile; npm run typecheck`：通过。
- `cd mobile; npm test -- --runInBand`：84 suites 通过，371 tests 通过，1 skipped，0 failed；真实 node:sqlite 覆盖 fresh v0 全表初始化、重复调用、legacy tasks、registry-only legacy v0、v4 数据保留、registry 激活和 recovery reset。
- Windows 长路径 worktree 复现了已知 CMake/Ninja 路径限制；切到 `D:\wt\h147` 短路径后，最新 HEAD 的 x86_64 Debug APK `BUILD SUCCESSFUL`。
- `emulator-5554` 卸载旧包后全新安装并冷启动成功，CreateForm 实际可见；设备内 `files/SQLite/autodl-h3.db` 为 `user_version=5`，11 张 app-owned 表齐全，logcat 无 `no such table`、SQLiteException 或本应用崩溃。
- v1.4.7 正式发布工作流构建并验证四 ABI 签名 universal APK；下载后的资产版本为 `1.4.7 (17)`，APK Signature Scheme v2、RSA 4096 签名复核通过。

状态审查中的 migration 基础设施缺口没有被本次最小发布热修复越界解决，必须在 C-Core Task 1 明确完成：显式逐版本 migration step/列演进、生产备份接线、启动期只读 recovery 产品化，以及 DDL 单一所有权。下载总超时与 2GB 上限不匹配挂到 C-Core Task 4；动态 provider 公网节点权限收紧挂到 C-Extended，不阻塞 Task 1。

## 5. C 阶段：C-Core Durable Local Executor

C-Core 尚未开始；B 已解除阻塞，当前可立即进入 Task 1。

C 的目标是：submit、status sync、artifact download 变成可跨进程恢复的数据库 operation，在网络超时或进程被杀时不重复产生可能计费的 provider 任务。

执行顺序（详见 `docs/superpowers/plans/2026-09-01-c-core.md`）：

1. **Task 1：版本化 schema migration** — 当前 v1.4.7 已稳定在 schema v5，C 必须提升到 `APP_SCHEMA_VERSION=6`；新增 `workflow_operations`、`workflow_job_events`，为 job 增加 revision、provider handle、last error、next sync。必须实现显式逐版本 migration step 和真实列演进，接线生产备份，收敛 DDL 所有权，并让启动失败进入可诊断的只读 recovery，而不是 import 崩溃；fresh v0、legacy v0、v4→v6、v5→v6、重复 migration 和失败回滚必须先有 RED 测试。
2. **Task 2：Operation/Lease/CAS repository** — 稳定幂等键、唯一约束、claim/renew/release、过期 lease 回收、`nextRetryAt` 过滤、revision/CAS 冲突返回当前 snapshot。
3. **Task 3：Durable submit 与 UNKNOWN 对账** — `VALIDATED → SUBMITTING → QUEUED/RUNNING` 事件化；超时进入 `UNKNOWN`，只用 opaque provider handle reconcile，禁止自动 resubmit。
4. **Task 4：有界 Artifact CAS** — SHA-256 内容寻址、`.part`、原子 rename、hash/MIME/字节/超时限制、引用安全 GC；status snapshot 不等待媒体下载。
5. **Task 5：有界调度与进程恢复** — foreground/background/headless 统一 tick，每轮有界 operation 数量，status/download/export 独立 lease，进程启动回收过期 lease。
6. **Task 6：C-Core 验收** — duplicate submit、lease contention/expiry、UNKNOWN reconciliation、CAS conflict、restart recovery、bounded queue 自动化测试，加 Android fresh-install 创建任务、v4/v5 升级数据保留与 force-stop 恢复验证。

C-Core 通过前不得开始 D 的 Project UI 或产品域迁移。每个 task 单独提交，遵守 RED → GREEN → REFACTOR；使用隔离 worktree，不直接在 `dev` 上开发。

C-Core 明确不做：完整 foreground service、MediaStore delivery/delete、Batch/Variant、成本策略、原生 ComfyUI 语义和复杂 workflow UI；这些属于 C-Extended 或 D。

## 6. D 阶段：D-Core Product Domain

D-Core 尚未开始，并继续受 C-Core 完整验收门禁约束。

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

1. `git status --short --branch`，确认当前为 `dev`，并用 `git merge-base --is-ancestor v1.4.7 dev` 确认开发基线包含 v1.4.7；不要改动 `local.properties` 与 `mobile/.expo/`。
2. 从 `dev` 创建 `codex/c-core-schema` 隔离 worktree，不在发布基线工作区直接开发 C-Core。
3. 阅读 `docs/superpowers/plans/2026-09-01-c-core.md` Task 1、本文件的状态审查收口、v1.4.7 fresh-install hotfix plan、架构设计的 durable executor 章节和现有 `mobile/src/storage/database*` 实现。
4. 先写真实 SQLite migration RED 测试：fresh v0、legacy v0、v4→v6、v5→v6、repeatable migration、列演进、legacy table 保留、生产 backup 接线，以及注入 DDL 失败后的 rollback + 可启动 read-only recovery。
5. 运行 focused Jest 看到预期失败，再实现 `runner.ts`/`v6DurableExecutor.ts`，随后运行 typecheck、全量 Jest 和 Android 门禁。
6. 完成并记录 C-Core Task 1 后，才继续 Task 2；C-Core 六项全部验收通过后再切换到 D-Core Task 1。
7. D-Core 必须从 C-Core 已稳定的 job/artifact/CAS snapshot 向上构建；不得绕过 v6 durable executor，或提前把 Project UI、Batch/Variant、同步协作并入 C-Core。

交接结论：A/B 已闭环。媒体并发、投影所有权、动态 AutoDL 产物节点、下载完整性和相册导出修复已通过自动化、模拟器及用户手动带凭据验收，并以 v1.4.6 发布；状态审查发现的 fresh-install registry 回归随后完成 TDD、独立复审、模拟器全新安装和正式签名发布，以 v1.4.7 收口。当前唯一正确的后续顺序是 C-Core Durable Local Executor → C-Core 验收 → D-Core Local Product Domain → D-Core 验收；下一项工作从 C-Core Task 1 的 v6 migration runner、生产备份与只读 recovery 开始。
