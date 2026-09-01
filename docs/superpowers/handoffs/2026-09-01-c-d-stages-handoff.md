# C / D 阶段开发交接（Handoff）

> 交接基线：`dev`，当前 HEAD：`99d6427e835739a64ca45a3f705a97606169be02`（2026-09-01）。
>
> B 阶段 hotfix 已包含在当前基线：`1595999b fix: prevent SQLite registry initialization crash`。

## 1. 产品与架构硬约束

本项目是 Android/React Native 本地优先应用，不引入业务后端、云端数据库、云端任务编排、对象存储或管理服务。

允许的外部网络依赖只有：

1. 用户配置的 LLM API；
2. 用户配置的生成 API（当前 AutoDL，未来可包括用户自有的原生 ComfyUI）；
3. 用户明确配置的固定 Git 仓库，用于订阅签名的声明式 workflow package。

Git 内容只能是数据，不能下载或执行 JavaScript、脚本、插件二进制、动态 adapter 或任意 URL。新 provider adapter 必须随审核过的应用版本发布；未来插件化只能在独立安全设计批准后实现。

本地 SQLite、任务队列、Workflow Registry、项目/资产索引和应用私有文件是权威状态。网络结果只能更新本地状态，不能替代本地 source of truth。

## 2. 当前已交付状态（B + hotfix）

### 已实现

- `WorkflowPackage` 声明式 envelope：`apiVersion/kind/metadata/spec/signature`。
- package 安全边界：拒绝脚本、可执行字段、远程引用、危险 JSON Pointer、过深/过大的数据。
- JSON Pointer compiler：RFC 6901 读取、绑定构造、递归 schema 值校验、content hash 缓存。
- Registry：版本不可变、active/previous 指针、回滚、兼容性检查、builtin bootstrap、Git commit-attestation 校验。
- 远程 Registry：HTTPS allowlist、HTTP 状态码、超时、响应大小限制、hash/signature/schema 验证。
- Runtime：使用 compiler 做输入校验和 request binding，Job 固化 workflow id/version/content hash/adapter version。
- CreateForm：从本地 catalog 获取 active workflow，不再直接 import H3 workflow JSON。
- 数据库：`workflow_registry` provenance 使用 `repository/ref/commit_sha`，避免 SQLite 保留字 `commit`。
- 回滚清理：GC 保留 active 和 previous 指针引用的版本。

### 当前已知限制

- 当前 builtin 只有 H3；CreateForm 仍默认选择 `records[0]`，还没有多工作流选择器。
- UI renderer 主要覆盖扁平字段；复杂嵌套 JSON Pointer、条件 UI、附件 semantic binding 尚未完整产品化。
- 当前 Git 订阅实现验证 Ed25519 `commit-attestation`，并非原生 GPG/SSH `git verify-commit`；后者应通过抽象 verifier 在后续单独实现。
- AutoDL adapter 仍是 POST 提交 + GET 结果轮询；不能假设 AutoDL wrapper 提供原生 ComfyUI WebSocket、上传、队列或取消能力。
- `workflow_jobs` 目前是 job snapshot，不是完整 Operation/Event durable executor。
- Android 构建：emulator/adb 可用，但本机 Gradle 构建目前在解析 `com.facebook.react.settings` 时失败并报告 `25.0.2`；需要先修复构建依赖/缓存，再做 APK 冷启动验证。
- 主工作区 `local.properties` 是用户本地文件，必须保持未提交、未修改。

## 3. C 阶段：M3 Durable Local Executor

### 3.1 目标

把当前“同步函数 + job snapshot”升级为数据库驱动的本地执行器。提交、轮询、下载、导出、重试、删除都成为可恢复 Operation；进程被杀、Android service 重启或网络短暂失败后可以继续，而不会重复产生可能计费的 provider 任务。

### 3.2 推荐分层

```text
Application service
  -> DurableExecutor
      -> OperationRepository / JobEventRepository
      -> lease + idempotency + retry policy
      -> ProviderAdapter
      -> Job/Artifact snapshots
  -> Task/Media compatibility projections
```

### 3.3 C1：执行核心与状态机

新增/扩展本地表：

- `workflow_operations`：`id, kind, job_id, status, lease_owner, lease_expires_at, attempt, next_retry_at, idempotency_key, last_error, created_at, updated_at`；
- `workflow_job_events`：append-only 状态事件；
- `workflow_jobs`：增加 revision/CAS 字段、provider handle、last error、下一次同步时间等必要 snapshot 信息。

