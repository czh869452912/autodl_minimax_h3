# Agent 工作台后续分析、设计与改进 Handoff

> 历史归档（整理于 2026-11-01）：历史交接，已由实施台账和现行设计谱系接替；下文启动指令不再是待执行任务。 状态与后继见[归档索引](archive/2026-10-31-agent-workbench.md)；现行页面设计见[设计谱系](../design/README.md)。原文“当前”、优先级、源码行号和复跑命令均属于审查时基线；复现探针不属于现行正确性回归。桌面执行端、远端 Worker 及外部业务编排服务器均禁止；旧文相反建议已失效。

交接日期：2026-10-31。审查源码基线：`13e6be6f361e8c1b207484c9eeca956e9f6504ce`。

工作仓库：本仓库根目录（原文的机器绝对路径已移除）。

## 0. 给接手 Agent 的任务

你负责在现有 Android 创作应用基础上，继续验证发现、完成方案设计并交付可验证的改进。范围同时覆盖产品交互、资源资产、Skill、模型与生成端口接入、授权预算、Agent 编排和运行恢复。不要把任务缩减为前端样式优化，也不要只写第二份泛化评估后结束。

先阅读本交接及两份主报告，核对当前 HEAD/工作区与证据基线的差异；把发现标为仍成立、部分已修复、已修复或待验证。随后建立相容于现有底座的设计，按有依赖顺序的小切片实施。优先处理可明确复核的入口契约问题，再推进能力解析和持久生产流程。报告中的建议是待评估设计，不是所有功能均已实现或全部必须一次开发。

### 用户硬约束：禁止桌面和远端 Worker

用户在本次交接中明确纠正：**“桌面、远端 worker 不是远期扩展，而是禁止项。”**

- Agent harness、子 Agent 协调、工具执行、生产计划、状态/项目事实、授权、调度和恢复均在 Android 应用内。
- **禁止桌面 Worker、远端 Worker、外部 Agent 运行时，以及承担本应用业务编排的服务器、网关或常驻电脑。** 不得改称 companion、sidecar、bridge 或插件宿主绕过这个边界，也不作为可选/远期路线保留。
- 允许调用外部 LLM/视觉模型 API 和图像、视频、音频生成 API。供应商执行已受理生成、返回状态和产物属于允许的服务行为；供应商不能接管本应用的完整 Agent、授权或生产计划。
- 允许读取用户授权的远程素材来源，归档与项目引用由 Android 应用处理；不要求配套桌面代理。
- Android 停止运行时，本地认知和编排可以暂停；恢复后核查原生成任务并继续。不能承诺关机后本地 Agent 仍执行，也不能为满足此承诺引入被禁止的 Worker。
- 竞品的 Node/Go/Python 后端仅作为模块设计参考。需要的能力用 Android 可运行方式实现；设备做不到的规格要明确限制。

此约束优先于旧文档、之前的对话回复和任何参考项目架构。两份主报告已同步修正此前不合适的 Worker/桌面编排建议。

## 1. 先读这些材料

| 顺序 | 材料 | 用途与注意事项 |
| --- | --- | --- |
| 1 | [系统架构审查](2026-10-31-agent-system-architecture-review.md) | 底层实际实现、边界、缺口、竞品源码、优先级及验收；主材料 |
| 2 | [产品与交互对标](2026-10-31-agent-workbench-benchmark.md) | 对象上下文、决策/授权续跑、候选采用、分镜与交付，含本轮截图 |
| 3 | [本地生成后端架构](../architecture/generation-backend.md)、[本地 Skill 契约](../architecture/local-agent-skills.md) | 理解既有职责，避免另起重复状态机 |
| 4 | [Android 产品与架构方向评估](../research/2026-10-27-creative-workspace-product-architecture.md) | 既有 Android 内运行约束、其他参考来源与 harness 判断 |
| 5 | [既有 UX 执行交接](2026-10-31-ux-execution-handoff.md) | 与页面、返回、选择器、资源管理相关任务交叉对照；基线较旧，不能假设全部尚未修复 |

旧路线图存在“设计已回应、待实现”的历史文字，不能据此否认当前源码已经完成的能力。以当前代码、实际测试与新采集界面为准。

证据目录：

