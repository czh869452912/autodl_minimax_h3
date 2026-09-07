# Unified Artifact Media Library Design

## Goal

让任务、工作流产物和结果画廊形成可扩展的数据模型，支持一个 Job 产生多个视频、图片、音频或其他文件，同时保持系统相册只是独立的交付副作用。

## Data model

- `WorkflowJob`：一次工作流执行及其状态。
- `WorkflowArtifact`：Job 产生的一个远端产物，`kind` 支持 video/image/audio/text/file/json。
- `MediaAsset`：应用内产物库的浏览与播放投影，拥有稳定 `assetId`，通过 `jobId/artifactId/workflowId` 追溯来源。
- `MediaDelivery`：产物交付到系统相册、分享或其他目标的记录；系统相册 URI 不作为画廊播放来源。

现阶段 UI 继续以视频为主，但存储层从第一天支持多种 artifact kind 和一个 Job 多个产物。

## Data flow

Provider adapter 返回 artifacts → runtime 持久化 `WorkflowArtifact` → materializer upsert `MediaAsset` → 下载更新应用私有 `localUri` → 画廊分页读取 `MediaAsset`。系统相册导出仅更新 `MediaDelivery`/兼容字段。

## Compatibility

现有 TaskRecord 保留为任务队列兼容投影。启动同步时，将已有成功任务中有效的 `localUri/videoUrl` 补写为 legacy `MediaAsset`；`galleryUri` 只作为已导出状态，不创建画廊媒体源。

## Acceptance

1. 成功任务下载后，`media_assets` 有独立记录，画廊只读该记录。
2. 仅存在 `galleryUri` 的任务不会出现在画廊。
3. 一个 Job 的多个 artifact 可以分别 materialize 成多个 MediaAsset。
4. 删除画廊资产不会删除系统相册副本。
