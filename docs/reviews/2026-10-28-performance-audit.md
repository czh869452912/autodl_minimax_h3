# 性能与调度可靠性审查报告

审查日期：2026-10-28（Asia/Shanghai）

代码基线：`5c965205ba3f9e325f9fcae1c629d14c8be494d5`

范围：移动端 React Native 页面、创作数据服务、SQLite schema、执行器与恢复、Agent 会话存储、Android 媒体模块，以及外部导入、CAS 去重、缓存、系统相册发布和文件备份。未修改业务代码。

## 结论

发现 22 项问题或明确的性能风险：8 项 P1、14 项 P2。核心模式是：全量历史被频繁刷新、单个展示单元重复读取整个版本集合、文件校验与浏览绑定、异步操作缺少工作量边界、恢复工作排在新任务之前，以及逻辑记录、临时文件和持久副本的生命周期不统一。

用户报告的两个现象有一条成立的代码级因果链：

```text
版本、历史任务、媒体文件增长
  ├─ 全量读取 / JSON 解析 / 大量组件 / 逐文件哈希 → 页面卡顿
  └─ 恢复检查或原生媒体队列变慢
       → tick 的 2 秒预算在领取任务前耗尽
       → 本轮领取 0 个新任务
       → 下一轮重复恢复检查 → 持续“等待提交”
```

这不是已确认的现场唯一根因：设备上的版本大小、UNKNOWN 数量、具体线程等待仍未知。可以确认的是，该调度饥饿条件已经通过实际执行器代码的受控实验复现，且存在多条让恢复检查变慢的路径。

### 外部素材重复导入的核实结论

用户观察到的“每次一个独立副本”，在素材记录层成立，在 CAS 原件层则有去重。需要按存储层区分：

| 层次 | 当前行为 | 判断 |
|---|---|---|
| 素材、版本及来源记录 | 每次用户导入使用新的命令 key，建立新的 asset/version | 重复逻辑记录成立，会继续放大卡片读取、文件校验与渲染 |
| 应用私有 CAS 原件 | 按文件字节 SHA-256 定址；相同内容共用一个文件 | 正常成功路径没有每次保留一份 CAS 原件 |
| 导入中间文件 | 仍先复制到独立 part，再哈希并确认目标可复用 | 最终去重不消除重复 I/O；正常路径会清理 part |
| 选择器缓存、派生预览 | 缓存与 CAS 分属不同生命周期 | 有残留及重复计算风险，须在设备上盘点实际容量 |
| 系统相册/公开保存目标 | 幂等身份基于 version/delivery，不跨版本按内容合并 | 同内容不同版本分别保存时可能产生真实副本 |
| 不同 ID 的完整文件备份 | 各自复制整套文件，遍历未排除 CAS 临时目录 | 原件和残留文件均可能再次复制；完整备份的独立副本本身有合理用途 |

“相同”指**文件字节完全一致**。同一画面重新压缩、修改 EXIF 或由提供方转换格式后，哈希可能不同，不能保证复用。系统相册中的来源原件与应用私有归档各一份，也有权限和持久性方面的必要性，不能直接归类为泄漏。

## 证据与限制

- **L（逻辑复现）**：执行仓库实际 TypeScript 函数，替换时钟、数据库或文件 I/O，验证调度行为与调用次数。证明算法性质，不代表 Android 耗时。
- **Q（查询计划）**：用当前 schema 的 CREATE TABLE/INDEX 定义在 Node SQLite 内存库中执行 EXPLAIN QUERY PLAN。不包含用户数据，查询计划可能随 SQLite 版本、统计信息和数据分布改变。
- **S（静态证据）**：检查实际调用链、循环、轮询、锁、数据结构与资源生命周期。
- 已找到本地 Android SDK 的 adb；`adb devices -l` 无连接设备。因此没有 CPU 采样、Perfetto、gfxinfo、PSS/heap 数据，也没有真机复现率、帧耗时或峰值内存实测值。Android 版本、设备型号、安装包构建类型不适用。
- 依据 Android performance 技能的证据要求组织审查；未将静态推断写成设备性能结论。未访问服务商或触发生成、导出、删除。

可复现证据：

- [实验脚本](evidence/2026-10-28-performance-audit/reproduce.cjs)
- [原始实验结果](evidence/2026-10-28-performance-audit/results.json)
- 执行命令（仓库根目录）：`node docs/reviews/evidence/2026-10-28-performance-audit/reproduce.cjs`
- 环境：Windows，Node v22.21.0，仓库内 TypeScript；实验断言均通过。实验不打开应用数据库，只写本目录 results.json。

补充的存储实验也执行仓库实际函数：CAS 使用内存文件系统与真实 SHA-256；导入服务使用当前 schema 的内存 SQLite；备份使用内存文件 I/O。两次相同字节的 CAS 发布后，原件文件数为 1、part 数为 0；两次不同命令 key 的 `asset.import` 后，asset/version/version_file 各为 2、artifact_blobs 为 1，重放第二个相同命令 key 不再新增。模拟已发布但未入库的文件，现有 GC 删除 0 个；两次不同 ID 的备份产生 2 份原件和 2 份残留 part 副本。后两项分别是故障窗口模型与合成文件目录，不是实际设备崩溃或磁盘占用实测。备份的目录枚举范围依据静态代码，实验将合成清单交给实际构建函数验证复制行为；其中的 `posters/preview.jpg` 不证明 Android 原生 poster 或响应目录位于 Expo documentDirectory 内。

P1：会阻止任务推进，或在用户描述的数百版本规模下形成直接、持续的重负载，应优先修复。P2：有明确的增长或放大机制，需要在对应场景下优化并验证。没有将所有同步 API、所有轮询或所有排序一概判为缺陷。

## 问题清单

