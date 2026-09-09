# C → D 准入与设计偏差评估

日期：2026-09-05。审查基线：`b80140259cd312dd4e213242543dae659bad6474`，本地 `v1.4.12^{}` 与 HEAD 一致，schema v8。

本轮为阶段评估：核对计划、实现、闭环记录，复跑自动化并查询发布状态；未修改产品代码、未安装 APK、未操作设备数据、未调用真实 LLM/AutoDL。既有未跟踪 `docs/reviews/` 保持原样。

## 1. 准入结论

**C 的工程基础已支持 D-Core；现在可以进入 D 的设计收敛与实施准备。D 实现应有条件准入，不能直接照 9 月 1 日的旧计划开工，也不能将 C 全部验收标为完成。**

- C 已实现持久 operation、租约恢复、UNKNOWN 不自动重提、CAS、媒体导出，以及命令/执行/投影分离。近期状态滞留、SQLite 并发写冲突与执行器提前释放租约已有修复和回归证据。本轮抽查及自动化未发现需要重做 C 的理由；这不等于对所有设备场景作无缺陷保证。
- 发布集成条件已满足：v1.4.12 正式发布且流水线成功。旧文档仍要求从 v1.4.9/v6、甚至未合并 C 分支开始，属于已失效的基线描述。
- 性能验收 `PERF-1` 明确 open；v1.4.9 真实业务手工矩阵也没有在所查记录中找到完整逐项关闭证据。后续真实任务恢复、12 次刷新与并发夹具覆盖了其中一部分，不能推定剩余场景全部通过。
- 技术判断上，PERF-1 可作为进入 D 后继续跟踪的验收项，不必阻止离线数据模型工作；但这属于**准入策略调整建议**。旧交接文档明确要求人工门完成后才实现 D，本报告不擅自将该门改成已通过。

建议在 D0 统一入口记录：补齐已执行场景的证据、列出真正未测项，并明确这些未测项对 D-Core 开工和 Studio 发布分别是否阻塞。无需为了旧版本号回退到 v1.4.9。

## 2. 本轮新验证与证据边界

| 项目 | 本轮结果 |
|---|---|
| `npm run typecheck` | 通过，退出 0 |
| `npm run verify:workflow-releases` | 通过；2 个固定工作流 release，以及 `mobile-1.4.10` manifest 校验成功；manifest 名称不是当前 app 版本 |
| `npm test -- --runInBand` | 123 suites passed / 1 skipped；703 tests passed / 2 skipped；0 failed，14.432 秒 |
| `git diff --check`（产品代码未修改） | 通过 |
| 本地 release 基线 | `v1.4.12^{}` = `b8014025` = HEAD |
| GitHub release | 非 draft、非 prerelease，2026-09-05 12:45:04 UTC 发布，universal APK 已上传 |
| GitHub Android Release run | HEAD `b8014025`，completed/success |
| 本轮 Android/真实业务 | 未重跑；既有证据与本轮验证分开使用 |

测试日志：本地忽略目录 `.superpowers/d-entry-review-jest.log`。

