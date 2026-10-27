**Android 端侧智能体与 Harness 选型调研**

调研日期：2026-10-27。适用约束：智能体与编排在 Android 应用本机运行，可以调用外部模型及图像、视频生成 API；不要求另一台电脑或业务服务器在线。

本次核对了上游仓库文档、关键源码、npm 发布元数据，并在隔离目录进行了 Pi 1.4.0 的浏览器及 Android Metro 最小打包检查。没有运行这些应用的 APK，没有验证真实模型请求、后台持续执行、进程恢复或付费生成。以下“建议”“适配成本”属于结合本项目的工程判断。

**结论与相对上一轮的调整**

Pi 值得作为迁移候选，而不应只因为当前项目已经使用 LangGraph 就排除。需要分别评估三个产品层次：基础循环 `pi-agent-core`、完整编码应用 SDK `pi-coding-agent`、实验性的持久 Harness `pi-durable`。

对当前 React Native + Expo 项目，建议先验证 `pi-durable` 的本地存储和完整模型调用链，同时保留现有 DeepAgents 实现作为对照；若其 API 稳定性不能接受，再比较 `pi-agent-core + 应用自己的持久化层`。不建议直接将整套 coding-agent 的 Node 运行环境搬进 APK 作为第一步。

原生方向另有值得认真比较的 JetBrains Koog，可以通过原生模块与 RN UI 集成，但需要承担工具桥接、状态传递与迁移成本。不能把更换 Kotlin 框架等同于低成本依赖替换。

**值得借鉴的 Android 开源应用**