| ID | 优先级 | 问题 | 主要触发条件 | 证据 |
|---|---|---|---|---|
| F01 | P1 | 恢复检查消耗预算，导致新任务持续无法领取 | 每轮恢复检查超过 2 秒 | L/S |
| F02 | P1 | 网络生成、查询和文件操作共用小线程池，查询与生成共用锁 | 慢生成叠加查询、哈希等 | S |
| F03 | P1 | 结果页每 2.5 秒全量加载、解析全部版本 | 单素材数百版本，页面可见 | S |
| F04 | P1 | 打开素材详情前校验全部原件并逐条写库 | 数百版本，反复打开详情 | L/S |
| F05 | P1 | 保存状态轮询每两秒对每个版本分别发 SQL | 详情已加载数百版本 | S |
| F06 | P1 | 素材网格、版本详情条和比较页全量挂载媒体组件 | 大量资产或版本 | S |
| F07 | P2 | 卡片、选材器为少量展示读取全部版本，搜索重复扇出 | 多资产、多版本、输入搜索 | S |
| F08 | P1 | Agent 创作卡片重复读取同一资产的全部版本 | 多张卡片共享一个长版本历史 | L/S |
| F09 | P1 | 大图、Base64、完整响应 JSON 在多个阶段复制 | 图生图、增强、放大、多图输出 | S |
| F10 | P2 | 单轮等待所有长操作，维护与修复也占用执行关键路径 | 慢网络、慢文件、历史修复积压 | S |
| F11 | P2 | 多个轮询缺少防重入或可见性管理，终态也持续刷新 | 读取慢于间隔、路由保留挂载 | S |
| F12 | P2 | 高频关联查询缺少索引，LIMIT 不能避免扫描与排序 | 全库历史持续增长 | Q/S |
| F13 | P2 | 视频历史按轮逐条查任务，重复过滤版本并与子组件重复刷新 | 多轮视频历史、有待处理任务 | S |
| F14 | P2 | 长会话全量恢复、展开外置文本；保存仍扫描全历史 | 大量消息、工具输出和工作区快照 | S |
| F15 | P2 | 蒙版按每个采样点建 View，移动时重建整个点集合 | 长笔划、多笔划 | S |
| F16 | P2 | 原生响应、提交大载荷和恢复引用缺少明确的回收闭环 | 长期连续生成 | S，生命周期风险 |
| F17 | P2 | 相同内容的重复导入不断新建素材与版本记录 | 多次从外部选入同一文件 | L/S |
| F18 | P2 | CAS 去重发生在复制、哈希之后，重复导入仍占用共享资源 | 大文件重复导入或并发附件归档 | L/S |
| F19 | P2 | 选择器缓存缺少应用级清理，派生预览重复生成且缺少磁盘预算 | 反复选材、预览多视频、重启 | S，生命周期风险 |
| F20 | P2 | 文件与数据库提交间的崩溃窗口留下 DB 驱动 GC 看不到的文件 | 导入/回收时进程中断 | L/S |
| F21 | P2 | 相册保存仅按版本/投递幂等，同内容跨版本仍产生独立文件 | 重复素材或相同结果分别保存 | S |
| F22 | P2 | 全量备份复制临时残留，失败备份及多份完整备份缺少保留闭环 | 多次备份、备份失败或文件量增长 | L/S |

## 详细发现

### F01 — 恢复阶段可以让新任务无限期饥饿

