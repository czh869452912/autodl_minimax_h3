# Prompt Assistant 修正实施记录

日期：2026-09-07。实施基线：`4ed379e4`。依据：[独立核验](../superpowers/reviews/2026-09-07-prompt-assistant-round3-verification.md)、[获认可的方案](../superpowers/plans/2026-09-07-prompt-assistant-foundation-remediation.md)。

## 已实施的修正

| 领域 | 最终行为与主要证据 |
| --- | --- |
| 会话存储 | v9 分离消息、运行、版本、工作区、客户端状态和摘要索引；变化记录单独写入。旧 JSON 按会话迁移，成功后删除旧行，损坏或来源不明确的记录保留原文并隔离。`threadRecords.test.ts`、`threadStore.test.ts` |
| 素材所有权 | 复用现有 CAS 和 GC 租约。图片与工作区正文保存内容引用，版本不会复制图片；临时导入、会话记录、交接、创建表单和任务分别持有引用。崩溃遗留 staging 租约可回收，任务仍持有引用时删除会话不删素材。`attachmentStore.test.ts`、`promptHandoffLifecycle.test.ts` |
| 接受提交 | 稳定 submission/user/run ID；用户消息、queued run、对应草稿 revision 在一个事务内接受。重放幂等，重试复用目标用户消息并固定工作区基线。模型执行在回执之后启动。`submissionCommands.test.ts` |
| 保存与恢复 | 保存失败保留 dirty owner；进程重启将无活实例的 queued/running 标为 interrupted。接受已落库但回读失败时，只能从持久记录恢复，旧 runtime 不得覆盖它；期间输入的新草稿保留。`runtimeStore.test.ts` |
| 协议与上下文 | 按消息和工具维护状态，支持 A/B/A，检测冲突快照；取消立即收口并拒绝迟到事件；设置请求 timeout 和整体 run deadline。模型历史保留失败轮正文，隔离损坏 call/result。真实 AbstractAgent 路径覆盖停止、克隆、附件和重试。`deepAgentStream.test.ts`、`modelTranscript.test.ts`、`aguiAgentPipeline.test.ts` |
| 跨轮工作区 | `/skills/` 只读，创作文件、todos、摘要 envelope 按 revision 保存；摘要须匹配 transcript 前缀、技能版本和预算。设置支持模型上下文及输出预算，runtime 身份包含 graph 版本。真实 DeepAgents graph 搭配假模型验证跨轮读写、摘要恢复和只读技能。`agentWorkspace.test.ts` |
| 展示开销 | 历史摘要数据库分页及查询合并；消息和版本初始展示 50 条；空闲 runtime 缓存上限 5，保存失败造成缓存压力时保留草稿并提示。消息投影按字段值失效，已完成历史不重复解析及渲染；文本显示每 50ms 合并，终态立即显示。`timelineProjection.test.ts`、`runtimeStore.test.ts`、`PromptAssistantUi.test.tsx` |
| 产物及交接 | 所有候选保留稳定 ID、来源 revision 和原文范围；只移除对应正文范围；编号绑定统一校验。已确认版本不可原地修改，恢复生成新的幂等版本。交接 ready/applied/submitted 状态及表单编辑持久化，任务提交在事务内接管引用。`promptParser.test.ts`、`promptBindings.test.ts`、`promptVersions.test.ts`、`CreateFormHandoff.test.tsx` |
| 交互 | 默认浅色语义配色覆盖导航、状态栏和弹层；核心工具命中区、附件删除区和按钮对比度修正。自定义 Tab 实际响应键盘，sheet 只响应自身焦点并恢复档位，动画尊重减少动态效果。共用媒体预览，复制操作统一处理失败/反馈/定时器；能力示例按技能 manifest 过滤。配置失败可打开设置，运行及存储错误不被旧运行记录屏蔽。相关 UI 和 route tests |

## 与初稿的结构差异

- 附件实例 ID、名称和绑定保存在所属消息/版本记录中；文件元数据以现有 `artifact_blobs` 为唯一来源，没有增加未使用的第二张附件元数据表。
- 复用一个引用仓储和 `agent_record` owner 编码区分消息、版本、composer、workspace，不为每类 owner 创建平行 CAS 实现。
- 没有引入全量 graph checkpointer。应用 transcript 与版本化工作区是恢复来源，静态技能不会复制到每个快照。
- 历史列表从数据库分页；当前线程为模型续写仍恢复完整 transcript，时间线及版本分页是展示分页。这不等于已实现大型单线程内存的完全按需加载。
- 以现有组件和图标体系修正交互，没有为了满足初稿文件名新增 `AgentAction` 等转发包装。旧事件接口仅转发同一流适配器，避免保留两套解析算法。

## 自动化验证

最终验证结果：

- `npm test -- --runInBand --silent`：141 suites passed，1 suite skipped；918 tests passed，2 tests skipped，总计 920 tests，30.315 秒。
- `npm run typecheck`：通过。
- `npm run verify:workflow-releases`：通过，验证 2 个 pinned releases 及 mobile-1.4.10 发布清单。
- `git diff --check`：通过。
- `npx expo export --platform android --output-dir ../artifacts/android-export`：通过。

跳过项为仓库原有的 AutoDL 在线契约（需要 `AUTODL_CONTRACT_LIVE=1`）和独立进程恢复验收（需要 case/phase/database/counter/capture 环境）；本轮没有新增 skip。测试包含真实 SQLite、真实 AbstractAgent 和真实 DeepAgents 图执行；模型、原生文件系统或平台事件按测试边界注入。

规模证据：2000 条消息中对尾行在模拟 10 秒内注入 1000 个 delta，展示发布 200 次，前 1999 行解析为 0 次；100 次 composer 输入没有触发 summary 通知；100 个同时间戳会话分页无重复且中文/字面通配符搜索正确；1/50/100 个版本共享图时均只有 1 个 blob，删除会话后任务引用保留。

Android Metro/Hermes 导出已成功（4018 modules、46 assets、约 15MB HBC）。现有 LangChain browser shim 的未导出内部路径产生 fallback 警告，未阻止导出；没有据此宣称原生 APK 安装验证通过。

## 尚未取得的验收证据

- `adb devices -l` 无连接设备。未执行 Android 360dp/横屏/平板、1.5/2.0 字体、TalkBack、真实键盘、点击命中及后台恢复的设备矩阵。
- 未测设备 PSS、帧时间、输入 p95 或真实磁盘满/杀进程；单测中的 SQL 故障与取消注入不能替代这些指标。
- 未调用真实 LLM。跨轮文件与摘要协议测试不能证明实际模型的摘要质量、图片理解效果或不同供应商的能力兼容。
- 原计划的完整混合规模设备矩阵尚未取得证据。当前已落实并测试变化记录持久化、历史解析与渲染隔离、展示合并、缓存压力反馈和空闲缓存上限；不能把这些证据扩大为所有性能与可访问性目标均已达标。
- 接受和导出按当前应用支持的图片 MIME 验证；HEIC/GIF 等格式在不同真实模型供应商的兼容性未验证。未新增自动转码或宣称所有供应商均支持。

上述项目保持为明确的后续验收或改进项，不将 R8 或原计划全部复选框标记完成。此记录不承诺不存在未知缺陷。
