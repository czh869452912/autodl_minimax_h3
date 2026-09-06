# 静态审查：任务列表刷新 显示不一致 / 卡顿 / 卡死

- 日期：2026-09-05
- 范围：`mobile/app/(tabs)/tasks.tsx` 及刷新链路（`src/tasks/*`、`src/workflows/executor/*`、`src/media/*`、`src/storage/*`）
- 方法：纯静态代码审查，未做运行时验证；所有结论附文件：行号
- 症状：
  1. 任务列表显示与后台状态不一致
  2. 刷新卡顿
  3. 刷新期间前端卡死

---

## 刷新链路总览

```
TasksScreen.load(mode)
  └─ syncTaskRun (src/tasks/sync.ts:271)
       ├─ runCycle (executor/cycle.ts) → tick (executor/tick.ts)
       │    ├─ executor.recover → operations.recoverExpired   [同步 SQLite]
       │    ├─ dueSnapshot: 4 × listDue                       [同步 SQLite]
       │    └─ 按 lane 认领并执行 SUBMIT/STATUS_SYNC/ARTIFACT_DOWNLOAD/EXPORT
       │         └─ ARTIFACT_DOWNLOAD → handleArtifactDownload (artifactOperation.ts)
       │              └─ cas.stage + cas.publish (media/cas.ts)  ← 卡死主因
       ├─ claimMaintenanceWindow (syncPolicy.ts:16)            [同步 SQLite]
       ├─ repairTaskProjections (sync.ts:181)                  [维护模式]
       ├─ reconcileMediaState (media/reconciliation.ts)        [同步 SQLite + FS]
       ├─ listTasks (listActive)                               [第一次读]
       └─ pendingSummary                                       [同步 SQLite]
  └─ taskStore.listPage({limit:40})                            [第二次读]
  └─ setTasks(page.items)                                      [全量替换]
```

---

## 症状 3（最严重）：刷新期间前端卡死 —— JS 线程阻塞

### F1. CryptoJS 纯 JS 计算整段视频 SHA-256，且算两遍 ★主因

- `media/cas.ts:151-167`：`stage()` 下载流式写入时逐 64KB chunk 用 `CryptoJS.algo.SHA256` 哈希。
- `media/cas.ts:96-108`：`verifyPublishedBlob()` 在发布前把整个文件**重读再哈希一遍**（durable reread 校验）。
- `media/cas.ts:79-85`：`wordArray()` 对每个字节做 JS 循环（100MB 视频 ≈ 1 亿次迭代 × 2 遍）。
- CryptoJS 在 Hermes 上吞吐仅 MB/s 量级，视频几十~几百 MB 时 JS 线程锁死数十秒。
- 触发路径：poll/manual 刷新 → cycle 认领 `ARTIFACT_DOWNLOAD`（`tick.ts:16` 该 lane 并发 1）→ 哈希全程发生在 `syncTaskRun` 的 await 链内。

### F2. 每 64KB chunk 同步写文件

- `media/cas.ts:52`：`new File(path).write(chunk, { append })`。expo-file-system 新 API 的 `File.write` 是**同步**的，100MB ≈ 1600 次同步 IO 全部压在 JS 线程，与 F1 叠加。

### F3. 刷新路径大量同步 SQLite

- `workflows/executor/operationRepository.ts`：全部使用 `*Sync`（`listDue`/`claimById`/`get`/`release`/`pendingSummary`/`recoverExpired`，行 84-252）。
- `media/reconciliation.ts:41-63,97-174`：`getFirstSync/getAllSync/runSync`，每任务 5-7 次同步查询 × 8 任务/轮。
- `tasks/scheduler.ts:33-62`（lease 同步写）、`tasks/syncPolicy.ts:23`（`runSync`）。
- 单次查询有索引（`storage/schema.ts:33` idx_workflow_operations_due）不算慢，但叠加 S2 的 250ms 轮询后累积占用显著。

### F4. 卡死窗口 = 刷新转圈窗口

