# 图片工作台与 NovelAI V5 Full 对齐

日期：2026-10-24。对应用户要求：以已登录的 NovelAI 窄屏官网为参照，修改图片创作交互，核对请求参数，支持 V5 Full，并实际生成验证。

后续更新：独立超分与内容管理的元数据查看已补齐，见 [内容管理：独立超分与图片元数据](2026-10-24-image-upscale-and-metadata.md)。下文实现边界记录本报告对应的前序提交。

## 已落地的交互

- 中央画布用于预览，底部保留描述、角色、底图、生成设置及生成按钮。普通创作不再需要穿过一整页表单。
- 完整描述编辑器分为描述、负面、角色、底图、片段五页。支持质量预设、风格模式、透明背景、官方标签查询、最终提示词预览与可重复插入的草稿片段。
- 生成设置支持 V5 Full / Curated、V4.5 Full / Curated；Full 的 High / Medium；尺寸与交换宽高、1–4 张、6 种采样器、步数、引导、Rescale、种子及底图强度。
- Medium 固定 14 步和 Euler Ancestral，使用 Heavy 负面预设；自定义负面、采样器、步数与 Rescale 保留在草稿，切回 High 后恢复。不能调节的参数不会显示为可以生效。
- V5 支持 32 个角色：启停、独立正负面、配对、上移、画布点选中心与精确坐标。V4.5 限制 6 个；切换时不会静默删除多余角色。
- 底图可从素材库选择或从相册导入。支持图生图和局部重绘：绘制蒙版、笔刷大小、撤销、清空，或导入黑白蒙版。
- 结果支持大图、全屏预览、多图切换、实际种子、保存、继续修改、以此图生成、局部重绘、最大画质增强、转视频。增强输出的实际尺寸单独归档，保留原始输入尺寸以便复现。选择候选不会自动改变镜头采用的版本。
- 后台自动保存不禁用输入框，不覆盖保存期间的新输入；失败保留输入。每次提交仍确认本批张数和未知费用。未知结果不会自动重发。

## 证据来源与边界

