# C-Core 合并后稳定性修复设计

> 设计日期：2026-09-03
>
> 目标分支：`dev`
> 输入：C-Core 合并后的媒体交付回归，以及 `docs/superpowers/reviews/` 下 2026-09-03 的五份审查记录。

## 1. 背景与结论

C-Core 将任务提交、状态同步和 Artifact 下载迁移到持久化 operation executor 后，旧的 `TaskSyncCoordinator -> MediaDeliveryQueue -> ensureTaskMedia` 自动交付链被旁路。新链虽然能可靠提交和监控远端任务，但在终态后的后续 tick、Artifact snapshot、媒体投影和相册导出之间缺少完整衔接，导致以下同源现象：

- 任务进入成功状态后，新建的 `ARTIFACT_DOWNLOAD` 被留到下一 tick，但任务页随即停止活动任务轮询；
- 设置中的“自动保存到系统相册”没有进入 durable operation 路径；
- 下载事务只 `UPDATE media_assets`，而 status 路径没有先创建对应行；
- 手动下载或导出可以让系统相册出现视频，却不能让结果画廊出现缺失的作品。

同日的 Prompt 助手专项 review 还确认了三类仍存在的用户可见缺陷：无条件自动滚动、历史会话顺序和识别口径不一致、相册多选附件 ID 碰撞。Timeline 对标 review 的 P0 项与这些缺陷共享同一 UI 和运行时边界，适合在同一个稳定性版本中完成。

本轮作为一个发布稳定性里程碑，拆成三个可以独立测试和提交的垂直切片：

1. Durable 媒体持久化与自动交付闭环；
2. Prompt 会话与附件数据正确性；
3. Prompt Timeline P0 交互修复。

三个切片共同进入同一个发布候选版本，但不互相混合提交。任何切片失败都不应破坏另外两个切片已经建立的状态不变量。

## 2. 范围

### 2.1 本轮纳入

媒体闭环：

- `STATUS_SYNC -> ARTIFACT_DOWNLOAD -> EXPORT` 的持久化 operation 链；
- 同一入口内的有界多 pass 调度，使新建 operation 可以在后续快照及时执行；
- `workflow_artifacts`、`media_assets`、`tasks`、`media_deliveries` 与 CAS metadata 的一致投影；
- `autoExportToGallery` 与 `keepPrivateCopy` 的 durable 执行语义；
- 自动下载和自动导出失败在任务列表中的可见状态；
- 对已经受本次回归影响的数据进行有界、幂等修复；
- A/B review 中与该链直接相关的 L1、L2、L3。

Prompt 数据正确性：

- 相册多选附件 ID 和 fallback 文件名唯一；
- 历史会话组内按最近活动时间排序；
- 历史计数与 Timeline 可见行口径一致；
- 默认同名会话在历史列表中可区分；
- 配置变化或会话删除时淘汰旧 runtime，阻止失效 runtime 覆盖当前会话。

Prompt Timeline P0：

- 只有用户仍贴底时才自动跟随流式输出；
- 用户离开底部后显示“回到最新”入口；
- 失败和中断在 Timeline 内显示，并为最后一轮提供重试；
- assistant 正文支持复制；
- 空状态建议可点击并写入 composer。

### 2.2 本轮不纳入

- A/B review M6 的动态公网 Artifact 主机授权收紧；该项需要单独的 provider 安全兼容设计；
- Registry `upsert` 并发竞态、`removeUnreferenced` N+1 和未使用 redirect helper 等独立清理项；
- Timeline P1/P2：动画、工具耗时、历史附件全屏预览、Prompt 版本 diff、编辑并分叉、完整时间锚点；
- Batch/Variant、原生 ComfyUI 队列取消语义和其他 D-Core 功能；
- 与本轮触达文件无关的通用重构。

## 3. 核心不变量

### 3.1 Operation 与调度