- `app/(tabs)/tasks.tsx:25`：`load()` 在整个 cycle（下载 + 2 遍哈希 + probeVideo + 发布 + reconcile）期间持有 `syncing`/`loadInFlight`，刷新按钮禁用、列表显示"正在刷新…"。

### 次要

- `tick.ts:63` + `durableExecutor.ts:236` + `operationRepository.ts:234-250`：每轮 tick 都跑 `recoverExpired` 同步事务（无堆积行时开销小，有 CLAIMED 过期行堆积时全表扫）。

---

## 症状 2：刷新卡顿

### L1. 250ms 热轮询

- `tasks/pollSchedule.ts:8`：`remainingDue > 0` 时下一次轮询仅 **250ms**。
- `app/(tabs)/tasks.tsx:29-47`：每轮 = 完整 `syncTaskRun`（cycle 最多 4 passes × 每 pass 4 次 listDue + recoverExpired + claim/release 写）+ `listPage` + 整列表重渲染。
- 一批操作排队/退避期间持续高频全量刷新 → 持续掉帧。

### L2. 全量替换 tasks + 行组件未 memo

- `tasks.tsx:25`：`setTasks(page.items)` 每次产生全新对象数组 → FlatList 全部可见行重渲染。
- `tasks.tsx:90`：`renderItem` 为内联函数，行组件无 `React.memo`。
- `tasks/repository.ts:19`：`map()` 对每行 `JSON.parse` input_json / images_json / audios_json ×40 行，全在 JS 线程（inputSnapshot 可能很大）。

### L3. 维护路径串行且偏重

- `tasks/sync.ts:181-194`：`repairTaskProjections` 串行 32 任务 × (get + listArtifacts + upsert)。
- `syncPolicy.ts:16-31`：手动刷新 `forceMaintenance=true` 每次强制跑 repair + reconcile + CAS GC（`reconciliation.ts:176-185`），拉长"正在刷新…"窗口。

### 次要

- `tasks.tsx:93-103`：每个活跃卡片 1s 定时器；多活跃任务时每秒多次局部重渲染（TaskTiming 已 memo，影响有限）。

---

## 症状 1：显示与后台状态不一致

### C1. `load()` 的 in-flight 守卫静默丢弃刷新，且无补偿 ★主因

- `app/(tabs)/tasks.tsx:25`：`if (loadInFlight.current) return;` —— 任何重叠触发被静默丢弃：
  - focus 刷新（`tasks.tsx:27`）
  - `retry` / `retryExport` 完成后的重载（`tasks.tsx:73,84`）
  - poll 定时触发
- 丢弃后**不排队、不重试**：若无活跃任务且无 pending 操作，`nextPollDelay` 返回 undefined（`pollSchedule.ts:13`）→ 不再有任何定时器。
- 典型场景：点"重新下载"时恰有 poll 在飞 → `requestTaskDownload` 已完成并写库（DOWNLOADED），随后 `load('poll')` 被丢弃 → UI 永远停在"排队中/下载中"，直到用户手动刷新或切换 tab。

### C2. 轮询条件基于"已显示"的前 40 条

- `tasks.tsx:28`：`hasActiveTasks` 基于当前 `tasks`（`listPage` created_at DESC 前 40，`repository.ts:57,61`）。
- 活跃任务若排在第 2 页 → `hasActiveTasks=false` → 10s 活跃轮询停止（`pollSchedule.ts:12`），该任务状态只能靠操作级 nextWakeAt 唤醒，无兜底。

### C3. 双读窗口

- `tasks/sync.ts:226`：`syncTaskRun` 内部 `listTasks()`（listActive）读一次；
- `tasks.tsx:25`：UI 随后再用 `listPage` 读第二次；
- 两次读取之间 executor / 后台 service 模式同步（`native/taskMonitor.ts:16-19`、`tasks/background.ts:21-26`，后台任务与前台共享同一 DB）可能继续写库 → `setTasks` 的快照又落后一拍。

### C4. poll 失败静默

