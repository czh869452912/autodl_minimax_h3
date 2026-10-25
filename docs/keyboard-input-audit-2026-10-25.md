# 全应用输入框键盘避让复核（2026-10-25）

实机反馈：Agent 输入框被键盘覆盖；滚动表单中下部输入框、设置页存在相同问题。本轮检查全部直接输入框及其父级布局，修复公共布局机制，不改变生成、授权、任务或数据保存流程。

## 原因与修复

旧页面混用 `KeyboardAvoidingView` 的 padding / height，部分只用状态栏高度作为偏移。实际输入区域还处于工作台页头等父容器下方：局部布局坐标无法表达完整窗口位置。部分滚动页仅处理键盘首次打开，没有在键盘保持打开、焦点切到后续字段时重新定位；设置页原先有单独的滚动补丁。

- `KeyboardSurface` 使用原生 `measureInWindow` 与键盘边界计算实际重叠，不再猜测页头高度。系统已缩小窗口时重叠为零，避免重复预留键盘空间；保留原有底部 padding。挂载时读取当前键盘状态，支持键盘已打开再进入弹窗。
- `KeyboardAwareScrollView` 在焦点变化、键盘显示、视口或内容布局变化时，按原生窗口坐标滚动聚焦输入框；同时考虑固定操作栏占据后的实际视口。只处理当前滚动容器内的输入框，避免另一弹窗的焦点牵动背景页面。
- 保留原生 ScrollView ref、现有滚动回调、校验定位、草稿和保存逻辑；抽屉保留输入聚焦展开、收起恢复及关闭行为。长多行输入框保留顶部可见，由输入框自身处理内部滚动，不追逐整个字段底边。
- 生产代码中的旧 `KeyboardAvoidingView` / 固定 `keyboardVerticalOffset` 已统一替换；设置页的单独补丁已移除。

## 输入框覆盖清单

源码枚举共 21 个文件、39 处直接 `<TextInput>` 声明，另沿组件调用检查重复字段、设置 `Field` 和工作流 schema 生成的字段。这里的数量是声明数量，不是运行时字段实例数量。

| 输入框所在文件（mobile 下） | 避让与聚焦滚动归属 |
| --- | --- |
| `app/(tabs)/settings.tsx`、`src/creative/CreativeAccountPanel.tsx` | 设置页 Surface + 感知焦点的滚动；创作账号弹窗走 ParameterSheet |
| `src/agent/PromptAssistantUi.tsx` | 主对话独立 Surface；全屏编辑独立 Surface；创作信息及引用选择走抽屉；滚动表单接入公共滚动组件 |
| `src/agent/HistoryList.tsx` | 搜索框在顶部；历史面板走所属 Surface / 抽屉；重命名弹窗独立 Surface |
| `src/creative/AgentWorkspace.tsx` | 新建项目输入框走 ParameterSheet |
| `src/creative/AgentCreativePanel.tsx` | 搜索弹窗独立 Surface + 公共滚动组件 |
| `src/creative/CreativeWorkspace.tsx` | 项目名称、简介、资产等编辑共用页面 Surface + 公共滚动组件 |
| `src/creative/ProjectPlans.tsx`、`TextAssetEditor.tsx`、`TextVersionEditor.tsx` | 嵌入 CreativeWorkspace 的编辑表单，共用父级避让与聚焦滚动 |
| `src/creative/ProjectShots.tsx` | 镜头编辑弹窗独立 Surface + 公共滚动组件 |
| `src/creative/ImageDraftScreen.tsx` | 画布提示词随根 Surface 上移；处理工具的滚动区接入公共组件 |
| `src/creative/NovelAiNumberField.tsx` | 数值字段分布于 NovelAiSettings 内嵌面板及 ParameterSheet；两条路径的滚动区均已接入 |
| `src/creative/NovelAiPromptEditor.tsx`、`NovelAiTags.tsx` | 画面编辑、角色、片段、标签走 ParameterSheet |
| `src/creative/PromptAssistSheet.tsx` | 提示词修改方向和可编辑建议走全屏 ParameterSheet |
| `src/creative/VideoDraftScreen.tsx` | 主表单根 Surface + 公共滚动组件；时长和更多参数走 ParameterSheet |
| `src/workflows/renderer/renderers.tsx`、`WorkflowParameterFields.tsx` | 旧 CreateForm、视频主表单或参数弹窗负责父级避让与滚动，保留 schema 渲染 |
| `app/(tabs)/gallery.tsx`、`src/creative/CreativeAssetPicker.tsx` | 固定顶部搜索框；Surface 缩小下方 FlatList 与操作区 |

