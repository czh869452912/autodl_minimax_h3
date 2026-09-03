# A/B 阶段交接审查（面向 C/D 阶段准入）

> 审查时间：2026-09-03
> 审查对象：`docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md` 所声称的 A/B 阶段状态，对照 `dev` 分支 `a1e8d026`（含 v1.4.6 发布基线 `536934fc`）的实际代码。
> 审查方法：逐项核对交接文档声明与源码；用真实 node:sqlite 模拟 fresh-install 数据库路径复现疑似缺陷；在主工作区复跑 `npm run typecheck` 与 `npm test -- --runInBand` 验证验收证据；用 `git log` 核对声称的闭环提交。

## 1. 总体结论

交接文档与代码事实**总体高度一致**，B 阶段实现质量良好，绝大多数声明可逐一在代码中验证。复跑验收证据全部通过（84 suites / 364 tests / 1 skipped、typecheck 通过）。但审查发现 **1 个高危回归（全新安装时 registry 表永不创建，v1.4.6 对新用户不可用）**、以及 **migration 基础设施能力不足**（无列演进、备份未接线、只读恢复未产品化），这直接影响 C-Core Task 1（v6 migration）的可行性。

**建议：B 的功能性结论成立，但不应"立即"进入 C-Core Task 1。应先把 fresh-install 修复 + 版本化迁移矩阵测试作为 C-Core Task 1 的第一批 RED 测试（或独立小 hotfix），否则 C 阶段所有验收都建立在无法通过全新安装的基线上。D-Core 门禁维持不变。**

## 2. 已核实为真的关键声明

| 交接文档声明 | 代码证据 | 结论 |
|---|---|---|
| 独占事务 `replaceArtifacts` + 同步 fallback | `jobs/repository.ts:46-70`（`withExclusiveTransactionAsync` → sync transaction → manual BEGIN） | 属实 |
| `upsertWorkflowProjection` 只写 Workflow 拥有的列 | `tasks/repository.ts:41`（ON CONFLICT 不触 local_uri/下载/导出列） | 属实 |
| 字段级 `updateMediaProjection`、删除竞态防护 | `tasks/repository.ts:18-38`（hasOwnProperty 字段级 patch、changes=0 返回 false）；`mediaQueue.ts:31`（false → 抛“任务已删除”） | 属实 |
| `upsertArtifactProjection` 非破坏性合并 | `media/repository.ts:47`（COALESCE/CASE 保留 local_path/poster/downloaded/export_status） | 属实 |
| `resolveLocalVideoSource` 逐候选验证、拒绝目录与零字节 | `tasks/localMedia.ts:19-35` | 属实 |
| 下载/导出共享同任务串行锁 + in-flight 合并 | `tasks/media.ts:38-53`（`withTaskMediaLock`）、`tasks/download.ts:81-89`（`downloadsInFlight`） | 属实 |
| 下载临时文件发布：先删目标、rename 失败转 copy、发布后按字节数复核、失败清理 `.part` | `tasks/download.ts:17-39, 65-77` | 属实 |
| Expo 原生 fetch、逐跳重定向校验、MIME/大小/超时/Content-Length 校验 | `tasks/downloadPolicy.ts:77-130`（`expo/fetch`、redirect: 'manual'、逐跳 `validateRedirectUrl`） | 属实 |
| 动态 AutoDL 产物节点 opt-in，仅内置 adapter 开启 | `workflows/providers/autodl/manifest.ts:11`；全仓 `allowProviderSuppliedPublicHosts: true` 仅此一处 | 属实 |
| 私网/保留 IPv4/IPv6、带凭据 URL、localhost fail-closed | `security/urlPolicy.ts`（含 CGNAT/TEST-NET/IPv4-mapped IPv6/0x 前缀由 URL 规范化覆盖） | 属实（边界见问题 7） |
| Registry 不再由 repository 构造函数建表、纳入 ensureAppDatabase、写入只读恢复拦截 | `registry/repository.ts:12-14`（仅 ensureAppDatabase + assertAppDatabaseWritable）；`repository.test.ts:56-57` 断言不建表 | 属实（但引入回归，见问题 1） |
| WorkflowPackage envelope/canonical hash/危险 JSON Pointer/远程引用禁止 | `schema/package.ts`（forbiddenKeys、`__proto__`/`constructor`/`prototype`、http(s) 字符串拒绝、节点/深度/长度上限、envelope 白名单） | 属实 |
| Registry immutable (id,version,hash)、active/previous 指针、回滚、兼容性检查、事务化 install | `registry/repository.ts`、`registry/service.ts:46-58` | 属实 |
| Ed25519 commit-attestation 绑定 repository/ref/commit/treeHash/entries | `registry/gitSource.ts:9-16`、`registry/trust.ts` | 属实 |
| Runtime provenance 校验（id/version/hash 三重匹配） | `workflows/runtime/runtime.ts:34-46` | 属实 |
| Registry fetch 逐跳 allowlist、3 跳重定向、body 大小/超时限制 | `registry/service.ts:60-109` | 属实 |
| `commit_sha` 非保留字 | `database.ts:33`、`registry/repository.ts` | 属实 |
| 闭环提交清单（f3456dc0…e69c7fd2、bdb1c1bf…1acfba9d） | `git log` 全部存在且主题吻合 | 属实 |
| 测试证据 84 suites / 364 tests / 1 skipped；typecheck 通过 | 本次审查复跑结果一致 | 属实 |
| C-Core/D-Core 尚未开始 | 无 `workflows/executor/`、`storage/migrations/` 目录 | 属实 |