- `tasks.tsx:25`：仅 `mode === 'manual'` 时 Alert；poll/maintenance 同步失败无任何 UI 反馈，"已更新 hh:mm:ss" 不变，用户无从察觉列表已过期。

### C5. 状态变更无事件推送

- 刷新期间 `ARTIFACT_DOWNLOAD`/`EXPORT` 完成直接写 tasks 表（`workflows/executor/artifactOperation.ts:91-137`），UI 只能等下一次 `load` 反映；与 C1 的丢刷新叠加后差异被放大。

---

## 修复优先级建议

1. **P0 卡死**：把哈希移出 JS 线程（expo-crypto 原生 digest / native 模块逐 chunk 更新）；取消或原生实现发布前的全量 reread 校验；`File.write` 改异步/整文件下载后 rename。参考 `cas.ts:52,79-85,96-108,151-167`。
2. **P1 不一致**：`load()` 丢弃改为"合并/排队"（in-flight 时记 dirty 标记，完成后强制再跑一次）；`retry` 完成后无论守卫结果都保证一次重载。参考 `tasks.tsx:25,73,84`。
3. **P1 卡顿**：`nextPollDelay` 的 250ms 下限提高并加退避（`pollSchedule.ts:8`）；`setTasks` 改为按 id 合并 + 行组件 `React.memo`；`renderItem` 提取为 memo 化组件。
4. **P2**：`hasActiveTasks` 改为查 DB 的活跃任务计数而非已显示列表（`tasks.tsx:28`）；poll 失败给出 UI 反馈（`tasks.tsx:25`）；`repairTaskProjections`/reconcile 降频或分片。

## 验证建议（实施修复时）

- 手动：造一个大视频（≥100MB）下载 + 同时刷新，观察 JS 线程（Flipper/Hermes profiler）与 UI 响应。
- 自动化：`mobile/src/route-tests/tasks.test.tsx` 已覆盖刷新 busy 态与 focus 刷新（行 60-90、202）；补充"in-flight 时第二次 load 被合并后仍会执行"的用例。
- 回归：`npm run typecheck && npm run test`（mobile/ 目录）。

---

# 复审（2026-09-05，修复后验证）

对照提交 `b672ea54..480e879a`（projection session / revision fence / native CAS / executor scheduler 重构）逐项复核。

## 验证证据

- `npm run typecheck`：退出码 0，无错误。
- `npm test`：**120 suites passed / 692 tests passed / 2 skipped / 0 failed**。
- Android 原生侧另有 `ArtifactTransferTest.kt` 等 JUnit 测试源码（本次未运行 Gradle）。

## 原发现逐项结论

