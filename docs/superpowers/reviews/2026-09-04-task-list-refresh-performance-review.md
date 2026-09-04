# 任务列表刷新静态审查（C 阶段变慢归因 + 后台刷新与通知）

> 审查时间：2026-09-04（第一轮：刷新性能归因；第二轮：后台刷新与通知审查）
> 审查对象：`dev` @ `8a6ec4d3`，第一轮重点覆盖 C 阶段对刷新链路的改动（`1782119b`…`155b903c`、`77ee941f`）。
> 审查方法：仅静态审查（无运行时测量）。逐文件阅读刷新链路全部代码：`app/(tabs)/tasks.tsx`、`src/tasks/sync.ts`、`src/tasks/repository.ts`、`src/workflows/executor/tick.ts`/`cycle.ts`、`src/media/reconciliation.ts`、`src/workflows/executor/operationRepository.ts`，并用 git 历史对照 C 阶段前后的差异。第二轮补充阅读后台/通知链路：`src/tasks/background.ts`、`src/native/taskMonitor.ts`、`android/.../TaskMonitorService.kt`/`TaskMonitorModule.kt`/`TaskMonitorHeadlessService.kt`、`AndroidManifest.xml`、`index.js`、`app.json`、`package.json`、`MainApplication.kt`/`MediaPackage.kt`。
> 关联：`docs/superpowers/reviews/2026-09-04-c-core-stage-review.md`（New-6 已提及 tick 全表扫，本审查将其并入刷新性能全链路归因）。

## 1. 总体结论

**怀疑成立。** C 阶段把刷新从"coordinator 一次同步 + 读库"改为"durable executor cycle + 投影修复 + 媒体对账 + 读库 + 逐条媒体修复"，其中**三块新增工作直接落在已完成历史任务上**；同时轮询条件放宽使 10s 轮询可能永不停止。历史任务越多，每次刷新的 SQLite 查询与文件系统 stat 越多（线性增长），且大量调用是同步 API，会阻塞 JS 线程挤占列表渲染 —— 主观感受即"刷新变慢"。

## 2. 刷新链路现状

每次 `load()`（focus / 手动 / 10s 轮询，`app/(tabs)/tasks.tsx:47-52`）：

```
syncTaskRun('foreground')                       // sync.ts:186-203
  ├─ 1. runCycle          // durable executor，≤4 pass × ≤8 ops（cycle.ts:36-37）
  ├─ 2. repairTaskProjections(32)                 // C 新增
  ├─ 3. reconcileMediaState(8) + CAS GC           // C 新增
  └─ 4. listActive()
taskStore.listPage({ limit: 40 })               // 全量含已完成（repository.ts:57-66）
repairTaskMediaPage(page.items)                 // 逐条媒体修复（tasks.tsx:16-35）
```

## 3. 已完成历史任务参与刷新的 4 个位置

| 编号 | 位置 | 范围 | 每次刷新成本 |
|---|---|---|---|
| R1 | `repairTaskProjections`（`sync.ts:134-147`，C 的 `1782119b` 新增） | `workflow_jobs` **全表** `ORDER BY created_at DESC` 取前 32 —— 最新 32 个 job 绝大多数为已完成 | 32 ×（`taskStore.get` + `listArtifacts`）≈ **65+ 次查询**；`sync.ts:141` 的一致性检查只挡写、不挡读 |
| R2 | `reconcileMediaState`（`reconciliation.ts:48,80`，C 的 `f698e3b1` 引入刷新路径） | **专扫 `status IN ('SUCCESS','PARTIAL_SUCCESS')`**，游标每次推进 8 个 | 每任务 2-5 次 DB 查询 + 每个本地 uri 一次 fs stat；结尾必跑 CAS GC（`reconciliation.ts:168` → `casRepository.ts:47` NOT EXISTS 扫描） |
| R3 | `repairTaskMediaPage`（`tasks.tsx:16-35`，09-02 `35fcd240` 引入） | 页面 40 条中所有 `DOWNLOADED` 或有 `localUri` 的任务（多为已完成） | 每条 1 次 `getPrimaryVideoByTaskId` + `resolveLocalVideoSource` 最多 3 次 fs stat（`localMedia.ts:26-33`）；**写回有条件（tasks.tsx:22）但读 + stat 无条件，每 10s 重复** |
| R4 | 遗留 PENDING 操作（`tick.ts:26-46`） | 已完成任务的卡住 `ARTIFACT_DOWNLOAD`/`EXPORT` 操作仍占 cycle 预算（≤8 ops），并进入 `remainingScheduled` | `operations.list()` 为**无 LIMIT 全表扫**（`operationRepository.ts:103-104`），每 tick 至少 5 次（4 lane 快照 + `remaining()` JS 过滤，`tick.ts:53-58`） |