## 3. 问题清单

### 高危

**H1. 全新安装（user_version=0）时 `workflow_registry` / `workflow_registry_active` 永不创建，v1.4.6 对新用户不可用**
- 根因链：
  - `storage/database.ts:115-134` `ensureAppDatabase` 仅在 `version === APP_SCHEMA_VERSION - 1`（即 4→5）时执行任何语句；`version === 0`（全新库的 `PRAGMA user_version`）直接 return，不建表、不写版本号。
  - `a884dfa5`（B.1 收口）将 registry 建表从 repository 构造函数移入 `APP_CREATE_STATEMENTS`，但后者只在 4→5 迁移和 legacy reset 中执行。
  - `tasks`/`workflow_jobs`/`media_*`/`app_scheduler_leases` 仍由各 repository 构造函数兜底建表，**唯独 registry 无人兜底**。
- 后果：fresh install 上 `CreateForm.tsx:65` 的 `workflowCatalog.bootstrap()` → `registry.getActive()` 抛 `no such table: workflow_registry` → 被捕获后 `setLoadError`，创建页永久显示"工作流加载失败"，无法创建任何任务。
- 不会被兜底拦截：`isLegacyAppDatabase` 对 v0+无表的库返回 false（`database.ts:50-61`），不触发"清除旧数据"对话框；`user_version` 永远停留在 0。
- 复现：本审查用 node:sqlite 模拟 fresh DB，`ensureAppDatabase` 后 `user_version` 仍为 0，`createWorkflowRegistry(db).upsert(...)` 抛 no such table（临时测试，未入库）。
- 未被发现的原因：验收模拟器与用户真机均保留了旧库（user_version 已是 5），验收矩阵缺少"全新安装"。
- 修复建议：`ensureAppDatabase` 对 `version < APP_SCHEMA_VERSION`（含 0）执行幂等 ensure 全部表 + `PRAGMA user_version = 5`；并将其作为 C-Core Task 1 RED 测试的第一条（fresh/4→6/5→6/未来 6→7 矩阵）。同时补一条"全新安装可完成一次任务创建"的模拟器验收项。

### 中（直接影响 C-Core Task 1 可行性）

**M1. 迁移 runner 没有列演进能力，v6 所需的 ALTER TABLE 完全不存在**
- `ensureAppDatabase` 只做 `CREATE TABLE IF NOT EXISTS`；已存在的 `workflow_jobs` 表在 5→6 时**不会**获得 `revision`/`provider_handle_json`/`last_error_json`/`next_sync_at` 列。
- 只允许 `version === APP_SCHEMA_VERSION - 1` 单级迁移：任何落在 v3/v2 的设备直接跳过迁移，掉进 `app/_layout.tsx:12-26` 的"清除并进入"销毁路径（有用户确认门，但等于清空全部本地数据）。
- 历史：旧 registry 构造函数曾有 `ALTER TABLE ... ADD COLUMN` 的 try/catch 兜底（`a884dfa5` 移除），说明列演进需求真实存在过。
- 建议：C-Core Task 1 实现显式版本化 step 列表（`migrations: Record<fromVersion, step[]>`，逐级执行、事务内可重复），不得只靠 CREATE TABLE IF NOT EXISTS。

**M2. "migration 前保留备份"未接线**
- `database.ts` 提供 `AppDatabaseOptions.backup` 钩子，但 `databaseClient.ts:10` 调用 `ensureAppDatabase(sharedDatabase)` 未传任何 options → 生产路径零备份。交接文档 §7 门禁"migration 前保留备份"实际未实现。

