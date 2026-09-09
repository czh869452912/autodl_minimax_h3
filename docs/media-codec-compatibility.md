# 客户端视频编码兼容性评估

日期：2026-09-10。范围：现有 Android App，服务端不可修改。结论：High 10 可以通过客户端软件解码和兼容副本解决，但不是调整工作流 schema 或升级播放器依赖即可完成；需增加原生媒体转换能力。

## 本轮实现：错误分类

在下载后、CAS 发布前继续检查视频轨道、时长、样本及 AVC/HEVC NAL 长度；之后查询设备解码能力并执行抽帧探测。对于 AVC，额外读取 SPS profile_idc，补足部分 MediaExtractor 未提供的 profile。设备能力查询失败时不武断认定不支持，继续探测。

| 原生结果 | 下载操作结果 | 行为 |
| --- | --- | --- |
| 轨道、时长、样本、NAL 明确不合法 | ARTIFACT_MEDIA_INVALID_RETRYABLE / ARTIFACT_MEDIA_INVALID | 保留有限重试，不发布不合格文件 |
| 没有声明支持目标格式的设备解码器 | ARTIFACT_MEDIA_UNSUPPORTED | 立即停止自动重试，说明设备编码不支持；任务卡隐藏无效下载重试 |
| 容器初检通过，但抽帧失败 | ARTIFACT_MEDIA_DECODE_FAILED | 立即停止自动重试；提示解码失败、无法确认损坏；保留人工重试 |
| 读取、探测或桥接能力异常 | ARTIFACT_MEDIA_PROBE_FAILED | 不归因于文件损坏；保留人工重试 |

原生 diagnosticCode 经桥接保留，在下载操作 last_error_json 中持久化；界面显示固定中文解释，不显示原始异常或签名 URL。旧版 MEDIA_INVALID 携带 MEDIA_DECODE_FAILED 诊断时也按解码失败处理。旧任务如果只有 ARTIFACT_MEDIA_INVALID 而无底层诊断，不能反推原始原因，需更新 App 后手动重试以重新分类。

这不是完整的独立媒体验证器：结构校验和抽帧通过都不能证明全片正确。MediaCodecList 是声明能力，不保证实际解码质量；抽帧失败也不等同于编码不支持。新分类不会让不兼容视频自动变得可播放，也没有放宽 CAS 发布校验。不兼容暂存文件仍按现有失败清理策略处理，未来兼容副本方案需增加原件的独立保存状态。

## 编码覆盖的可行性

以下是方案评估，并非当前 App 已支持的承诺。除 High 10 与 8-bit 对照样本外，其他类别仍需专门样本及真机验收。

| 输入类型 | 首选路径 | 可行性与边界 |
| --- | --- | --- |
| H.264 8-bit 4:2:0 + AAC | 设备原生播放 | 保留快速路径；仍受 profile、level、尺寸、帧率和设备限制 |
| H.264 High 10，10-bit SDR | FFmpeg 软件解码 → 8-bit 像素转换 → H.264 编码 | 优先解决本次问题；两条真实样本已在电脑成功转换，Android 性能尚未测量 |
| H.264 4:2:2 / 4:4:4、高位深 | 软件解码并转换为 8-bit 4:2:0 | 技术可行；色度和精度有损，需对应构建配置和样本 |
| HEVC Main / Main10 SDR | 支持时原生；否则软件解码转 H.264 | 软件路径开销更高，应限制并发和分辨率 |
| VP8 / VP9 / AV1 SDR | 能力检测后原生或软件回退 | 可以逐项扩展；AV1 的依赖、CPU 开销及低端机时延须单独测量 |
| HDR10 / HLG / Dolby Vision | 独立色彩和 profile 处理 | 10-bit 不一定是 HDR；HDR 转 SDR 必须做正确色调映射。Dolby Vision 不宜在首期承诺通用兼容 |
| AAC 以外的音频 | 支持时保留，否则软件解码并转 AAC-LC | 音频采样率、声道、时间戳及音画同步也属于兼容范围，当前探测仍侧重视频 |
| MP4 / MOV / MKV / WebM | 独立检查容器、视频、音频 | 封装与编码是两层；仅改扩展名或 MIME 无效。新增容器还需扩展当前下载 MIME 策略和校验器 |

