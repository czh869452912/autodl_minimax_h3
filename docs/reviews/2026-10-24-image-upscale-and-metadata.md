# 内容管理：独立超分与图片元数据

日期：2026-10-24。前序图片工作台提交：`8c611d8b`。

## 已实现

- 素材详情的每个图片版本，以及图片创作结果，提供「查看图片元数据」与「超分图片 · 2×」。查看历史版本时，操作绑定当前选中的版本。
- 元数据面板显示原文件实际尺寸、格式、大小和 SHA-256；按正负面提示词、模型、Seed、步数、采样器、引导、Rescale、角色和来源整理生成信息。支持单项复制、完整原始元数据与 App 配方复制。没有参数、元数据损坏或原件缺失时明确提示，不伪造生成信息。
- 图片内嵌信息读取自本地原件，App 配方单独保留。超分后的实际尺寸与生成时尺寸分别显示。长文本预览有上限，复制保留完整内容。
- 独立超分生成可恢复的任务草稿，确认前展示原始与目标尺寸；只在用户授权后发送一次请求。提交后离开页面仍可从草稿和任务查看结果。原图保持不变，超分结果新增为同一素材的版本，不自动替换默认版本、项目固定版本或镜头采用版本。
- 沿用现有账号安全存储、未知费用授权、共享执行队列、发送闸门、持久回执和恢复隔离；结果不明不会自动重发。恢复本地超分回执时保留操作类型与预期尺寸，避免按普通生成的尺寸限制误判。
- 归档超分结果时保留原始生成配方、导入元数据与来源版本；服务端超分响应的 `seed=0` 不覆盖原始生成 Seed。

## 接口与边界

`POST https://image.novelai.net/ai/upscale`，JSON 请求及 `Accept: application/json`。

| 参数 | 当前官网客户端行为 |
| --- | --- |
| `image` | PNG Base64，保留原尺寸与 Alpha；WebP / JPEG 在设备内转为 PNG，并应用 EXIF 方向 |
| `model` | `nai-diffusion-5-curated`，是独立超分服务使用的模型，不改变原图的 V5 Full 来源 |
| `declared_blur_sigma` | 固定 0 |

当前官网公开部署常量为 `UPSCALE_FACTOR=2`、`UPSCALE_MODEL=nai-diffusion-5-curated`、`UPSCALE_BLUR_SIGMA=0`。[官方接口文档](https://image.novelai.net/docs/doc.json) 说明该端点支持 JSON 图片响应。[超分说明页](https://docs.novelai.net/en/image/upscale/) 中的“四倍分辨率”没有被用来推导宽高各 4 倍；实际客户端与真实响应确认宽高各 2 倍。

App 原图限制为最多 3,145,728 像素，输出最多 12,582,912 像素；允许非 64 倍数的原始尺寸。结果 PNG 最多 20MB，与现有本地图片存储上限一致。连续超分超出原图上限时需先缩小；不提供未经验证的 4× / 8× 开关。独立超分与工作台的「最大画质增强」分别保留。

## 验证记录

- 使用既有 `.env` Token 真实调用 1 次独立超分，HTTP 200。输入 832 × 1216、1,765,669 字节；输出 1664 × 2432、6,491,026 字节。对比 PNG 的 `Comment`、`Software`、`Source`，原生成参数保留。
- 脱敏请求证据：[standalone-upscale.evidence.json](../evidence/2026-10-24-novelai-v5-full/standalone-upscale.evidence.json)。Token 未进入源码、APK 或证据文件。无自动重试。
- TypeScript 检查通过；全量 Jest 219 个套件、1449 个测试通过，1 个套件及 4 个测试按原配置跳过。新增覆盖真实队列归档、原始 Seed 保留、回执恢复不重复提交、超分独立尺寸限制、元数据复制和用户确认。
- Android 调试 APK、测试 APK、原生单元测试构建通过；设备端图像测试 8 项通过，包括真实官网下载 WebP 转 PNG 后元数据相同、非整齐尺寸与 Alpha、JPEG EXIF 方向、私有目录与像素限制。
- 原生发送测试确认超分使用 `/ai/upscale`，重复读取回执不会再次发送。真实请求返回的原始响应只保存在被忽略的 `.local-tools`，可离线复查。
- 最终 Android x86_64 APK 已安装到模拟器；通过系统图片选择器导入真实 NovelAI 原图，检查素材详情的元数据面板、原始参数与超分草稿入口。截图：`app-content-image-actions.png`、`app-image-metadata.png`、`app-upscale-draft.png`，位于同一证据目录。

本轮未新增 Director Tools、云图库同步或流式预览。