1. 一个 tick 仍只执行 tick 开始时取得的快照；本轮不破坏该有界和可审计语义。
2. 一个 executor cycle 可以连续执行多个 tick pass，但必须同时受 `maxPasses` 和 `maxOperationsTotal` 限制。
3. 每个后续 pass 都重新读取 due operation；只有上一 pass 有进展且仍有 due operation 时才继续。
4. 达到预算、没有进展、只剩未来 operation 或进入只读模式时立即停止，不允许无界 drain。
5. operation 的 idempotency key、lease owner、attempt 和 retry backoff 继续由现有 repository 保证。

默认 cycle 预算为最多 4 个 pass、总计最多 8 个 operation。典型成功链分别占用 submit、status、artifact、export 四个 pass；轮询中的未来 `STATUS_SYNC` 因 `nextRetryAt` 未到期而自然停止。

### 3.2 Artifact 与媒体投影

1. 成功或部分成功的 job 返回的每个 Artifact 都必须持久化到 `workflow_artifacts`。
2. 每个带远端 URL 的视频 Artifact 必须有且只有一个稳定 ID 的 `media_assets` 行。
3. `ARTIFACT_DOWNLOAD` 成功后，blob metadata、blob reference、task media projection、media asset local projection 和 operation 成功状态必须作为一个 SQLite 事务提交。
4. Artifact metadata 投影只能非破坏性更新，不能覆盖已经存在的有效本地路径、海报或已导出状态。
5. `media_assets.status = downloaded` 只有在可用本地文件存在时成立；修复扫描发现文件丢失时必须降级为 `queued` 或 `failed`。
6. 结果画廊继续只读 `media_assets`，不退回从 `tasks` 临时拼装 UI 数据。

### 3.3 自动导出

1. `autoExportToGallery` 在 Artifact 成功落入 CAS 时求值；为 `true` 时创建稳定、幂等的 `EXPORT` operation，为 `false` 时不创建。
2. `keepPrivateCopy` 与自动导出决定一起写入 operation payload，避免排队期间设置变化导致同一 operation 行为漂移。
3. `EXPORT` 只能以已校验的应用私有文件作为源，不能把系统相册 URI 当成 canonical source。
4. Android publisher 继续以稳定 display name 查找已完成项；进程在外部发布成功、数据库提交前终止时，重试必须复用既有 MediaStore 项而不是生成重复视频。
5. `keepPrivateCopy=false` 时不能直接删除 CAS 文件。导出成功后先事务化清理 task/media 本地路径并释放对应 blob reference，之后只允许 CAS GC 删除已无引用的 blob。
6. `media_deliveries.status` 和 `media_assets.export_status` 均保存稳定枚举；中文文案只在 presentation 层生成。

### 3.4 Prompt 会话与附件

1. composer 内每个附件 ID 必须唯一；批量选择、跨毫秒边界和跨入口合并都不能产生重复 React key。
2. 删除、提及和发送附件必须始终按唯一 ID 指向同一个附件。
3. 历史分组内固定按 `updatedAt DESC`、`threadId` 次序稳定排序。
4. 历史消息数由与 Timeline 相同的 normalization helper 计算，不展示包含隐藏 tool result 的原始数组长度。
5. 自定义标题保持原样；未自定义且标题相同的历史行追加创建时间作为显示限定符，但不修改持久化标题。
6. 同一 thread 在任一时刻只有一个可写 runtime generation。旧 runtime 被淘汰后，即使迟到事件到达，也不能 emit snapshot 或写入数据库。

### 3.5 Timeline 交互

1. 初次加载、用户发送消息且仍贴底时，Timeline 跟随最新内容。
2. 用户主动上滑离开阈值后，流式 delta、内容尺寸变化、键盘布局变化和 Prompt 卡挂载均不能改变用户视口。
3. 用户滑回底部或点击“回到最新”后恢复跟随。
4. 自动跟随状态由 scroll metrics 和明确的用户拖动事件驱动，不能由消息长度猜测。
5. 失败或中断行属于当前会话的 UI 运行状态，不作为模型输入；切换会话时按 thread 隔离。
6. 重试复用最后一条用户输入与附件快照，但不得重复插入两条可见用户消息。

