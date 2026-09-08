# LLM 高级设置与思考强度

设置 → Prompt 助手 LLM → 高级设置提供可编辑默认值：最大输出 4096 tokens、上下文 32768 tokens、请求超时 600 秒、重试 2 次、思考强度“服务商默认”。数字留空在保存时恢复默认；“恢复高级设置默认值”仅重置这五项，随后保存生效。修改思考强度会更新空闲助手运行配置。

## 请求协议

- 输出预算通过 LangChain `maxTokens` 进入实际请求；Chat Completions 使用 `max_tokens`（OpenAI reasoning 模型由 SDK 转换），Responses 使用 `max_output_tokens`。
- DeepSeek V4 Flash / Pro（含同名前缀变体）提供默认、关闭、low、high、max。默认不发送思考参数；关闭发送 `thinking: {type: "disabled"}`；手动强度发送 `thinking: {type: "enabled"}` 与 `reasoning_effort`。
- 已核实的 OpenAI 模型按具体型号和日期快照过滤档位：GPT-5 / mini / nano 为 minimal / low / medium / high；GPT-5.1 为 none / low / medium / high；GPT-5.2 另支持 xhigh；GPT-5 Pro 仅 high；GPT-5.2 Pro 为 medium / high / xhigh；常见 o1 / o3 / o3-mini / o4-mini 为 low / medium / high。均保留“服务商默认”。未知兼容模型仍提供 default / none / minimal / low / medium / high / xhigh，实际支持取决于提供方。
- SDK 识别的 OpenAI reasoning 模型使用其 `reasoning` 设置自动转换 API 参数；其余 Chat Completions 模型使用兼容字段，Responses Codex 别名使用 Responses 字段。GPT-5 Pro 显式指定 Responses API，补足当前 SDK 的自动路由名单；OpenAI 启用推理时省略不兼容的 temperature 参数。
- 应用没有另设独立思考 token 上限。部分模型的思考与正文共用输出预算；提高强度不会自动扩大预算。整轮时限仍为请求超时的两倍，至少 60 秒。

协议依据：[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/) 与 [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/)，2026-09-08 核对。

OpenAI 复核依据：[GPT-5](https://developers.openai.com/api/docs/models/gpt-5)、[GPT-5.1](https://developers.openai.com/api/docs/models/gpt-5.1)、[GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2)、[GPT-5 Pro](https://developers.openai.com/api/docs/models/gpt-5-pro)、[GPT-5.2 Pro](https://developers.openai.com/api/docs/models/gpt-5.2-pro) 和 [GPT-5.2 参数兼容性](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2)。因此“OpenAI 合法值不含 none”这一评审表述过宽；不能把 none 静默映射为 minimal。新增真实 SDK wire 测试覆盖 Chat Completions 路径及上述协议修正，模型切换和保存端共用同一档位校验。

评审中的摘要中间件实例问题保留为 Minor：库内确有 token 估算倍率，强制摘要实例重建会重置它；摘要事件和会话 ID 仍在 graph state 持久化，并有跨轮恢复回归，最终上下文检查继续生效。本轮没有扩大为摘要器生命周期重构，也没有移动共享类型目录。

## 连续工具调用与历史

安装的 `@langchain/openai` 1.5.10 接收 `reasoning_content`，但默认出站转换会丢失它。V4 开启思考时使用公开 Completions 子类入口保留该字段；请求数据放在本次调用选项中，不在模型实例上共享可变历史。流式和非流式均经过真实 SDK 的请求体回归。

下一轮从已保存运行活动中按 assistant 消息 ID 恢复真实思考；不会修改展示消息，也不伪造缺失思考。保留的思考进入本机上下文估算、摘要触发和保留预算。借助现有摘要器处理工具调用/结果边界；不能安全压缩的超限输入在 API 请求前报告错误。摘要指纹包含思考内容，旧预算版本的摘要失效后重建。

旧对话若原本未保存思考内容（例如此前关闭思考或使用不提供思考的模型），无法补回真实历史；切换模型/模式后的兼容性仍由服务商决定。所有 token 估算仍为近似值。

## 验证范围

- 单元及集成回归覆盖默认值、留空/恢复默认、校验、加密存储读写、设置至运行配置映射、配置刷新、真实 SDK 请求体、并发隔离、历史恢复及思考感知的摘要/超限保护。
- 协议验证拦截实际 SDK 的 fetch，使用模拟响应；没有向真实 DeepSeek / OpenAI 发起计费请求。
- Android API 35 模拟器检查高级设置布局、数值键盘与焦点滚动；设置页采用 KeyboardAvoidingView 并在视口变化后显示当前输入框。
- 初版验证：144 suites、989 tests 通过，TypeScript 和 Android x86_64 debug 构建通过。独立复核发现的 Responses 字段格式及思考上下文漏算问题均修正后验证。
- 本次评审修正后全量 Jest：145 suites、1013 tests 通过，既有 1 suite / 2 tests 跳过；TypeScript 无错误，diff check 通过。复核日志为 `.superpowers/llm-settings-review-tests.log`；此轮纯配置/协议修正未重新构建 APK，下面模拟器证据对应初版界面。
- 模拟器确认底部重试字段上移到键盘上方（输入框底部 y=1591，键盘顶部 y=1633）；实测输出改为 8192、选择 max、恢复默认。没有保存这些临时模拟器设置。截图保存在 `.superpowers/prompt-qa/llm-advanced-*.png`，构建和测试日志位于忽略目录 `.superpowers/llm-settings-*.log`。