| 编号 | 原发现 | 结论 | 证据 |
|---|---|---|---|
| F1 | CryptoJS 纯 JS 哈希整段视频×2 | **已解决** | 下载+哈希移入原生 `transferArtifact`（`MediaModule.kt` 用 `Executors.newFixedThreadPool(2)` 后台线程池）；校验用 `sha256File` 原生哈希（`media/cas.ts:285-293`）；CryptoJS 仅剩 operationPart 小字符串（`cas.ts:76`） |
| F2 | 每 64KB chunk 同步写文件 | **已解决** | 流式写移入原生 `ArtifactTransfer.kt`；JS 侧 `CasFiles` 已无 write/readChunks |
| F3 | 刷新路径大量同步 SQLite | **基本解决** | `operationRepository` 全部异步且 claim 带 fence（`RETURNING`+复读校验，`operationRepository.ts:199-229`）；committer/reconciliation/scheduler/claimMaintenance 均改异步。**残余**：`jobStateRepository` 仍有 10 处 `*Sync`（见 N1） |
| F4 | 卡死窗口=刷新转圈窗口 | **已解决** | UI 只做快照读+命令唤醒（`tasks.tsx:20-23`）；执行器在独立 scheduler slice 中运行（`foregroundExecutorScheduler.ts`），维护挪入 `executorRunner.ts:26-28`，由 5 分钟冷却租约节流 |
| L1 | 250ms 热轮询 | **已解决** | `pollSchedule.ts` 已删除；会话定时最小 1000ms（`taskListSession.ts:57-59`）；scheduler 兜底最小 1000ms（`foregroundExecutorScheduler.ts:30-35`） |
| L2 | 全量替换+行未 memo | **已解决** | `equalCard` 保序去重保持 item 身份稳定（`taskListSession.ts:96-101`）；`TaskCardRow` memo 化；卡片查询不再解析 input_json/images_json（`projectionRepository.ts:67-107` 只取展示列） |
| L3 | maintenance 串行 32 任务 | **已解决（移出 UI 路径）** | repair+reconcile 在后台 slice 内执行，`claimMaintenanceWindowAsync` 5 分钟冷却或 force-next-slice（`executorRunner.ts:25-28`） |
| C1 | load 丢刷新无补偿 | **已解决** | dirty 标记+cause 合并，drain 循环直到干净，flight 结束后补跑（`taskListSession.ts:62-143`），无静默丢弃 |
| C2 | 轮询条件基于已显示 40 条 | **已解决** | `readActivity` 用 SQL COUNT 统计活跃任务含 download/export 状态（`projectionRepository.ts:146-153`）；监控用 `listActiveTaskIds`（`taskServices.ts:17-20`，路由测试覆盖离页任务） |
| C3 | 双读窗口 | **已解决** | `readConsistentWindow` revision fence（`projectionRepository.ts:181-193`）；revision 由 SQLite 触发器维护（`schema.ts:51-56`），命令与读取单一事实源 |
| C4 | poll 失败静默 | **已解决** | 非模态"状态可能已过期"横幅+手动刷新仅告警一次（`tasks.tsx:52`，路由测试覆盖） |
| C5 | 状态变更无事件推送 | **已解决** | 命令路径统一 invalidate+signal（`taskCommandService.ts:22-23`、`submissionCommand.ts:34-35`、`connectivityCommands.ts:19`）；工作状态变化触发会话读取（`taskListSession.ts:151-154`） |

## 新发现（重构引入，均为低风险残余）

| 编号 | 发现 | 位置 | 风险 |
|---|---|---|---|
| N1 | `jobStateRepository` 仍是同步 SQLite（10 处 `*Sync`），位于 executor handle 路径（job transition、`jobs.get`） | `workflows/executor/jobStateRepository.ts:66-189` | 低：单 slice ≤8 操作、行级小事务；STATUS_SYNC 4 并发时仍有 JS 占用，建议后续异步化 |
| N2 | `loadMore` 在 read in-flight 时静默丢弃（与旧 C1 同类，但 onEndReached 随滚动自然重试）；page 分支 fence 冲突后 `appendCursor` 已消费，需再滚动补页 | `taskListSession.ts:167,73-86` | 很低 |
| N3 | revision 回退（DB 重置/备份恢复）时 session 冲突重试 4 次后抛错进入 stale；pull-refresh 无法越过 revision fence | `taskListSession.ts:92-94` | 很低：legacy 重置流程中 Stack 尚未挂载；恢复流程会 exitApp |
| N4 | claim fence mismatch 抛错中断整个 slice，已 CLAIMED 操作需等 120s 租约过期后由 recoverExpired 重开 | `tick.ts:70`、`operationRepository.ts:216-227` | 低：foreground/service 已由 `task-executor` DB 租约串行化，跨 runtime 竞争概率极小 |
| N5 | 原生传输/哈希仅 Android 实现，iOS 走 `ARTIFACT_TRANSFER_UNAVAILABLE` | `native/media.ts:86-91,122-130` | 记录性：app.json 仅 android 配置，属当前产品约束；未来支持 iOS 需补齐 |
| N6 | 卡片 `downloadProgress` 仍只有 0/1 两态（无增量进度写库），下载中显示 0% 或 100% | `executorRuntime.ts:95-114` | 体验项（旧问题延续，非回归） |

## 总体结论

原审查的 12 项发现（F1-F4、L1-L3、C1-C5）**全部解决**，其中 F3/C5 留有受控残余（N1、N5、N6）。新实现引入 6 项低风险观察点，均不阻塞；建议后续迭代优先处理 N1（jobStateRepository 异步化）与 N6（下载进度增量上报）。

