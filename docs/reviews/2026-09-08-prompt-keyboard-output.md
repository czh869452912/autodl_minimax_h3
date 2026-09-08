# Prompt 助手键盘避让与空输出修复

## 已确认原因

- 主页面把全局 `useWindowDimensions()` 的变化量和自定义底栏消失混在一起，再扣除估算的底栏高度。全局窗口尺寸并非聊天容器尺寸，这会少补键盘重叠区域；基线还依赖窗口 resize 与键盘事件的先后顺序。
- 版本预览在 Android 上禁用了 `KeyboardAvoidingView`，依赖 Modal 总能原生 resize；抽屉另用屏幕键盘坐标裁局部高度。改为原生 `KeyboardAvoidingView` 的实际容器重叠计算，使用 padding 以避免固定初始高度。主屏计入顶部 safe area；Modal 使用透明状态栏统一原点。抽屉的滚动内容和固定 footer 都放在避让后的区域。
- `H3AgUiAgent.runStream` 已识别 `length/max_tokens/content_filter` 为不完整消息，却无条件发送 `RUN_FINISHED(success)`。只返回 reasoning 或空白文本的请求也会被标成已完成。

## 修复行为

- 主输入、历史搜索、创作信息抽屉、重命名弹窗、版本预览参数均启用容器级避让。打开 Modal 时底层主屏停止避让；宽屏内联历史不会禁用主屏避让。
- 仅最后一条具有非空正文、没有工具调用且未被截断的助手消息可以完成运行。空回复、仅思考、仅工具过程返回 `RUN_ERROR(empty_output)`；输出上限和内容过滤分别返回 `output_limit`、`content_filter`。其它已知异常终止返回 `incomplete_output`。
- 保留已接收的文本、思考、工具记录及 workspace。现有运行状态 reducer 将失败原因持久化，现有 UI 提供重试入口；不再把异常完成的消息认证为可导出的最终版本。
- 设置页解释单请求超时、整轮时限及输出预算。没有擅自改变用户已有配置，也没有自动增加收费请求。

## 当前限制

- 默认单次模型输出预算：4096 tokens，通过 `ChatOpenAI.maxTokens` 发出。应用未另设独立思考 token 上限；提供方可能将 reasoning 计入输出预算。
- 默认单请求超时：600 秒；整轮时限：`max(60000, timeoutMs * 2)`，默认 1200 秒。
- 默认上下文预算：32768 tokens，输出预算需至少 256 且不超过上下文的一半，可在高级设置中调整。
- 没有截图对应请求的服务端 finish reason、usage 或实际设置，不能认定截图那一轮必然是 token 截断。上述默认值不代表用户当时使用的配置。

## 验证

- 先加入 token 截断、reasoning-only、空白正文及 Android 避让回归：原代码 10 项失败，证明旧行为不符合预期；修复后通过。
- 真正的 AG-UI SDK pipeline 验证 reasoning-only 的 `length/stop` 最终落为 failed、保留思考、不发送 RUN_FINISHED，且退出 running。
- 宽屏内联历史回归：先复现禁用避让，再修复并通过。
- TypeScript typecheck、Git diff whitespace 检查通过。
- 全量 Jest：143 suites 通过，1 suite 跳过；952 tests 通过，2 tests 跳过。
- Temurin JDK 21、Android x86_64 debug 自包含 APK 构建和安装通过。JBR 25 的首次构建失败属于本地 JDK 不兼容。
- Android API 35 / 1080×2400 / Gboard：实际输入主聊天文本、四项创作信息、历史搜索、重命名、预览分辨率/时长/Seed；末尾字段可以滚动到可见区域，按钮位于键盘上方。切换字母/数字键盘可继续输入。重命名及导出预览均取消退出，没有调用真实 LLM 或发送生成请求。
- 本机截图保存在忽略目录 `.superpowers/prompt-qa/`。设备 crash buffer 为空。
- 独立审查发现一项宽屏历史按钮问题，已修复并复核关闭。

未覆盖用户截图中的具体手机/输入法、iOS 实机及服务商现场复现；本次修改仍在工作区，未发布手机更新包。

## 审查后收尾

- 抽屉的 `bottom` 简化为常量 0，删除旧的重复钳制表达式。
- 在根避让容器外用 `marginBottom: max(insets.bottom, 8)` 恢复额外底部留白，不与 KAV 动态 padding 竞争；原来的 composerDock 自身仍有 7px padding，并非完全没有间距。
- Android 几何测试注明依赖 RN 0.86.3 的私有方法，升级 RN 时需复核。
- 历史列表向主屏同步重命名弹窗的可见性，关闭或卸载时解除；宽屏内联历史打开重命名也会暂停主屏避让。新增回归先失败再通过。
- 本轮相关 3 个测试文件共 70 项通过，typecheck 和 Android debug 构建通过；新包在 API 35 模拟器复查关闭态留白和键盘展开态通过，发送按钮完整位于键盘上方。未改动流式输出逻辑。
- 已知边界：完成判定依赖最后观察到的 assistant 消息为最后一轮回复。如果未来 provider 在最终回复后重放早期消息，应根据实际日志扩展流身份/顺序处理，不先凭假设重排流。
