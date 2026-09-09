# Prompt 助手第三轮评审独立核验

日期：2026-09-07。基线：`4ed379e4`，`mobile/src` 与原评审的 `cb263cf3` 无差异。范围：核验、方案评估和实施规划；未修改产品代码。

关联：[原评审](2026-09-06-prompt-assistant-agent-ux-review-round3.md)、[综合实施方案](../../plans/2026-09-07-prompt-assistant-foundation-remediation.md)、[可复跑探针](evidence/round3-probes.cjs)。

## 1. 核心结论

原评审抓住了主要风险，但“42 项属实、5 项修正、0 项推翻”不能沿用。存在明确误报、遗漏依赖默认行为，以及把代码气味直接推断为用户必现故障的情况。原推荐顺序也把附件引用化与其必需的资产所有权、迁移、GC、上下文物化拆开，容易形成第二次迁移。

确认优先解决的实际问题：

1. **持久化放大（P1）**：消息、composer、版本重复保存图片；探针中恢复 5 次形成 6 个版本，同一图片在快照 JSON 中出现 8 次。整行序列化及全部会话载入放大成本，但本次未测得实机内存峰值。
2. **提交和错误归属缺失（P1）**：UI 有两层 `runs.length` 错误屏蔽；SDK 会消费附件并吞掉 `runAgent` 异常，UI 的 `catch` 不能代表提交结果。应按 submissionId/userMessageId/runId 关联结果，区分未接受、已接受但运行失败。
3. **显示历史与模型历史不一致（P1）**：失败轮部分输出被过滤。删除过滤器方向正确，但“retry 下必然冗余”不成立：重试较晚一轮时，切片中仍有更早失败轮。
4. **流状态适配有确定性损坏（P2）**：交错 `A/B/A` 丢第三片，非前缀全文快照追加形成 `catcar`，有结果的损坏参数在进入 graph 前就阻断整轮。
5. **全量推送与派生计算（P1 优化对象）**：每次变化重建消息视图、拼全文签名、广播会话快照并排序。必须建立可测的更新次数和实机预算，不能直接宣称“长会话必卡”。

## 2. 需要撤回或修正的关键判断

| 原项 | 核验结论 | 证据及影响 |
| --- | --- | --- |
| T6 双围栏整条不可见 | **推翻整条隐藏结论** | `PromptAssistantUi.tsx:620` 先检查 `item.prompt`；两个专用围栏使 parser 返回 null，因此正文仍显示。探针从实际 TSX AST 提取条件执行，结果 `bodyVisible=true`。多产物不自动选取是当前明确策略，可改进但不是内容丢失。 |
| U4/C4 文件绕过单图 20MB | **推翻该部分** | 安装的 `@copilotkit/react-native/src/hooks/use-attachments.ts:87,136,152` 默认限制 20MB。9 张和累计 50MB 未统一控制、没有失败回调仍属实；相册入口同样没有累计 50MB 控制。未知/虚报文件大小仍需读取实际字节校验。 |
| A1 完全无上下文管理 | **推翻“完全没有”** | 实装 DeepAgents 1.13.2 默认创建 `SummarizationMiddleware` 与 `PatchToolCallsMiddleware`，browser 入口导入的正是被原评审称为“仅 langsmith chunk”的实现。无 profile 默认触发阈值 170000 tokens、保留 6 条消息。应用缺少模型预算配置、跨 run 摘要复用与一致性保证，仍须改。 |
| A12 402KB 技能包全量注入模型 | **混淆 graph 输入与模型请求** | `getOfficialH3SkillFiles()` 返回 36 个虚拟文件，实测 412295 UTF-8 bytes；并非等量 system prompt tokens。技能中间件已有元数据发现及按需读文件。包体和每轮重建确有成本，不能直接等同每轮发送 402KB 网络 prompt。 |
| H1 “仅 langsmith chunk 有 checkpointer”作为无持久化依据 | **结论成立，论据错误** | `deepagents/dist/browser.js:1` 实际导入该 chunk；真正依据是 `h3Agent.ts:34` 不传 checkpointer/store，自带 StateBackend；`aguiAgent.ts:198` 每轮只输入原始技能 files，并只消费 messages 流，没有保存 workspace 更新。 |
| P11/C9 无 allowFontScaling ⇒ 不支持动态字体 | **推翻该推理** | RN `Text.js:289` 默认 `allowFontScaling !== false`，本来跟随系统字号。小字、固定尺寸存在布局风险，需大字号验收；不应全局加 multiplier 上限掩盖问题。 |
| P5 抽屉没有入场过渡 | **推翻绝对表述** | `DraggableSheet.tsx:59-70` 已从屏幕外设置 position 并 spring 到档位。`Modal animationType=none` 只说明未用原生 Modal 动画；遮罩无淡入、无阴影/边界仍成立。 |
| H4 ready 附件缺 displayName 会抛错 | **给定触发条件不成立** | `assignImageDisplayNames` 对本轮全部附件生成 displayName；handleSubmit 使用同一 render 的集合。TS 的非空断言本身不会运行时抛错。真正风险是 find 未命中，但尚无正常路径证据；失配校验可做，不能记作已复现崩溃。 |
| “库内 CAS 空置” | **推翻** | `tasks/executorRuntime.ts:40` 已创建 CAS，`artifactOperation.ts:95` 写 owner 引用，`media/reconciliation.ts:176` 调 GC。只是 agent 输入尚未接入。 |
| C5 必须先申请相册权限 | **不接受通用方案** | 当前入口为系统 image picker。不能因没有 `requestMediaLibraryPermissionsAsync` 判定缺权限；需要按平台/入口判定真实拒绝，仅拒绝且不可再次请求时引导设置。 |