明确**不涉及**已完成任务的环节：远端状态同步（cycle 只认 `workflow_operations`，活跃 job 的 STATUS_SYNC）与 `listActive`（`repository.ts:68`）。旧 coordinator 的 active 过滤逻辑已随 `1782119b` 退出前台刷新路径。

## 4. 变慢的三个放大器

**A1（High）：轮询条件放宽，可永不停止**
`77ee941f` 将 `shouldPoll` 从 `hasActiveTasks` 改为 `hasActiveTasks || hasPendingOperations`（`tasks.tsx:50-52`），其中 `hasPendingOperations` 来自 `operations.remainingDue > 0 || remainingScheduled > 0 || budgetExhausted`。只要存在任何 PENDING/SCHEDULED 操作 —— 哪怕属于早已完成的任务且持续重试失败（RETRYABLE 指数退避封顶 60s，操作永不删除）—— **10s 轮询永不停止**，R1/R2/R3 每 10s 全量重跑。C 阶段前轮询只在有活跃任务时开启。

**A2（Medium）：每 tick 重建执行器**
`tick.ts:70` 每次调 `executor.recover` → `executorForCurrentSettings()`（`sync.ts:39-56`）：readSettings + 重建 adapters/runtime/durableExecutor。有操作在执行时最多 4 pass × 4 次完整重建；单 pass 无操作时也至少 1 次。

**A3（Medium）：同步 SQLite + fs stat 阻塞 JS 线程**
`reconciliation.ts`（49-54、95-153）与 repository 多处用 `getAllSync/runSync`；叠加 R3 的 `getInfoAsync` 批量 stat。operations 表与 SUCCESS 任务数随历史线性增长，单次刷新查询总数从 C 前 O(活跃任务) 涨到 O(32×2 + 8×4 + operations 全表×5 + GC)，全部挤占 JS 线程，FlatList 渲染被卡 —— 与"刷新变慢"的主观感受一致。

## 5. 结论与建议（按优先级）

1. **修轮询停止条件（对应 A1/R4）**：`hasPendingOperations` 应排除无活跃任务的纯重试操作（如仅统计非 RETRYABLE 等待、或任务全部终态时忽略 scheduled 重试）；否则列表页在无任何活跃任务时仍长期 10s 轮询。
2. **R1 降频**：`repairTaskProjections` 只需在任务数变化 / 手动刷新 / 周期性（如 ≥60s）时执行，不必绑定每次 10s 轮询；且 `compatibilityJobs.list()` 应加 LIMIT 下推到 SQL。
3. **R2 降频**：`reconcileMediaState` 同样无需每 tick 执行；游标已在（`reconciliation.ts:158-166`），可加最小间隔或仅对 `updated_at` 有变化的任务做 fs 校验。
4. **R3 加跳过条件**：对 40 条页面数据增加"投影上次校验时间"TTL（如 5 分钟内校验过且无变化则跳过 stat），或仅在 focus/手动刷新时执行逐条修复。
5. **A2 缓存**：`executorForCurrentSettings` 按 settings 内容做 memo，避免每 pass 重建。
6. **R4/A3 SQL 化**：`operations.list()` 加 `state`/`LIMIT` 过滤（C-Core review New-6 已建议，本审查确认其在刷新热路径上，优先级应上调）。

## 6. 边界说明（第一轮）

- 本审查为纯静态推理，未做运行时 profile；"变慢"的程度需以实际测量验证（建议在历史任务 ≥100 的设备上对比 C 前后单次 `load()` 耗时与轮询触发次数）。
- R1/R2 的行为本身是 C 阶段设计目标（投影修复与媒体对账的持久化保障），问题不在"存在"而在"频率与数据范围未随历史增长封顶"。

---

# 第二轮：后台刷新与通知审查（2026-09-04 追加）

## 7. 后台刷新实现现状（结论：已实现，3 条路径，可靠性分层）

| 路径 | 触发与间隔 | 代码位置 | 可靠性 |
|---|---|---|---|
| **B1 前台服务轮询**（"开启持续监控"） | 每 2 分钟（`INTERVAL_MS`）→ `triggerHeadless()` → Headless JS → `syncTaskRun('service', taskIds)` | `TaskMonitorService.kt:17,33` → `TaskMonitorHeadlessService.kt:8-13`（90s 超时、允许前台执行）→ `index.js:7-16` | 最可靠：`START_STICKY` + `dataSync` 类型 FGS，退后台仍运行；taskIds 经 SharedPreferences 持久化（`TaskMonitorService.kt:21,28`），服务被杀重启后可恢复 |
| **B2 expo-background-task** | `minimumInterval: 15`（分钟），启动时注册一次 | `background.ts:16-24`、`_layout.tsx:35` | 机会性：Android 底层 WorkManager 带系统约束（电池等），受 OEM 省电策略与"用户强杀后不执行"限制，实际可能数十分钟至数小时一次甚至不跑 |
| **B3 回前台同步** | AppState → active；另加 focus 刷新 | `_layout.tsx:37-39`、`tasks.tsx:49` | 严格说是"回前台刷"，不算后台 |

