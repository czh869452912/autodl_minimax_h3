# 2026-10-27 视频结果保存与任务列表调整

## 调研依据

查看了以下项目的公开源码与项目说明，借鉴交互组织方式，未复制源码或资源：

- YTDLnis 的 [精简下载项](https://github.com/deniscerri/ytdlnis/blob/main/app/src/main/res/layout/active_download_card_minified.xml)：缩略图、短标题、次要属性、右侧更多操作；[历史卡片](https://github.com/deniscerri/ytdlnis/blob/main/app/src/main/res/layout/history_card.xml) 将结果与信息组织在同一项中。
- Seal 的 [DownloadQueueItem](https://github.com/JunkFood02/Seal/blob/main/app/src/main/java/com/junkfood/seal/ui/component/DownloadQueueItem.kt)：状态使用文字、颜色和图标区分，进度与任务信息同项显示，日志等次要信息按需查看。

## 本应用采用的方式

- 不采用大面积图片背景上的文字，避免生成图片复杂背景影响可读性；保留独立缩略图。
- 任务上行显示类型、创建时间和状态，主体显示两行提示词、缩略图、规格；排队及执行耗时无需展开。
- 下载进度在折叠状态下可见；媒体失败有直接处理入口。整项打开结果，更多操作仍在原项展开，移除重复的详情按钮。
- 视频结果不再附带底部大保存按钮。保存使用标题栏图标；排队、保存中、已保存禁用重复操作；失败仍可重试。项目镜头的采用操作保留在标题栏。
- 修复自动保存记录晚于结果到达时不再被读取的问题，按当前版本持续追踪保存状态，切换版本清理旧轮询。

## 验证范围

组件回归覆盖延迟自动保存从无记录变为保存中、已保存，以及折叠任务的进度与直接打开结果。Android 最终布局与构建验证在本轮执行。

验证结果：TypeScript 通过；3 套件 35 项测试通过；最后标题栏调整后结果页 15 项测试再次通过。Android x86_64 构建成功并安装，720×1280 / 320 dpi 检查任务卡片与展开／收起操作，摘要和耗时位置保持稳定，无重复详情按钮。模拟器无现成视频生成结果，视频自动保存状态通过组件测试验证；未发起生成，未更新手机交付 APK。