官方资料用于核对语义，具体实现以本机锁定版本为准：[DeepAgents 默认中间件](https://docs.langchain.com/oss/javascript/deepagents/customization)、[RN 字体默认行为](https://reactnative.dev/docs/text#allowfontscaling)、[Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)。

## 3. 全量条目处理矩阵

“成立”表示代码路径支持该机制，不等于做过设备复现。“条件成立”表示边界风险存在，触发频率或用户结果未获实测。“改进项”不计作功能故障。任务编号对应实施方案。

### G：Agent

| ID | 判定 | 处理意见 / 归属 |
| --- | --- | --- |
| G1 | 成立；探针复现 | 按消息维护活动状态，不因别的 messageId 出现而推断完成；不反复对同 id START/END。异常已结束 id 用诊断终止或显式新段。R3。 |
| G2 | 成立；探针复现 | 累积快照相同忽略、前缀增长补尾、非前缀冲突显式报错并保留已收内容。不能全文继续追加。R3。 |
| G3 | 成立；探针复现 | 用规范化器成对处理工具调用和结果；坏参数不能伪造成功调用。保留正文及有界诊断，隔离不合法 call/result 对。R3。 |
| G4 | 成立；建议论据需修正 | 普通追问保留部分文本；重试裁到目标 user，同时保留先前合理历史。探针确认重试后一轮也会丢先前失败文本。R3。 |
| G5 | 缺 END 成立；严重度需限定 | 安装的 verifyEvents 允许随时 RUN_ERROR，不要求先 END，现有 run reducer 已收束工具。属于自定义订阅者的一致性缺口；异常明确结束未闭合事件可作为本应用更强契约。成功与产物有效性分开。R3。 |
| G6 | 成立 | cancel 只有 CUSTOM + complete。补标准终态需要同步更改 reducer 与 provider 错误映射，否则 cancelled 可能变 failed 或弹重复错误。R3。 |
| G7 | 条件成立 | `input.state` 基线陈旧；现有白名单覆盖当前客户端字段，尚非这些字段的必现回滚。明确 graph/client 状态所有权，不能“基于结束时任意活状态合并”。R2/R4。 |
| G8 | 条件成立 | fallback id 共用；无 id 经工具结果闭合后还可能直接吞后续文字。缺失 id 在入口按来源及段编号稳定补齐，不能在 render 中随机生成。R3。 |
| G9 | 成立 | completed 下未终结工具被标 cancelled，语义混乱；协议 interrupt 与进程死亡 interrupted 不应混用。R3/R4。 |
| G10 | 潜在兼容风险 | clone 丢状态，无当前调用点；已有包装边界内补复制语义和契约测试，不主动引入新调用者。R3。 |
| G11 | 条件成立；乱序探针复现 | 身份装饰无条件按位覆盖已有 metadata；优先显式 id，新导入保留端到端 id，旧数据一次性适配。R1/R6。 |
| G12 | 成立，已局部封装 | 注册表本来就在 `createLocalCopilotKitCore` 内；补版本兼容断言及真 SDK 测试。没有可用官方替代时不虚构“降级路径”。R3。 |
| G13 | 成立 | 事件单测 mock 基类，现有真 SDK 集成只有两个场景。增测交错、异常、取消、重试和状态补丁顺序。R0/R3。 |

G5/G6 协议依据：[AG-UI Events](https://docs.ag-ui.com/concepts/events)。本机 `@ag-ui/client@0.0.57/dist/index.js.map` 包含完整 `verify.ts`，其中 RUN_ERROR 可在任意时间发生，且之后不得再发事件；相应 HTTP transform 用 `code=abort` 表示取消。

### U：交互

| ID | 判定 | 处理意见 / 归属 |
| --- | --- | --- |
| U1 | 成立；屏蔽有两层 | UI `:414` 和 footer `:578` 都要调整。按错误来源及 runId 去重，不能只改上层参数。SDK 吞异常使 catch 回填不充分。R2。 |
| U2 | 成立；提交禁用本身正确 | definition 缺失且加载失败时结束草稿等待态，给工作流恢复入口；不能绕过 definition 校验。R6。 |
| U3 | 成立，非逐字符写 SQL | 每键广播并重复持有数据，SQL 有 300ms/2s 合并。composer 独立 store，只落 asset 引用。R1/R5。 |
| U4 | 部分成立 | 单文件限额已有；统一两类入口的数量/总量/实际字节/失败反馈和并发预占配额。R1。 |
| U5 | 机制成立，设备结果待测 | 全局键盘事件令底层可见 sheet 展开；只有所属焦点/顶部 modal 可以改变布局，并记住用户此前档位。R7。 |
| U6 | 条件成立 | 恢复可连续产生版本；以一次 commandId 幂等，保留日后主动恢复同版本能力。不能按 restoredFrom 永久去重。R6。 |
| U7 | 成立 | 整数输入与粘贴校验一致，number-pad 不能代替数据校验。R6。 |
| U8 | 成立 | 空 brief 不关闭，焦点/字段反馈；不产生空命令。R7。 |
| U9 | 成立；原清理建议不充分 | 每次物化复制，包括本地 URI；表单应用后消费草稿。不能消费时删除，也不能仅等任务终态就删，后续重试仍可能读源图。按 owner 引用释放。R1/R6。 |
| U10 | 缺少显式重入成立 | draftId 仍可在路由/重新挂载时使用，故“只能等一小时”过于绝对。增加保存的交接草稿列表、冲突后的重新应用/丢弃命令。R6。 |
| U11 | 成立，主要为改进项 | 工具条确实裸 Text；RunTimelineRow 第三色板及 hit area 缺口并入同一组件规范。R7。 |
| U12 | 部分成立 | 抓取动画中的目标值造成跳变；用 stopAnimation 回调读当前值。正文不可拖是交互取舍，不能把 PanResponder 整体铺到滚动正文。R7。 |
| U13 | 成立 | 复制反馈统一；失败保留可理解反馈，成功定时复位、卸载清理。R7。 |

### T：Timeline

| ID | 判定 | 处理意见 / 归属 |
| --- | --- | --- |
| T1 | 成立，性能结论需实测 | 成本是历史总文本及状态规模，不是每条原生行必重绘。id+长度会对等长编辑命中旧缓存。用内容 revision + 解析器版本，稳定行对象及分域订阅。R5。 |
| T2 | 成立 | 冷启动 Date.now 当 endedAt 夸大耗时。保存 lastActivityAt/observedDuration；未知结束时间明确标未知，不设拍脑袋上限。R2。 |
| T3 | 成立 | 匹配任意历史相同文本/图片数会误删乐观消息。只认 submissionId/userMessageId，连尾部文本比较也不够。R2。 |
| T4 | 成立 | 专用反引号完整包裹才裁正文，标题/波浪线等仍重复。parser 返回确认的范围，渲染保留范围外内容。R6。 |
| T5 | 有条件的依赖遗漏 | 仅补签名不能保证持久化旧版本被修复，known 集合会跳过已有项。版本创建改由完整 run 终态命令负责，旧版本用一次性 reconciliation。R2/R6。 |
| T6 | 误报；多产物选择为改进项 | 正文可见且 parser 有意拒绝猜测。保留该安全行为；统一多候选显式选择与 source identity。R6。 |
| T7 | 成立，表述修正 | 触发是围栏内行首 markdown 标题，非任意行内 `#`。TITLE 先截断再读围栏，需复用 fence 结构解析。R6。 |
| T8 | 条件成立，影响低 | 末 id 可能是 tool，但工具结果前通常已闭文本。按 activeTextIds 驱动动画，不按 messageIds.at(-1)。R3/R5。 |
| T9 | 成立 | 工具 args 仍留在 messages.toolCalls 中，不是全系统丢失；run.tools 没保存，工具视图无法展示。引用规范工具记录，不再复制大参数。R1/R3。 |
| T10 | 成立，改进项 | retryOf 导航、序号化 a11y 标签、工具摘要口径统一。R7。 |
| T11 | 成立 | 同文反查会选错来源；卡片传 artifact/version identity，不用 prompt 字符串反查。恢复版本还需独立 versionId。R6。 |
| T12 | 部分成立，禁止静默 index 兜底 | 未识别标签变 NaN 导致阻断；materialize 对非中文标签其实跳过编号校验，属于校验缺失而非拒绝 Picture N。明确 binding.ordinal/attachmentId，不用显示文案作主键；旧歧义需用户显式绑定。R6。 |

### S/H：会话与新增核验

| ID | 判定 | 处理意见 / 归属 |
| --- | --- | --- |
| S1 | 成立；探针复现 | 新记录无 data URI 的持久化 DTO，旧数据有可恢复迁移；CAS 资产、映射及所有者完整建立。R1。 |
| S2 | 成立 | 数据即时 reduce，显示推送合并；禁止给全部事件加数据库级 300ms 防抖，否则停止/错误有延迟。R5。 |
| S3 | 成立 | async 函数内 runSync + JSON.stringify，先限量/引用化再异步事务。R1/R6。 |
| S4 | 成立 | list() 不归一化非打开会话。启动时投影恢复并识别活 runtime，不能一概将后台运行标 interrupted。R2。 |
| S5 | 成立；拒绝硬截断 | runs/versions 无界增长；裁版本仍可能被 completedIds+历史重建，裁 runs 会丢来源及 retry 链。采用独立记录和分页，缓存上限不等于数据删除。R1/R5。 |
| S6 | 条件成立 | user 消息保存与 run 创建分离。新路径原子接受 submission/user/queued run；旧记录只对明确孤立尾部提供恢复操作，避免伪造历史运行。R2。 |
| S7 | 当前无用户缺陷 | rename 已单独持久化。以后按命令更新元数据，移除模糊 updateMetadata 保存职责。R2。 |
| S8 | 成立，位置需修正 | saveTails 在 registry，appliedRenames 在 AgentScreen。清理须等当前 tail 完成并比较身份，防止清掉新一代写队列。R5。 |
| S9 | 成立，超过“记日志” | dispose 后 active=false 抑制错误且 flush catch resolve；诊断不保证尾部保住。flush 返回可见失败，未保存 runtime 不可被正常 LRU 驱逐。R2/R5。 |
| H1 | 成立 | 明确 immutable skills 与 mutable workspace，跨 run 保存文件/todos/有效摘要，区分继续与 retry 的 workspace 基线。R4。 |
| H2 | 成立 | 与 U3/S2 同根，不另建节流器。R5。 |
| H3 | 成立 | 包括重复表单物化，不仅重复点击导出。CAS 去重必须同步 retain/transfer/release。R1/R6。 |
| H4 | 给定场景不成立 | 防御校验放在提交命令入口，命名缺省本来已有生成逻辑。R2。 |

### M/P：展示层

| ID | 判定 | 处理意见 / 归属 |
| --- | --- | --- |
| M1 | 小触控区成立，P1 可保留 | 20/36/38 尺寸可直接核实。真实命中区受父容器约束，hitSlop 不能穿过父边界；重排附件删除入口。R7。 |
| M2 | 成立 | 硬编码色存在，精确色数不影响结论。先定义语义 token 再收敛，包含 sheet/版本/run。R7。 |
| M3 | 静态主题割裂成立 | 不等同“半套深色模式”已是产品承诺。全应用一个 mode，默认浅色；如启用系统模式需覆盖所有 Tab/Modal/status。R7。 |
| M4 | 无自定义按压反馈成立 | 合并到 IconButton/Action，不要各处独立动画。R7。 |
| M5 | 状态文案成立；可见性需设备核验 | 独立状态/未读徽标，同时保留文本，颜色不作为唯一信息。R7。 |
| M6 | 样式覆盖不全成立 | 链接/列表/引用的最终样式取决于 markdown 组件默认值；补统一主题并截图验收。R7。 |
| M7 | 成立，id 类型修正 | `:594` 泄露的是 message id，非 attachment id；其他处还包括 run/thread id。a11y 用可理解标签并补 role/state。R7。 |
| M8 | 改进项 | 多档字号不直接等于缺陷；统一正文/标签/辅助文字，优先解决 9/10px 和大字号布局。R7。 |
| M9 | 静态圆点属实，低优先级 | 主 run 已有 spinner；动效只用于活动区，遵循减少动态效果偏好。R7。 |
| M10 | 成立 | 两处预览的关闭、动画、a11y 不一致，复用一个媒体预览。R7。 |
| M11 | 改进项 | 52/54/55 的差异本身无功能后果；按用途统一尺寸 token，不强求所有视图同尺寸。R7。 |
| M12 | 颜色接近成立；辨识度待测 | 提及用边框/链接语义及焦点反馈，不靠轻微色差。R7。 |
| M13 | 未证实溢出 | RN 默认会排版换行；缺 CSS word-break 不是原生缺陷证据。长 URL/长英文/大字号/窄屏实机测后决定。R7/R8。 |
| P1 | 状态标题缺语义色成立 | 工具明细已有 ✓/×；完善 run 标题图标/文字状态，避免只加颜色。R7。 |
| P2 | 成立 | 重试使用次级操作组件，disabled 与 busy 一致，最小命中尺寸。R7。 |
| P3 | 成立，改进项 | 快捷入口图标/文本反馈与层级统一。R7。 |
| P4 | 成立 | 错误屏使用当前主题，映射错误码并提供设置/重试入口。R7。 |
| P5 | 部分误报 | sheet 已有 spring；只完善 scrim、边界、关闭过渡。R7。 |
| P6 | 成立，改进项 | 用已有 AppIcon；无旋转动画并非故障，减少动态效果时保持静态。R7。 |
| P7 | 改进项 | 已有 selected a11y 和边框；增加“当前”文字标记即可，不必所有胶囊反白。R7。 |
| P8 | 改进项 | 恢复是新版本操作，反馈与 command 完成一致；避免误做破坏性替换。R6/R7。 |
| P9 | 部分成立 | 自由输入+chips 并非天然错误；规范可选分辨率选择，选项须来自当前 workflow schema。R6。 |
| P10 | 40 高度成立；对比度待视觉验证 | 把手与可读档位状态统一；至少满足平台命中尺寸。R7。 |
| P11 | 动态字体推理错误 | 见第 2 节；保留系统缩放，以布局验收消除裁切。R7。 |
| P12 | 无触觉属实，改进项 | 已安装包无 expo-haptics；仅在产品需要时集中实现重要确认，遵循系统偏好，不作为正确性前置。R7。 |

## 4. 旧项与新项的映射及范围

- A1/A2/D1/D2：分别进入 R4 的上下文预算和 R1 的规范持久化；不得重新实现一套已有摘要框架。
- A3/A4/A5/A7：合并到 R3。旧的 `streamH3Agent` 在非测试代码中没有应用调用者，须明确保留兼容还是删除；不继续维护两套完成判定。
- A6：工具 deadline/错误语义进入 R3；HITL 是独立能力，只有存在需要人工决策的工具才实现，且依赖 durable checkpoint/resume。当前文件写入虚拟 FS，不应所有操作弹权限。
- A9：全局 fetch shim/全局 timeout 的配置耦合属实，进入 R3 的传输边界；请求 timeout 不等于整个多轮 run 的 deadline。
- A12：技能静态包去重与受控 workspace 进入 R4；9 个技能的元数据可供 R7 空态使用，模型选择技能仍保持自主。
- B2/B3/B5/B6/B8/B9/B10/B12：分别并入 R5、R3、R6、R3、R3、R2、R5、R7，不另立重复工作项。
- C1/C2/C4/C5/C6/C7/C8/C9/C12/C13/C14/C17：分别并入 R2、R7、R1、R7、R7、R7、R7、R7、R2、R7、R7、R7。旋转 baseline 与 width>=720 的宽屏判断确有结构风险，未做横屏实测。
- C3/C11/C15/C18/C19：诊断生命周期并入 R2；render 中命名副作用并入 R1；预览可访问性并入 R7；搜索并入 R5；复制并入 R7。
- D3/D4/D5/D6：LRU、空会话生命周期、UUID、分页搜索归 R1/R5；不能简单按年龄删除仍有草稿/版本的“空消息会话”。D7/D8/D9 归 R2/R3。
- D10、word-level diff、FTS5 中文检索：属于可独立追加的产品能力，无证据表明是本轮正确性必需。当前计划明确不加入；保留可扩展的分页 repository 和导出 identity。

原文声称已修项：既有测试与代码抽查支持主要修复（chunk、tool args、rename、末会话删除、运行持久化、草稿防抖、产物校验）。但“C16 已修”过于宽泛：当前 mention sheet 的 onAdd 仍先关闭再选图，未发现选择完成自动回到提及列表的路径（`PromptAssistantUi.tsx:467-470`）。R7 应覆盖这个完整流程。不能从若干抽查推导“所有体验均通过实机验证”。

## 5. 不宜照搬的修复建议

| 原建议 | 引入的风险 | 替代约束 |
| --- | --- | --- |
| 版本只留 50 条 | 来源/retry/恢复链断裂，reconcile 又补回删除条目 | 分页与缓存上限，显式删除及依赖保留规则。 |
| id + length 缓存 | 等长修改、相同 id 不同线程命中旧内容 | threadId + messageId + contentRevision + parserVersion。 |
| 对 emit 全局套落盘防抖 | 取消/错误/确认延后，UI 与 agent 状态不同步 | 只合并可覆盖的文本展示快照，边界立即通知。 |
| submit catch 无条件回填旧稿 | SDK 吞异常导致不执行；晚到错误覆盖新输入；已接受消息重复发送 | 提交回执 + revision 守卫 + 单独恢复入口。 |
| materialize 改 hash 文件名 | 并发写半文件、无引用被 GC、任务 URI 失效 | 使用现有 CAS 的发布/验证流程，事务 retain 与所有者转移。 |
| consume 或任务完成后清图 | 表单尚未提交/任务可重试/版本仍引用 | 删除前确认所有持久 owner 均已释放。 |
| index+1 修 NaN | 原 prompt 的图片编号被静默映射到另一图 | 显式 ordinal，无法无歧义迁移时要求重新绑定。 |
| 加 checkpointer 同时继续全量 replay | 消息双份、摘要/files 复制、旧 run 状态污染新重试 | 明确唯一 transcript 所有者，workspace 独立且版本化，未来 resume 用隔离 checkpoint 命名空间。 |
| 添加统一字体倍率上限/预申请相册权限 | 限制已有辅助功能、增加不必要授权门槛 | 实际设备布局与入口所需权限驱动。 |

## 6. 实际验证记录

```text
git diff cb263cf3 HEAD --stat -- mobile/src
  无差异
cd mobile
npm test -- --runInBand --silent
  131 suites passed, 1 skipped; 817 tests passed, 2 skipped
npm run typecheck
  exit 0
cd ..
node docs/superpowers/archive/reviews/evidence/round3-probes.cjs
  exit 0，14 条证据输出
```

探针验证的是已评审基线的实际行为，其中包含断言缺陷仍存在的审计样例，故放在 docs/evidence，不加入产品 CI；修复后必须将对应“期望正确行为”转换为产品回归测试，不能用探针通过声称问题已修。

本次未调用真实 LLM、未进行 Android UI/杀进程/内存帧率实测；G1/G2/G3/G4/S1 用合成输入直接运行实际模块，T6 用真实 parser 和从 UI AST 提取的判定表达式，非完整原生渲染。性能、触控、键盘和视觉结论均保留此证据边界。