---

# 第三轮审核（2026-09-05，提交 `1a8acd60`）

> fix: atomically project job status and retry SQLite write contention

## 验证证据

- `npm run typecheck`：退出码 0。
- `npm test`：**123 suites passed / 701 tests passed / 2 skipped / 0 failed**（较上轮 +3 suites / +9 tests）。

## 复审残余项处理情况

| 编号 | 原残余 | 结论 | 证据 |
|---|---|---|---|
| N1 | `jobStateRepository` 同步 SQLite | **已解决** | 全部改异步并接入 `withWriteTransaction`（`jobStateRepository.ts`，原 10 处 `*Sync` 清零）；所有调用点（durableExecutor/executorRuntime/taskMonitor）已补 `await` |
| N2 | `loadMore` in-flight 静默丢弃 | **已解决** | `pagePromise` 合并请求并等待当前读完成后再取 cursor（`taskListSession.ts:173-181`）；page fence 冲突现计入 `conflicts`（≤4 次后报错），**顺带修复了上轮实现中 page 冲突分支不计数、可无限重试的潜在死循环** |
| N4 | claim fence / 写竞争 | **加固** | 新增 `sqliteBusy.ts`：`SQLITE_BUSY/LOCKED` 查询级重试（3s 指数退避，经 Proxy 包装 `getDatabase()` 全局生效）+ 事务级整体重试（`withWriteTransaction`，保证不在陈旧读快照上重试单条语句） |
| N6 | 下载进度 0/1 两态 | 未处理 | 维持原状（体验项） |

## 本提交的新改进

1. **原子化任务投影**：`transition()` / `createWithEventAndOperation()` 在**同一事务**内完成 job 变更 + 事件 + 操作 + tasks 投影写入（`jobStateRepository.ts:143-145,178-182`）——消除"job 已变、tasks 投影滞后"的不一致窗口，配合 revision 触发器立即驱动列表刷新。
2. **有界状态修复**：`repairStaleTaskStatuses`（`taskProjectionRepair.ts`）每次 cycle 前修复 ≤32 条陈旧投影（含旧版本遗留、recent-window 外的任务），`hasMore` 并入 `budgetExhausted` 驱动 1s 重排（`executorRuntime.ts:162-166`）；无媒体 IO，不受 5 分钟维护冷却限制。
3. `artifactOperation.policy` 支持异步（`artifactOperation.ts:277`），`readTerminalNotifications` 改异步（`taskMonitor.ts`）。

## 新引入观察点（均低风险）

| 编号 | 发现 | 位置 | 说明 |
|---|---|---|---|
| R1 | `getDatabase()` 现返回 Proxy 包装的连接 | `databaseClient.ts:30`、`sqliteBusy.ts:32-46` | 全部查询自动获得 BUSY 重试；已确认无 `===` 引用比较消费者，测试已相应调整；注意 Proxy 仅缓存方法包装，`withExclusiveTransactionAsync` 传递原生事务句柄不重试（正确） |
| R2 | `repairStaleTaskStatuses` 候选查询无完全匹配索引 | `taskProjectionRepair.ts:13-18` | `ORDER BY j.updated_at` 无法命中现有 `(status,updated_at,id)` 索引；千行级全扫亚毫秒可接受，任务量上万后建议补 `(updated_at,id)` 索引 |
| R3 | `withWriteTransaction` 会整体重试回调 | `sqliteBusy.ts:24-30` | 已审计现有调用点均为幂等 DB 工作 + 幂等读；原生相册导出 `publish` 在事务外不受重试影响 ✓。注释已声明"回调内不得有网络/发布"，后续改动需遵守 |
| R4 | BUSY 重试上限 3s | `sqliteBusy.ts:11` | 持续竞争下命令仍抛错，UI 有 Alert 兜底，可接受 |
| R5 | `withSchedulerLease`（同步变体）已无生产调用方 | `scheduler.ts:59` | 死代码，建议随测试清理 |