观察：
- 后台刷新只写 SQLite 投影，UI 列表在 focus/10s 轮询时才读库 —— by design。
- B1 有自动停服逻辑：headless tick 中 `result.summary.remaining === 0` 时 `stopTaskMonitor()`（`index.js:14`）。`remaining = remainingDue + remainingScheduled`，**与第一轮 A1 同源：存在永久重试的操作（RETRYABLE 退避永不删除）时 FGS 不会停**，每 2 分钟空转一轮 `syncTaskRun`，是隐性耗电项。
- `toggleMonitoring`（`tasks.tsx:54`）静默失败：`startTaskMonitor` 返回 false（ids 为空或原生模块缺失）时无任何用户提示。
- 原生模块注册已确认无误：`MediaPackage.kt:10` 在 `MediaModule` 之外捎带注册了 `TaskMonitorModule`。

## 8. "开启持续监控后仍无通知"归因（结论：必然现象，三层原因）

**N1（Critical，产品缺失）：任务状态通知从未实现。**
全仓库唯一发通知的代码是 FGS 自身的常驻通知：`TaskMonitorService.kt:18,31-32`，文案固定"正在监控任务…"，从不更新、从不发"任务完成/失败"通知。headless tick 的同步结果 `result.summary` 在 `index.js:15` 直接 return 丢弃，没有任何"状态变化 → 发通知"逻辑；`package.json` 无 `expo-notifications` 依赖。**按钮的真实功能只是"退后台继续每 2 分钟同步数据"，并不承诺任何用户通知。**

**N2（High，权限缺失）：Android 13+ 的 POST_NOTIFICATIONS 运行时权限从未请求。**
manifest 已声明权限（`AndroidManifest.xml:5`），但 Kotlin/JS 全仓库无任何 `requestPermission` 调用（已 grep 确认）。Expo SDK 57 → targetSdk 36（≥33）：未授权时通知抽屉不显示该应用的任何通知，FGS 仅在"活动应用/任务管理器"中可见 —— 用户感受即"启用了但什么都没有"。

**N3（Medium，可感知性）：渠道 IMPORTANCE_LOW。**
`TaskMonitorService.kt:31` 创建的渠道为 `IMPORTANCE_LOW`：静默、无横幅、无震动，且常驻通知文案永不变化 —— 即使权限已授予，用户也容易认为"没有通知"。

正面确认：FGS 基础配置正确 —— `foregroundServiceType="dataSync"` + `FOREGROUND_SERVICE_DATA_SYNC` 权限（`AndroidManifest.xml:4,35`）、`startForegroundService` 启动（`TaskMonitorModule.kt:18`）、`onCreate` 内即时 `startForeground`、FGS 进程状态下 `startService` 启动 Headless 服务不受后台限制。

## 9. 第二轮建议（按优先级）

1. **实现真正的任务通知**：新增通知渠道（`IMPORTANCE_DEFAULT`），在 headless tick / FGS 中对比任务状态变化后发通知（至少覆盖"任务完成/失败"）；或在 headless `syncTaskRun` 返回后由 JS 侧经原生桥发通知。需引入 `expo-notifications` 或扩展 `TaskMonitorModule`。
2. **请求通知权限**：启动监控前请求 `POST_NOTIFICATIONS` 运行时权限（Android 13+），被拒时给出引导提示。
3. **通知内容随状态更新**：FGS 常驻通知应反映当前监控状态（如"监控中：N 个任务"），复用 `NOTIFICATION_ID` notify 更新。
4. **修 B1 停服条件**：与第一轮建议 1 同源处理 —— `remaining === 0` 判定应排除无活跃任务的纯重试操作，避免 FGS 空转不止。
5. **`toggleMonitoring` 失败提示**：`startTaskMonitor` 返回 false 时 Alert 告知用户（如"没有进行中的任务"）。

## 10. 边界说明（第二轮）

- 静态审查未验证运行时行为：B2 实际触发频率、FGS 在具体 OEM（小米/华为等）上的存活率、headless JS 在真机上的实际执行情况均需真机验证。
- N2 的行为描述基于 Android 13+ 官方文档语义（未授权时通知不显示、FGS 仅任务管理器可见）；`remaining === 0` 停服与 FGS 空转的推断与第一轮 A1 共用同一代码事实（RETRYABLE 退避、操作不删除）。