## 4. 架构设计

### 4.1 有界 executor cycle

保留 `createExecutorTick` 作为单快照执行单元，在其上增加 cycle orchestration。`syncTaskRun`、RootLayout、Expo background task、原生 task monitor 和 CreateForm foreground trigger 都调用同一个 cycle，不各自实现循环。

Cycle 聚合所有 pass 的 summary，并额外区分：

- `remainingDue`：当前仍可立即执行的 operation；
- `remainingScheduled`：只在未来到期的 operation；
- `budgetExhausted`：因 pass/operation 预算停止。

UI 是否继续轮询以 operation summary 为准，而不是只看 task 是否为 `QUEUED/RUNNING/UNKNOWN`。这样终态 status 创建下载后，任务页不会提前停止；同时 cycle 通常会在同一次入口的下一 pass 立即开始下载。

### 4.2 Status reconciliation

扩展 job transition 的输入，使一次成功的 status CAS 事务同时完成：

- 更新 job snapshot 和 revision；
- 追加 `STATUS_RECONCILED` event；
- replace 当前 job 的 `workflow_artifacts` snapshot；
- 创建下一 `STATUS_SYNC` 或 `ARTIFACT_DOWNLOAD` operations。

`media_assets` 是可重建 projection，不进入 job domain repository 的核心事务。Status pass 完成后，在 Artifact operation 开始前执行幂等 materialization；Artifact handler 本身也必须执行 ensure projection，避免崩溃窗口或旧数据造成 `UPDATE 0 rows`。

Task projection repair 从持久化 Artifact snapshot 设置 `videoUrl`，并保持媒体拥有的 `localUri/galleryUri/download/export` 字段不被 workflow 更新覆盖。

### 4.3 Artifact download commit

Artifact handler 在读取 operation payload 后先确保对应 `media_assets` 远端投影存在，并把 task 下载状态更新为 `ENQUEUED/DOWNLOADING`。下载流继续使用现有 HTTPS、redirect、MIME、大小、hash、idle timeout 和 lease fencing。

成功 commit 事务写入：

- `artifact_blobs`；
- `artifact_blob_refs`；
- `tasks.local_uri/download_state/download_progress`；
- `media_assets.local_path/mime_type/status`；
- 可选的下一 `EXPORT` operation；
- 当前 `ARTIFACT_DOWNLOAD` operation 成功状态。

连接或 idle timeout 继续 retry；policy、MIME、大小或 hash 失败进入 terminal failure，并同步写入任务和媒体失败投影。失败原因对用户使用安全、稳定的错误码和展示文案，不保存原始 URL、Token 或 provider body。

### 4.4 Export handler

新增真正的 `EXPORT` handler，复用现有原生 `exportVideo` 边界。Handler 流程为：

1. 读取 task、media asset 和 operation payload；
2. 验证应用私有文件仍存在；
3. 把 task、delivery 和 asset 投影为 `EXPORTING`；
4. 调用原生 publisher；
5. 事务写入 `galleryUri`、`EXPORTED` delivery、asset export enum 和 operation 成功状态；
6. 如果不保留私有副本，释放 blob reference 并清空本地 projection，交给后续 GC。

外部发布失败写入 `EXPORT_FAILED` 和 delivery failure。可判定的本地源缺失不盲目重试；瞬时原生或 I/O 错误使用有界 retry。由于原生 publisher 按稳定 display name 幂等，崩溃后的重试不会产生重复系统相册项。

### 4.5 媒体修复扫描

增加一个有界 reconciliation，每次 cycle 后最多扫描固定数量的候选项：