| 项目 | 本地运行方式与主要选型 | 已核对的能力 | 对本项目最有价值的参照 |
| --- | --- | --- | --- |
| [Operit](https://github.com/AAswordman/Operit) | Kotlin Android 应用，自有聊天/工具循环、工作流执行器；QuickJS 模块；可选 Ubuntu ARM64 用户空间 | Skill 管理、ToolPkg/MCP 扩展、角色绑定不同模型/工具/skills、可视化节点工作流 | 最接近“可扩展创作平台”的产品能力组合；区分 skill、可执行插件和流程 |
| [RikkaHub](https://github.com/rikkahub/rikkahub) | Kotlin 原生；独立 `ai` 模块中的 AgentLoop；应用层管理会话、工具与持久化 | 内置/用户 skills、按助手启用、`use_skill` 按需加载、内置 skill-creator、多轮工具执行 | 手机上的 skill 管理和调用交互；不必为加载 skill 引入完整桌面环境 |
| [PalmClaw](https://github.com/ModalityDance/PalmClaw) | Kotlin + Compose + Room + Coroutines + OkHttp，自有 AgentLoop 与进程级 runtime | 会话、上下文、工具、MCP、ClawHub 安装及兼容性判断；前台服务共享同一个 runtime | Android 生命周期、会话串行/跨会话并行、skill 兼容性分级 |
| [PocketClaw](https://github.com/Lord1Egypt/PocketClaw) | Flutter 外壳 + Kotlin 服务 + APK 内的 Go/PicoClaw 核心及 ARM64 工具，通过本机回环通信 | 设备内 gateway、工作区、skill 安装、命令工具 | “UI 与本机 Harness 分进程”在 Android 上的实现路径；项目规模较小，主要作为架构参照 |

这些项目的选型说明，端侧产品既可以使用原生循环，也可以打包一个独立执行内核。它们没有证明“换成一个通用 Harness 就自动获得完整创作平台”：安装管理、设备能力、后台生命周期和产品工作流仍然有应用自己的实现。

Operit 的 README 明确列出 workflow、ToolPkg、MCP、Skills；源码中有独立的 `WorkflowExecutor`、`WorkflowScheduler` 和 `SkillManager`。工作流包含 trigger、execute、condition、logic、extract 等节点，执行器会检查环并进行拓扑排序；这能作为节点模型和编辑器的参考，但本次未证明其任意节点都支持崩溃后续跑。[产品说明](https://github.com/AAswordman/Operit/blob/dbf71916fae9750cfdc9f9a774f5a0fee56633fb/README.md)、[执行器](https://github.com/AAswordman/Operit/blob/dbf71916fae9750cfdc9f9a774f5a0fee56633fb/app/src/main/java/com/ai/assistance/operit/core/workflow/WorkflowExecutor.kt)、[SkillManager](https://github.com/AAswordman/Operit/blob/dbf71916fae9750cfdc9f9a774f5a0fee56633fb/app/src/main/java/com/ai/assistance/operit/core/tools/skill/SkillManager.kt)。

RikkaHub 原版已实现 AgentLoop 和 Skills，不能只依据早期介绍把它归为普通聊天客户端，也无需依赖第三方 agent fork 才能参考这些能力。其 loop 支持流式响应、多轮工具、审批等待与最大步数；skill 列表只向模型提供名称和简介，`use_skill` 再读取正文或包内文件。会话与工具调用状态恢复不等同于任意 DAG 检查点恢复。[AgentLoop](https://github.com/rikkahub/rikkahub/blob/a7d1e6efb50bb781e49bc26c5145640ad6a7ea97/ai/src/main/java/me/rerere/ai/agent/AgentLoop.kt)、[SkillManager](https://github.com/rikkahub/rikkahub/blob/a7d1e6efb50bb781e49bc26c5145640ad6a7ea97/app/src/main/java/me/rerere/rikkahub/data/skills/SkillManager.kt)、[SkillsTools](https://github.com/rikkahub/rikkahub/blob/a7d1e6efb50bb781e49bc26c5145640ad6a7ea97/app/src/main/java/me/rerere/rikkahub/data/ai/tools/SkillsTools.kt)。

PalmClaw 的关键点是一个进程只有一个 GatewayRuntime，Always-on 前台服务只持有运行时，不创建第二套。其兼容性检查会识别 `scripts/`、CLI 依赖、环境变量和桌面依赖文件，并把包标为需要桌面环境或可能兼容。架构文档仍把长任务暂停/恢复/追踪留到后续阶段，因此适合作为生命周期和安装管理参照。[架构](https://github.com/ModalityDance/PalmClaw/blob/75a42aeda0e580ebad0de4a38c00c94146148366/docs/engineering/architecture.md)、[兼容性检查](https://github.com/ModalityDance/PalmClaw/blob/75a42aeda0e580ebad0de4a38c00c94146148366/app/src/main/java/com/palmclaw/skills/SkillCompatibilityEvaluator.kt)。

PocketClaw 的服务通过 `ProcessBuilder` 启动打包的本机二进制，说明本地 sidecar 不要求外部电脑；但是 ABI、进程控制和设备内工具发行都需要专门工程。项目 README 的内存数字属于作者特定设备上的报告，本次没有复测，也不能外推为本项目或 Node 方案的性能。[README](https://github.com/Lord1Egypt/PocketClaw/blob/c164172bfda84f0857aaf1e386c32d65ceeacc71/README.md)、[本地服务](https://github.com/Lord1Egypt/PocketClaw/blob/c164172bfda84f0857aaf1e386c32d65ceeacc71/android/app/src/main/kotlin/com/lord1egypt/pocketclaw/service/PocketClawService.kt)。

以上仓库报告的主要许可证分别是 Operit LGPL-3.0、RikkaHub AGPL-3.0、PalmClaw AGPL-3.0、PocketClaw MIT；引用架构与直接复用代码是不同的工作。具体文件的许可证以对应仓库为准。

**需要排除的“移动端”误判**

[Pi Mobile](https://github.com/lhr0909/pi-mobile/blob/27acd3030ef97978356cdfae1f8597b9749d7f58/README.md) 的 `apps/mobile` 是 Expo/RN 客户端，`apps/host` 才是运行 Pi SDK 的 Node/TypeScript host。它可以参考消息队列、steer/follow-up/abort 和时间线设计，但原架构要求 host，不满足本次直接端内运行目标。

[OpenClaw 官方 Android 应用](https://github.com/openclaw/openclaw/blob/main/apps/android/README.md) 围绕与 Gateway 配对工作，不能把官方移动入口等同于网关已经嵌入 APK。PocketClaw 等另行打包本地网关的项目是另一条实现路线。

**Pi 三层能力与迁移含义**

本次上游仓库为 `earendil-works/pi`，旧 `badlogic/pi-mono` 已重定向。核对的三个 npm 包均为 `@earendil-works/*` 的 1.4.0；不能把旧包名或旧文章的功能边界直接套用到本次版本。[仓库](https://github.com/earendil-works/pi)、[agent-core 发布元数据](https://registry.npmjs.org/@earendil-works%2Fpi-agent-core/1.4.0)、[durable 发布元数据](https://registry.npmjs.org/@earendil-works%2Fpi-durable/1.4.0)。

| 层次 | 提供什么 | 端内采用的判断 |
| --- | --- | --- |
| `pi-agent-core` | Agent 状态、模型/工具循环、事件流、steering/follow-up、工具执行钩子，可注入 streamFn | 可适配，但单独使用并不提供 skill 安装、流程持久化和创作编排等完整产品能力 |
| `pi-coding-agent` | 编码应用会话、压缩、skill、扩展、资源加载和文件/进程工具、SDK/RPC/TUI | 不能直接当作 RN 库替换；需要移植 Node 边界，或在 APK 内嵌 Node 并建设桥接 |
| `pi-durable` | 持久会话、提交、工具任务、检查点、扩展/钩子、子智能体示例、任务图、SQLite/IndexedDB 等存储 | 最值得验证的完整 Harness 候选，但明确标为 Experimental，接口可无预告变更 |

`pi-agent-core` 的 streamFn 可以注入，模型访问不是绑定死的全局服务；这为复用本项目的 API endpoint、显式密钥注入和流式传输适配提供了入口。其普通导出仍会经过 `pi-ai` 根导出，打包兼容性不能仅根据主循环文件判断。[Agent 源码](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/agent/src/agent.ts)。

`pi-coding-agent` 中 skill loader 直接使用 fs/path；session manager 使用 crypto、fs、os 等 Node API。它的 README 还明确表示主应用不内置 sub-agents 和 plan mode，而通过扩展/包定制。所谓“更完整”主要指编码应用会话与扩展宿主，不代表已经带有本项目需要的多智能体创作流程编辑器。[Skill loader](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/src/core/skills.ts)、[Session manager](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/src/core/session-manager.ts)、[主应用说明](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/coding-agent/README.md)。

`pi-durable` 则有不同的设计：状态先提交，观察者再看到结果；工具也是任务；支持父子任务及子会话。其 portable SQLite 接口只需要异步 `exec/run/get/all/transaction/close`，有机会对接 `expo-sqlite`；onWake 可交给宿主处理唤醒。适配必须满足事务隔离、操作排队和持久提交后的发布顺序，不能只做方法名转发。框架恢复也不能保证外部服务 exactly-once。[Durable 设计与存储契约](https://github.com/earendil-works/pi/blob/6c384aa30f619d7b28963f2bab24d8dacbe73cb6/packages/durable/README.md)。

三个包均声明 Node >=22.19.0，源码同时包含可移植部分；这既不能证明整个包可以直接运行在 Hermes，也不能据此把所有模块都判为只能运行在 Node。

**实际打包检查**

依赖安装在隔离目录，使用 `--ignore-scripts --no-audit --no-fund`。项目业务源码、package.json、lockfile、Metro 配置均未修改。隔离检查的入口仅保留导出的类/函数，不发起模型或生成请求。

| 检查 | 入口/条件 | 结果及含义 |
| --- | --- | --- |
| esbuild browser / core | 导入并保留 Agent | 通过，未压缩产物约 431 KiB；只证明该入口能按 browser 打包 |
| esbuild browser / durable | 导入 Harness、MemoryStorage、createRegistry、portable SqliteStorage | 通过，未压缩产物约 903 KiB |
| Android Metro / core 原样 | 使用本项目安装的 Metro、Expo 默认配置及 Babel preset；隔离 projectRoot | 失败：pi-ai 的 auth/context.js 使用变量动态 import，Metro 报 Invalid call |
| Android Metro / core 兼容模块 | 仅替换默认 Node 凭据探测模块；env 返回 undefined、fileExists 返回 false | 最小入口通过；正式实现应由应用显式提供凭据，不能把这个测试替代模块当成完整认证支持 |
| Android Metro / durable | 同样隔离配置；portable SQLite 入口；无上述替代模块 | 最小入口通过，约 2.86 MiB 未压缩 bundle |

Metro 检查使用 Expo 默认配置，而非本应用完整的自定义 resolver；没有同时打入现有 UI、业务代码或具体 LLM provider。bundle 大小不能用于比较真实 APK 大小、内存、启动速度或两套 Harness 的完整应用开销。

初期在 C 盘隔离目录与 D 盘工具链之间还遇到检查脚本的跨盘路径及输出扩展名问题；最终使用同一 D 盘隔离目录排除了这些干扰，表中结果是排除后得到的结果。

下一步仍需要检验：具体 provider 的 import 链、Hermes 执行、SSE/取消/推理与视觉输入、SQLite adapter、杀进程恢复、后台唤醒、工具桥接及已有会话迁移。本次没有提供这些能力已经通过的结论。

检查材料位于本机的 `build/harness-research-20261027/`（已被 Git 忽略），包括独立 package-lock、最小入口、打包脚本及产物；上游源码摘录位于系统临时目录 `android-agent-harness-research-20261027/`。它们是调研材料，不是生产接入。

**另一条完整框架路线：Koog**

[JetBrains Koog](https://github.com/JetBrains/koog) 支持 Kotlin 的模型/工具调用、图策略、历史压缩、MCP 和持久化检查点；仓库提供含 Android target 的 Compose Multiplatform 示例。Skills 文档给出了发现目录、生成元数据提示、工具按需读取的模式。它提供的是框架能力，skill 安装/编辑/发布等界面仍要由应用建设。[Android 示例配置](https://github.com/JetBrains/koog/blob/22e342e033c716f835312dd6cbe83193e1cbcf76/examples/demo-compose-app/commonApp/build.gradle.kts)、[Skills](https://docs.koog.ai/skills/)、[持久化](https://github.com/JetBrains/koog/blob/22e342e033c716f835312dd6cbe83193e1cbcf76/docs/docs/features/agent-persistence.md)。

如果决定让长任务运行时主要由 Kotlin 服务管理，Koog 值得优先评估。它与 PalmClaw/Operit/RikkaHub 的原生 AgentLoop 是不同路线，不应声称这些应用本身使用了 Koog。本次 Koog 源码检查基于 develop 快照，生产验证需选择发布版本并逐模块确认 Android 支持。

对现有项目，原生模块迁移意味着：RN UI 订阅 native events；Agent 工具调用通过统一桥接到创作命令服务；处理媒体引用、取消、回执和原生/JS 生命周期。尤其现有工具和生成编排大量位于 TypeScript，需要明确 JS runtime 不活跃时谁能够执行这些操作。

**建议的目标边界与候选顺序**

候选验证顺序：

1. `pi-durable`：验证其可移植存储和完整请求链；它最有机会减少会话、任务、子智能体生命周期方面的自建工作。Experimental 是生产选型的明确不确定项，需要固定版本和隔离适配。
2. `pi-agent-core + 本地持久化层`：适合想保留最小 loop、明确愿意自行拥有恢复和编排语义的情况。不能把它包装成“完整 Harness 开箱替换”。
3. Koog 原生模块：适合愿意迁移核心执行层、长期投入 Kotlin 后台能力的情况。
4. 当前 DeepAgents/LangGraph：保留为功能和行为对照；若新候选的移植或成熟度成本更高，可以继续使用，但同样需要解除 H3 固定装配。

整套 `pi-coding-agent + APK 内 Node sidecar` 技术方向符合“手机本机运行”的约束，不要求外部服务器。代价是 Node/原生依赖发行、ABI、IPC、前台服务、进程恢复、文件权限、扩展执行，以及把当前 RN 内的业务工具暴露给 sidecar。只有产品确实需要广泛执行桌面 npm 扩展或脚本时，才值得优先承担这些工作；即使嵌入 Node，也不保证所有桌面 skill 的外部命令和平台依赖都能满足。

无论选择哪一个候选，都应保留以下应用职责：

- Skill Registry：导入、制作、校验、兼容性、版本、启停和导出；与可执行扩展分别管理。
- AgentDefinition：模型、角色、skills、工具、子智能体范围、输入输出结构、资源限制。
- FlowDefinition：创作流程、数据依赖、人工选择、生成任务等待、受限并行与重试策略。
- Capability Catalog：图像/视频源能力、模型参数、素材约束、费用信息、提供方适配。
- 现有创作命令和生成执行器：任务事实、预算绑定、未知结果、收据、归档和资产版本。

Harness 管理智能体会话与任务。生成执行器继续管理外部生成任务事实；工具只提交持久命令并取得 jobId，然后等待/观察。用稳定的领域 operationId 贯穿恢复，避免用一次新会话/新 toolCallId 重新提交同一业务步骤。

Skill 文本能指导决策；声明式 FlowDefinition 承担要求确定恢复行为的步骤。图像源选择需要能力匹配和服务商实现；更换文本 Agent Harness 不会自动得到图像生成协议和资产谱系。

**足以决定迁移的首个验证闭环**

固定一个候选版本，在同一 RN UI 和同一创作命令服务后面完成：

1. 导入一个外部 skill，按需读取 reference，并创建新版本。
2. 主智能体委派一个子智能体，保留父子关系、事件与结果。
3. 使用当前自定义 OpenAI-compatible endpoint，验证文本、工具调用、推理历史、视觉输入、取消和错误。
4. 创建候选图生成任务，等待人工选图，再创建 H3 任务并归档。
5. 分别在模型请求中、人工等待中、提交后回执前退出进程；再次启动后恢复，未知结果查原任务，不盲目重新消费。
6. 对照现有实现记录事件数量、耗时、上下文使用、启动和内存；通过实际测量决定是否更换，不能由包体大小或框架名称推断收益。

若这些检查通过，迁移会话循环和运行记录才有足够依据；skill、流程和生成能力层可以保持与具体 Harness 解耦。

**核对的源码快照**

| 仓库 | 分支 | Commit |
| --- | --- | --- |
| earendil-works/pi | main | `6c384aa30f619d7b28963f2bab24d8dacbe73cb6` |
| AAswordman/Operit | main | `dbf71916fae9750cfdc9f9a774f5a0fee56633fb` |
| rikkahub/rikkahub | master | `a7d1e6efb50bb781e49bc26c5145640ad6a7ea97` |
| ModalityDance/PalmClaw | main | `75a42aeda0e580ebad0de4a38c00c94146148366` |
| Lord1Egypt/PocketClaw | main | `c164172bfda84f0857aaf1e386c32d65ceeacc71` |
| lhr0909/pi-mobile | main | `27acd3030ef97978356cdfae1f8597b9749d7f58` |
| JetBrains/koog | develop | `22e342e033c716f835312dd6cbe83193e1cbcf76` |
