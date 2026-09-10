# 原件直接播放与集中解码设置

本轮按用户最新要求替代“自动生成兼容副本”的默认策略。前一轮评审文档作为历史背景，不是本轮指令。

## 决策与实现

下载、播放、封面各自承担独立责任：下载保留并校验原始字节；播放器负责解码；封面只输出一张 JPEG，不生成新的视频文件。

| 设置 | 当前 Android 实现 | 失败行为 |
| --- | --- | --- |
| 自动（默认） | Media3 平台解码；已知不支持的 AVC profile 直接使用 LibVLC 软件解码 | 解码异常或 15 秒没有首帧时回退一次；已证实文件结构损坏则提供重新下载 |
| 硬解码 | 独立 Media3 PlayerView，视频 decoder selector 仅保留 `hardwareAccelerated` 解码器，音频正常选择 | 明确提示切换自动或软解码，不伪装成硬解码成功 |
| 软解码 | LibVLC 3.7.5，关闭硬件解码，直接解码原始流 | 显示失败、重试与外部播放器入口 |

设置存于 SecureStore，保存后通知已挂载的播放器；支持应用内 `file`、`content`、HTTPS 源。强制模式不经过自动 profile 选择。硬解码并不能让没有相应硬件的设备支持 H.264 High 10。

本地文件通过 LibVLC 的路径构造函数打开，避免 Java `File.toURI()` 产生 `file:/…` 后被 VLC 当作非法 MRL。content URI 保持文件描述符存活至播放器释放。

## 下载与升级

- 应用执行器不再注入转码依赖，下载校验使用结构检查，保留哈希、样本与 NAL 检查，不要求系统能够解出三帧。
- 未完成的旧兼容转换作业以 `ARTIFACT_CONVERSION_RETIRED` 终止并解除租约，不删除其原件或导出历史。
- 对仍存在的原件恢复作品和任务的本地路径；修复前检查文件存在，事务内重查引用，避免恢复已删除的作品。
- 移除“重试转换”界面。请求已保留的原件不会重新排队转换。
- 旧转换实现和诊断代码仍保留供历史测试、后续清理使用，当前应用执行器不再调用它们。以前已生成的副本不会被本轮自动删除。

## 封面

旧实现优先使用 MediaMetadataRetriever，只在抛异常时回退；一个内容错误但非空的 Bitmap 会被当成成功，并在数据库中长期缓存。截图能证明封面异常，不能单凭截图确定具体芯片或像素 stride 的根因。

新实现直接软件解码原件的第一帧，显式关闭硬件加速并转换至 JPEG 使用的像素格式，最大边 640；使用临时文件，成功并可重新读取后原子替换。封面缓存采用 `sw-v3-` 版本与源路径哈希。画廊清理旧版封面，源文件改变时重新生成；详情页也不会继续显示旧版花屏封面。失败显示占位，不把封面问题升级为下载失败。

自动回退只能识别错误和没有首帧，不能可靠判断“已成功提交但像素花屏”。遇到这类设备问题可统一选软解码。HDR 的色调映射和 Dolby Vision 不在本轮已验收范围。

## 为什么仍用两个播放后端

单纯更换 React Native 的视频 UI 包，如果底层仍是系统 MediaCodec，并不能补齐 High 10 软件视频解码。Media3 官方文档也区分容器和采样编码；其 FFmpeg 扩展说明的是音频解码，并非可直接补全通用 H.264/HEVC 视频的软件后端。

当前已集成 LibVLC，复用它的软件解码能力、保留 Media3 的平台播放与硬件筛选，比再接入第三个播放器更易验证。后续如果统一为单 LibVLC 后端，必须先解决严格硬解码筛选、生命周期、全屏和渲染一致性；不能把 `setHWDecoderEnabled(true, true)` 简单当成“绝不软解”。mpv/JNI 自建方案需要额外的 native 构建、播放器控制及发布维护，本轮不引入。

## 验证边界

本轮目标编码包括 MP4 中的 H.264 8-bit / High 10、HEVC 8/10-bit，以及 VP9/AV1 的直接播放路径。实际能力仍取决于所打包的软件解码器、设备硬件、分辨率和帧率。不能用一个 High 10 样本宣称所有 profile、容器和设备已经验收。下载提供方的容器/MIME 许可策略也没有被无条件放宽。

首要真实样本：768×1344、24fps、243 帧、10.125s、H.264 High 10 / yuv420p10le、BT.709 SDR；SHA-256 `a1a88c83b3755c212357eefbb4d53ec73a526c98bc6f5f0e2bb95614c66adff3`。不在文档中存储签名 URL。

本轮验证结果：

- TypeScript 类型检查通过；相关完整回归 409 项通过、1 项跳过；新增设置保存和零设备解码帧结构检查后，受影响测试再次通过。
- Android JVM 43 项通过；双 ABI（x86_64 / arm64-v8a）开发 APK 与 instrumentation APK 构建通过。
- 在已连接的 `emulator-5554` 上运行真实样本：`OriginalMediaInstrumentedTest`、`LibVlcPlaybackInstrumentedTest` 两项通过。检查原件结构、软件封面、原件哈希保持不变；文件与 MediaStore content URI 均出帧、推进播放时钟，暂停后 seek 能到达请求的中点。
- 目视检查了模拟器生成的封面、实际软件播放截图和集中设置界面，真实样本未出现截图所示的条纹花屏。
- 首次设备测试发现并修复了 `file:/…` 的 LibVLC 打开问题，修复后复测通过；这与用户手机最初问题不应直接等同。

本轮没有完成不同手机的硬解码可用性与硬件播放流畅度验收，也没有把单一样本的结果扩展为 HEVC/VP9/AV1 全矩阵通过。

## 依据

- [Media3 支持格式：容器、平台解码器、软件扩展和 FFmpeg 音频范围](https://developer.android.com/media/media3/exoplayer/supported-formats)
- [Media3 MediaCodecInfo：hardwareAccelerated 属性](https://developer.android.com/reference/androidx/media3/exoplayer/mediacodec/MediaCodecInfo)
- 本地锁定的 LibVLC 3.7.5 源码 `org/videolan/libvlc/Media.java`（本轮检查实际制品源码，不推断新版行为）。

仍需后续设备验收：目标手机原始失败视频、HEVC Main10、VP9/AV1、不同厂商硬件、HDR 色彩、持续播放功耗与内存。LibVLC 分发许可和对应源码交付沿用已有发布检查，当前开发包验证不替代发布验收。