- 成功 job 有 `workflow_artifacts`、但缺 `media_assets`：重新 materialize；
- `workflow_artifacts` 缺失、但 artifact operation payload 仍在：从 payload 恢复 snapshot；
- task 有有效 CAS `localUri`、asset 缺失或未标为 downloaded：补建/修正 asset；
- task 已 `EXPORTED` 且有 `galleryUri`、delivery 缺失：补建 delivery；
- projection 声称 downloaded、文件却不存在：清空本地路径并降级状态。

扫描必须幂等、分页且有上限，不能在启动或打开画廊时全表遍历。画廊只消费修复后的统一媒体目录。

### 4.6 Prompt runtime lifecycle

Runtime registry 增加显式 lifecycle：

- `dispose()`：标记 generation 失效、abort in-flight run、停止新的 persist、flush 已确认 snapshot、取消订阅和 timer；
- `evictThread(threadId)`：删除会话时清理该 thread 的全部 runtime；
- `ensure(config, thread)`：为相同 thread 建立新 config generation 前先 dispose 旧 generation；
- persist callback 捕获 generation token，token 不再是当前值时直接丢弃迟到事件。

历史排序和显示 helper 保持纯函数，供 UI 与测试共同使用。会话切换只改变 active thread，不改变数据；点击历史行必须始终按 `threadId` 加载对应 snapshot。

### 4.7 Prompt Timeline UI

`ConversationTimeline` 内维护贴底状态：

- `onScroll` 根据 `contentOffset.y + layoutMeasurement.height >= contentSize.height - threshold` 更新状态；
- `onScrollBeginDrag` 立即关闭自动跟随；
- `onMomentumScrollEnd` 和滑回底部重新计算；
- signature effect、`onContentSizeChange`、`onLayout` 只在跟随状态为真时调用 `scrollToEnd`；
- 离开底部且内容继续增加时显示“回到最新”按钮。

Timeline 接收按 thread 隔离的 `runIssue`。发送失败、RUN_ERROR 和用户中断都会生成内联状态行；最后一轮失败行提供重试。assistant 行提供复制入口。EmptyTimeline 的建议 chip 只填入 composer 并聚焦，不自动产生外部 LLM 请求。

## 5. 数据兼容与迁移

本轮复用现有 v6 表结构和 operation kind，不要求 schema version 升级：

- `workflow_artifacts`、`workflow_operations`、`media_assets`、`media_deliveries` 和 blob tables 已存在；
- 稳定 export enum 写入现有 TEXT 字段；
- runtime generation 和 Timeline issue 为内存生命周期状态，不新增数据库列；
- 受影响历史数据通过 reconciliation 修复，而不是一次性破坏性 migration。

如果实施中发现必须增加持久字段，应停止该切片、更新本设计并使用新的显式 migration version，不能在 repository 构造函数中临时 ALTER TABLE。

## 6. 错误处理与恢复

- 所有 projection 更新必须检查目标是否存在；预期应存在却更新 0 行时，先执行幂等 ensure，再重试一次，不静默成功。
- Cycle handler 抛出异常后继续遵守 owner-safe release；不能留下无期限 `CLAIMED` operation。
- 达到 cycle 预算不是失败；summary 标记 `budgetExhausted`，前台保持后续轮询，后台等待下一合法入口。
- Artifact 或 export terminal failure 不改变 job 的远端成功状态，只改变 task/media delivery 状态。
- 自动导出失败后保留应用私有副本，允许用户手动重试。
- Prompt runtime dispose 中 abort 失败或 flush 失败不能让旧 generation 恢复写权限；错误通过当前 runtime notice/inline issue 报告。
- 附件发现重复 ID 时在进入 composer state 前重新分配唯一 ID，并在开发测试环境保留可诊断断言。

## 7. 测试策略

### 7.1 媒体端到端

新增真实 SQLite 集成用例，完整执行：

```text
SUBMIT -> STATUS_SYNC(RUNNING) -> STATUS_SYNC(SUCCEEDED + video)
       -> ARTIFACT_DOWNLOAD -> EXPORT
```