## 结论

本提交解决了第二轮全部关键残余（N1、N2）并为写竞争加了系统性防护（N4 方向）；新改进（原子投影 + 有界修复）直接服务于最初的"显示与后台状态不一致"症状，闭环成立。新引入 5 项低风险观察点，无阻塞项；遗留 N6（进度体验）与 R2（索引）可并入后续迭代。

---

# 第四轮审核（2026-09-05，HEAD `be95840d`）

> fix: await executor workers before releasing scheduler lease

## 验证证据（本机实测，非引用文档）

- `npm run typecheck`：退出码 0。
- `npm test`：**123 suites passed / 703 tests passed / 2 skipped / 0 failed**。

## 本提交审查

### 修复内容

`tick.ts` 的两层并发（同 lane 多 worker、跨 lane `Promise.all`）原在首个 worker 抛错（如 `OPERATION_CLAIM_FENCE_MISMATCH`）时**立即拒绝**，`executorRunner` 的 `finally` 随即释放 `task-executor` 租约，而其余已启动的 handler 仍在运行——此时竞争 runner 可持锁进入，与在途工作并发操作同一批 operation。这与第二轮 N4 观察点同源，且 BUSY 重试无法覆盖（不是锁错误，是收尾时序缺口）。

修复：新增 `waitForAll`（`tick.ts:19-24`），两层等待均改为 `Promise.allSettled` 收敛后再传播首个 rejection：
- 租约持有直到全部在途工作 settle（`executorRunner` 的 `assertOwned`/`finally` 时序恢复正确）；
- 失败轮次不 `acknowledge` wake generation（`executorRunner.ts:30` 在 `runCycle` 成功后才执行）→ trailing wake 驱动 +1s 补跑，无丢工作；
- 不吞错：原始 rejection 原样抛出，由 scheduler backoff 呈现。

### 回归测试

`executorRunner.test.ts` 新增 same-lane / cross-lane 两个集成用例（真实 SQLite + 真 operation repository + tick + runner，仅注入 claim 错误与完成时机门）：验证竞争 runner 在在途工作完成前 `competingCycles === 0`、租约存在；收尾后错误传出、op 成功落库、租约释放、`handledGeneration` 保持 0、后续 runner 可进入。断言覆盖完整（文档记录修改前两用例均失败，符合 red-green）。

### 附带确认（上轮遗留疑点）

1. **投影覆盖风险：排除**。`jobToTaskProjection` 先 `...previous` 展开（`projection.ts:18`），`videoUrl` 回退 previous（`projection.ts:33`）；`upsertWorkflowProjection` 冲突更新不含 download_state/download_error/download_progress/gallery_uri/export_* 列（`repository.ts:49`）——原子投影写入不会覆盖媒体投影状态。
2. `withWriteTransaction` 整体重试在 revision 触发器场景下安全：触发器自增随事务回滚一并回滚，重试不会虚增 revision。

## 新观察点（低风险，不阻塞）

| 编号 | 发现 | 位置 | 说明 |
|---|---|---|---|
| R6 | `waitForAll` 只重抛首个 rejection，同轮其余 worker 的异常被收敛丢弃 | `tick.ts:19-24` | 这些异常均已先经各自 `catch → release/retry` 路径处理；仅影响诊断信息完整度，可后续聚合 |
| R7 | worker 内 `release` 若抛非预期错误会进入 waitForAll 收敛路径 | `tick.ts:76` | release 失败的操作将由 `recoverExpired` 兜底重开，行为正确；仅日志噪音 |

## 总结

第四轮确认：`be95840d` 闭合了第二轮 N4 的实质缺口（租约提前释放），`1a8acd60` 的原子投影经复核无覆盖副作用。当前 HEAD 上原审查全部 12 项 + 复审残余 N1/N2/N4 均已闭环并带回归测试；遗留项仅 N6（下载进度体验）、R2（可选索引）、R5（死代码）、R6/R7（诊断完整性）——均为低风险改进项，无正确性风险。
