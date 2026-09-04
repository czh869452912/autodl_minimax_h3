# H3 Skill 工作流复刻能力静态审查（移动端 Agent Runtime vs 正常 Harness）

> 审查时间：2026-09-04
> 审查对象：`mobile/src/agent/`（DeepAgents JS + AG-UI + CopilotKit RN 本地运行时）、`mobile/src/agent/skills/minimax-h3/`（内置官方 skill bundle）、`mobile/src/shims/`、`mobile/src/agent/generated/h3Skills.ts`、`docs/superpowers/specs/2026-08-27-prompt-agent-runtime-design.md`。
> 审查方法：**纯静态审查**。逐文件阅读 agent 构造、事件桥接、会话持久化、附件链路与 skill bundle 内容；对 `node_modules/deepagents/dist` 的关键语义（默认工具集、subagent 默认启用、files 通道 reducer、checkpointer 缺省）做了源码级核对。未运行应用、未发起真实 LLM 调用、未执行任何 skill 流程。
> 核心问题：目前的 agent 设计，结合内置 MiniMax H3 skill，能否在 Android 本地**完整复刻**正常 harness（官方 MiniMax Hub agent / 桌面本地文件 agent）中使用该 skill 进行的工作流程。

## 1. 总体结论

**分层结论，不能一概而论：**

1. 对 `h3-prompt-writing`（bundle 中唯一声明可移植的 skill）：其核心工作流程——识别模式（T2VA/I2VA/FL2VA/L2VA/Ref2VA）→ 通过文件工具读 `SKILL.md` 与 `references/base-en.txt`/`ref-en.txt` → 多轮迭代 → 产出符合 H3 字段结构的 prompt——**可以在 Android 本地完整跑通**，且有测试锁定。但存在 4 处静态可见的能力折损（见 §4）。
2. 对 8 个风格 skills（`3d-animation-short-generator` 等）：**明确不能复刻**，且这是设计上有意的边界。这些 skill 的 frontmatter 自声明 `Requires the MiniMax Hub agent (canvas workspace, choice cards, hub_generate_* tools); not portable`，其依赖的 canvas / choice cards / `hub_*` 工具在 APK 中一个都不存在；系统策略已将其显式降级为 "pre-production package" 模式。
3. 因此，"结合 skill 完整复刻正常 harness 的**全部**工作流程（含生成、剪辑、成片）"——**否**；"完整复刻其中 `h3-prompt-writing` 的工作流程"——**是（带 §4 所列折损）**。这与 README 第 134 行的自我声明一致。

## 2. 事实基础（审查确认）

### 2.1 Agent Runtime 构造

- `h3Agent.ts:26-33`：`createDeepAgent({ model, skills: [officialH3SkillRoot], systemPrompt: H3_SYSTEM_POLICY })`。未注册任何自定义工具、未传 `subagents`、未配 `checkpointer`、未配 `interruptOn`。
- 系统策略（`h3Agent.ts:6-13`）要求：检视官方 skill 文件并按用户请求选择 skill、通过文件系统工具完整读取匹配的 `SKILL.md` 与引用文件、多轮迭代、禁止固定模板；并声明 "This APK has no MiniMax Hub canvas tools"，要求对依赖 Hub 工具的流程返回明确标注的 pre-production package，绝不声称已完成生成。
- 模型接入：`modelAdapter.ts:20-34`，用户自配 OpenAI-compatible endpoint/model/key，`temperature: 0.3`、`dangerouslyAllowBrowser: true`。`initChatModel`（`shims/langchainBrowser.ts:10`）与 `SandboxClient`（`shims/langsmithSandbox.ts:8-10`）被 shim 为构造即抛错——**无通用模型加载、无远程沙箱执行**。

### 2.2 DeepAgents 默认能力（dist 源码核对）

- 文件系统工具：`ls` / `read_file` / `write_file` / `edit_file` / `glob` / `grep`，作用于内存 `StateBackend`。
- `task` 工具可用：`createDeepAgent` 在未显式关闭时默认注入 `GENERAL_PURPOSE_SUBAGENT`（dist `langsmith-BBV5JlNW.js:6417-6421`），可覆盖部分 skill 的 `task` 委派语义（同步、进程内，无 async task）。
- `files` 状态通道使用合并 reducer `fileDataReducer`（dist :3848-3862，update 合入 current、null 删除），**但 agent 未配 checkpointer，且每次 run 的 graph input 都重新播种 `files`**（见 2.4），故跨 run 的虚拟 FS 产物不保留。

### 2.3 Skill Bundle