**M3. read-only recovery 未产品化**
- `markRecovery` 只写诊断行然后 rethrow；而 `getDatabase()` 在模块加载期执行（`tasks/sync.ts:12`、`app/_layout.tsx:9`、`create/CreateForm.tsx:42`）→ 迁移失败 = import 抛异常 = 启动崩溃/红屏，而非架构要求的"只读恢复 + 诊断导出"。
- `assertAppDatabaseWritable` 仅 registry repository 使用；tasks/jobs/media repository 均不检查恢复状态。
- 建议：启动时捕获 `ensureAppDatabase` 异常进入只读模式页（展示 diagnostic + 导出），并在写入口径一拦截。

**M4. DDL 所有权仍分裂，存在 schema 漂移风险**
- registry 已收敛，但 `tasks/repository.ts:6-12`、`jobs/repository.ts:19-21`、`media/repository.ts:11-16`、`tasks/scheduler.ts:21` 仍在构造函数建表/建索引，与 `database.ts` 的 `APP_CREATE_STATEMENTS` 重复定义（当前靠人工保持一致）。C-Core Task 1 应一并收敛到单一 schema owner。

**M5. 下载总超时（30s）与大小上限（2GB）不匹配**
- `downloadPolicy.ts:84` 总 deadline 与单块 read 共用 `timeoutMs`（AutoDL manifest 固定 30s），`maxBytes` 却是 2GB。大视频在实际网络下必然超时；现有验收最大文件仅 6.6MB。建议改为按字节数缩放总时长或仅保留逐块 idle 超时，并在 C-Core Task 4（CAS 下载）一并解决。

**M6. 动态节点模式使 allowlist 完全失效（已文档化的折衷，需收紧路径）**
- `allowProviderSuppliedPublicHosts: true` 时 `validateArtifactUrl` 传 `{}` → 任意公网 HTTPS 主机及重定向链均放行，`allowedHosts: ['autodl.art']` 形同虚设。缓解因素：下载请求不带凭据、MIME/大小/私网校验保留、仅内置 adapter opt-in。建议在 C-Core 将"动态主机"改为一次性登记（首次校验通过后写入 session allowlist）或限定 provider 响应同源，缩小开放面，并在安全文档中明示该特权。

### 低 / 观察项

- **L1** `upsertArtifactProjection` 的 status CASE：`local_path` 非空但文件已丢失时仍保持 `downloaded`，依赖 UI/gallery 的 `resolveLocalVideoSource` 事后修复（gallery.tsx:20 enrich 已实现），DB 层存在投影不一致窗口。
- **L2** `media/repository.ts:73` 把中文展示文案（`已保存到相册` 等）写入 `export_status` 列，状态机枚举只存在于 `media_deliveries`；建议后续规范化。
- **L3** `upsertDelivery`（两条语句）与 `tasks/repository.ts:64` `remove`（五表删除 + 文件清理）均未包事务，进程中断会留下不一致/孤儿行。
- **L4** `registry/repository.ts:22-29` `upsert` 的 get→insert 并发竞态会把不可变冲突报成裸 UNIQUE 错误（事务化的 `installAndActivate` 无此问题）；`removeUnreferenced` 对 active 行存在 N+1 查询。
- **L5** `resolveArtifactRedirects`（downloadPolicy.ts:132）仅测试引用，且用全局 `fetch` 而非 expo 原生 fetch，与主路径不一致——建议删除或标注。
- **L6** `app_scheduler_leases` TTL 120s 无续约；超过 TTL 的长同步可能被并行入口抢占。C-Core Task 2 lease 设计需覆盖并保留回归测试。
- **L7** `runtime.ts:64` 将所有 submit 异常（含可判定的 4xx/auth）一律标记为 `UNKNOWN`，方向保守安全（不重复计费），但混淆了"确定失败"与"未知"；C-Core Task 3 的错误分类（auth/schema/4xx terminal）应以此处为改造点。
- **L8** coordinator 对同一 job 的 sync 无 CAS/lease（当前 targets 按 task 去重 + 共享 cursor，不会重复取号，实际无害）；由 C-Core Task 2/5 解决。

## 4. 交接文档表述与事实的偏差

1. "Registry schema 已纳入事务 migration/recovery；不再由 repository 构造函数独立建表；旧表保留"——**对 registry 本身属实，但该改动引入 H1 回归**，验收矩阵缺少全新安装路径，文档将 B 标记为"对 C/D 的阻塞已解除"过于乐观。
2. §7 门禁"migration 前保留备份；失败进入 read-only recovery"——备份钩子未接线（M2）、只读恢复未产品化（M3），属"门禁已写、实现未至"。这两项恰是 C-Core Task 1 的内容，文档已将其列入计划，但应明确当前不具备，避免接手者误以为已有基础。
3. 其余声明（热修复五项内容、动态节点、发布验证、提交清单、测试数字）经核对与复跑全部属实。

