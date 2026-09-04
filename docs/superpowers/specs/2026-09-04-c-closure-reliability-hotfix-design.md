# C 阶段可靠性收尾热修复设计

日期：2026-09-04  
目标版本：v1.4.9  
数据基线：schema v6

## 目标

在 v1.4.9 发布前完成 C 阶段最后一轮可靠性收口：阻止损坏视频被标记为已下载或已保存；让离线任务在联网恢复后立即继续；把高频刷新从历史数据维护中解耦；补齐持续监控的任务结果通知；恢复创建页的提交前参数校验。

本设计不启动 D 阶段，不引入 schema v7，不改变 AutoDL 动态 CDN 的 Accepted Constraint，也不把持久 operation 退回 UI 直连执行。

## 已确认根因

### 媒体播放异常

当前下载链路校验 HTTPS、HTTP 状态、MIME、长度、输入流 SHA-256 和 CAS 文件大小，但没有重新读取落盘字节验证其 SHA-256，也没有在提交下载成功投影前验证 MP4 可解析性。内容损坏、落盘字节变化或伪装为 `video/mp4` 的响应仍可能进入 `DOWNLOADED`，随后被原生发布器复制到 MediaStore。

MediaStore 发布器又会按稳定 display name 无条件复用已完成条目，导致重新下载得到不同内容后仍可能返回旧的损坏副本。

### 离线后不主动恢复

网络失败会把 `STATUS_SYNC` 退避到最多 60 秒后的 `next_retry_at`。应用没有监听网络从离线到在线的变化，因此重连不会唤醒或提前到期相关 operation；恢复依赖下一次计时轮询、生命周期切换、重启或其他命令触发 cycle。

### 刷新随历史数据增长

普通列表轮询把 durable cycle、投影修复、媒体对账、CAS GC 和列表读取绑定在同一次 `syncTaskRun`。部分 operation 查询先全表加载再在 JS 过滤，投影兼容修复也在 SQL 无 LIMIT 的结果上切片。已完成历史任务和 terminal operation 增长后，同步 SQLite 与文件 stat 会持续占用 JS 线程。

v1.4.9 现有 hotfix 已从任务列表页面移除逐条 `repairTaskMediaPage`，因此审查中的该项不再重复实现；其余热路径仍需收口。

### 持续监控没有结果通知

当前前台服务只显示固定的低重要性常驻通知。Headless JS 丢弃同步结果，没有完成/失败事件到通知的路径；Android 13+ 也没有申请 `POST_NOTIFICATIONS` 运行时权限。全局 operation 的剩余数还会让只监控特定任务的服务被无关重试拖住。

### 创建页参数校验退化

AutoDL 元数据合同冻结了 Prompt `1..10000` 字符，但内置 H3 workflow definition 只包含 `minLength: 1`。创建页仅检查空 Prompt，没有在写 job/task/operation 前运行完整 draft 校验。超长 Prompt 因而进入 durable SUBMIT，最终只表现为任务列表中的笼统 provider 提交错误。

## 设计原则

- 持久 operation ledger 仍是提交、状态同步、下载和导出的唯一执行路径。
- 数据正确性先于投影成功状态；未经内容校验的媒体不得成为 `DOWNLOADED` 或 `EXPORTED`。
- 普通轮询只处理到期工作；历史修复和文件系统维护按明确触发原因及最小间隔运行。
- 不以“任务已终态”为理由忽略所有 operation；终态任务的下载和导出仍是合法待办。
- UI 参数校验和 durable executor 共用同一 workflow schema，executor 保留防御性二次校验。
- 通知来自持久事件并具备跨进程去重，不能依赖内存中的一次状态变化。

## 1. 媒体可信落盘

### 1.1 CAS 落盘验证

CAS 在发布最终 blob 后重新读取文件并计算 SHA-256，结果必须与相对路径和输入流计算出的 hash 一致。验证采用分块读取，不把完整视频载入 JS 内存。若 hash 或实际大小不一致，删除违反 CAS 不变量的文件并抛出稳定的完整性错误；已有引用会在后续媒体对账中被降级并重新获取。

Android 原生媒体模块提供文件 SHA-256 能力，JS CAS 通过可注入 verifier 使用它。单元测试使用内存文件实现，保持算法和错误语义可独立验证。

### 1.2 视频可播放性探针

视频 artifact 在 CAS 校验后、SQLite 成功提交前运行原生探针：

- `MediaExtractor` 必须找到至少一个 video track；
- duration 必须为正且在可表示范围内；
- sample table 必须可以遍历，sample size 不得为负或越界；
- `MediaMetadataRetriever` 必须能解码首帧、中间帧和靠近尾部的同步帧。

探针不是完整转码或逐帧播放，不增加发布前的全量解码成本，但覆盖空壳 MP4、错误轨道、截断 sample table 和常见 NAL/关键帧损坏。

前两次失败使用 `ARTIFACT_MEDIA_INVALID_RETRYABLE` 并进入现有退避；第三次使用终态 `ARTIFACT_MEDIA_INVALID`。失败文件不产生下载成功投影、不进入 export queue。用户之后仍可通过显式重试创建新的 manual generation。