- `mobile/src/agent/skills/minimax-h3/`：9 个 skill（1 个 prompt writing + 8 个风格 skill），由 `scripts/generate-h3-skill-bundle.mjs` 生成 `generated/h3Skills.ts`（逐文件 SHA-256 manifest），`skillBundle.ts:4-42` 每次 run 返回全新副本并做 Hermes YAML 兼容归一化。
- `h3-prompt-writing/SKILL.md:4` 自声明：`Portable to any agent that can read local files — no external API calls, MiniMax Hub tools, or proprietary runtime required`。工作流仅依赖本地文件读取与对话迭代。
- 8 个风格 skill 的 frontmatter 均声明 Hub-only；`brand-promo-video-generator` 显式 `allowed-tools`：`webfetch, hub_image_search, hub_analyse_media, hub_canvas_get_node, hub_canvas_group_recent_outputs, hub_generate_image, hub_generate_video, hub_generate_audio, hub_generate_music, hub_synthesize_speech, hub_video_edit, hub_audio_meta, task`（`generated/h3Skills.ts:14`）——**APK 中一个都未实现**。
- `3d-animation-short-generator/SKILL.md` 的工作流依赖 canvas 文本/图像/表格节点、choice cards 审批闸门、角色卡/场景卡生图、单镜头生视频、剪辑拼装与 BGM 生成，静态审查下 APK 无一可执行。

### 2.4 会话与产物持久化

- 消息与状态：`runtimeStore.ts:72-74` 恢复 `threadId`/`messages`/`state`；`threadStore.ts`（SQLite）在 300ms 防抖后落盘，并对 `apikey/authorization/token/endpoint/headers` 等键做递归脱敏（`threadStore.ts:5-15,36-55`）。**跨 run 连续性只由聊天记录承载**。
- 虚拟 FS：每次 run 输入 `{ messages, files: getOfficialH3SkillFiles() }`（`aguiAgent.ts:135`、`h3Agent.ts:92`），且无 checkpointer——run 内（含 `task` 子代理）共享 FS 正常，**agent 用 `write_file` 产出的中间件在下一次 run 消失**。正常 harness（磁盘文件系统）则跨会话持久。
- 附件：仅 `image/*`（`AgentScreen.tsx:279`、`assistantImagePicker.ts:50`），单条 ≤9 张（`PromptAssistantUi.tsx:225`）、单张 ≤20MB（`assistantImagePicker.ts:69`），转为 `image_url` data URI 进入 DeepAgents 消息（`aguiAgent.ts:63-76`）。无音频/视频附件通道。
- 交付：最终 prompt 经 draft 导出到创建页，draft 1 小时过期（`promptDraft.ts:4`）；视频生成由用户手动提交 AutoDL 工作流完成，agent 直创建任务在 Roadmap 中。

### 2.5 测试与设计文档的锁定

- `h3Agent.test.ts`：锁定 `read_file /skills/h3-prompt-writing/SKILL.md` 工具事件与 `integrated_multimodal_description:` 起始的最终输出。
- `aguiAgent.test.ts`：锁定 graphInput.files 含 `/skills/` 路径、AG-UI 事件顺序、图片附件到达 DeepAgents。
- `skillBundle.test.ts`：锁定 9 个 `SKILL.md`、manifest 全覆盖、fresh file map。
- `localBoundary.test.ts`：锁定无 `server/` 目录、无 `runtimeUrl` 的本地边界。
- 设计文档 `2026-08-27-prompt-agent-runtime-design.md`：Out of scope 明确排除 "Reimplementing MiniMax Hub's Canvas or `hub_*` tool runtime"（:26）；Hub-only Skill Policy（:53-55）要求此类 skill 输出必须标注 pre-production package。

## 3. 能力对照表（正常 harness vs APK）