## 5. 准入建议

进入 C-Core Task 1 前（按序）：
1. **修复 H1**（fresh-install 建表 + user_version 写入），可独立小提交或并入 C-Core Task 1 第一批 RED 测试；
2. C-Core Task 1 实现显式版本化 step 迁移（覆盖 M1）、接线生产 backup（M2）、启动期只读恢复兜底（M3，最低限度：捕获异常进入只读页而非崩溃）；
3. Task 1 验收增加"全新安装→创建任务"与"v4 升级→数据保留"两条模拟器路径；
4. M5（超时/大小匹配）与 M6（动态主机收紧）分别挂在 C-Core Task 4 与 C-Extended，不阻塞 Task 1；
5. D-Core 门禁维持不变。

**结论：A 阶段闭环属实、无遗留；B 阶段功能性验收属实，但存在一个发布级回归（H1）和迁移基础设施缺口（M1–M3）。建议先完成上述第 1、3 项再从 C-Core Task 1 起步；不宜在现状下直接按交接文档§8 清单开始开发。**

## 6. 复审（2026-09-03，针对 H1 修复轮 v1.4.7）

修复范围：PR #21（`4b3617c9` fresh-install 初始化、`a9a38ee8` legacy 表识别补全、`fd3088b7` 版本 1.4.7、`287fda96` 测试类型修正），以 `v1.4.7` 正式发布。

**H1 — 已修复，复审通过**：
- `ensureAppDatabase` 现区分三种状态（`database.ts:116-135`）：空 v0（无任何 app 表）→ 单事务创建完整 v5 schema + `user_version=5`，且不执行无意义备份；v4 → 原有 4→5 加性迁移（备份行为不变）；其他含 app 表的旧库 → 不动，保留既有确认门。
- `isLegacyAppDatabase` 改为对照完整 `APP_TABLES`（含 `workflow_registry`、`app_database_recovery`）检查 `sqlite_master`（`database.ts:51-62`），堵住了"仅含旧 registry 表或 recovery 标记的 v0 库被误判为空库并盖上 v5"的 P1（修复过程中独立复审发现的 `a9a38ee8`）。
- `resetAppDatabase` 现在同时清理 recovery 标记，避免 reset 后残留只读状态。
- 本审查用真实 node:sqlite 独立复验 4 项：fresh v0 后 registry `installAndActivate` 可用且 `user_version=5`；仅含旧 `workflow_registry` 的 v0 库不被 stamp；仅含 recovery 标记的 v0 库不被 stamp；fresh 路径跳过 backup。全部通过。
- 仓库新增 7 个真实 SQLite 测试覆盖同一矩阵；全量复跑 84 suites / 371 tests / 1 skipped、typecheck 通过，与交接文档声称一致。
- 发布链核对：`ls-remote` 确认 `v1.4.7^{}` = `ad7110de`（与文档一致）；`app.json` 1.4.7；模拟器全新安装验收（卸载重装、CreateForm 可见、11 张表、无 `no such table`）在交接文档中有记录。

**M1–M4 / M5 / M6 — 未在本轮处理，且处理方式正确**：
- 热修复 spec 明确声明不引入通用 migration runner、列演进、生产备份接线或只读恢复 UI（`2026-09-03-fresh-install-database-hotfix-design.md:23`），未越界。
- 交接文档已同步更新：C-Core Task 1 的 RED 测试矩阵扩展为 fresh v0 / legacy v0 / v4→v6 / v5→v6 / 列演进 / 生产 backup / 只读 recovery；Task 4 吸收 M5（下载超时 vs 2GB）；M6 挂 C-Extended；Task 6 验收增加 fresh-install 创建任务与 v4/v5 升级保留。与本 review §5 建议一致。

**复审遗留观察（不阻塞）**：
1. 全新安装中若迁移失败（事务回滚 + markRecovery），下次启动会落入"清除并进入"破坏性确认门而非只读恢复页——对无数据的 fresh 安装是可接受的降级，但 M3 产品化后应统一。
2. 本 review 文档当前未提交入库（untracked），建议随下一提交纳入版本管理。

**复审结论：H1 修复完整、正确、有回归测试与发布闭环；遗留项的归属与交接文档更新准确。仓库现可按更新后的 C-Core Task 1 要求开工。**
