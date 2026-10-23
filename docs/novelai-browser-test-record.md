# NovelAI 官网交互测试记录

测试日期：2026-10-23。页面：https://novelai.net/image 。官网页面版本：32f2478。环境：Codex 内置浏览器，页面截图视口约 796×918，响应式单列界面。账号为用户已登录的 Opus；未读取或保存凭据。

## 使用规则

后续接入前先读本记录，不重复已验证的基础生成。只有相关模型/官网版本/API 合约变更、实现回归或未覆盖行为才补测。这里证明的是官网 UI 行为，不证明 app API 已接通。每项新增测试记日期、模型、输入、预期、实际结果和证据，失败/未验证不能标为通过。

## T01 基础生成：通过

- 模型：V5 Curated；模式：Anime。
- 尺寸：832×1216；张数：1；Steps：23；Prompt Guidance：7。
- Sampler：Euler Ancestral；Prompt Guidance Rescale：0。
- Seed：提交前空白，结果显示 2016169171。
- Quality Tags：Standard；Transparent BG 未勾选；未添加角色或参考图。
- 提示词：`scenery, no humans, a small wooden observatory on a grassy hill, telescope, starry night, warm window light, peaceful atmosphere, anime background art`
- 负面编辑器提交前为空，未检查其预设，不推断最终请求负面内容为空。
- 提交入口：Generate 1 Image 0 Anlas。生成时按钮禁用，完成后恢复。
- 结果：一张星空、山丘、暖光木屋/天文台和望远镜图。结果栏显示上述尺寸和 Seed。
- 费用观察：生成前后 Anlas 显示值相同；Opus 剩余比例显示未变化（百分比取整不能证明未消耗额度）。不能据此断言全部 Opus 操作免费。
- 样本：`fixtures/novelai/v5-curated-observatory.webp`，由页面结果图片下载。此文件用于视觉和资产入库样本；尚未验证它包含原始生成元数据，不能直接作为参数恢复金标准。
- 样本 SHA-256：`d5fb52bf67dc4d61b628b8958e51b4dab54298b59215c1a7e035070db2bda737`。

## T02 参数面板：读取通过

底部 Settings → 模型/模式、尺寸、张数、步数、Guidance、Seed、Sampler。Advanced Settings 展开后显示 Rescale。查看后关闭，没有更改设置。设置面板关闭后可访问性树可能仍保留隐藏控件，需用截图或可见性确认真实显示状态。

## T03 提示词及参考界面：读取通过

点击底部提示词摘要展开编辑面板。顶部为 Prompt / Reference Images / Chunks；Prompt 内有 Prompt / Undesired Content、Quality Preset、Transparent BG、Character Prompts。

编辑器是 contenteditable DIV，并非 textarea；同时存在隐藏的负面编辑器。自动化要按可见性定位，不可盲目选择第一个输入框。测试中仅填充当前可见编辑器。

当前 V5 Curated 的 Reference Images 面板截图只显示 Image2Image，以及上传/画笔图标。未执行图生图。不能将该观察外推到其他模型，也不能据此断言 API 不支持其他能力。

Chunks 提供分类和提示词块入口；用户已有内容未修改，不将其内容纳入测试素材。

## T04 结果与历史：读取通过

生成后大图占主体，底部有尺寸和 Seed，固定生成操作仍可见。顶部另有显示 42 Anlas、1 Anlas 的操作按钮，本轮没有点击且未确认其语义，不当作本次生成费用。

History 展开后出现 choose image、lock history scrolling、download all images、delete image(s)。只检查入口，没有下载整个历史或删除记录；持久化到刷新/重新登录后的行为未测。

## 未验证清单

- API Token 配置、真实 HTTP 合约、费用查询、二进制/压缩包返回格式。
- 其他模型的参数、Vibe、精确参考、角色位置、图生图、局部重绘、增强。
- 原始文件元数据、隐写元数据、参数无损恢复及 Seed 再生成一致性。
- 超时、断线、取消、重试与重复消费。
- 多图批次、历史持久化、文件上传、透明背景。
- 更窄手机宽度与实际软键盘、Android WebView/原生 app 行为。

## 对实施方案的约束

1. 模型能力矩阵驱动表单和参考方式，不能统一显示所有参数。
2. 费用、用量、任务状态与工具操作费用分别展示。
3. 生成 Run 保存实际 Seed、模型、完整输入快照和资产版本，不能只存 Prompt。
4. 本次 WebP 样本可用于资产入库与展示测试；元数据解析需另收集确证原始文件。
5. Agent 和手动生成共享命令及回执；官网成功不替代适配器集成测试。