断言：

- 每个 pass 都不执行自身创建的新 operation；cycle 可以在预算内推进后续 pass；
- `workflow_artifacts` 有且只有一个视频 snapshot；
- `media_assets` 在下载前已经存在，下载后为 downloaded；
- task 有 `videoUrl/localUri/DOWNLOADED`；
- 自动导出开启时有一个稳定 EXPORT operation 和一个 `EXPORTED` delivery；
- 自动导出关闭时无 EXPORT；
- `keepPrivateCopy=false` 只释放引用，由 GC 决定是否删除 blob；
- 重启、重复 cycle、重复 status 和外部发布后崩溃均不产生重复 operation、asset、delivery 或系统相册项；
- 历史缺失 asset/artifact/delivery 的受影响任务可以被 reconciliation 修复。

### 7.2 Prompt 数据正确性

- 固定 `Date.now()` 后一次选择多张图片，所有 ID 和 fallback filename 仍唯一；
- 删除其中一张不会删除其他图片，React key 和提及绑定稳定；
- 两个同名 thread 交替活动后，历史组内保持降序且显示可区分；
- raw message 含多个 tool result 时，历史计数等于 Timeline normalization 行数；
- 配置变化期间旧 runtime 收到迟到 delta，不 emit、不 save；
- 删除会话会 abort、flush、evict 对应 runtime。

### 7.3 Timeline 交互

- 初始贴底时，stream delta 与 content size 变化会跟随；
- 用户上滑后，同样事件不调用 `scrollToEnd`；
- 点击“回到最新”恢复跟随；
- 键盘和 layout 变化不打断离底视口；
- RUN_ERROR、abort、retry、assistant copy 和 suggestion fill 均有组件级测试；
- retry 不产生重复的乐观用户气泡。

### 7.4 发布验证

自动化门：

```powershell
npm run typecheck
npm test -- --runInBand
git diff --check
```

Android 模拟器至少验证：

1. 提交真实或受控 fake 任务后，终态无需手动刷新即可开始下载；
2. 自动保存开启时，系统相册与结果画廊均出现同一视频；
3. 自动保存关闭时，只出现应用内作品，不出现系统相册项；
4. 重启后 pending download/export 恢复且不重复；
5. 长 Timeline 上滑期间持续流式输出不抢回视口；
6. 相册一次多选至少三张图片，名称、删除和 @提及对应正确；
7. 两个同名历史会话交替发送后顺序、计数和打开内容一致。

## 8. 实施与提交边界

建议按以下顺序实施：

1. 媒体状态 snapshot 和兼容 projection；
2. 有界 executor cycle；
3. Artifact 成功/失败投影与 durable export；
4. 历史数据 reconciliation；
5. 附件唯一性；
6. 历史排序、计数与 runtime lifecycle；
7. Timeline 贴底守卫；
8. 内联错误、重试、复制和 suggestion chips；
9. 全量自动化与模拟器发布验收。

每项采用 RED -> 最小实现 -> GREEN -> 局部回归 -> 小提交。媒体和 Prompt 两个子系统不放进同一个代码提交；文档更新可在最终验收提交统一完成。

## 9. 完成标准

本里程碑只有在以下条件全部满足时才完成：

- 用户报告的自动下载、自动保存和结果画廊三个现象均有失败测试并已通过；
- 三篇 Prompt 专项 review 的直接缺陷全部有回归测试并已通过；
- Timeline review 的四个 P0 项全部落地；
- 已有 v6 migration、durable recovery、媒体手动操作和 Prompt 助手测试无回归；
- 模拟器验证覆盖前台、持续监控和进程重启路径；
- 受影响历史任务可以自动修复，无需清除应用数据；
- 工作区无未解释改动，发布记录明确列出仍后置的 M6、Timeline P1/P2 和独立低优先级观察项。