发布来源：[v1.4.12](https://github.com/czh869452912/autodl_minimax_h3/releases/tag/v1.4.12)、[成功的发布流水线](https://github.com/czh869452912/autodl_minimax_h3/actions/runs/33965623010)。本轮查询了发布资产元数据，没有重新下载 APK 做独立签名校验。

既有设备证据主要见 [刷新回归修复](../verification/2026-09-05-task-refresh-regression-fix.md)：真实 Expo SQLite 10 轮并发、40 次状态转换、30 次命令唤醒、原问题数据恢复及 UI 成功状态；后续 N4 修复由集成回归覆盖，未重新安装。

未闭合性能门见 [PERF-1](../../../verification/2026-09-05-task-refresh-follow-ups.md)：生产 HTTPS 128 MiB 完整传输、release 等效构建、100/1000 任务对比、5 次独立冷启动、下载期间交互与 JS stall 尚未完整验收。现有 debug 本地文件与 connection-cold 数字不能替代。

## 3. D 计划必须调整的部分

### A. 迁移与状态所有权：v8 → v9，保留 C 的投影机制

证据：旧 [D-Core 计划](../plans/2026-09-01-d-core.md) 第 7、23 行仍要求 v7；`mobile/src/storage/schema.ts:1` 已为 v8；v7 属于 registry release，v8 属于刷新投影和持久唤醒。

调整建议：

- 以开工时最新已验证的集成提交为基础；若届时无其他 schema 发布，D 首个迁移使用 v9。不得修改已发布 v7/v8 的语义。
- 文件图应补齐 `schema.ts`、`APP_TABLES`、current schema、migration runner/fresh 路径与 schema ownership 测试，不能只增加一个 migration 文件。
- 覆盖 fresh v0→v9、已发布 v8→v9、仍支持的 v4～v7 连续升级、重复执行、备份失败与事务回滚；保留任务、job/event、媒体、CAS refs、registry release、revision/wake 状态。
- “legacy 只读”指 D 通过只读接口消费旧任务；不能将 `tasks` 全局冻结。C 仍需在 job 转换事务里写任务投影，媒体执行器也继续更新其拥有的列。

### B. 新领域写入必须复用异步事务、命令与投影边界

证据：`mobile/src/create/submissionCommand.ts:12` 已原子写入 job/event/operation/task/wake；`mobile/src/workflows/executor/jobStateRepository.ts` 已将 job 转换与 task 投影统一事务；`mobile/src/storage/sqliteBusy.ts:23` 提供整事务 BUSY/LOCKED 重试。

- 项目提交应经过应用 command service：同一事务固定 prompt/asset/workflow 版本、建立 job 关系、落库 operation 与 wake；提交后才发失效通知。网络与文件发布在该事务外执行。
- 不要先入队再单独 `linkProjectObject`。崩溃可能留下已提交但没有来源关联的 job；也不要在 durable handler 里到处查询 Project，倒置执行层依赖。
- Studio 方案提到的 `submissionQueue.ts` 是旧入口。当前 CreateForm 实际调用 `persistSubmissionCommand`；D 应提炼/扩展这一权威路径，不能另建一套队列。
- Project/Studio 建立异步、有界、可分页的投影 reader/session，借鉴现有 revision fence、尾随刷新和跨 runtime 发现机制。v8 revision 只覆盖 tasks/operations，新领域表变更必须有相应失效依据。
- 工程状态、下载状态、导出状态分别展示；不能把“provider 生成成功”直接等同于“本地可播放”。UNKNOWN 应有明确等待对账/人工决定的状态，不能落到通用“失败重试”按钮。

### C. 资产导入与删除保护必须先于项目媒体 UI

证据：`mobile/src/tasks/repository.ts:74` 的删除会物理删除 job/artifact/media/delivery；`mobile/src/workflows/executor/exportOperation.ts:181` 在不保留私有副本时释放 workflow artifact 引用；`mobile/src/media/cas.ts:318` 的 GC 没有保留时间参数。

- Task 3 只有 `createAssetVersion({casHash})`，遗漏“从图片/音频选择器、聊天附件、已有生成产物导入 CAS”的入口。当前 `MediaPicker.ts` 会把文件复制到 cache，临时 URI 不能成为项目长期身份。
- 增加本地媒体 ingestion service：异步复制/校验/hash/原子发布，按 MIME 校验，失败清理，再事务写 AssetVersion 与 refs。现有 CAS 接口以 operation-owned native part 为边界，不能假定任意 picker URI 可直接接入。
- 每个历史 AssetVersion 持有独立引用；hash 去重仅去重内容，不能把不同项目/角色/版本的语义身份合并。提交中的输入也要持有版本引用，不能执行时解析“当前资产”。
- 建立域引用感知的删除/归档服务。已经被项目引用的 job、artifact 和 delivery 不应被任务页硬删除切断来源；由归档、解除关系、最终物理清理分开处理。
- `keepPrivateCopy=false` 只释放投递方引用；被项目版本引用的 blob 应继续保留，并让 UI 说明项目占用。历史版本尚保留时，项目归档不等于允许清理全部 blob。
- GC 补齐“最后失去引用时间 + 保留窗口”，明确 retain 与 GC 并发的 fence/删除预留规则。当前先删除 blob 行再异步删文件的流程，不能未经适配就用于任意前台项目 retain；增加真实独立连接竞争测试。陈旧 part/quarantine 清扫继续采用有界、按龄且检查所有权的方式。

以上是 D 引入长期引用后必须满足的新约束，不是断言现有 task-only 删除契约本身错误。

### D. 将 Studio 的可变镜头表改成版本化创作模型

证据：[Studio 方案](2026-09-04-h3-style-skills-decoupled-studio-review.md) 第 95～101 行将 prompt、绑定、状态、taskId 与视频 URI 放在一行 `project_shots`；与 D 的不可变历史要求冲突。该方案尚未成为产品实现，`src/domain`、`src/project` 尚不存在。

- 保留 Project 为可修改标题/归档状态的容器；PromptRevision、AssetVersion 及已确认创作内容不可变。Job 的输入/provenance 不可变，但运行状态按 revision/event 演进；旧计划“Project/WorkflowJob 不可变”的泛化措辞需消除歧义。
- D-Core 先定义与未来 Shot/WorkPackage 的关系契约。D-Studio 再加入稳定 Shot 身份和 ShotRevision；WorkPackageRevision 固定镜头顺序、版本与资产绑定集合。避免第一版做不可追溯表，第二版再重建。
- 创作 WorkPackage 与已签名的执行 WorkflowPackage 是两类对象，名称和责任必须区分。
- `[char:Mia]`、`[scene:kitchen]` 可用于候选匹配；确认后持久化 assetVersionId、用途和顺序，不能继续按名称隐式绑定。重名、缺失引用、越权跨项目引用均应明确处理。
- 同一镜头重生生成新 job/attempt，保留旧产物；选用哪个成片是独立选择状态。完整 GenerationVariant 产品功能仍可后置。
- 创建确认应记录所确认的 revision/hash 与来源 message/thread/skill 信息；不要把一个可随意覆盖的 `confirmed` 布尔字段当完整确认历史。

### E. Agent → Studio 应是结构化、可恢复的输入协议

证据：`promptParser.ts:26` 只提取第一个代码块；`promptDraft.ts:4` 草稿一小时过期且消费即删除；`AgentScreen.tsx:224` 导出时附件 ID 为空，CreateForm 只恢复 prompt。`aguiAgent.ts:135` 每次输入 fresh skill files；现有调用未配置持久 checkpointer。

- 不把“放开系统提示词 + 多镜头正则解析”当作完整方案。定义版本化结构包 schema，校验镜头 ID、数量、时长/分辨率、资产绑定和目标 workflow capability；保留旧单 prompt 兼容入口。
- 流式半包、无效包、重复消息重放不能直接落成可提交项目；使用 thread/message/package identity 做幂等导入，预览/确认后生成新 revision。
- 快捷气泡可以保留，但正则提取只作显示降级；实际确认要绑定稳定 choice ID 与 revision，不能从模型输出的勾选符号推定用户同意提交。
- 先解决已确认项目内容跨 run/重启持久化；必要时从域仓库重建 Agent 上下文。完整虚拟 FS/checkpointer 可另立范围，不能继续依赖聊天长文本充当项目数据库。
- “一键带入”应携带 promptRevisionId、资产版本和顺序、duration/resolution、workflow 坐标；接收页校验目标 schema，并在实际提交时再次校验。创建页不必靠一小时临时草稿维持来源追溯。

### F. UI 方向可保留，交付范围应重新分期

“导演对话 + 制作工作板”、资产面板、镜头卡片的方向符合当前痛点。D 第一版只做通用 Project 历史页会遗漏多镜头消费痛点；一次性加入整包批跑与 DAG 又超出原 D-Core。

| 分期 | 建议交付与退出条件 |
|---|---|
| D0：基线与合同 | 修订旧计划/交接，明确未闭合 C 门；固定 schema、权威写入口、版本/引用/删除规则、结构包协议与范围 |
| D-Core：离线项目基础 | v9（按开工时版本调整）、Project/PromptRevision/AssetVersion/links、媒体 ingestion、引用与删除保护、轻量离线历史；确认不损坏 C 任务与媒体路径 |
| D-Studio：单镜闭环 | 项目上下文、分镜预览/确认、资产绑定、一键带入或单镜提交、结果回链、重启恢复；UI 复用任务执行投影 |
| D-Extended | 整包批跑、Batch/Variant、并发/预算策略、取消/部分重试、项目导入导出 |
| 更后续 | DAG、生图/配音/剪辑适配器、同步/协作、Web 独立产品化 |

工作板放在项目详情内，保留当前快速创建和全局任务入口；避免尚未建立项目上下文就改造全局导航。镜头列表应虚拟化、按需加载历史与播放器，避免在每张完成卡片同时挂载播放实例。下载百分比当前主要为 0/1，未接入真实增量事件前不要显示虚构精度。

Studio 文档的“2～3 天/1～2 周”估计未覆盖上述合同与设备门，应按拆分后的交付重新估计。

## 4. D 验收需要新增的场景

1. 断网创建项目、导入图片、修改多个 prompt/asset 版本，重启后历史可读；改名/重新排序不改变已提交任务的绑定。
2. 从聊天导入同一个包两次、流式中断后重试，不重复创建版本或提交 job；无效包不进入可执行状态。
3. job 提交过程中故障注入：版本引用、项目关系、job/event/operation/wake 全部提交或全部回滚；幂等重试不能制造新收费提交。
4. 项目持有产物时删除原任务、关闭 keep-private-copy、执行导出/GC；媒体和来源历史仍正确。覆盖项目归档、引用释放与独立连接 retain/GC 竞争。
5. 镜头重新生成不覆盖旧 job/artifact；UNKNOWN 不自动重提；生成、下载、导出失败能分别恢复。
6. v8→新版本与 fresh 安装、支持的旧版本升级、备份失败/迁移回滚/只读恢复；保留已有业务和私有媒体。
7. 项目/镜头列表有界分页，状态转换与前后台唤醒同时发生时仍一致；下载期间交互独立于执行器完成。PERF-1 应在 Studio 发布验收前关闭或有明确的范围化处置记录。

设备验收使用专用 AVD/独立 fixture；有业务数据的设备避免 Gradle connected 测试安装清理。沿用刷新回归记录中的数据保护教训，不以清空业务库解决迁移问题。

## 5. 下一步建议

先将旧 D-Core plan、C/D handoff 与 Studio 方案合成一致的 D0/D-Core/D-Studio 执行基线，再实施第一批迁移与引用保护。本报告仅提供评估与调整建议，未将建议写成已批准实施计划，也未改写既有验收结果。
