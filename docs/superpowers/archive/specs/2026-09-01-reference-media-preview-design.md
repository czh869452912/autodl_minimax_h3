# 生成页参考素材预览修复设计

## 背景

提交 `c95349eb` 将素材 Base64 编码从选择素材时延后到 AutoDL 提交前，以避免选择大文件时阻塞生成页。延迟编码后，`TaskMediaInput` 在提交前通常只包含本地 `uri`，而生成页预览组件仍只读取 `dataUri`，因此图片显示为空，音频也无法预览。

## 目标

- 让刚选择、尚未 Base64 编码的本地图片立即显示。
- 让刚选择、尚未 Base64 编码的本地音频可以交给播放器预览。
- 保持已经包含 `dataUri` 的历史/测试数据兼容。
- 不恢复选择阶段的 Base64 读取，也不改变提交阶段的编码和校验逻辑。

## 方案

在 `AttachmentPreview.tsx` 内统一计算预览地址：优先使用 `item.uri`，没有本地 URI 时回退到 `item.dataUri`。

- `ImagePreviewGrid` 使用 `item.uri ?? item.dataUri` 作为 `Image` 的 source URI。
- `AudioRow` 将同一地址传给 `useAudioPlayer`。
- 删除、索引标签和其他布局行为保持不变。

选择阶段仍只保存文件 URI；提交阶段继续由 `prepareAutodlInput` 读取本地文件并生成 data URI，AutoDL 请求契约不变。

## 错误处理

若素材同时缺少 `uri` 和 `dataUri`，预览组件不主动读取或转换文件，保持现有空预览行为；提交阶段的 `prepareAutodlInput` 继续负责报告“媒体缺少本地 URI”等输入错误。这样预览层不会引入额外异步状态或重复编码。

## 测试

为预览组件增加回归测试，验证：

1. 仅有本地 `uri` 的图片使用该 URI。
2. 仅有 `dataUri` 的图片继续使用 data URI。
3. 音频播放器收到本地 URI（并兼容 data URI 回退）。

同时运行相关 Jest 测试和 TypeScript 类型检查。