另检查不直接声明输入框的容器：`CreateForm`、`NovelAiSettings`、`WorkbenchUI.ParameterSheet`、`DraggableSheet`、`PromptVersionPanel`。没有输入框的只读列表和水平结果列表无需新增键盘处理。

## 验证

- TypeScript 通过。
- 完整 Jest：244 个套件、1593 项测试通过，1 个套件 / 4 项测试跳过。新增原生窗口偏移、已缩小窗口、已打开键盘下挂载弹窗、固定操作栏、连续切换焦点、非后代输入框隔离和长多行字段测试。最后补充内嵌图片设置滚动后，再跑相关图片及公共组件测试。
- Android Debug QA 和双手机架构 Beta 构建通过。APK 的独立身份、签名、Hermes、86 个原生库的内容及 ELF / ZIP 对齐检查见 `build/phone-beta/beta3-verification.json`。
- 本轮额外执行 `:app:lintBeta`，第三方 `react-native-worklets:lintAnalyzeRelease` 在 Kotlin UAST 阶段以 `Cannot find a KaModule for the VirtualFile` 崩溃，不能宣称 Lint 通过。详细记录保存在 `mobile/keyboard-beta-lint.log`；没有为绕过检查修改第三方库。

### Android 原生交互抽查

独立新建的 API 37 x86_64 QA 模拟器，使用与交付包相同键盘代码的自包含 Debug 构建，软键盘 Gboard；未接触用户手机、现有模拟器数据或真实账号。通过原生 UI 层级、窗口 IME 边界和截图交叉核查。测试输入均为本地占位数据，没有发送 Agent 消息或提交生成。

下列坐标为 1080×2400 物理像素；键盘上沿为 y=1517。固定操作栏存在时，聚焦字段还需位于更小的滚动视口内，而不是仅高于键盘。

| 场景 | 实际结果 |
| --- | --- |
| 图片画布提示词 | 聚焦框 y=1218–1356，提示词及底部操作可见 |
| 设置页较下方“最大输出” | 聚焦后从 y=1643–1747 滚到 y=1147–1251，保存栏保持可见 |
| 设置页切到“模型上下文上限” | 键盘不关闭，下一字段滚到 y=1147–1251 |
| Agent 主输入框 | 聚焦框 y=1383–1488，输入内容、创作摘要和发送入口在键盘上方 |
| Agent 创作信息抽屉“风格与氛围” | 聚焦框 y=1046–1172，抽屉扩展且底部操作可见 |
| 抽屉继续切到“期望时长” | 聚焦框 y=1137–1263，键盘保持打开，底部操作仍可达 |
| 视频主提示词 | 聚焦框 y=890–1238，生成操作在键盘上方 |
| 视频更多设置底部 Seed | 聚焦框由 y=2180–2306 移到 y=1360–1486，弹窗标题及完成入口可见 |
| 图片全屏编辑标签 / 角色负面词 | 分别 y=940–1057、1047–1389，聚焦框完整可见 |
| 图片内嵌专业参数“步数”及连续切到“Rescale” | 两者 y=1212–1307，完整位于滚动视口内（底边 y=1349），底部生成按钮 y=1360–1465 可见 |

交互原始 XML / JSON / 截图在 `build/keyboard-qa/`；精选截图保存在 [复核证据目录](reviews/evidence/2026-10-25-keyboard/)。

源码覆盖检查是全量检查；Android 交互为代表性场景抽查，不代表逐一操作过每个动态字段。此次未在用户手机安装，也未验证用户所用 OEM 输入法；仍需用 Beta.3 在原手机复测。