1. 在用户已登录的 `https://novelai.net/image` 中，实际观察窄屏设置、High / Medium 切换、提示词、透明背景、角色及结果操作，执行了 High、Medium、Medium 透明背景三次生成。官网下载的 WebP 读取了 EXIF UserComment。
2. 下载 [官方接口文档](https://image.novelai.net/docs/doc.json)，在证据目录保存当日原件。检查官网公开部署的客户端静态资源，部署号 `32f2478-39929112768-1`；没有执行下载的脚本。
3. 使用 `.env` 中既有的 `NOVELAI_ACCESS_TOKEN`，由当前 App 请求构造器向官方接口真实发送请求。Token 仅保留在请求内存，未写入源码、构建产物、报告或请求证据。

**内置浏览器没有暴露 Network / HAR / CDP 抓包能力。因此没有取得官网浏览器原始 HAR。** 目录内分别标记了官网生成图片元数据和当前 App 协议直接请求记录，不能将二者称为官网网络抓包。参数结论来自官网交互、公开客户端、官方文档和真实接口响应的交叉验证。

`.env` 用于开发验证，未打包进 App。设备中的创作账号仍通过已有的安全存储连接流程配置。

## V5 Full 生成参数覆盖

`POST https://image.novelai.net/ai/generate-image`，`Authorization: Bearer …`，`Content-Type: application/json`，`Accept: application/json`。实际服务成功返回 HTTP 200；官方文档部分描述为 201，客户端接受所有成功状态。

| 字段 | 行为与约束 | 对应入口 |
| --- | --- | --- |
| `input` | 最终主描述，保留权重、Unicode、混合提示词和 `||随机项||` | 描述 / 最终提示词 |
| `model` | `nai-diffusion-5-full` / `nai-diffusion-5-full-medium`；重绘加 `-inpainting` | 模型 / Effort / 生成方式 |
| `action` | `generate` / `img2img` / `infill` | 底图 |
| `params_version` | 固定 4 | 协议自动处理 |
| `width`, `height` | 64 的倍数，总像素最多 3,145,728；按输出尺寸归一化底图和蒙版 | 尺寸 |
| `steps` | 1–50；Medium 固定 14 | 采样与引导 |
| `scale` | 0–10 | 引导强度 |
| `cfg_rescale` | 0–1；Medium 不发送 | Rescale |
| `seed` | uint32，留空在提交前生成并冻结 | 随机种子 |
| `n_samples` | 1–4；一批一次请求，每图独立实际种子与归档 ID | 一次生成 |
| `sampler` | Euler Ancestral、Euler、DPM++ 2S Ancestral、DPM++ 2M SDE、DPM++ 2M、DPM++ SDE；Medium 固定 EA | 采样器 |
| `noise_schedule` | V5 固定 `karras`；V4.5 另支持 exponential、polyexponential | 按模型约束 |
| `negative_prompt` | 选定预设与用户负面组合；Medium 使用固定 Heavy | 负面 |
| `v4_prompt.caption` | `base_caption` 与启用且非空的 `char_captions` | 描述 / 角色 |
| `v4_negative_prompt.caption` | 与正面严格配对；Medium 各角色负面为空 | 角色 |
| `centers` | 角色归一化坐标 x / y，范围 0–1 | 点选位置 / 坐标 |
| `use_coords`, `use_order`, `legacy_uc` | 明确控制角色位置与顺序，关闭 legacy UC | 指定角色位置 / 协议 |
| `qualityToggle`, `ucPreset` | false / 3；客户端展开预设，防止服务端再次添加 | 协议自动处理 |
| `tag_hint_qt`, `tag_hint_uc_preset` | 记录所用预设，不代替实际最终描述 | 质量 / 负面预设 |
| `straight_alpha` | V5 默认 true，可切换 | 透明边缘颜色 |
| `tag_hint_transparent_background` | 透明模式发送 true，并在主描述中添加透明标签 | 透明背景 |
| `deliberate_euler_ancestral_bug`, `prefer_brownian` | EA 使用 false / true，其他采样器不发送 | 协议自动处理 |
| `image` | 图生图 / 重绘使用归一化 PNG Base64，原件不可变 | 底图 |
| `strength`, `noise`, `extra_noise_seed` | 0–1 / 0–1 / 噪声种子，默认主种子减一并冻结 | 底图影响 |
| `color_correct` | 底图路径固定 false | 协议自动处理 |
| `mask` | 黑色保留、白色重绘的目标尺寸 PNG Base64；可绘制或导入 | 重绘蒙版 |
| `add_original_image` | 是否合成回原图 | 合成回原图 |
| `img2img.strength`, `img2img.color_correct` | 重绘未遮罩区域变化；强度非 1 时发送，颜色校正 true | 未遮罩区域变化强度 |
| `image_format` | PNG；明确保留 Alpha，结果按 JSON 多图导入 | 协议自动处理 |
| `upscaled_enhance` | V5 图生图的最大画质增强，单张输出、至多 2 倍且不超过 3,145,728 像素 | 最大画质增强 / 增强画质 |

模式在客户端展开为 `fur dataset` / `background dataset`。质量预设展开为实际标签。自动文字支持英文直引号、弯引号、日文引号，保留显式 `text:`，按角色坐标顺序和 CJK 阅读规则整理文字。片段和素材版本 ID 是本地编辑状态，不当作服务端参数发送。

角色上限存在资料差异：[模型文档](https://docs.novelai.net/en/image/models/) 写 22，当前公开客户端允许 32。本次 32 角色真实请求成功，返回 PNG 元数据确认正负各保留 32 个角色，因此实现采用 32。这证明参数接受与保留，不保证一张画面能清晰呈现全部 32 个角色。

[官方 Effort 说明](https://journal.novelai.net/novelai-diffusion-v5-full-effort-toggle/) 与实际 Medium 行为一致。

## 不显示无效参数

- V5 不支持的 Vibe、Precise Reference、ControlNet、SMEA、Variety、Decrisper 不提供可误用的开关。
- 当前官网会将 V5 Curated 局部重绘映射到 V4.5 Curated。App 提示用户切到 V5 Full，不静默换模型。
- 本次完成的是生成端点与其图生图 / 局部重绘参数。独立的 Director Tools `/ai/augment-image`、超分 `/ai/upscale`、云端图库同步和流式预览不在本次实现中，不能声称整个 NovelAI 产品均已复刻。
- 仍使用未知费用确认，没有将 Opus 等同于全部设置免费，也没有伪造官网的实时 Anlas 报价。

## 实际接口验证

8 次生成请求均 HTTP 200，共 12 张 PNG；另有一次标签查询 HTTP 200。所有调用均手动选择测试用例，无自动重试。每个用例有发送标记，避免重复运行脚本再次计费。

| 用例 | 请求配置 | 结果 |
| --- | --- | --- |
| Full High | 832 × 1216，23 步，EA，标准质量、Heavy UC | 1 张，实际种子 3280070968 |
| Medium 透明 | 832 × 1216，14 步，EA，透明 | 1 张，Alpha 范围 0–255 |
| 多角色多图 | 640 × 640，12 步，DPM++ 2M，Rescale .15，轻度质量、人物 UC，两个角色与坐标，画面文字 | 2 张，种子 19472 / 19473 |
| 图生图 | 实际生成图作为底图，变化 .35，噪声 .1，额外种子 123 | 1 张 |
| High 重绘 | 原图 + 黑白蒙版，未遮罩强度 .8 | 1 张 |
| Medium 重绘 | Medium inpainting 模型，同一底图与蒙版 | 1 张 |
| 四图 / 32 角色 | 512 × 512，6 步，DPM++ 2M SDE，32 个启用角色与位置 | 4 张，种子 56731–56734；PNG 元数据保留正负各 32 个角色 |
| 最大画质增强 | 832 × 1216 的真实生成底图，图生图强度 .2，`upscaled_enhance=true` | 1 张，实际 PNG 1467 × 2144，4,993,605 字节 |
| 官方标签 | `model=nai-diffusion-5-full&prompt=telescope&lang=en` | 返回 telescope、observatory 等标签 |

请求记录中的 `image` / `mask` 替换为字节数与 SHA-256。响应摘要含状态、图片数量、尺寸、实际种子和哈希，不含 Authorization。原始响应和 PNG 位于被忽略的 `.local-tools/novelai-live-2026-10-24`，可离线复查。

证据目录：[../evidence/2026-10-24-novelai-v5-full](../evidence/2026-10-24-novelai-v5-full/)。其中 `official-*.png` 是官网截图，`app-*.png` 是 Android App 截图，`*.metadata.json` 是官网下载图元数据，`*.evidence.json` 是当前协议直接请求记录。

`generate-parameter-audit.json` 对当日官方 Swagger 的 54 个生成参数逐一标记发送条件或不发送的理由，另外记录根级字段。旧模型字段、服务端别名和 V5 无效字段不当作可用开关。Swagger 仅给出字段类型，模型能力与约束仍需交叉核对公开客户端。当前 V5 的 `e2eUpscale` 为 false，因此不发送 `upscale.declared_blur_sigma`；支持的是 `upscaled_enhance`。

## 实现与验证

- 协议：`mobile/src/creative/novelAiProtocol.ts`、`novelAiPresets.ts`。
- UI：`ImageDraftScreen.tsx`、`NovelAiPromptEditor.tsx`、`NovelAiSettings.tsx`、`NovelAiMaskEditor.tsx`、`CreativeResults.tsx`。
- 原生准备：`NovelAiImagePreparation.kt` 在设备内归一化 PNG、应用手机 EXIF 方向、灰度化导入蒙版并绘制路径；支持私有目录边界和像素、字节、笔画限制。`CreativeImageMetadata.kt` 补充官网 WebP EXIF 读取。
- 底图和蒙版通过不可变版本固定，更新失败时事务回滚。提交时核对源文件清单，数据库切换或文件关联变化会拒绝提交。
- 原生请求容量从文字生图的 256 KB 扩到 36 MB，回执上限 64 MB，以支持底图 / 蒙版和多图。发送闸门、持久回执、恢复隔离和不重复计费策略保留。
- 多图不足按部分成功归档已有结果；恢复本地回执保留期望张数；不会自动补图。
- 最终 `npm run typecheck` 通过；全量 Jest 216 个套件、1441 个测试通过，1 个套件与 4 个测试按既有配置跳过。
- Android x86_64 Debug APK、测试 APK 与原生单元测试构建通过；最终 APK 已安装到模拟器。设备端图像测试 5 项通过，包含实际官网下载 WebP 元数据、蒙版位置、透明度、私有路径限制和 JPEG 方向。
- 实际模拟器检查了图片入口、中央画布、High / Medium 切换、自动保存、参数抽屉及角色 / 底图页；发现并修正五个编辑页签在窄屏折行的问题。最终 APK 再次确认五页签单行排列、图生图素材入口与最大画质增强设置，并保存 `app-prompt-editor.png`、`app-img2img-editor.png`、`app-enhance-settings.png`。

测试 APK 用于模拟器验收。未经证实的流式、超分、Director Tools 和实时费用不列为已完成功能。