位置：[cycle.ts](../../mobile/src/workflows/executor/cycle.ts#L46)、[tick.ts](../../mobile/src/workflows/executor/tick.ts#L70)、[novelAiRecovery.ts](../../mobile/src/creative/novelAiRecovery.ts#L9)。

cycle 在调用 tick 前计算 `Date.now()+2000`；tick 先等待 recover，再查到期操作，进入 worker 时才检查 deadline。若恢复与候选读取已消耗全部预算，worker 直接 break，不会领取操作。下一轮重新设置预算、重新做同样的恢复工作。恢复查询最多取 32 个 UNKNOWN/BLOCKED 请求，逐个校验请求并等待原生 lookup；没有恢复游标或退避时间，未找到回执的同批记录可能每轮重复检查。

受控实验每种配置运行三轮：恢复阶段 100ms 时领取 3 次；2100ms 时三轮均 `claimed=0, remainingDue=1`。这是对现有 cycle/tick 的实验；不是伪造真实网络延迟，也没有证明用户设备恰好是 2100ms。

建议：给恢复单独的时间与数量预算，增量检查并按任务退避；保障到期新任务获得最低推进份额。不要只延长 2 秒预算。保证恢复仍先处理必要的过期归属和发送边界，不得以优化为由重发结果不明的消费请求。

验收：注入慢恢复和持续 UNKNOWN 记录，连续多轮仍能推进新的未发送任务；确认 UNKNOWN 不会自动重发，恢复任务也不会被永久饿死。

### F02 — 原生网络、查询、哈希存在跨功能阻塞

位置：[MediaModule.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt#L22)、[NovelAiTransport.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/NovelAiTransport.kt#L27)。

MediaModule 的媒体执行器只有两个线程。生成、放大、回执查询、标签建议、哈希等均进入该执行器；NovelAiTransport 的 generate 和 lookup 还共用实例锁。generate 持锁执行 HTTP 及文件写入，HTTP callTimeout 为 240 秒。另一个线程若等待 lookup 的锁，两个媒体线程就可能同时无法处理其他本地工作。线程池排队时间也不在该 HTTP callTimeout 内。

lookup 本身会 `readBytes()` 整个 response.json 并重新计算 SHA-256，文件上限 64MiB；因此它不是一个廉价存在性查询。

建议：将网络生成、本地校验与快速查询隔离；缩小锁范围，以请求 key 而非整个 transport 串行化；保留持久发送标记的原子性。原生排队、锁等待和执行分别计时，增加可观测的队列长度。不能简单换成无限线程池。

验收：注入慢生成时，已有回执查询、其他文件哈希仍能推进；相同 key 仍不能重复发送。用 Perfetto 确认媒体线程的 monitor contention 与排队时间。

### F03 — 结果页的全量版本轮询与状态刷新绑定

位置：[CreativeResults.tsx](../../mobile/src/creative/CreativeResults.tsx#L74)、[service.ts](../../mobile/src/creative/service.ts#L74)、[ImageHistorySheet.tsx](../../mobile/src/creative/ImageHistorySheet.tsx#L30)。

每 2.5 秒执行 versions(assetId)，无 LIMIT，读取并 JSON.parse 每一条完整 recipe，然后排序，创建新对象与数组并 setVersions。终态也不会停止这部分轮询。ImageHistorySheet 的 useMemo 依赖 versions，新数组会使过滤重新运行；FlatList 无法消除数据解析成本。任务 status 查询排在全量版本读取之后，读取失败时 status 也不更新。

300 版本时，按每轮都完成的名义频率计算，约 7200 次 recipe 解析/分钟/单资产；这是代码频率推算，不是实测吞吐。对象变化会触发列表更新，但不能据此声称每次重新解码全部图片。

建议：任务状态独立读取；版本列表采用游标分页和轻量摘要，只在创建、文件状态、归档等事件或 revision 变化后更新。完整 recipe 按选中的版本读取；未变化的条目保留对象身份。`onlyJob` 应把 job 过滤下推数据库，避免先读整个资产再过滤。

验收：300/1000 版本静置一分钟，未变化历史不被反复读取与解析；人为拖慢版本查询不影响任务状态展示。

### F04 — 打开详情会校验全部原件并制造数百个写事务

位置：[CreativeWorkspace.tsx](../../mobile/src/creative/CreativeWorkspace.tsx#L103)、[fileResources.ts](../../mobile/src/creative/fileResources.ts#L10)、[runtime.ts](../../mobile/src/creative/runtime.ts#L28)、[foreignKeyConnection.ts](../../mobile/src/storage/foreignKeyConnection.ts#L9)。

inspect 先读取所有版本，串行 verify 每一个，再重新读取版本并展示详情。isActive 只在循环完成后检查，离开页面也不能及时停止剩余校验。verify 即使资源未变化、哈希相同，仍会更新状态、时间、revision，并执行恢复尝试的 UPDATE。

300 个 AVAILABLE 资源的受控实验：300 次哈希调用、600 次资源读取、300 个写事务、600 条 UPDATE 调用。哈希与 SQLite I/O 均为 mock；UPDATE 次数不表示每条都实际修改数据。真实运行时每个独占事务还会新建 SQLite connection、配置外键、BEGIN/COMMIT、关闭 connection。

总文件读取量取决于文件字节数。例如平均每张 4MiB 时，300 张完整哈希约需读取 1.17GiB；这是容量示例，不是当前设备数据。

建议：立即展示已知状态，只校验当前需要使用的版本；其余按访问、文件变更或过期策略分批验证，支持停止。生成发送、恢复、导出等完整性边界保留必要校验。不要为浏览无差别递增全部资源 revision。

### F05 — 详情保存状态轮询形成高并发 N+1 查询

位置：[CreativeWorkspace.tsx](../../mobile/src/creative/CreativeWorkspace.tsx#L65)、[service.ts](../../mobile/src/creative/service.ts#L89)。

每两秒 Promise.all(versions.map(deliveries))，每个版本单独查全部保存记录、取第一条，既没有 reading 锁，也不因全部终态而停止。300 版本意味着每轮发起 300 个查询，名义上每分钟 9000 个；如果一轮超过两秒，下一轮继续排入。

建议：一个批量查询获得当前页面或当前资产需要的最新 delivery 摘要；仅追踪 QUEUED/PUBLISHING，终态走事件；读取防重入，变化后才更新状态。不应仅把 Promise.all 改成逐个 await，否则仍然保留 N 次查询。

验收：300 版本时，一轮保存状态读取为常数级 SQL；无活动保存时停止定时读取；慢查询不积压后续轮次。

### F06 — 虚拟化没有覆盖素材网格、详情版本条和比较页

位置：[CreativeWorkspace.tsx](../../mobile/src/creative/CreativeWorkspace.tsx#L169)、[CreativeWorkspace 素材网格](../../mobile/src/creative/CreativeWorkspace.tsx#L213)、[VersionComparison.tsx](../../mobile/src/creative/VersionComparison.tsx#L29)、[MediaPreview.tsx](../../mobile/src/creative/MediaPreview.tsx#L44)。

这些入口使用 ScrollView/View 加 map，一次挂载所有卡片和缩略图。素材网格初始上限 100，可增加到 1000；详情版本条与版本比较没有分页。图片预览使用 original 路径，image 分支没有独立 thumbnail。对视频，挂载会排入 poster 提取任务；该队列限制了同时执行数，却不会因卡片卸载取消已经排队的任务。

因此“生成历史已经是 FlatList”不能覆盖其他入口。不能声称 300 张原图都会以原始像素同时保留；具体解码采样、缓存和内存需测量，但全量组件和原件请求已能确认。

建议：所有历史入口采用有界虚拟化，缩略图使用独立持久小图；原图仅用于当前查看和放大。poster 队列增加需求撤销及可见项优先策略。避免把同方向虚拟列表直接嵌入无界 ScrollView。

### F07 — 素材卡片与选材器重复读取全部版本，搜索没有取消实际工作

位置：[AssetTile.tsx](../../mobile/src/creative/AssetTile.tsx#L9)、[CreativeAssetPicker.tsx](../../mobile/src/creative/CreativeAssetPicker.tsx#L25)、[service.ts latestVersions](../../mobile/src/creative/service.ts#L77)、[CreativeWorkspace.tsx](../../mobile/src/creative/CreativeWorkspace.tsx#L83)。

AssetTile 为一个封面调用 versions，读完历史再找默认/最新版本；网格挂载 M 张卡片后数据工作量约为各资产版本数之和。选材器则对一页资产 Promise.all 读取每个资产的全部版本。asset limit 控制的是资产数，不控制版本总数；加载更多会从头加载更大的资产集合。

选材器与创作素材页 query 每次变化都触发读取。旧请求的 active/generation 检查只阻止应用旧结果，并不停止已有数据库扇出。快速输入时，未显示的旧搜索仍在消费资源。

建议：卡片批量读取默认/最新版本摘要；已有 latestVersions 可复用，但需要保持“默认版本优先”的语义。选材器按版本分页，默认折叠单资产历史；输入防抖并串行合并最新请求。

### F08 — Agent 创作卡片把一个长历史重复读很多遍

位置：[agentCreativeActivity.ts](../../mobile/src/creative/agentCreativeActivity.ts#L16)、[AgentCreativeCards.tsx](../../mobile/src/creative/AgentCreativeCards.tsx#L33)。

读取最多 100 个 receipts，生成最多 20 张卡片。每张卡片查询草稿、任务、输出 links，再调用该资产 versions，最后按输出 ID 过滤。不同草稿共享同一资产时，没有资产级去重。

受控执行真实 readAgentCreativeActivity，20 个不同草稿共享一个 300 版本资产：20 次全量 versions 调用、6000 条 recipe 解析、83 次模拟数据库读取调用。service/DB 使用测试替身，并按当前 versions 的逐行解析行为构造结果，因此数字证明调用放大，不是数据库基准。按 2.5 秒完整刷新推算可达 144000 条解析/分钟。

建议：直接按 creative_output_links 批量 JOIN 需要的版本，批量查询任务和草稿；一次读取中对共享资产去重只是过渡方案。终态卡片缓存，只有活动任务增量更新。

### F09 — 大媒体完整加载、编码和复制造成内存峰值与 JS 停顿风险

位置：[NovelAiImagePreparation.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/NovelAiImagePreparation.kt#L25)、[novelAiResponseStore.ts](../../mobile/src/creative/novelAiResponseStore.ts#L22)、[novelAiProtocol.ts](../../mobile/src/creative/novelAiProtocol.ts#L107)、[boundExecution.ts](../../mobile/src/creative/boundExecution.ts#L24)、[NovelAiTransport.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/NovelAiTransport.kt#L34)。

输入：先分配输出 bitmap，再完整 decodeFile 源图；允许源图最高 16777216 像素，旋转可能再分配一个 bitmap。按 ARGB_8888 理论估算，一张此规模 bitmap 为 64MiB，旋转副本与最高约 12MiB 的输出可同时存在，随后还有 PNG 与 Base64。此处是分配量估算，不是 PSS。

输出：原生 lookup 整体读响应校验；JS readAsStringAsync 整体读 JSON，JSON.parse 提取 Base64，Buffer.from 再解码验证 PNG；externalize 又把 Base64 写回文件并哈希。响应总上限 64MiB；放大字段允许更长的 Base64。字节数与 JS 字符串的实际内存不应简单等同。

提交：含 Base64 的 requestInput 会经历 JSON 序列化、哈希、比较和入库。绑定校验与 native 请求校验重复处理大载荷。单次生成完成附近可能同时出现大对象处理、历史刷新和渲染。

建议：在原生完成响应提取、流式校验与 CAS 归档，JS 只交换路径、哈希及尺寸；输入在符合图像语义的前提下采样解码。Enhance/独立超分要求原像素时不能盲目降采样。签名、哈希应对规范化的不可变请求只计算必要次数。

验收：分别测多图输出、普通图生图、旋转大图、Enhance 和超分；采集内存峰值与长帧，验证像素语义、请求哈希、恢复回执与结果均保持正确。

### F10 — 长操作和历史维护拖住整个执行 slice

位置：[tick.ts](../../mobile/src/workflows/executor/tick.ts#L20)、[foregroundExecutorScheduler.ts](../../mobile/src/tasks/foregroundExecutorScheduler.ts#L22)、[executorRuntime.ts](../../mobile/src/tasks/executorRuntime.ts#L197)、[executorRunner.ts](../../mobile/src/tasks/executorRunner.ts#L23)、[taskProjectionRepair.ts](../../mobile/src/tasks/taskProjectionRepair.ts#L13)。

deadline 只在领取下一项前检查，不限制已经开始的 handle。tick 等待所有 lane 的已启动工作全部 settle；scheduler 的 running 只有 slice 返回才清除。期间 wake 只设 dirty，不能立刻领取新工作。慢 EXPORT、STATUS_SYNC 或网络 SUBMIT 都可能推迟下一轮。

此外每个 runCycle 在 cycle 前执行计划恢复、兼容转换退役、旧投影修复；repair 的 LIMIT 32 限制返回候选数，不限制寻找候选时扫描历史。slice 在持有 task-executor lease 时还可能执行维护与媒体对账。维护有五分钟冷却，不能写成“每轮执行全部维护”，但触发时仍阻塞 trailing slice。

建议：区分调度领取预算与外部执行生命周期；各 lane 有独立、可观测且有界的在途操作；历史修复采用增量队列/游标，与用户新命令公平调度。超时必须配合真正取消或归属 fencing，不能仅 Promise.race 后重复启动仍在运行的消费请求。

### F11 — 轮询防重入、终态退出和可见性规则不统一

位置：[ProjectPlans.tsx](../../mobile/src/creative/ProjectPlans.tsx#L18)、[ProjectActivityPanel.tsx](../../mobile/src/creative/ProjectActivityPanel.tsx#L14)、[AgentCreativePanel.tsx](../../mobile/src/creative/AgentCreativePanel.tsx#L21)、[creative-task 页面](../../mobile/app/creative-task/[id].tsx#L28)、[TaskInboxButton.tsx](../../mobile/src/tasks/TaskInboxButton.tsx#L18)。

ProjectPlans 每两秒读取最多 30 个计划，并逐个查 decision、step、候选，最多约 92 次读取/轮（1 个计划查询、每计划 3 个查询、1 个镜头列表查询）；没有 reading 锁。ProjectActivity 有两个独立轮询，也无防重入。ProjectPlans/ProjectActivity 用 useEffect，若路由失焦但组件仍挂载，轮询继续；不应假定导航必定卸载它们。

Agent 项目选择面板即使折叠，每两秒仍读全部 projects（含 brief）；任务详情即使终态仍每 2.5 秒读 job/draft/review。TaskInboxButton 有 reading 锁，但每三秒仍统计未归档的全库任务并读取最近记录，面板关闭也运行。

建议：统一采用 focus/AppState 管理与 single-flight 读取；仅有活动状态时用定时兜底，静态历史按事件或 revision 更新；合并同页面的刷新请求。任务页已有 taskListSession 的防重入、revision 和按活动量调度可作为参考。

### F12 — 高频关联查询缺索引，历史越大扫描越多

位置：[schema.ts](../../mobile/src/storage/schema.ts)、[agentCreativeActivity.ts](../../mobile/src/creative/agentCreativeActivity.ts#L12)、[ProjectPlans.tsx](../../mobile/src/creative/ProjectPlans.tsx#L22)、[projectActivity.ts](../../mobile/src/creative/projectActivity.ts#L5)。

当前 schema 的内存 SQLite 查询计划：

| 实际查询形态 | EXPLAIN 关键结果 |
|---|---|
| creative_generation_drafts WHERE job_id=? | SCAN creative_generation_drafts |
| creative_decision_requests WHERE plan_id=? | SCAN creative_decision_requests |
| creative_plan_steps WHERE plan_id=? AND kind='video' | SCAN creative_plan_steps |
| 按 thread 关联读取最近 receipts | 扫描 receipts 索引、逐条按 origins.id 查找、临时排序 |

projectActivity 还对 receipt JSON 的多个字段做 OR/json_extract 再关联项目，这类条件难以直接利用普通列索引。单独加 LIMIT 并不保证只处理 LIMIT 条数据。

对照项：creative_asset_versions 的 `(asset_id,version_no)` UNIQUE 已支持按资产有序查版本；workflow_operations 到期查询也使用现有 due 索引。不能把所有问题归因于“没有索引”。

建议：以真实基数验证 `(job_id)`、`(plan_id)`、`(plan_id,kind)` 及 origins/receipts 的关联、排序索引；高频活动查询考虑显式 project_id/thread_id 摘要列。按迁移添加，不改既有数据库文件。确认写放大与迁移成本后再落地。

### F13 — 视频历史刷新含逐轮查询和重复数据处理

位置：[VideoGenerationHistory.tsx](../../mobile/src/creative/VideoGenerationHistory.tsx#L36)、[workbenchSessions.ts](../../mobile/src/creative/workbenchSessions.ts#L42)、[service.ts](../../mobile/src/creative/service.ts#L60)。

有未结束/UNKNOWN 或待归档记录时，每 2.5 秒读草稿、各资产全部版本，再对每轮发一条 job SQL，并对共享版本数组重复 filter。M 轮、共享 V 个版本时这部分匹配为 O(M×V)。子 CreativeResults 同时有自己的版本/状态轮询。排序编号每轮读取并写入 SecureStore，用 includes/indexOf 反复寻找编号；停止刷新前还用整个对象的 JSON.stringify 比较。

已有正向措施：资产读取在单轮内去重；needsRefresh 为 false 后不继续读历史。仍需优化活动期间成本及 UNKNOWN 长期存在的情况。

建议：批量查 job，按 jobId 一次构建版本索引；父子共享读取快照；编号只在新 job 出现时写，使用 Map。注意 drafts 接口先 LIMIT 100 后在内存按 session 过滤，旧轮次会缺失；这是额外的历史正确性问题，不能靠提高 LIMIT 无限扩容。

### F14 — 长会话显示虚拟化，但加载与保存仍随历史增长

位置：[threadStore.ts load](../../mobile/src/agent/threadStore.ts#L170)、[threadStore.ts save](../../mobile/src/agent/threadStore.ts#L203)、[agentRecords.ts](../../mobile/src/agent/agentRecords.ts#L2)、[attachments.ts hydrate](../../mobile/src/media/attachments.ts#L206)、[runtimeStore.ts](../../mobile/src/agent/runtimeStore.ts#L158)。

load 一次读取全部 messages、runs、versions、workspaces，并 hydrate 所有被外置的历史文本。hydrate 会并行遍历对象和数组，长工具输出与所有工作区内容即使暂时不显示也会读入并做 UTF-8 大小验证。保存已采用记录增量写入，但每次 save 仍遍历所有记录，用 recordFields 递归枚举、排序键并比较字段数组；recoverInterruptedRuns 在一个事务内读全部 agent_runs 再挑活动 run。

已有 listMessages 分页接口、50ms 视图发布、300ms 防抖和 2 秒最长保存间隔、记录级增量写与有界 runtime 缓存。不能描述为“每个 token 重写整个会话”。风险在于全量加载和每次保存前的全历史检查成本，需用大对话测量。

建议：UI 首屏只读最近窗口，工具输出/工作区内容按展开加载；模型上下文与 UI 历史分离；记录 dirty id/revision，避免反复扫描历史；恢复用可索引的运行状态或持久活动集合。

### F15 — 蒙版涂画每个点都是一个原生 View

位置：[NovelAiMaskEditor.tsx](../../mobile/src/creative/NovelAiMaskEditor.tsx#L19)。

onPanResponderMove 每次追加点时复制当前 points 数组、setDrawing；render 用 strokes.flatMap 为所有历史点生成 View，并重新计算位置与旋转。一个长笔划可有 2048 个点，整个画布可达数千节点。对同一笔从 1 点逐步增加到 N 点，累计重建工作接近 O(N²)。数量有上限，所以不是无界泄漏，但在上限以内仍可能卡顿。

建议：用原生绘制路径/画布或既有适合的矢量渲染方案，历史笔划缓存，活动笔划按帧更新并做合理抽稀；保留最终发送的蒙版语义与坐标精度。不要为此先增加重型依赖，先验证现有技术栈可用能力。

### F16 — 长期生成存在重复大载荷保留与回收策略缺口

位置：[NovelAiTransport.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/NovelAiTransport.kt#L63)、[novelAiResponseStore.ts](../../mobile/src/creative/novelAiResponseStore.ts#L29)、[submissionCommand.ts](../../mobile/src/create/submissionCommand.ts#L43)、[assetLifecycle.ts](../../mobile/src/creative/assetLifecycle.ts#L11)。

原生 creative-responses/<key> 保留 response.json/sha256/sent，响应又被导入 CAS；JS 插入 owner_type=novelai_response 的引用。含图输入的 prepared.requestInput 作为 SUBMIT payload 持久保存。检索应用代码未找到 creative-responses 已归档响应的清理接口，也未找到 novelai_response 引用的配套释放路径。素材 trash 是软删除，本身不回收这些数据。

这是生命周期风险，不足以证明意外泄漏：UNKNOWN 恢复及不可重发要求确实需要部分证据长期保留。长期重复保留大 JSON/Base64 会增加磁盘占用，并放大已有扫描、读取、备份和存储压力；当前占用量尚未测量。

建议：明确“发送标记、恢复所需回执、已归档原件、审计摘要”各自保留条件；归档事务完成并验证恢复不再依赖完整响应后，才回收重复大文件和引用，保留防重发标记与不可变哈希。提交请求以 CAS 引用表达大媒体，避免长期在操作 JSON 中复制 Base64。先做占用盘点再设计回收，禁止直接清空目录。

### F17 — 重复导入共享文件，但不断创建新的逻辑素材

位置：[runtime.ts](../../mobile/src/creative/runtime.ts#L64)、[fileImport.ts](../../mobile/src/creative/fileImport.ts#L29)、[service.ts](../../mobile/src/creative/service.ts#L124)。

图片与通用文件导入入口均在完成 externalize 后，以新的 `createId()` 作为命令 key 调用 asset.import。服务确认 blob 已存在，却不会查询是否已经有指向该 hash 的素材，而是新建 asset、初始 version、version_file、恢复来源和引用，并按需关联项目。同一命令 key 的重放已有幂等保护，但用户再次点击导入是一个新的命令，不触发该保护。

实际服务的内存数据库实验确认：同一个 blob 的两次不同 key 导入生成 2 个素材、2 个版本和 2 条文件记录，blob 仍为 1 条；再次重放相同 key 不增加记录。因此界面中重复素材不等于原件文件重复，但会让 F04/F06/F07 的校验、挂载与查询成本继续增长。

建议：导入后按内容查找候选，提供“使用已有素材/关联到当前项目”和“新建独立素材”的清晰语义；项目关联可利用现有 asset.linkToProject。相同内容可以有不同标题、元数据、生命周期和项目身份，不能后台强制合并，也不能直接按 hash 删除重复素材。Agent 与工作台优先传递已有 asset/version 引用，避免再次走外部文件导入。

### F18 — 最终去重不能节省重复导入的复制与校验

位置：[attachments.ts importImage](../../mobile/src/media/attachments.ts#L45)、[attachments.ts externalize](../../mobile/src/media/attachments.ts#L89)、[cas.ts](../../mobile/src/media/cas.ts#L129)、[cas.ts adoptNativePart](../../mobile/src/media/cas.ts#L295)、[fileImport.ts](../../mobile/src/creative/fileImport.ts#L15)。

外部 file/content URI 先复制到新 part，计算完整哈希，再由 adoptNativePart 校验 part，publish 校验已有目标或新移动的目标。普通无异常路径相当于一次临时复制和三次完整哈希读取；同内容已经存在时仍走前面的工作。CAS 受控实验两次发布计到 4 次校验哈希，不含上游 importer 的两次初始哈希，与该调用链一致。

externalize 的 known Map 只在单次调用内复用；imported Map 只对文本/data URI 建 key，且属于 store 实例，导入包装函数每次新建实例。外部 URI 没有跨调用内容复用缓存。整个 importer 与 blob/ref 注册又置于共享 `cas-gc` lease 内，以保护归档和回收的一致性；重复大文件导入会占用同一资源，其他导入最多按当前 5 秒等待窗口重试，再报告“素材正在维护”。这会造成等待，但不能据此断言用户“等待提交”的现场根因就是导入 lease。

已有 `asset://hash` 和准确的本地 CAS URI 识别路径可以直接保留引用，不重新复制。建议优先使用这条路径；对外部来源，可在稳定源身份、大小及变更标记可验证时缓存到 hash 的映射，来源可能改变时重新校验。进一步减少重复扫描需设计一次归档中可传递的完整性证据与发布边界，不能直接删掉持久化后校验，也不能因 URI 相同就认定内容没变。

### F19 — 选择器缓存与派生预览缺少统一的生命周期

位置：[fileImport.ts](../../mobile/src/creative/fileImport.ts#L38)、[runtime.ts](../../mobile/src/creative/runtime.ts#L50)、[assistantImagePicker.ts](../../mobile/src/agent/assistantImagePicker.ts#L52)、[MediaPicker.ts](../../mobile/src/create/MediaPicker.ts#L12)、[VideoDraftScreen.tsx](../../mobile/src/creative/VideoDraftScreen.tsx#L184)、[MediaPreview.tsx](../../mobile/src/creative/MediaPreview.tsx#L11)、[MediaModule.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt#L286)。

这些 DocumentPicker 入口显式要求 copyToCacheDirectory。已检查的导入完成路径会 releaseStaging，但它释放的是引用/租约，并不删除选择器复制出的缓存文件；未找到这些入口对 picker 缓存的统一清理。选择后校验失败或候选被放弃，也可能保留缓存。系统可回收 cache，所以这是应用级生命周期缺口，不能宣称文件永久不释放。相对地，saveCreativeText 对自己创建的临时文件已有 finally 删除。

视频封面还有一个可确认的计算问题：JS Promise 缓存只有 100 项；被逐出或进程重启后，原生 extractPoster 即使稳定命名的 JPG 已存在，也会重新执行 FFmpeg。原生每次使用随机临时 JPG，正常 finally 会删除它；相同 key/source 的最终路径稳定，因此正常路径不是每次新增一个最终文件。不同 key/source 的最终 poster 则缺少已定位的磁盘容量、失效和清理策略。

建议：区分应用拥有的 picker 临时文件、仍在被页面使用的输入、CAS 原件及可重建派生缓存。归档成功且使用方释放后回收拥有的临时文件，启动时按年龄与预算清理失效缓存；不得删除用户来源文件。poster 命中可验证的现有派生文件时复用，以源内容 hash 与变换版本定位，并设磁盘预算。具体目录和实际残留量需分别盘点，不能假定原生 filesDir 等于 Expo documentDirectory。

### F20 — 崩溃留下的无索引文件不在现有 GC 的发现范围

位置：[attachments.ts](../../mobile/src/media/attachments.ts#L129)、[cas.ts publish](../../mobile/src/media/cas.ts#L133)、[cas.ts collectGarbage](../../mobile/src/media/cas.ts#L318)。

导入先发布 CAS 文件，再把 artifact_blobs 和临时引用写入事务；若进程恰好在两步之间终止，文件可能没有数据库行。回收则先删除无引用的数据库行，再删除物理文件；捕获到文件删除错误时会恢复行，但进程直接终止不执行 catch。collectGarbage 只遍历 repository.listUnreferenced 返回的数据库记录，无索引文件不会被看见。模拟发布后尚未入库的一个文件，调用实际 GC 后删除数为 0、文件仍存在。

正常路径的 part、失败清理与隔离机制已有保护，不应把每次导入都写成泄漏。但仍未找到覆盖无索引 CAS 文件、异常中断 part 和需保留隔离文件的通用对账回收闭环。releaseExpiredAttachmentImports 清理过期引用和租约，并不扫描这些文件。这类残留还会进入 F22 的目录遍历备份。

建议：持久记录待发布/待删除意图并在重启恢复，或建立有边界的文件—索引对账。扫描必须识别活动导入、原生 operation/attempt、有效 lease、恢复来源和隔离证据，并设置安全年龄；仅凭“没有 blob 行”立即删除会破坏正在归档的结果。先提供只读占用报告，再在测试库注入各阶段崩溃验证回收与恢复。

### F21 — 相册发布幂等不覆盖同内容的不同版本

位置：[enqueueVersionExport.ts](../../mobile/src/creative/enqueueVersionExport.ts#L6)、[CreativeImagePublisher.kt](../../mobile/android/app/src/main/java/com/example/autodlh3/CreativeImagePublisher.kt#L24)。

当前按 `(versionId, original, generation)` 复用 delivery；generation=1 由自动和手动保存共享，因此不能说“同一版本点保存必定重复”。但不同版本即使引用相同 blob，也有不同 deliveryId 及其 SHA-256 publicationKey。原生 lookup 只查该 key 对应的文件名与目标目录，再验证内容；不会按内容搜索其他 publicationKey 的已有文件。两个版本分别执行保存可各自插入和复制一份公开文件。

因此 F17 的重复导入可以在分别保存后变成真实相册副本；CAS 的单份原件不覆盖公开目标。这里也有合理的“另存一份”需求，按 hash 全局静默合并可能改变用户意图或目标语义。

建议：明确默认“确保已保存”和显式“另存副本”的区别；默认路径可维护按内容、目标、发布策略定位的持久映射，支持已删除/不可读目标的重新发布与恢复。保留 version 到 delivery 的审计关系和崩溃重入能力，不得只换一个 key 就绕过已有 UNKNOWN 对账。相册空间和真实文件数尚未做设备实测。

### F22 — 完整备份复制范围过宽，重复与失败包缺少保留闭环

位置：[creativeBackupRuntime.ts](../../mobile/src/storage/creativeBackupRuntime.ts#L9)、[fileBackup.ts](../../mobile/src/storage/fileBackup.ts#L27)、[listCreativeFileBackups](../../mobile/src/storage/creativeBackupRuntime.ts#L63)。

运行时递归遍历 documentDirectory，仅排除顶层 creative-backups 与 SQLite，没有按数据库引用或文件用途筛选。因此 CAS 正式文件之外，位于该根目录的 cas/parts 残留、隔离文件及其他辅助文件也会被复制。受控目录中放入一个残留 part，两次不同 ID 的实际 buildCreativeBackup 均将其打包，最终有 2 份备份 part；原件同样有 2 份备份副本。这没有验证原生响应或 poster 目录位于该根目录，不能据此把它们算进实际备份占用。

不同 ID 的备份是完整独立副本；同 ID 的已完成 manifest 则会校验并复用，不能说重试必定重复。引用原件先做预检，构建时再哈希源与目标，普通新备份对引用原件约为三次完整哈希和一次复制。完整性校验有必要，但工作量会随全部历史文件字节数增长，并发生在要求停止应用写入的启动维护阶段。

manifest 最后发布，失败目录不会列为可恢复备份，这是正确保护；但构建失败没有清理已复制文件，列表又会跳过无有效 manifest 的目录。未找到旧完整备份与失败包的容量/保留管理。用户可能看不到失败包却继续承受占用，重复备份也继续复制残留。

建议：明确可恢复数据清单，排除可重建缓存及已确认失效临时文件；恢复确实需要的来源和证据仍应纳入。对完整包、失败包分别展示空间与状态，提供保留预算和安全清理。若引入按内容增量备份，必须同时设计引用、清单及恢复链的保留规则，不能以省空间为由破坏独立恢复或现有完整性检查。备份前估算空间与工作量，限制维护阻塞时长。

## 已有保护与不应误判的部分

- ImageHistorySheet、图片工作台底部版本条、VideoGenerationHistory、对话列表及旧 gallery 使用 FlatList；旧 gallery 还有游标分页。问题集中在未覆盖的入口与数据层，不能全盘归因于“没有虚拟化”。
- CreativeResults、AgentCreativeActivityProvider、VideoGenerationHistory 有 reading 防重入；它们与 F05/F11 的无保护轮询应分别处理。
- 执行器按 lane 限流、有持久 lease、幂等与 UNKNOWN 恢复；优化应保留这些正确性约束。
- SQLite busy 已异步退避，普通服务查询多为 async；getAllSync 搜索命中还包括兼容 API、维护和测试用途，未将命中数当成生产热路径证据。
- 现有索引、任务列表 session、记录级增量存储、poster 并发限制和缓存都有价值；应在现有机制上补齐工作量边界，而不是引入第二套状态系统。
- CAS 对相同字节的原件已有去重，导入命令与同版本保存也各有幂等保护；完整备份、用户外部原件和应用持久归档的独立副本各有用途。需治理的是重复工作、默认使用语义及生命周期缺口，不能笼统按重复文件删除。

## 建议修复顺序

1. **保障任务推进（F01/F02/F10）**：恢复与领取预算分开、UNKNOWN 检查退避、原生线程与锁隔离、调度阶段可观测。先证明慢操作下不会重复发送或饿死新任务。
2. **切断数百版本的日常放大（F03/F04/F05/F08）**：轻量版本摘要、状态独立刷新、只验证所用文件、批量保存状态、按 output links 精确取版本。
3. **控制页面与媒体工作量（F06/F07/F09/F13/F15/F18/F19）**：全入口虚拟化、缩略图、分页和搜索合并、原生响应归档、蒙版路径绘制、已有素材引用复用与派生缓存命中。
4. **治理长期增长（F11/F12/F14/F16/F17/F19/F20/F21/F22）**：统一刷新策略、按查询计划加索引、会话按需读取、重复导入与保存的产品语义、缓存及恢复审计数据保留、孤儿文件对账与备份保留策略。先做各目录/记录的只读空间盘点，再制定回收方案。

不建议把“提高超时、提高 LIMIT、放开线程数、清空旧版本、自动重试生成”作为主要修复。这些措施不能消除工作量增长或调度饥饿，部分还会增加消费或数据风险。

## 后续真机验证矩阵与验收口径

以下是验证计划，不代表已完成的测试或现有性能保证。使用 release/profileable 构建，同一设备、相同图像尺寸和提示词，冷/热状态分别记录；每个重点场景至少重复三次。大库仅在独立测试数据库构造，不修改用户原库。

| 场景 | 数据规模 | 应采集证据 | 验收重点 |
|---|---|---|---|
| 工作台静置、切版本、展开历史 | 10/100/300/1000 版本 | Perfetto、gfxinfo、JS 阶段耗时、SQL 次数、meminfo | 静态历史不重复全读；状态查询不被历史阻塞；首屏处理量有界 |
| 打开/退出素材详情与比较 | 300 版本、多个图片尺寸 | 哈希次数/字节数、SQL/事务计数、帧时间、PSS | 先显示可见项；不全量校验与挂载；离开后停止无用工作 |
| 慢生成期间提交新的未发送任务 | 注入慢网络/慢恢复/慢导出；0/32/100 UNKNOWN | 恢复/领取/发送分段日志、原生队列、锁等待、操作与 job 状态 | 队列公平推进；UNKNOWN 不重发；可区分真等待与展示滞后 |
| Agent 创作卡片与选材搜索 | 20 张卡共享 300 版本；100+ 素材 | 查询数、读取行/字节数、JS CPU、搜索请求队列 | 共享资产不重复全读；旧搜索不积压；SQL 数随批次数而非卡片数增长 |
| 图生图/增强/超分/多图返回 | 输入像素上界、旋转图、1/4 张输出 | Perfetto、meminfo/heap、native allocation、响应字节数 | 控制峰值与复制次数，保持像素、元数据、校验与恢复语义 |
| 长 Agent 会话与蒙版 | 大消息/工具输出/工作区；2048 点笔划 | 加载/保存耗时、文本读取量、View 数、JS 与 UI 长帧 | 首屏按窗口读取；历史内容按需加载；绘制节点不按点数增长 |
| 长期连续使用与重启恢复 | 1000+ 任务，重复进入详情和生成 | DB/creative-responses/CAS 占用、引用数、恢复耗时 | 重复大载荷可解释且有生命周期；无历史增长导致的调度失效 |
| 重复外部导入 | 同 URI、不同 URI 相同字节、同画面不同元数据；小图/接近导入上限文件 | asset/version/blob 数、各目录字节数、copy/hash 次数、lease 等待 | 明确复用/新建语义；相同字节 CAS 仅一份；重复导入不留下无用途缓存 |
| 导入/回收阶段崩溃恢复 | 在 part、publish、入库、删行、删文件边界分别终止独立测试进程 | 文件—索引差异、活动 lease/attempt、恢复与 GC 日志 | 结果不丢失、不重发；无索引与过期临时文件可安全对账 |
| 跨版本保存与预览缓存 | 相同 hash 不同版本；同版本重试；100+ 视频预览后重启 | 公开文件数/哈希、delivery 映射、FFmpeg 次数、poster 空间 | 默认保存与另存语义明确；幂等和恢复保留；已有有效封面命中磁盘缓存 |
| 多份备份与中途失败 | 不变数据连续两次不同 ID；注入复制失败；含失效 part | 包清单、失败目录、源/目标字节与哈希量、维护时长、剩余空间 | 临时残留不被盲目复制；失败占用可见可回收；每个承诺可恢复的备份均可恢复 |

建议埋点分段：命令持久化、wake、scheduler lease、恢复检查、候选查询、claim、凭据绑定、预算 dispatch、原生入队/开始/结束、HTTP、响应校验、导入、版本归档、UI 观测到状态。记录 job/operation ID、行数、字节数、队列长度和耗时，不记录 token、完整 Base64 或凭据。

对于用户当前的“等待提交”，最小现场证据应同时包含：workflow_jobs.status、SUBMIT operation.state/attempt/next_retry_at/lease_expires_at、executor phase、scheduler lease，以及上述阶段时间。仅靠截图无法区分 F01、原生/执行 slice 阻塞、数据库重试与 F03 的显示滞后。
