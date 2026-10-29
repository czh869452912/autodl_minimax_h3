# 全本地 Agent 基座：Skill 导入、提炼、管理与编排评估

日期：2026-10-29。本文为架构与产品评估，不表示这些功能已经实现。

配套交互方案：[全本地创作平台的 UI 设计逻辑与演进路线](2026-10-29-local-creative-ui-evolution.md)，将技能、角色、编排与 3D 能力接入移动端创作焦点和返回契约。

硬约束：除模型请求及其必要素材上传、任务查询、结果下载外，全部在 Android 本地运行。Skill 导入以设备已有文件为入口，不把 GitHub 下载、远程 Skill 商店、远程 MCP 或云端 Agent 作为运行依赖。

“总结创建”在本文中指从用户选择的会话、项目成果和已验证操作提炼可复用 Skill，同时支持用户描述需求直接创建和手工编写。

## 1. 选型结论

建议把当前 H3 助手升级为本地 Agent 工作空间：DeepAgents/LangGraph 继续负责模型与工具循环，应用拥有 Skill 库、角色配置、权限、持久运行和创作计划。DeepAgents 的版本升级应进入前置技术验证：新版对 Skill 重载、显式指定和工具按需加载有直接收益，但本次 Android Metro 检查发现兼容阻塞，暂不直接替换生产依赖。详见第 9 节；更换 harness 仍需另行实测比较。

导入和管理 Skill 不要求更换 DeepAgents。更换 Pi 或其他循环也不会自动获得安装器、经验提炼、版本管理、Android 恢复和流程编辑器。

产品应区分以下对象：

| 对象 | 用途 | 不承担的职责 |
| --- | --- | --- |
| Skill | 可复用方法、示例、参考资料与模板 | 不自行授予工具权限或创建消费授权 |
| Tool | 受校验的本地能力入口，如创建镜头、修改场景、提交模型任务 | 不负责定义完整创作方法 |
| AgentProfile | 角色、模型配置引用、可见 Skill、工具集合与运行预算 | 不复制项目事实或存储明文密钥 |
| WorkflowTemplate | 可实例化的步骤、依赖、输入输出和人工决策 | 不等同于一段自然语言 Skill |
| WorkflowRun / AgentRun | 某次执行的固定版本、状态、事件和产物 | 不随着模板或 Skill 编辑而改变历史 |

一个角色可以使用多个 Skill；一个步骤可以调用角色，也可以直接渲染或导出。简单任务不需要创建多个 Agent。

## 2. 当前源码能力与缺口

| 项目 | 当前事实 | 提升点 |
| --- | --- | --- |
| 内置技能 | `skillBundle.ts` 从生成的 TS 文件读入，测试覆盖 9 个 SKILL.md；构建校验覆盖 36 个文件 | 独立的运行时 Skill 存储与索引 |
| 加载边界 | `agentWorkspace.ts` 将 `/skills/` 挂载为只读 backend | 读取固定的用户 Skill 快照，继续保护正式版本 |
| 工作区 | StateBackend 文件、todos 和总结可捕获恢复；文本工作区上限 1 MiB | 大 Skill 库/资产不要塞入每个会话快照 |
| 会话总结 | 对话前缀 hash、预算、skillVersion 一致时复用压缩总结 | 建立独立的经验提炼流程与可审阅 Skill 草稿 |
| Agent 装配 | `h3Agent.ts` 固定官方 Skill root、H3 输出政策和创作工具 | 分离通用宿主政策、角色指令与 H3 技能 |
| 运行复用 | `runtimeStore.ts` configKey 不包含用户 Skill 集合或角色版本 | 加入 SkillSnapshot/Profile/ToolRegistry 身份 |
| 计划 | `plans.ts` 固定 selection/video，runner 直接提交视频 | 通用步骤、产物绑定、人工决策和整图完成规则 |
| 来源检查 | `agentScope.ts` 按 thread/run/项目范围校验 | 显式支持父子运行、步骤身份及权限继承 |
| 子 Agent | 应用未定义专用子角色；已安装 DeepAgents 在默认 profile 下可自动加入 general-purpose | 不应误判为框架没有子 Agent，也不能视为产品已完成多角色编排 |