- [本轮 UI 证据清单（本地归档：manifest.json）](archive/2026-10-31-agent-workbench.md#local-archive)：5 个界面截图、UI 树、采集说明。模拟器 APK 为 1.5.0-preview.4/code76；没有证明 APK 与源码逐字节相同。
- [系统证据与哈希清单（本地归档：manifest.json）](archive/2026-10-31-agent-workbench.md#local-archive)：竞品树、固定提交源码快照、来源和测试结果。
- [来源 URL 与提交索引](../evidence/2026-10-31-agent-system-review/sources.json)。

交接时审查输出均为未跟踪文件；另有此前 UX 审计输出。保留所有既有工作，不要为了工作区整洁删除或混入无关提交。本交接未修改产品实现，发现的缺陷仍需后续复核和修复。

## 2. 已有底座：必须在此基础上演进

当前链路：用户选项目 → 会话 Runtime/AG-UI → 每轮 Skill/工作区快照 → DeepAgent 多轮模型/工具 → 类型化创作命令 → 草稿/提案/决策 → 冻结请求与授权预留 → 持久化 Job → 独立执行器 → CAS/资产版本 → 用户显式采用。

下列事实应保留，不能回退：

1. UI 与 Agent 共用领域命令和 revision 校验；模型提供的文本不是身份或授权。项目范围来自可信运行配置和数据库。
2. 资产版本不可变；生成结果首先是候选；模型不能自动批准自己的变更提案或替用户采用候选。
3. 原件在 CAS，SQLite 保存领域/任务事实，密钥在设备安全存储；新增索引与缓存不能成为第二套事实源。
4. 请求冻结素材版本、内容哈希、workflow/adapter 信息；幂等收据、Job、输入与预算在事务中关联。
5. 精确绑定账号与 credential generation；账号轮换不将旧任务转到新默认账号。查询退役凭据的规则保留，撤销凭据不能使用。
6. 结果未知先核查原 Job，不能自动重发、换模型或换供应商。未知费用占用不得冒充已退款/已结算。
7. 生成、下载、归档、导出、审阅采用分开表达。重试下载不等于重新生成；停止聊天不等于远端生成取消。
8. 备份恢复使用新 execution epoch，撤销/隔离旧授权和执行，不因恢复或工程导入自动继续消费。
9. Skill 安装不等于启用，普通升级不漂移旧 run，撤销阻断后续调用；Skill 不能授予工具或付费权限。
10. Android 前台、后台和 headless 共用同一持久执行内核，保留租约、attempt、epoch 等栅栏；禁止引入外部 Worker。

## 3. 发现台账：事实、风险与建议分开

### H01 / P1：带音频草稿的提交入口不一致

- **静态确认**：[agentTools.ts:94](../../mobile/src/creative/agentTools.ts) 调用 submit 时遗漏 `preview.audios`；[手动提交:58](../../mobile/src/creative/videoRuntime.ts) 有传；[底层校验:63](../../mobile/src/creative/videoSubmission.ts) 比较 audioRefs 与 audios。
- 触发：视频草稿含音频参考，走 Agent 提交，按路径会报 `DRAFT_INPUT_CHANGED`；没有实测外部生成。不是静默丢音，也不是所有视频生成失败。
- [planRuntime.ts:10](../../mobile/src/creative/planRuntime.ts) 同样遗漏；现有选图计划默认不带音频，不能夸大为所有计划均失败。
- 建议：共享完整 PreparedSubmission，入口只附加 origin/authorization/planStep 等差异，不独立挑选媒体字段。
- 回归必须经过真实入口装配或等价可验证边界；仅底层函数测试显式传 audios 无法证明修复。验证三个入口的图音冻结输入一致、空音频正常、重复提交只建一个 Job、变更内容仍被拒绝。

### H02 / P1：金额能力与实际提交路径存在边界

- [budget.ts](../../mobile/src/creative/budget.ts) 有金额/次数、未知费用和事务预留。
- 当前 [videoSubmission.ts](../../mobile/src/creative/videoSubmission.ts) 传 `maximum:null`；图像/视频手动授权 `amountLimit:null`、有限次数并允许未知费用；`_costEstimate` 是展示快照。
- 不能声称“各端口已实现绝不超额的金额硬限制”。没有证据证明已经发生超额扣费，也未确认某个界面已作错误承诺。
- 建议：分别表达可约束上限、展示估价、未知成本；任何金额保证必须在实际 dispatch 路径有可执行约束。LLM token/整轮成本另建预算，不与媒体次数混淆。

### H03 / P2：创作语义和资源依赖不足

- 通用资产、版本、标签、回收站、引用与恢复已存在，不能重建一套资产库。
- 建议四层：Blob/派生文件 → Asset/Version → Character/Scene/Style/Voice 等语义 → Project/Shot/用途绑定。
- 当前同种类/同原件 hash 导入会复用资产；文件去重应保留，不同业务用途应通过语义/用途对象表达。不要未经确认改为大量重复原件。
- 需要批量接入、媒体元信息/代理、派生关系、来源/使用说明；执行依赖与普通媒体资产分别建模。

### H04 / P2：检索与上下文不适合长项目

- [agentTools.ts](../../mobile/src/creative/agentTools.ts)：creative_context 全量镜头；asset_search 前 30 个资产但逐资产版本全量；授权只给原始限额等，未给清晰剩余量。
- [service.ts:80](../../mobile/src/creative/service.ts)：搜索主要是标题/描述/标签 substring。
- 建议摘要 + 游标 + 按对象读取，结构/全文检索优先；按需图像/帧/片段检查。聊天图片附件能力不等于 Agent 已能按项目资源 ID 自主查验所有视觉素材。
- 向量检索作为可重建派生索引，不能绕过项目权限或替代版本事实；执行引用必须绑定确切 versionId。

### H05 / P2：端口和能力接入未统一

- [LLM adapter](../../mobile/src/agent/modelAdapter.ts) 支持自定义 endpoint/model/key；媒体 [accounts.ts:6](../../mobile/src/creative/accounts.ts) 主要固定 NovelAI/AutoDL。
- [applicationRegistry.ts:23](../../mobile/src/providers/applicationRegistry.ts) 的 additional registrations 是代码扩展点，不是任意用户端口热插拔。
- 建议分离 ProviderDefinition、EndpointBinding、CredentialBinding、ModelCapability、WorkflowVersion、AuthorizationGrant，并先做统一 ReadyState/能力诊断。
- [accountVerification.ts](../../mobile/src/creative/accountVerification.ts) 对 AutoDL 记录 authenticated:false，不能把 token 非空称为已验证身份；探测不能暗中收费。
- ProviderAdapter 的报价/上传/取消/核查/usage 可按真实支持情况增加；不支持必须如实返回，不假装具备。

### H06 / P2：Skill 兼容范围与组合不足

- [package.ts](../../mobile/src/agent/skills/package.ts)：md/txt/json，32 文件、512 KiB，禁止额外权限/依赖声明；文本指导不是工具安装器。
- [store.ts](../../mobile/src/agent/skills/store.ts)：不可变内容、全局启用、每轮快照与撤销已存在。不能再报告成“导入 Skill 未接入 Agent”。
- 建议增加来源 commit/hash/许可、能力依赖与缺口解释、项目/单次运行作用域、样例评估。新增 manifest metadata 不意味着直接放开被禁止字段。
- 区分 Skill（指导）、Tool（宿主执行）、Workflow（持久步骤）。脚本需求优先转 Android 类型化工具，不能依赖桌面/远端脚本宿主。

### H07 / P2：持久化生产计划仍为窄模板

- [plans.ts](../../mobile/src/creative/plans.ts)、[planRunner.ts](../../mobile/src/creative/planRunner.ts)：主要“选图→H3 视频”，已有决策、依赖、授权等待和结果回填。
- [validator.ts](../../mobile/src/workflows/schema/validator.ts) 明确 COMPOSITE_UNSUPPORTED。预留类型不等于通用 DAG 已完成。
- 建议应用内认知循环与确定性生产循环分离；扩展少量 typed 节点、持久事件、人工决策、部分重跑、失效传播。无需先做公开低代码编辑器。

### H08 / P2：会话持久化不等于任意步骤恢复

- [runtimeStore.ts:99](../../mobile/src/agent/runtimeStore.ts) 重建后将未结束 run 标为 interrupted；[agentWorkspace.ts](../../mobile/src/agent/agentWorkspace.ts) 保存文件/todo/摘要，但不是完整项目长期事实库或通用业务检查点。
- 建议 RunSpec 固定项目、工具、Skill、输入版本、模型配置、预算；应用内节点检查点/事件唤醒；模型不常驻轮询长生成。
- 不因追求恢复改成外部托管 Agent。Android 后台受限时，明确暂停、保存与恢复动作。

### H09 / P2：多 Agent 尚未形成业务协同契约

- [h3Agent.ts:49](../../mobile/src/agent/h3Agent.ts) 没有显式业务角色；已安装 DeepAgents 有按 harness profile 启用默认 general-purpose 的机制。
- 不能说“完全没有子 Agent”，也不能由框架 API 推断已有成熟的导演/分镜/质检团队。实际默认工具暴露及配置传播仍需验证。
- 先验证单协调者 + 只读质检等少量角色；工具/项目范围/额度继承，父级汇总成本，协调者统一提交提案，子级不扩权。运行与协同全部在 APK 内。

### H10 / P2：交互缺少统一对象与决策上下文

- 最新截图支持的发现：助手只显示项目名，缺当前镜头/输入版本/待处理工作；创作信息偏单镜头 Prompt；Skill 管理占对话空间；菜单操作分散。
- 对照产品报告 A01–A06/B01–B10 和既有 UX handoff，核实哪些已修复。焦点对象、候选比较、待决策、授权续跑和运行/媒体状态应统一连接领域对象。
- 返回导航与大字体/读屏等需要真实 Android 验证，不能用源码或静态截图证明全部可用。

### H11 / P2：交付链需要 Android 可行性设计

- 单任务下载/归档/相册导出已有，多镜头时间线、音轨/字幕、合成与工程包没有已验证完整闭环。
- 评估 Android 原生媒体处理、设备规格/内存/磁盘/耗时、临时文件回收、中断恢复。先支持有限明确规格，不将渲染发往自建远端 Worker。

## 4. 竞品来源对照：借鉴机制，不搬部署架构

以下是审查时固定提交的公开源码；已下载本地快照。未安装运行两款产品，不能据此声称其所有功能生产成熟。复制实现前另核对当前许可证；本次建议主要参考模块和数据边界。

| 来源与固定链接 | 观察到的机制 | 本项目对应发现/设计 | Android 转化要求 |
| --- | --- | --- | --- |
| Toonflow [resources.ts](https://github.com/HBAI-Ltd/Toonflow-app/blob/aaf8b1d5cec6160adf595ab1c09cb078dc6f0f0b/apps/server/src/agent/runtime/resources.ts) | 按会话组织资源、Skill 正文按需读取 | H04/H06/H08：资源上下文分层 | 转为 APK 内资源加载，不接入其 Node 宿主 |
| Toonflow [skills/index.ts](https://github.com/HBAI-Ltd/Toonflow-app/blob/aaf8b1d5cec6160adf595ab1c09cb078dc6f0f0b/apps/server/src/agent/skills/index.ts) | 工作区/全局作用域及同名优先级 | H06：项目 Skill 组合 | 用本地持久绑定和 run 快照，保留现有撤销规则 |
| Toonflow [providers/types.d.ts](https://github.com/HBAI-Ltd/Toonflow-app/blob/aaf8b1d5cec6160adf595ab1c09cb078dc6f0f0b/packages/providers/types.d.ts) | 模型能力、输入规格、可选估价/余额、恢复原任务 | H02/H05：供应商与模型契约 | Android 适配器；展示价格字符串不作为账本硬上限 |
| Toonflow [subAgent.ts](https://github.com/HBAI-Ltd/Toonflow-app/blob/aaf8b1d5cec6160adf595ab1c09cb078dc6f0f0b/apps/server/src/agent/runtime/subAgent.ts) | 工具选择、独立会话、取消、等待输入、usage 汇总 | H09：受约束角色协作 | 应用内实现，保持宿主授权和累计预算 |
| 影策 [tool/policy.go](https://github.com/ddcat-ai/open-ai-canvas/blob/82fc5c03233c33380a5335146c50bb507deb5692/backend/internal/agent/tool/policy.go) | 工具读写/媒体/预处理分类、能力可见性、缓存与审批策略 | H05/H07/H09：ToolRegistry | 转为 TypeScript/Android 宿主元数据；可见性不替代执行权限 |
| 影策 [cloud_agent_media_approval.go](https://github.com/ddcat-ai/open-ai-canvas/blob/82fc5c03233c33380a5335146c50bb507deb5692/backend/internal/app/cloud_agent_media_approval.go) | 修改审批参数后重建准备结果/哈希/资源租约，校验解析后规格 | H01/H02/H05：准确审批实际请求 | 保持本地事务与固定输入，复用现有预算机制 |
| 影策 [cloud_agent_runtime_scheduler.go](https://github.com/ddcat-ai/open-ai-canvas/blob/82fc5c03233c33380a5335146c50bb507deb5692/backend/internal/app/cloud_agent_runtime_scheduler.go) | 持久状态推进、事件唤醒与恢复检查 | H07/H08：生产循环和检查点 | 只借鉴状态机机制，在 Android SQLite/现有执行器内实现 |
| 影策 [yingce-agent/README.md](https://github.com/ddcat-ai/open-ai-canvas/blob/82fc5c03233c33380a5335146c50bb507deb5692/yingce-agent/README.md) | 推理与数据库/计费/审批职责分离，失败不随意切执行路径 | H08：RuntimeAdapter 与业务内核边界 | **远端 Node + Go 部署不适用且禁止引入**；职责分离发生在同一 APK 内 |

两个提交分别为 `aaf8b1d5cec6160adf595ab1c09cb078dc6f0f0b` 和 `82fc5c03233c33380a5335146c50bb507deb5692`。后续如果研究更新版本，分别记录新证据，不覆盖旧快照或声称旧结论自动适用于新代码。

## 5. 下一步设计应明确回答的问题

1. **资源**：角色/场景等是独立语义实体还是资产特化？如何绑定版本、表达用途和上游变化？本地探测、代理、全文/语义索引如何分阶段落地并可重建？
2. **能力**：任务要求如何解析到工具、模型、workflow、资源与账号？缺少能力如何返回明确状态并跳到现有配置入口？多个配置如何优先选择而不暗中切换已提交任务？
3. **授权**：连接权、素材外发权、执行消费权如何分别表达？端口/模型/输入变化何时仍在已授权范围，何时重新准备？未知成本如何展示和有限执行？
4. **Skill**：如何扩展 metadata 与作用域并迁移旧包？升级/停用/撤销分别影响哪些 run、计划和已受理 Job？依赖诊断如何不变成自动扩权？
5. **编排**：RunSpec、Plan、Step、Decision、Job 如何关联？哪一层是事实源？事件、幂等、lease、CAS 和检查点如何复用？如何部分重跑与标记失效？
6. **Android 生命周期**：前台、后台 slice、headless、进程被杀、用户强停、重启、离线、存储不足下分别如何暂停/恢复？哪些行为可以验证，哪些不能承诺？
7. **交互**：如何从镜头进入 Agent 并保留输入版本？候选、提案、选择、授权、执行、采用如何呈现？关闭面板与取消运行/任务如何区分？
8. **迁移**：现有数据、备份、Skill、历史 Job 和旧工作流如何兼容？新增 schema、派生索引、包格式的升级/恢复如何测试？

不需要先更换 harness。对 DeepAgents 的问题先定位应用层缺口；只有有对照证据证明替换更合适时再提出，并满足 Android 内运行和同一验收场景。

## 6. 建议工作包和交付

| 顺序 | 工作包 | 交付与验收 |
| --- | --- | --- |
| A | 复核 H01，统一提交契约；澄清 H02 | 可审阅小改动 + 入口回归；图音不丢参数，幂等/预算/校验不退化；文案与真实成本模式一致 |
| B | 资源语义与能力目录设计、最小诊断实现 | 领域关系图/迁移方案/接口；一个镜头可枚举确切依赖，缺能力有结构化原因；查询分页 |
| C | 多连接/模型能力、外发与有限授权 | 配置→无消费校验→草稿就绪→授权→提交闭环；凭据代次/请求 hash/未知占用仍有效 |
| D | Android 应用内 typed 生产计划 | 在现有计划上扩节点、事件与恢复；关闭聊天仍可在系统允许时执行；暂停与恢复明确；只重跑失败节点 |
| E | Skill 项目组合与受约束角色 | 兼容旧包/版本快照，能力缺口可解释；子 Agent 不扩范围和额度，成本可追踪 |
| F | Android 本地多镜头交付 | 支持规格内的时间线/音轨/字幕/拼接及工程清单；临时文件/中断/恢复可验证；无外部 Worker |

建议产生三个持续更新的材料，而非重复生成大量相互冲突的路线图：发现处理台账、最终架构/迁移设计、每个切片的验证记录。可在现有 docs/architecture 与 docs/verification 中按仓库惯例落文件，并回链本交接。

优先完整验收场景：导入角色参考/配音 → 建立少量镜头 → 绑定设定 → 生成结构化分镜提案 → 审阅 → 候选比较/选择 → 有限授权 → 生成 → 质量检查 → 重做一个失败镜头 → 显式采用 → 支持规格内导出。所有步骤在 APK 内编排；外部只提供模型与生成 API。

## 7. 验证基线及后续测试

本次已有结果：4 个测试文件通过，31 项通过、1 项跳过，约 22 秒。不是全仓测试，不是新增方案验收，也不覆盖 H01 的工具入口缺失。

- [日志](../evidence/2026-10-31-agent-system-review/targeted-tests.log)
- [Jest JSON](../evidence/2026-10-31-agent-system-review/targeted-tests.json)

从 `C:/Users/czh86/Documents/ChatGPT/autodl/autodl_minimax_h3/mobile` 运行基线命令：

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/agent/skills/runtime.test.ts src/creative/agentScope.test.ts src/creative/budget.test.ts src/creative/videoSubmission.test.ts
```

产品改动后执行相关测试与 `npm run typecheck`；Skill/workflow 内容变更时再执行 package.json 中对应 verify 脚本。按改动选择检查，不必为写文档重跑全套。金额、幂等、迁移、恢复等高影响逻辑使用真实 SQLite/故障注入验证；单纯镜像实现的 mock 不能代替事务证明。

关键新增验证矩阵：

- 手动/Agent/plan：混合图音、无音频、失效输入、重复事件/提交、旧 revision、断流后回执重放。
- 授权：过期/撤销/账号切换、请求规格变化、已知/未知费用、额度并发争用；未获授权不发送。
- 计划：等待选择/授权、结果归档后续跑、部分失败、取消后续、上游变更；不覆盖已采用结果。
- Skill：旧包兼容、项目组合、版本升级、撤销、缺依赖、输入内容不能扩权。
- Android：前后台切换、进程重建、强停/重启、离线与重连、原件缺失/恢复、存储不足；记录设备/系统和实际证据。
- UI：新鲜 UI 树与截图、返回/取消、大字体/读屏/窄屏；截图与当前构建对应关系要清楚。

先用离线模型、模拟供应商和真实本地执行链验证。历史验证或本次对标不构成新的真实付费生成授权；需要真实调用时遵循用户实际授予的账号、次数与费用范围，不从文档推定权限。不要输出密钥或在用户数据库做破坏性恢复实验。

## 8. 交接时未完成与不能误报的事项

- H01 尚未修复；只完成静态调用链确认。没有真实生成复现记录。
- 没有测试两款竞品的运行质量，也没有验证其全部供应商、恢复和计费。
- 没有验证后台在全部 Android/OEM 状态下持续执行；手机停止运行时允许本地流程暂停。
- 尚无通用 DAG、业务角色团队、任意媒体端口热插拔、完整多镜头后期交付的验收结论。
- 当前源码中的额外 Provider 注册点和框架子 Agent 能力，不能被忽略，也不能当成完整产品能力。
- 报告已删除 Worker 扩展路线；**不得重新引入桌面/远端 Worker 或外部编排服务器**。
- 后续完成情况必须说明实际修改、验证结果、未覆盖边界和仍需用户决策的具体产品取舍。不要把本交接中的建议直接标记“已完成”。

## 9. 可直接转交的启动指令

> 请接手本仓库的 Agent 创作工作台分析、设计与改进。先完整阅读本 handoff 和其中两份主报告，核对当前代码与基线差异，维护发现处理台账。严格遵守：桌面 Worker、远端 Worker、外部 Agent/业务编排服务器均禁止；Agent、编排、状态与项目数据在 Android 应用内，只调用允许的外部模型与生成 API。保留现有不可变版本、共享命令、精确凭据绑定、授权账本、幂等执行与恢复隔离。优先复核并修正 H01 图音提交入口差异，同时明确 H02 成本约束；随后设计并逐步实现资源语义、能力诊断、端口授权、Skill 组合和应用内持久生产计划。复用竞品机制但不搬其部署架构。每个改动提交可审阅结果与相应测试，不能停留在泛化建议，也不能未经授权发起付费生成。