### 1.3 已有坏副本恢复

播放器错误后重新运行本地探针。探针仍通过时只保留“重试播放”，避免把设备解码器的瞬时错误误判为坏文件；探针失败时显示“重新下载”。

重新下载命令在一个 `BEGIN IMMEDIATE` 事务中：

1. 确认 task、asset 和 artifact 身份；
2. 清空该 artifact 的坏本地投影并释放 workflow-artifact CAS ref；
3. 将已知 export 投影重置为 `NOT_REQUESTED`，但不直接删除用户可见相册内容；
4. 追加下一代 durable manual download operation；
5. 提交后启动有界 foreground cycle。

UI 不直接删文件、不直接下载、不直接写 task/media projection。

### 1.4 MediaStore 幂等替换

稳定 display name 继续作为同一 artifact 的系统相册身份。原生发布器找到同名已完成条目后，分别计算源文件与目标 content URI 的 SHA-256：

- 内容一致：返回 `alreadyExisted=true`；
- 内容不同：删除应用创建的旧条目，再用 pending row 原子发布新内容；
- 目标读取或 hash 失败：视为不可复用，清除旧条目后重新发布。

异常路径继续删除未完成 pending row。同一 artifact 修复后，系统相册最终只保留一个有效副本。

## 2. 联网恢复与增量刷新

### 2.1 网络恢复唤醒

引入与当前 Expo SDK 匹配的 `expo-network`。根布局只在 `isConnected=false/unknown` 转为 `true` 时触发恢复，避免每次网络状态回调都同步。

恢复过程将活跃 job 关联且最后错误为 retryable network/timeout 的 `STATUS_SYNC` 与 `ARTIFACT_DOWNLOAD` operation 的 `next_retry_at` 更新为当前时间，然后运行一次 foreground cycle。成功状态同步会按现有投影规则清除旧 `lastError/syncError`。

该动作只提前已有 durable operation，不凭空创建提交操作，也不自动重放 UNKNOWN submit。

### 2.2 同步策略分层

`syncTaskRun` 增加显式策略：

- `poll`：执行到期 cycle 并读取活跃任务/operation 摘要；
- `maintenance`：在 `poll` 基础上执行兼容投影修复、媒体对账与 CAS GC；
- `service`：执行监控 task IDs 所需工作并返回结果事件及 scoped remaining；
- `command`：命令入账后的有界 cycle，不触发历史维护。

冷启动、App 回到前台、人工刷新使用 maintenance。维护通过 `app_scheduler_leases` 中独立 key 记录下次允许时间；人工刷新可显式绕过间隔，生命周期重复事件不能。列表计时器和详情加载使用 poll。

### 2.3 SQL 热路径

operation repository 新增以下有界查询，不再由 tick 调 `list()` 全表过滤：

- 按 kind、state、到期时间和 lease 条件选择 due rows，带 `LIMIT`；
- 聚合返回 `remainingDue`、`remainingScheduled` 和最早 `nextWakeAt`；
- 按 job IDs 返回监控范围内的剩余工作；
- 仅提前到期具备 retryable 网络错误的 operation。

兼容 job repository 增加 SQL `ORDER BY ... LIMIT ?`，`repairTaskProjections(32)` 不再先读取全部 job。

### 2.4 精确计时与执行器缓存

任务页保留活跃状态可见刷新，但使用一次性 timer 对齐 operation 摘要的 `nextWakeAt`，每次 load 后重新计算；不存在活跃任务和待执行 operation 时不设 timer。未来 60 秒的 retry 不再导致这 60 秒内每 10 秒运行完整刷新。

adapter/runtime/durable executor 按影响执行行为的 settings fingerprint 缓存。每次同步仍读取当前 settings；fingerprint 变化时立即重建，避免 token 或媒体策略更新后沿用旧实例。

## 3. 持续监控与结果通知

### 3.1 权限和渠道

新增原生任务通知管理器，集中管理：

- 低重要性的持续监控渠道；
- 默认重要性的任务结果渠道；
- Android 13+ `POST_NOTIFICATIONS` 请求与授权状态；
- 完成/失败通知发布和 event ID 去重。

用户点击“开启持续监控”时先请求权限。拒绝时弹出明确提示，不启动服务，按钮保持关闭。原生模块缺失、没有活跃任务或服务启动失败同样显示原因。

常驻通知显示“正在监控 N 个任务”，task IDs 更新时刷新文案。

### 3.2 持久事件驱动

service 同步后从 `workflow_job_events` 查询所监控 job 的终态事件，覆盖 `SUCCEEDED`、`PARTIAL_SUCCEEDED`、`FAILED` 和 `CANCELLED`。瞬时网络错误和 scheduled retry 不发布失败通知。

Headless JS 将事件 ID、task ID、最终状态和安全的展示文本传给原生通知管理器。原生 SharedPreferences 保存最近 256 个已通知 event ID，发布前原子去重并定期裁剪，避免进程重启、重复 tick 或 JS 在 commit 后重启造成重复通知。