已核对安装版本 `deepagents@1.13.2` 的 browser 导出与构造源码：支持 skills、backend、同步 subagents 和 checkpointer。其 SkillsMiddleware 缓存元数据，同名技能按后读覆盖；`allowedTools` 在所查技能中间件中被解析并展示，不能用它替代宿主的工具权限校验。

另一个重要限制：当前包的 AsyncSubAgent 契约使用服务地址与 graphId，其异步中间件面向远端 Agent。全本地持久子任务应由应用执行层调度，不能直接把该远端接口当作 Android 本地后台能力。

在线文档会演进，且部分示例混合其他语言的参数；实现应以固定安装版本的 browser 类型、源码与 Android 验证为准。[DeepAgents 技能文档](https://docs.langchain.com/oss/javascript/deepagents/skills)、[子 Agent 文档](https://docs.langchain.com/oss/javascript/deepagents/subagents)。

## 3. Skill 导入：先做可解释的兼容性

首版入口：本地 ZIP、应用创建的 Skill 包、粘贴 SKILL.md 文本。可额外支持系统目录选择器，前提是设备文件权限与目录遍历已验证。导出为带 SKILL.md、references 和 assets 的本地包，可通过系统文件机制转移。

基本格式采用 [Agent Skills 规范](https://agentskills.io/specification)：SKILL.md 的 name/description 为基本元数据；正文和引用按需加载。应用所需 ID、版本、启用范围和兼容状态保存在旁侧 manifest/SQLite 中，不强迫用户改写标准文档。`allowed-tools` 属实验字段，不能由包内容自动增加宿主权限。

导入链路：选择文件 → 本地临时区检查 → 显示元数据和兼容性 → 提交不可变版本 → 加入技能库。导入不等同于启用，包内文档也不等同于用户授权。

具体要求：

- 识别单技能包与多技能合集，用户选择要安装的目录；检查 YAML、引用路径、文件哈希和资源预算。
- 解包前限制条目数、解压后字节数和单文件大小；拒绝路径穿越、绝对路径、符号链接和路径大小写冲突。检查临时文件后再发布，失败不留下半安装状态。
- 同名技能不静默覆盖。内部 skillId/来源独立于展示名；更新需要明确目标与 expectedRevision；重复导入同一内容可返回原安装记录。
- 保留原文件与来源、许可证信息；Hermes 所需 YAML 规范化单独记 parser/normalizationVersion 与运行内容 hash，不把转换后的内容冒充原包字节。
- UI 显示“可直接使用 / 仅部分可用 / 缺少能力 / 无法解析”。检测结果基于已知工具、compatibility 和资源引用，不能保证任意自然语言指令都已通过静态检查。

首版支持文档型和应用工具型 Skill。包含 Python/Bash/Node 脚本、CLI 或外部服务依赖的包可以保留其内容，但不执行脚本、不自动安装依赖；标明受影响的能力。当前尚无通用脚本运行器，不能把“导入成功”显示为“脚本可运行”。以后如确有需要，再单独建设设备内受限解释器和能力桥接。

现有内置 `3d-animation-short-generator` 已在 compatibility 中声明依赖 MiniMax Hub 与专用画布工具，是兼容性检测的真实验收样本：当前应提示只能用于前期方案；后续可派生本应用适配版本，并明确记录差异，不能静默修改官方版本。

## 4. 总结创建：把经验变成可复用方法

现有上下文压缩总结的任务是节省模型上下文，不适合作为经验提炼的唯一来源。它可能丢失用户修改、失败尝试和最终采纳依据。

建议增加三种创建入口：空白编辑、描述需求生成、从选定会话/成果提炼。后者按以下流程工作：

1. 用户选择来源范围，例如某次会话的部分消息、一个镜头的采纳版本、某个计划的实际操作。
2. 本地准备 EvidenceBundle：用户要求和修正、成功/失败工具结果、采纳产物、参数与结果关联。区分实际观察、用户评价与模型推断；不将成功生成自动标为高质量。
3. 从当前范围排除凭据、鉴权头、设备路径和无关私人内容；媒体默认传已有元数据，只有确需视觉判断时才作为模型输入。当前会话持久化的字段过滤不能证明文本中的秘密已清除，需要额外处理。
4. 调用用户配置的模型，输出结构化 SkillDraft：适用条件、必要步骤、参数选择依据、例子、验证方法、限制、来源引用和待确认项。
5. 本地生成 SKILL.md 与必要 references；检查格式、引用和能力依赖。用户编辑草稿后保存或采纳为正式版本。
6. 用户可以显式启用或将它绑定到某个角色/项目。以后使用结果可作为修订证据，但不自动重写正式 Skill。

示例：“把这次做出稳定双人对话镜头的过程存成 Skill”。输出应提炼站位、轴线、参考图和迭代判断；角色姓名、项目 ID、临时路径和授权 ID 应变为参数或留在来源记录，不固化进方法。

提炼来源与导出内容分离：本地保留可追溯证据，导出的包默认只包含已审阅的方法、示例和用户选择的资源。删除原会话不应使已发布 Skill 无法加载，但来源记录需要显示引用已失效或保留经用户选定的证据副本。

“总结生成”只是候选经验。对单次案例明确标注适用范围，使用脱离原项目的新输入试用后再判断复用价值；试用默认先验证草稿与产物结构，不偷偷调用收费生成。

## 5. 管理：本地库、版本和运行快照

技能库建议提供搜索、标签、来源与兼容性筛选、预览、编辑副本、版本比较、回滚、启用/停用、项目/角色绑定和导出。内置技能保持只读，用户可派生副本。按包引用计数清理资源，删除入口展示被哪些角色或流程使用。

正式版本不可变，草稿可修改。生命周期与开关分开：DRAFT → RELEASED → ARCHIVED；启用状态保存在绑定上，避免一个全局状态无法表达不同项目的选择。回滚是切换绑定到旧版本，不覆盖版本内容。

建议最小实体：

| 实体 | 必要字段 |
| --- | --- |
| Skill | id、来源、显示信息、当前推荐 versionId |
| SkillVersion | id、skillId、schemaVersion、manifestHash、immutable files、compatibility |
| SkillDraft | id、目标 skillId、baseVersionId、内容、revision、提炼任务引用 |
| SkillBinding | profile/project 范围、skillId、versionId 或明确的跟随更新策略、enabled |
| SkillSnapshot | 本次可见技能的 versionId/hash、名称冲突决议、索引版本 |
| DistillationRun | 输入证据引用、模型配置引用、状态、输出 draftId、失败原因 |

SQLite 负责索引与关系，文件/CAS 保存不可变包文件和大资源。增加独立技能资源的所有权与备份恢复规则，不把 ZIP 字节塞进会话 JSON；可复用 CAS 基础，但不能绕过现有文件引用与垃圾清理契约。

运行开始解析 SkillSnapshot，挂载为只读 `/skills/`，正文/引用按需读取。运行中编辑、停用或发布新版本不会替换已经固定的内容；撤销工具权限则在下一次工具调用前生效并按需中止任务，不能因“版本固定”继续使用已撤销能力。

`configKey`、运行记录和恢复数据要纳入 profileVersionId、skillSnapshotId、toolRegistryVersion。技能元数据缓存仅在同一快照内复用，更新后创建新图/运行时；不依赖写入原目录触发热加载。同名覆盖行为由应用显式处理，不能直接暴露上游的“最后一个获胜”。

工作区中的 skillVersion 应从全局内置 bundle hash 改为本次快照身份。旧会话缺少该字段时迁移为其原内置版本；找不到固定版本应阻塞恢复并解释原因，不能悄悄改用最新版。

## 6. 发现与权限：技能更多时保持可用

少量 Skill 可以直接提供全部名称与简介；规模增大后，用本地文本索引召回候选，再加载正文和引用。首版不需要向量数据库或额外 embedding 服务。用户可明确指定技能，自动选择则受当前角色/项目的可见集合限制。

记录“可见 / 选择 / 已加载 / 实际使用证据”。读取了 SKILL.md 不能证明所有指令被遵循，UI 不应将文件读取直接标为技能成功。

执行权限由宿主决定：当前用户授权 ∩ 项目范围 ∩ 角色工具集合 ∩ 运行/步骤约束。Skill 的能力声明用于兼容检查或收窄范围，不能扩大权限。模型密钥通过受控模型适配器使用，Skill 文件与工具结果不获得密钥。消费沿用已有结构化授权；另行增加模型调用次数/token/时间预算，不能假定现有图像视频预算已覆盖 LLM 消耗。

生成或导入的 Skill 可以提出新方法，不能凭正文写入数据库、修改应用政策或注册任意远程工具。管理操作走 typed command，例如 skill.createDraft、skill.updateDraft、skill.release 和 skill.bind；Agent 可准备候选，发布与启用按用户的明确操作或已有结构化授权执行。

## 7. 编排：方法指导与持久执行分别承载

自然语言 Skill 用于开放式判断；重复的生产流程用版本化 WorkflowTemplate 实例化，步骤固定 Skill/角色/输入版本，并由本地 runner 驱动。

建议先支持顺序、依赖并行、人工选择、条件分支、失败暂停与显式重试。限制有界重复，首版不必支持任意循环或任意 JS 节点。模板建议至少具备 inputSchema、步骤类型、依赖、输出 schema、版本化绑定与预算边界。

先接入三类真实步骤：agent（产出结构化镜头方案/Skill 草稿）、generation（接现有 job）、decision（复用人工选图）。随后增加 local.render 和 local.export。编排编辑器先用步骤列表，等协议稳定后再增加节点画布。

每个步骤具有稳定 runId/stepId/attemptId、冻结输入、命令收据、产物引用、取消状态与恢复点。提交模型生成使用稳定业务命令身份；超时或返回未知结果先查询原 job，不能自动创建另一笔消费。

本地 runner 负责执行租约、依赖满足、输出校验和整图完成计算。状态可表达 READY、RUNNING、WAITING_USER、WAITING_NETWORK、SUCCEEDED、FAILED、CANCELLED；等待状态无需保持模型请求和聊天页面存活。项目/权限变化、输入失效、模型不可用应给出明确阻塞原因。

Agent 步骤内部恢复有两种粒度：先支持保存输入/产物后重新执行未完成的纯生成步骤；需要恢复到具体工具边界时再接入持久 checkpointer 或操作日志。不得把“步骤可重试”描述为“任意推理位置精确续跑”。

确定性生产步骤与即兴子 Agent 分开。专用子角色只获取所需上下文与工具，父子关系记录在本地，不能凭模型生成的 ID 声明调用身份。当前 guard 校验顶层 run，接入子 Agent 时需验证传递的 thread/run/scope、rootRunId/parentRunId 及取消继承。

事件流应加入 executionId/parentExecutionId/stepId/agentRole，UI 形成可展开执行树；现有消息投影不能直接视为已经支持子 Agent 状态。先按顺序执行角色，再对无数据冲突的步骤开放有限并发；模型请求额度和消费额度共享约束，不能每个子 Agent 各自获得一份无限预算。

## 8. 推荐模块结构与接入点

```text
Agent / Skill / Plan UI
  → 应用命令、查询与授权
      → SkillLibrary / SkillImporter / SkillDistiller
      → AgentProfile / ToolRegistry / SkillSnapshotResolver
      → LocalRunCoordinator / WorkflowRunner
          → AgentRuntimeAdapter → DeepAgents browser → 外部模型 API
          → GenerationRunner → 现有 provider/job 链路
          → LocalRenderer / Exporter
  → SQLite / 文件与 CAS / 安全凭据存储
```

建议新增 `skills/` 管理应用能力；现有 `agent/skills/` 继续作为内置源。`skillBundle.ts` 退为内置包源，运行时通过 resolver 汇总内置与用户固定版本；`agentWorkspace.ts` 接收快照 backend；`h3Agent.ts` 逐步演进为通用 createLocalCreativeAgent，由 profile 注入角色指令和应用工具。

`runtimeStore.ts` 负责会话生命周期，流程恢复由 runner 管理；不把所有新职责堆进一个 Store。SkillDistiller 输出 SkillDraft，不能直接修改正式库。通用工具描述在应用侧定义，LangChain tool 转换留在 adapter，便于未来公平比较其他 harness。

若试用其他基座，先共用同一 Skill 包、快照、工具/授权和工作流协议，再比较端内请求链、恢复与资源成本。此前 Pi 调研中的打包通过只是历史候选证据，本次未复测最新 Pi，也未据此改变生产选型。

## 9. DeepAgents 是否升级：值得推进，先通过端侧兼容验证

### 9.1 当前版本与候选

2026-10-29 同时核对本地 lockfile、npm registry 与上游发布记录。本地声明 `deepagents: ^1.13.2`，lockfile 和实际安装均为 1.13.2；npm latest 为 1.16.0。生产依赖和 lockfile 本次均未修改。

| 版本 | 与本项目有关的变化 | 判断 |
| --- | --- | --- |
| 1.13.2（当前） | 已支持 browser backend、Skill 发现、同步子 Agent 和可注入 checkpointer | 可继续运行；新版 Skill 交互需要自行补足 |
| 1.14.0 | `skillsMetadata: null` 显式重载；加载时点由 beforeAgent 移到 beforeModel | 直接适合安装、编辑后在下一次模型调用更新技能目录 |
| 1.14.2 | 二进制内容卸载选项、自动 UnsupportedContentMiddleware | 可改善多模态历史体积和失败处理，需核对应用已有媒体引用与模型能力 |
| 1.15.0 / 1.15.1 | `pinnedSkills` 指定技能；`metadata.include_tools` 按需提供工具；路由和工具错误状态修正；1.15.1 修正 ContextHub glob 路径范围 | 与本次技能库、角色配置目标最相关，是主要升级收益来源 |
| 1.16.0（latest） | 实验性远端异步子 Agent 完成通知、等待状态与 fork/排队能力 | 可作为整体升级验证目标；这些异步能力仍要求 Agent Protocol 服务，不纳入本地执行方案 |

来源：[npm 包元数据](https://registry.npmjs.org/deepagents/latest)、[1.14.0 发布说明](https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.14.0)、[1.14.2 发布说明](https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.14.2)、[1.15.0 发布说明](https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.15.0)、[1.15.1 发布说明](https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.15.1)、[1.16.0 发布说明](https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.16.0)。候选包也从 npm 下载并核对 SHA-512 integrity 后检查发布源码，未仅依据在线文档推断已安装能力。

### 9.2 升级能减少哪些应用工作

- **Skill 重载**：管理器安装/发布新版本后，可以更新下一次运行的可见目录。仍须保持当前运行的快照固定，不能对正在执行的生产流程直接切换新版。
- **显式指定**：技能选择器或 `@技能` 操作可将 `pinnedSkills` 交给框架，在下一次模型调用注入正文。它表示装载正文，不保证模型必然遵循，也不等于固定包版本；包版本仍由 SkillSnapshotResolver 决定。
- **工具按需提供**：可降低大量创作工具对上下文的占用。resolver 只返回宿主已注册、当前角色/项目允许的工具；`include_tools` 不能注册新代码或扩大授权。当前直接传给主 Agent 的工具不会仅因升级自动改成按需提供，需要重新组织工具装配。
- **文件与错误处理**：新版有路由边界修正和结构化工具错误状态。当前流适配器已读取 ToolMessage.status，但仍需验证用户界面与模型重试行为。

Skill 导入、安装、提炼、版本管理、SQLite/CAS、持久流程和 Android 调度仍由应用实现，升级不会交付这些产品模块。

### 9.3 已确认的升级成本与阻塞

**第一项是实际打包阻塞。** 1.15.1 和 1.16.0 的 browser 入口所导入的公共 chunk 含 `import { createHash } from 'node:crypto'`，用于二进制卸载的 SHA-256。当前 1.13.2 的对应 browser chunk 没有这一导入。1.16.0 即使不启用二进制卸载，该静态依赖仍会进入 Metro 解析；本次最小 Android 打包确实在这里失败。

可选修复路径是等待/提交上游 browser 可移植哈希修复，或在应用内对该依赖采用范围明确、实现真实 SHA-256 的兼容适配。应用已有 CryptoJS 可供评估，但必须验证 Uint8Array 字节、update/digest 语义与导出形状；不能用返回空值的 shim 消除报错，也不应全局替换任意库的 Node crypto。修复后继续构建以发现后续问题，本次未实施该适配。

**第二项是关联依赖需要一起验证。**

| 依赖 | 当前锁定 | 1.16.0 声明的相关范围 |
| --- | --- | --- |
| `@langchain/core` | 1.2.9 | ^1.2.14 |
| `@langchain/openai` | 1.5.10 | ^1.6.2，optional peer；本应用实际使用，因此需要满足 |
| `langchain` | 1.5.10 | ^1.5.10 |
| `@langchain/langgraph` | 1.4.13 | ^1.4.10 |
| `@langchain/langgraph-sdk` | 1.10.0 | ^1.9.23 |
| `@langchain/langgraph-checkpoint` | 1.1.5 | ^1.1.5 |
| `langsmith` | 0.7.17 | >=0.7.1 <0.10.0 |

Anthropic 适配器是可选 peer，现阶段不为使用 OpenAI-compatible API 而额外接入。试验使用上述满足要求的固定最低 Core/OpenAI 版本并保留其余列出的当前版本，依赖安装未使用 legacy-peer-deps；正式升级还需核对实际选定的完整 lockfile。

其他需要明确处理的接入点：

1. **旧会话迁移**：`H3_GRAPH_VERSION` 当前包含 `deepagents-1.13.2/h3-workspace-1`，恢复函数要求精确相等。机械替换这个常量会拒绝旧工作区，保留旧值又会掩盖运行时变化。应分开 runtimeVersion 与 workspaceCodecVersion，迁移兼容数据，并对总结/内部状态单独失效处理。
2. **模型兼容**：升级 OpenAI 适配器后，复测自定义 DeepSeekCompletions 的 reasoning_content、流式取消、视觉输入和动态工具。不能因 generic OpenAI-compatible endpoint 可用就假设其能力元数据完整。
3. **内容过滤**：自动 UnsupportedContentMiddleware 可能改变不受支持媒体的模型输入；用真实配置验证图片是否仍传入、降级是否可见，避免创作上下文被无声替换。
4. **内部消息与中间件顺序**：Skill 重载移动到 beforeModel；新版还调整技能中间件顺序。`pinned_skill` 会产生内部 HumanMessage，需保证其不显示成用户发言、不重复持久化为用户输入，并验证现有总结与 transcript 前缀校验。
5. **文件资源**：`offloadBinaryContent` 默认关闭。后续启用前，应适配本地资源存储与清理；现有工作区捕获只接受文本，不能直接把二进制 state 或 blob 引用塞进原 codec。发布源码的 BlobCache 默认上限为 256 MiB，属于缓存上限而非启动分配，端侧需要另定资源策略。
6. **权限与子任务**：重测只读技能、CompositeBackend 路由、项目作用域、子 Agent 身份和消费幂等。新版远端异步通知保持未接入，不作为本地后台恢复机制。

### 9.4 本次隔离验证结果

| 检查 | 结果 | 能证明什么 |
| --- | --- | --- |
| npm 元数据与发布包 integrity | 通过 | 确认版本、peer 范围与被检查的发布包 |
| 1.16.0 browser 入口在 Node 中运行 | 通过 | 满足所选依赖组合后可创建并执行离线图 |
| ScriptedModel：指定 Skill 正文注入 | 通过 | `pinnedSkills` 对所选技能产生内部消息；未发真实模型请求 |
| ScriptedModel：同一图显式刷新目录 | 通过 | 更换输入技能文件并设 skillsMetadata=null 后，新目录替换旧目录 |
| 当前 1.13.2：Android Metro 最小入口 | 通过 | 现有 resolver 可打包该基线入口 |
| 候选 1.16.0：Android Metro 最小入口 | 失败，node:crypto 无法解析 | 直接升级存在明确 browser/RN 适配阻塞 |
| 1.15.1 browser 发布源码 | 同样存在 node:crypto 导入 | 不能把 1.15.1 当作已验证的规避方案；未单独执行其 Metro 构建 |

Metro 检查沿用本项目 metro.config.js 的 resolver，隔离 projectRoot 与依赖目录，保留所需导出以避免空入口。它不是完整应用打包或 Hermes 执行测试；Node 冒烟通过也不代表 Android 可用。检查材料在 Git 忽略的 `build/deepagents-upgrade-review-20261029/`，包含试验 package-lock、探针脚本和基线 bundle；生产依赖、源码与 Metro 配置均未改动。

### 9.5 建议决策与进入条件

**决定：把升级列为近期技术工作，生产暂留 1.13.2；以 1.16.0 为固定验证目标，解决端侧阻塞后再合入。** 1.15 的 Skill 能力让升级有直接收益，1.16 的远端编排功能不改变本地架构。若 browser 修复尚未收敛，可先按 RuntimeAdapter/SkillSnapshot 契约开发本地库，避免 UI 与安装器阻塞。

正式升级的进入条件：

1. browser 入口依赖可在当前 Metro/Hermes 运行；哈希适配有真实字节一致性验证。
2. 按实际依赖组合通过 typecheck、Agent/工作区/模型协议/流式事件/作用域/计划与恢复测试，再完成全量现有测试。
3. APK 构建和设备验证覆盖视觉输入、Skill 指定/刷新、取消、进程中断恢复及旧会话迁移；收费生成仍走原预算和幂等链路。
4. 升级时固定已验证的直接依赖版本并提交 lockfile；保留可读旧数据的回退策略。npm ci 会按现有 lockfile 复现，当前 `^1.13.2` 并不让每次 ci 自动升级，但重解锁时可进入后续 minor，因此不能只看 package.json 判断运行版本。

这些是升级验收条件，不要求用户额外提供服务器，也不表示本次已经完成生产升级。

## 10. 交付顺序与验收

| 阶段 | 交付 | 关键验收 |
| --- | --- | --- |
| 0 | DeepAgents 1.16.0 端侧兼容与迁移验证 | 解决 browser 打包阻塞；满足关联依赖；旧会话可读；未引入服务器 |
| 1 | 本地导入、兼容检测、技能库和版本 | 不发额外网络请求；内置/用户包隔离；重复导入不覆盖；失败无半安装 |
| 2 | 运行快照、角色/项目绑定、显式指定技能 | 运行中升级仍读取旧版；新运行读新版；停用/权限撤销行为可解释 |
| 3 | 描述创建、会话/成果提炼、草稿审阅与导出 | 来源可追溯；敏感内容不进入模型输入/导出；不自动启用候选 |
| 4 | 通用 agent/generation/decision 步骤 | 重启恢复；等待用户/网络；重复投递不重复消费；版本与产物固定 |
| 5 | 专用角色、本地渲染/导出、有限并发与编排 UI | 子任务权限和预算受限；父子取消正确；所有步骤本地调度 |

应补的行为验证：同名包、破损 YAML、路径逃逸、缺少引用、脚本依赖不兼容；发布后原运行不变；提炼不把旧授权写进 Skill；恢复到已提交生成时不重发；子 Agent 无法跨项目；聊天页面关闭后计划仍可在应用获得执行机会时继续。

离线时安装/管理已有包、手工编辑、已有资产与本地渲染可用；创建/提炼所需模型步骤等待联网。进程被终止时持久记录保留，重新获得执行机会后恢复，不承诺 Android 上无条件常驻运行。

## 11. 本次验证与边界

- 本地 `verify:skills` 通过：36 个文件的内容、哈希与元数据一致。
- 现有 skillBundle、agentWorkspace、plans 三组测试通过，共 31 项。
- 静态核对固定安装版本的技能缓存、只读 backend、同步/异步子 Agent 和装配参数。
- 追加升级评估时完成第 9.4 节的独立探针；原有 31 项测试针对当前 1.13.2，不能用作候选升级通过的证据。
- 未实现 Skill 安装器、管理 UI、提炼流程或新编排器；未发模型请求，未验证 Android 新功能和性能。
