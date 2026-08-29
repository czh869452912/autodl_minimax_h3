# Video Detail Adaptive Layout Design

## Goal

让视频详情页根据屏幕高度分配空间：视频区域自适应填满页面上半部和剩余可用空间，Prompt 卡片保持当前最大高度并贴近底部，同时保证小屏设备仍可访问全部内容。

## Layout

- `SafeAreaView` 继续占满整个屏幕并处理上下安全区。
- 主内容容器使用纵向 `flex` 布局，不再依靠一个普通的整页 `ScrollView` 决定高度。
- 顶部返回栏保持自然高度。
- 返回栏之后的媒体区域使用 `flex: 1` 和合理的 `minHeight`，占用 Prompt 卡片之外的全部剩余空间。
- 视频容器取消固定 `aspectRatio: 16 / 9`，随媒体区域拉伸；内部 `VideoView` 继续使用 `contentFit="contain"`，因此不会裁剪或变形。
- 元信息紧贴视频区域下方。
- Prompt 卡片位于页面底部，Prompt 内容区继续使用 `maxHeight: 240` 和独立滚动。
- 复制按钮继续位于 Prompt 滚动区之外，并保持在底部安全区之上。

## Small-screen fallback

正常手机高度使用固定的上下分区。若屏幕高度不足，根容器允许内容滚动，但 Prompt 最大高度仍为 240；视频区域可以缩小到最小高度，不能挤走返回按钮、Prompt 或复制按钮。

## Component boundary

仅修改 `app/video/[id].tsx` 的布局结构和样式。`VideoPlayer` 的播放、错误、海报和全屏行为保持不变，任务与下载状态也不改变。

## Verification

- 组件测试断言详情页存在可伸展的媒体区域和底部 Prompt 区。
- Prompt 滚动容器仍保持 `maxHeight: 240`。
- 视频容器不再固定为 16:9，`VideoPlayer` 仍占满容器。
- 长 Prompt、复制、返回、无媒体源和本地优先等现有测试继续通过。
- 运行完整 Jest、TypeScript typecheck 和 Android debug 构建。