状态机必须明确：

```text
DRAFT -> VALIDATED -> SUBMITTING -> QUEUED -> RUNNING
                                      |           |
                                      +-----------+
             SUCCEEDED / PARTIAL_SUCCEEDED / FAILED / CANCELLED / UNKNOWN / EXPIRED
```

规则：

- 每个 operation 使用稳定幂等键；同一 key 不得并发执行两次。
- lease 获取、续租、过期回收和 finally 释放必须可测试。
- `UNKNOWN` 表示 provider 结果不确定，只能用原始 provider handle 对账；禁止自动重新创建可能重复计费的任务。
- 状态更新使用 revision/CAS，防止前台、后台、Headless JS 同时覆盖较新的 snapshot。
- retry policy 持久化 `attempt/nextRetryAt`，使用指数退避 + jitter，并区分可重试和不可重试错误。

### 3.4 C2：Artifact/CAS 操作

- provider artifact 下载、校验、hash、原子 rename 形成独立 operation；
- 使用应用私有目录的临时文件和 SHA-256 内容寻址路径；禁止把大 Base64 写入 SQLite；
- 下载前检查 HTTPS/host allowlist，下载中限制超时、重定向、MIME、最大字节数，失败清理 `.part`；
- 导出到 Android MediaStore 是独立 delivery operation，不能阻塞状态同步；
- CAS 引用计数/垃圾回收必须保留仍被 job、asset、delivery 引用的文件；
- 下载/导出/删除操作必须支持 app 重启后继续或进入明确的 retryable failure。

### 3.5 C3：调度与 Android 恢复

- 前台刷新、Expo background task、Headless JS、Android foreground service 统一进入 executor；
- 使用独立 lease key 区分 status、download、export，避免同一工作被重复调度；
- 每次调度只处理有界 operation 数量，并在本轮结束后再安排下一次 tick；
- Android service 被杀后，下一次启动从 SQLite 查询过期 lease 和到期 retry operation；
- 任务列表只读取 snapshot/projection，不能在渲染路径扫描全部 event 或 artifact。

### 3.6 C 阶段禁止事项

- 不引入 Temporal/Argo 等服务端编排器；
- 不新增 webhook receiver 或云端队列；
- 不把“重试 submit”当成 UNKNOWN 的默认处理；
- 不在 C 阶段同时引入 Project/PromptRevision/Batch 产品 UI；这些属于 D。

### 3.7 C 阶段验收门禁

必须有自动化测试覆盖：

- duplicate submit / idempotency key；
- lease contention、lease expiry、finally release；
- timeout → UNKNOWN → provider handle reconciliation；
- retry/backoff 和 `nextRetryAt` 过滤；
- revision/CAS 冲突；
- app/process restart recovery；
- operation queue 有界并发；
- 下载临时文件、hash、原子 rename、MIME/size/timeout；
- status sync 不等待媒体下载；
- 所有现有 TypeScript/Jest 测试保持通过。

推荐提交顺序：`C1 executor schema` → `C1 state machine` → `C2 CAS` → `C2 media operations` → `C3 scheduler` → `C3 Android recovery` → `full verification`。

## 4. D 阶段：M4 Product Domain

### 4.1 目标

在 C 的可靠执行基础上，把“Prompt、素材、任务、成片”提升为可复用的本地创作项目模型，支持版本、引用、回滚、导出和未来可选备份；不在本阶段引入必须联网的协作后端。

### 4.2 领域模型

```text
Project
  -> Brief / Scene / Storyboard
  -> PromptRevision (immutable)
  -> Asset -> AssetVersion (immutable, CAS-backed)
  -> GenerationBatch
       -> GenerationVariant -> WorkflowJob
  -> Delivery / Review / Export
```

建议表：

- `projects`：本地项目、归档、更新时间；
- `prompt_revisions`：内容 hash、父 revision、来源、用户确认状态；
- `assets` / `asset_versions`：CAS hash、MIME、尺寸、来源、引用计数；
- `generation_batches` / `generation_variants`：参数差异、seed、workflow hash、状态汇总；
- `project_links`：项目与 prompt/asset/job/delivery 的显式关系；
- `backups` 或导出 manifest：仅记录用户主动导出的本地包，不自动上传。

### 4.3 D 阶段原则