点击结果通知启动应用并进入任务列表。通知不包含 token、源 URL、完整 Prompt 或 provider 原始响应。

### 3.3 Scoped 停服

Headless 返回所监控 task IDs 的活跃任务数与 pending/claimed operation 数。二者都为零时，在结果通知发布后停止前台服务。其他任务的 scheduled retry 不再拖住当前监控会话。

## 4. 创建页提交前校验

### 4.1 Workflow 合同

内置 H3 workflow 发布新的 immutable `1.0.1` 定义：

- Prompt：`minLength: 1`、`maxLength: 10000`；
- duration：整数 `1..15`；
- resolution：保留固定 enum；
- seed：可选整数 `1..999999999999999`；空输入在 snapshot 构建阶段规范化为缺省值；
- images/audios：继续由 schema 限制为 9/3。

catalog bootstrap 新增该版本并激活它，保留既有 `1.0.0` package 和历史 job provenance，不原地改写旧记录。

### 4.2 唯一提交前校验门

创建页按以下顺序提交：

1. 从表单值和媒体附件构造规范化 input snapshot；
2. 对活动 workflow/version/content hash 做 provenance 与完整 draft 校验；
3. 若失败，保存字段错误状态并弹出“参数设置不合法”，立即返回；
4. 仅在校验成功后获取 submission gate、读取 token、创建 durable job/task/operation；
5. executor 的 `prepareSubmission` 再执行相同校验作为非 UI 调用的防线。

失败路径不读取凭据、不写数据库、不调用 provider，且保留全部用户输入。

### 4.3 错误展示

增加纯函数把 JSON Pointer 错误路径与 schema title、约束和值组合成中文信息。`/prompt` 映射到 WorkflowForm 的 `prompt` 字段；无法映射的错误显示在表单顶部但不丢失。

示例：`Prompt（视频描述）最多 10,000 个字符，当前 10,237 个。`

Prompt 计数显示为 `当前长度 / 10,000`，超限时使用错误颜色。TextInput 不设置截断式 `maxLength`，避免粘贴内容被静默裁剪；用户点击提交时会得到明确反馈。

覆盖 REQUIRED、TYPE_INVALID、ENUM_INVALID、MINIMUM、MAXIMUM、MIN_LENGTH、MAX_LENGTH、MIN_ITEMS 与 MAX_ITEMS。未知错误保留安全的通用描述。

## 5. 测试与验收

### 自动化测试

- CAS：落盘 hash 不一致、大小不一致、正确 hash、竞争发布和清理。
- 视频探针桥：有效 MP4、无视频轨、零时长、sample table 损坏、关键帧解码失败。
- artifact handler：前两次可重试、第三次终态、不提交成功投影、不产生 export operation。
- durable redownload：事务性清投影、释放正确 ref、manual generation 单调递增、并发收敛。
- MediaStore：相同内容复用、不同内容替换、pending 清理、异常回滚。
- operation SQL：due/scheduled/nextWakeAt、job scope、LIMIT、network retry expedite。
- sync 策略：poll 不运行维护，maintenance 降频，人工刷新强制维护，settings fingerprint 失效。
- 任务页：精确 timer、联网恢复立即同步、无工作时停止计时。
- 通知：权限允许/拒绝、终态过滤、event 去重、256 条裁剪、scoped 停服。
- 表单：10000 字符通过、10001 字符拦截；非法 duration/resolution/seed/附件数不 enqueue；字段中文错误与合法输入单次入账。
- registry：`1.0.1` 激活、`1.0.0` 保持不可变。

### Android 设备验收

1. 下载有效视频，确认本地播放和相册副本可播放。
2. 使用损坏 MP4 fixture，确认不会显示“已下载/已保存”，三次后进入明确失败状态。
3. 对已有坏副本触发重新下载，确认新文件可播放且相册中只有一个有效同名条目。
4. 任务运行时断网超过最大退避，再恢复联网；不重启、不提交新任务即可继续状态同步和结果下载。
5. 100 条以上历史任务时，普通 poll 不运行投影全表修复、CAS GC 或逐条文件 stat。
6. Android 13+ 分别验证通知权限允许和拒绝；允许时完成/失败各一条，重启后不重复。
7. 无其他活跃监控工作时，结果通知发布后前台服务停止。
8. 输入 10001 字符 Prompt 及其他非法参数，确认创建页原地提示且任务列表没有新增记录；修正后仅提交一次。

## 6. 发布边界

本设计属于尚未发布的 v1.4.9 C-closure hotfix，可继续使用当前 `codex/c-closure-hotfix` 工作树。完成自动化、Android 构建、上述设备验收、独立审查、PR 合并、annotated tag 和 release 资产复核前，不启动 D 阶段。

AutoDL 动态 CDN host 无稳定前缀仍按既有 M6 Accepted Constraint 处理；本轮增加的是内容完整性与可播放性校验，不声称新增 DNS pinning 或固定域名白名单。