| 正常 harness 能力 | h3-prompt-writing 需要 | Hub 风格 skills 需要 | APK 现状 |
|---|---|---|---|
| 本地读文件 | ✅ 必须 | ✅ 必须（references/*.md） | ✅ 内存 StateBackend + 每 run 播种 |
| 写/改本地文件（跨会话持久） | 可选（草稿、中间产物） | ✅ 必须 | ◐ run 内可用；跨 run 丢失（无 checkpointer + 每 run 重播种） |
| 图片理解 | ✅ I2VA/FL2VA/L2VA 看图 | ✅ | ◐ 有（≤9 张/条、≤20MB、image_url），依赖用户所选模型的视觉能力 |
| 音/视频媒体理解（`hub_analyse_media` 或脚本抽帧/听音） | Ref2VA 的 `<Video N>`/`<Audio N>` 需要 | ✅ 必须 | ✗ 无音频/视频附件、无 shell、无分析工具 |
| choice cards 审批闸门 | 不需要 | ✅ 必须 | ✗ 未配 `interruptOn`，仅对话文本征询，无强制中断 |
| canvas 工作区节点 | 不需要 | ✅ 必须 | ✗ |
| `hub_generate_image/video/audio/music/speech`、`hub_video_edit` | 不需要 | ✅ 必须 | ✗ |
| shell / 脚本执行 | 不需要 | 部分 | ✗（shim 主动抛错，属有意封禁） |
| `task` 委派 | 不强依赖 | ✅ 声明在 allowed-tools | ◐ DeepAgents 默认 general-purpose 子代理可用（同步、进程内） |
| 最终视频产出 | 不在 skill 范围 | ✅ 端到端必须 | ✗ skill 流程内无；由 AutoDL 提交链路在应用层替代（当前需用户手动） |

## 4. `h3-prompt-writing` 可复刻路径上的折损点（静态发现）

**Gap-1（Important）：音视频引用无法被 agent 感知**
- Ref2VA 要求为 `<Video N>`/`<Audio N>` 定义 reference labels 并做 retention analysis；正常 harness 至少可由用户转述或工具分析媒体，Hub 有 `hub_analyse_media`。APK 附件通道仅 `image/*`，无 shell 不能抽帧，用户只能文字描述或以截图代替视频关键帧。
- 影响：Ref2VA 全参考模式的复刻完整性受限于用户转述质量；T2VA 与纯图片 keyframe 模式不受影响。

**Gap-2（Important）：虚拟 FS 产物不跨 run 持久**
- 每次 run 以 fresh skill bundle 重播种 `files` 且无 checkpointer（见 §2.2/§2.4）。agent 在多轮会话中用 `write_file` 沉淀的中间产物（如逐段草稿）在下一次 run 不可用，只能靠聊天记录回溯。
- 影响：长会话/多日推进的创作流程与桌面 harness 体验不等价；`h3-prompt-writing` 官方工作流本身不要求写文件，故不阻塞单次任务内的复刻。

**Gap-3（Minor）：无强制审批闸门**
- Hub skills 的 choice cards 是硬中断；APK 未配置 `humanInTheLoopMiddleware`/`interruptOn`，模型只能以文本征询同意。对 `h3-prompt-writing` 影响有限（其流程无显式 gate），但意味着 skill 文本中若出现确认类指令，执行约束力弱于 Hub。

**Gap-4（Minor）：复刻质量与底座模型强耦合**
- 官方 Hub 使用 MiniMax 自有 agent；APK 依赖用户自配的 OpenAI-compatible 模型（README 推荐 `deepseek-v4-flash-vision-exp`）。视觉理解、长上下文、指令遵循的差异会直接体现为 skill 执行质量差异。静态审查无法评估具体模型的执行保真度（需实测）。

**Observation：无 LLM 上下文/成本护栏**
- 应用代码未设 token/上下文上限，仅传输层 `timeoutMs`/`maxRetries` 可配；完整读入 `base-en.txt`（222 行）+ `ref-en.txt`（341 行）+ 多轮迭代在弱模型/长会话下可能触发上游上下文限制，错误仅以 `RUN_ERROR` 透出（`aguiAgent.ts:94-99`）。

## 5. 结论重述

1. **能**：`h3-prompt-writing` 的官方工作流程（读 skill 文件 → 识别五类模式 → 多轮迭代 → 产出 `integrated_multimodal_description` / `overall_soundscape` / `non_diegetic_music`（及 Ref2VA 六段结构））在 Android 本地由当前 agent 设计完整承载，bundle 与官方一致（SHA-256 manifest），路径有测试锁定。
2. **不能**：8 个 Hub-only 风格 skills 的端到端制作流程（canvas、choice cards、`hub_*` 生成/剪辑/拼装），APK 无对应工具且设计上有意不做，统一降级为 pre-production package；视频生成由 AutoDL 工作流在应用层替代，但当前不在 skill 流程内闭环。
3. 即使在可复刻路径上，也存在 Gap-1～4 四处折损；其中 Gap-1（媒体理解）与 Gap-2（FS 持久性）为结构性差异，若追求"完整复刻"应进入 Roadmap 评估（如音频/视频附件与分析、checkpointer 或文件产物持久化、interrupt 审批闸门）。

## 6. 审查局限性声明

- 本报告为纯静态审查：未在真机/模拟器运行 agent，未发起真实 LLM 请求，未验证任一模型对 skill 的实际执行保真度；Gap-4 的模型侧差异需实测补充。
- DeepAgents 语义结论基于当前锁定版本（`mobile/package.json`：`deepagents ^1.13.2`）的 dist 源码阅读；升级依赖后默认工具集/子代理行为可能变化，届时应复核 §2.2。
- 本审查不改变 README:134 与设计文档声明的产品边界；§4 的折损点属"已知且有意/可接受"与"需要补齐"的划分建议，供 Roadmap 优先级决策参考。