Android 与 Media3 的设备依赖边界见 [Android 格式支持](https://developer.android.com/media/platform/supported-formats)、[Media3 格式支持](https://developer.android.com/media/media3/exoplayer/supported-formats)。FFmpeg 可编译的容器、音视频解码能力见 [FFmpeg General Documentation](https://ffmpeg.org/general.html)。这些能力不意味着任意第三方 Android 包默认包含所有对应解码器。

## 方案比较

| 方案 | 解决范围 | 评价 |
| --- | --- | --- |
| 只升级 Expo Video / Media3 | 播放器问题修正 | 无法凭空增加设备不具备的 High 10 解码能力 |
| Media3 Transformer 默认配置 | 平台能解码的素材转换 | 仍受平台解码限制，不能作为 High 10 的通用兜底 |
| 集成软件视频播放器 | App 内播放 | 仍需独立解决封面、完整性探测和系统相册兼容；播放性能和新渲染层集成成本较高 |
| 按需生成兼容副本 | 播放、封面、导出共用 | 推荐；增加一次转换耗时和磁盘副本，后续复用现有播放器和导出流程 |

Media3 的官方 FFmpeg 扩展主要提供音频解码，不是 H.264 软件视频解码插件；Transformer 默认具有与 ExoPlayer 类似的加载、提取和解码限制，不能直接使用其软件解码扩展。[Transformer 官方说明](https://developer.android.com/media/media3/transformer/supported-formats)

## 推荐实现顺序

1. **Android 原生可行性样机。**编译固定版本、精简组件的 FFmpeg（libavformat/libavcodec/libavutil/libswscale，音频转换时加入 libswresample）。先覆盖本次 High 10 SDR + AAC；软件解码后优先尝试 MediaCodec H.264 8-bit 编码，验证像素布局、时间戳和编码器失败处理。软件编码回退单独决定，不能把“设备无法解码”与“设备无法编码”混为一谈。
2. **持久化兼容副本。**以源哈希＋转换配置版本作为幂等键，记录原件、兼容副本和转换状态；引入独立转换操作，支持租约、取消、进程恢复、临时文件清理及磁盘配额。原件传输完整性与本机可播放性分开记录，不能将待转换原件冒充已验证可播放结果。
3. **统一消费。**兼容副本验证后供预览、封面和默认导出使用；原文件允许单独导出。副本损坏时重新转换，不重新生成；原件缺失时才重新下载。输入素材的媒体路径不随输出兼容改造而意外改变。
4. **渐进扩展。**增加 HEVC、VP9、AV1 及音频回退，最后单独评估 HDR。保持显式支持矩阵，对超范围编码显示可理解的限制。

原 FFmpegKit 已退役，不建议直接依赖其旧二进制包。[项目说明](https://github.com/arthenica/ffmpeg-kit)。优先自建可重复的精简构建，或在评估维护状态后采用可复现构建的分支。最终组件选择会影响 ABI 包体和分发许可要求；硬编方案与包含 libx264 的软编方案应分别评估。

## 工作量与验收

错误分类为本轮改动；完整兼容副本属于跨层改造，涉及原生构建/JNI、媒体数据库与 CAS 引用、持久化操作队列、播放封面和导出。未完成原生样机前，不承诺 APK 体积增量、真机转换耗时或“全编码支持”。

进入正式实现前，需在 arm64 真机和 x86_64 模拟器测量两条真实样本及可公开合成样本的耗时、峰值内存、输出大小、音画同步和色彩。覆盖普通 8-bit 不重复转码、High 10 成功转换、坏 NAL 拒绝、设备能力查询异常、取消/杀进程恢复、同源并发幂等、磁盘不足、导出一致性。测试用 High 10 小样本为 FFmpeg testsrc2 合成，未包含用户素材。
