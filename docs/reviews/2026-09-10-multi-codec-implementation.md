# 多编码播放第一阶段实现与验收记录

日期：2026-09-10。基于已认可的架构评估实施。状态：代码与调试构建可审查；设备播放验收未完成，不能宣布已正式覆盖所有编码或已修复用户故障机。

## 已实现

- LibVLC 3.7.5 原生 View，通过 React Native ViewManager 接入；本地 file/content 源强制软件解码，支持播放/暂停、拖动、全屏、音频焦点和前后台释放/恢复。首帧事件来自 TextureView 更新，不把 Playing 当作首帧。
- 现有 VideoPlayer 加播放路由：本地特殊 AVC profile / 系统无匹配 decoder 时优先 LibVLC；普通本地视频在 Media3 失败且验证未判损坏时尝试软解；远程 URL 仍使用 Media3。元数据探测 1.5 秒超时后允许原路径继续，软解 15 秒无首帧显示失败并释放播放器。不会自动跨引擎循环，用户可显式重试。
- 播放源变化会重建播放状态。Media3 到 LibVLC 传递当前位置；软解失败可通过受限 FileProvider 或 content URI 请求外部播放器，处理没有 handler 情况。独立 Media3 Activity 也加入本地软解回退。
- 下载原件保留现有 SHA/CAS/checkpoint/lease 协议。遇到系统 codec 不支持时，原件立即成为本地可访问投影；原下载任务成功，单独创建 `compatibilityOnly` 持久化任务。该任务复用现有 ARTIFACT_DOWNLOAD 串行 lane，不增加数据库 schema，转换失败不再改写原件下载状态。
- 任务卡显示兼容副本状态，失败时“重试转换”复用本地原件和同一个转换任务。转换原件丢失时拒绝自动重新下载。原件和兼容副本仍分别保存相册，成对导出与原件单独导出的完成状态分开处理。
- 转码按实际编码器的尺寸、对齐、帧率、profile 与 bitrate 能力产生最多三个候选；长短边限制支持竖屏。原样本在能力允许时保留 768×1344；缩放使用保持显示比例的画布和 padding，处理 SAR、rotation。保留完整解码、帧数一致、时长和输出系统抽帧检查。
- FFmpeg session 失败按 sourceProbe/sourceDecode/sourceFrames/encode/outputProbe/outputDecode 分类；输出系统检测单独标记 platformPlaybackProbe。桥接返回有限长脱敏诊断，operation 持久化 diagnosticCode/diagnosticStage。native logcat 记录候选编码器及尺寸，便于真机定位。
- 封面系统抽帧失败时对本地文件走 FFmpeg 单帧降级。Media3 依赖统一为实际解析的 1.9.0。

## 已完成验证

- TypeScript typecheck 通过。
- 应用层回归：`npm test -- --runInBand src/media src/tasks src/workflows/executor`，46 个套件、350 项通过，1 个套件/测试原有跳过。
- Android JVM 单测：43 项、0 失败；包含竖屏原尺寸、编码器尺寸约束、日志脱敏。
- 原生 Kotlin/Java 编译、debug APK 与 androidTest APK 构建通过；构建使用 JBR 21，系统 Android Studio JBR 25 与现有 Gradle 8.13 不兼容。
- 播放路由测试覆盖直接软解、系统失败回退与位置传递、软解失败不循环、损坏文件不进入回退、远程错误不切换引擎。
- 真实 SQLite 测试覆盖原件先可用、转换失败后仍为 DOWNLOADED、独立重试不重新下载、原件单独保存、转换源缺失不进行远程替换。
- 静态检查初次构建 APK 内 70 个 native so：ELF PT_LOAD 和未压缩 ZIP 数据均满足 16KB 对齐；没有因此推断 16KB 真机运行一定成功。
- Gradle dependencyInsight 确认 Media3 ExoPlayer 最终为 1.9.0。

具体二进制大小、LibVLC AAR SHA-256、JVM 测试统计见 `2026-09-10-multi-codec-build-evidence.json`。arm64 LibVLC 核心 so 46,087,168 bytes，AAR 内压缩 21,883,089 bytes；这不是最终 release 下载增量，未建立同配置 release 基线。初次双 ABI debug APK 约 306 MiB，包含项目既有依赖与调试内容。

最终调试产物位于 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`；最终 APK 的字节大小与 SHA-256 已记录在上述 JSON。最后一次重建之后重新检查 native ELF / ZIP 对齐通过。测试 APK 位于 `mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`。这些是开发验收产物，不是已发布版本。

## 设备验证入口

新增 `LibVlcPlaybackInstrumentedTest`，使用 debug-only、不对外导出的 `CodecPlaybackTestActivity`，验证实际 TextureView 首帧、时钟前进、暂停/seek 及 file/content 两种源。默认使用仓库中的合成 64×64 High10 fixture；通过 `codecReviewAssets` 和 `sampleAsset` 可选择本轮真实视频，不把用户视频提交到仓库。

```powershell
$env:JAVA_HOME = 'C:/Users/fai_l/.jdks/jbr-21.0.11'
# 工作目录：mobile/android；需先有可用 adb 设备。
.\gradlew.bat :app:connectedDebugAndroidTest '-PreactNativeArchitectures=x86_64' `
  '-Pandroid.testInstrumentationRunnerArguments.class=com.example.autodlh3.LibVlcPlaybackInstrumentedTest'

# 本轮样本可用时：把下面两项追加到上述命令；真机架构改为 arm64-v8a。
# -PcodecReviewAssets=C:/Users/fai_l/AppData/Local/Temp/autodl-codec-review-20260910
# -Pandroid.testInstrumentationRunnerArguments.sampleAsset=sample.mp4
```

本轮 adb devices 没有设备。现有 AVD `Resizable_Experimental` 使用 android-37.1/google_apis_ps16k/x86_64 镜像，但启动命令被自动审批策略拒绝，返回 `blocked by policy`，没有更详细原因，因此没有运行设备测试，也未截取首帧或宣称实播成功。

## 后续验收与边界

1. 首先在故障手机上运行真实样本，用 logcat 的 AutoDLMedia 诊断定位原转码失败，验证软解全程、音画同步、seek/尾帧、全屏返回、前后台、连续打开关闭和新架构事件桥接。当前 instrumented test 的 seek 操作还不能代替视觉确认目标画面正确。
2. 实际 16KB 设备加载、Release/R8 构建、CPU/掉帧/温升、AV1/HEVC/VP9/HDR 样本矩阵尚待验收。当前自动本地转码白名单仍为 SDR h264/hevc/vp9；HDR 不会静默转换。LibVLC 的“能解码”不代表 HDR 色彩链路已通过。
3. 第一阶段回退覆盖本地原件；直接远程软解、音轨/字幕/倍速等完整跨引擎状态迁移、独立低优先级转换 lane、能力缓存与策略开关、服务端双资产输出仍未实现。转换任务当前共享下载 lane，执行时不能抢占；不要将其描述为完整后台低优先级服务。
4. 既有失败任务可点击重试来复用保留原件，并进入新流程；本次没有批量改写旧任务或删除旧文件。
5. 发布前按锁定 LibVLC 二进制和插件集合完善许可证/源构建材料、替换/重链接义务并验证打包；不把 POM 或 RN 包授权当成整个原生引擎的授权结论。服务端工作流配置未修改。

本阶段没有修改帧数容错来掩盖缺帧，也没有把“改成 16 对齐”作为真机故障根因。App 版本号未递增、没有提交/发布 release。