- PromptRevision、AssetVersion、WorkflowPackage 和 WorkflowJob 语义不可变；编辑产生新版本。
- Project UI 读取 repository/projection，不直接拼接多个 legacy task 表。
- 删除采用软删除/引用检查；CAS 文件只有在没有引用且超过保留窗口后才能 GC。
- 旧 `tasks` 投影在兼容窗口内继续可读；不要在 D 的普通升级中直接 DROP 表。
- 导出项目包必须排除 SecureStore secrets、token、API key 和临时 lease；明确包含 workflow hash、prompt revision、asset manifest 和 job provenance。
- 离线创建/编辑/查看历史必须可用；网络只在提交、刷新 provider 状态或用户主动同步时使用。

### 4.4 D 阶段后续扩展点

- M5：Batch/Variant 并发、成本/配额策略、Agent 选择 workflow 和用户确认后提交；
- M6：仅在用户明确需要时设计本地 outbox/cursor、可选 E2EE/同步/协作；不得反向改变本地权威模型。

### 4.5 D 阶段验收门禁

- 新建项目 → 多个 PromptRevision → 资产版本 → generation batch/variant → workflow job → delivery 全链路可追溯；
- 同一 asset hash 去重，引用计数正确，GC 不删除活跃资产；
- Prompt/Asset/Project 版本回滚不改写历史 job；
- 导出/导入项目包不包含 secrets，并在离线环境可读取；
- 迁移失败进入只读恢复/诊断导出，不清空用户数据；
- 大量历史项目、资产、任务使用分页和索引，UI 不做全表扫描；
- 完整 TypeScript/Jest + emulator 回归通过。

## 5. 数据迁移与 schema 规则

当前已发生一次“开发期直接删除旧库”的迁移，但从现在起不再采用该策略。后续数据库变化必须：

1. 提升明确的 `APP_SCHEMA_VERSION`；
2. 事务内执行可重复 migration；
3. migration 前保留本地备份或导出路径；
4. 新增目标表/列时保留旧表和旧列；
5. 失败进入 read-only recovery，并输出诊断信息；
6. 只有在独立版本化 removal migration 且明确用户确认后才删除 legacy 表。

所有新 SQL 标识符避开 SQLite 保留字（例如使用 `commit_sha`，不要使用 `commit`）。DDL 必须至少有一次真实 SQLite 或 emulator 验证，不能只依赖 Jest mock。

## 6. Android 构建与设备验证

当前证据：

- `adb` 位于 `C:\Users\fai_l\AppData\Local\Android\Sdk\platform-tools\adb.exe`；
- `emulator-5554` 可用；
- Android Studio JBR 位于 `C:\Program Files\Android\Android Studio\jbr`；
- 设置 `JAVA_HOME` 后 Gradle 仍在 `settings.gradle:21` 解析 `com.facebook.react.settings` 时失败，错误为 `25.0.2`。

进入 C 前优先修复构建链：

1. 检查 `mobile/node_modules/@react-native/gradle-plugin` 和 Expo/RN 版本是否与 lockfile 一致；
2. 检查 Gradle includeBuild 和 plugin resolution cache；
3. 用 `./gradlew :app:dependencies --stacktrace --info` 获取完整解析原因；
4. 不要通过降低 RN/Expo 版本或删除 lockfile 来规避；
5. 构建成功后安装 debug APK，冷启动并进入 Create 页；
6. 使用 `adb logcat -b crash` 确认无 `NativeDatabase.execSync`/SQLite DDL 崩溃；
7. 验证 registry bootstrap、任务创建、后台恢复和媒体下载。

## 7. 工作方式与提交要求

- 每个行为变更遵守 RED → GREEN → REFACTOR；先看到失败测试再写生产代码。
- 使用隔离 worktree；不要直接在 `dev` 上开发。
- 每个独立子任务单独提交，提交信息说明行为变化。
- 提交前执行：

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
```

- Android 变更额外执行 Gradle + emulator QA；如果构建环境阻塞，记录完整命令和错误，不声称 APK 验证通过。
- `git diff --check` 和 `git status --short` 必须干净，除主工作区用户已有的 `local.properties` 外不得引入本地密钥/配置。

## 8. 交接结论

推荐顺序是：

```text
B hotfix（已完成）
  -> Android build/SQLite 冷启动门禁
  -> C1 durable executor
  -> C2 CAS + media operations
  -> C3 scheduler/restart recovery
  -> D product domain/migrations
  -> M5 agent + batch
```

不要把 C/D 当作一次性大重构。C 先保证“任何 operation 可恢复且不重复计费”，D 再建立“任何创作对象可追溯且版本不可变”；两者都必须保持本地权威和无业务服务器约束。
