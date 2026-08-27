# AutoDL H3 视频生成 Android App

这是一个轻量的原生 Java Android 客户端，用于调用 AutoDL.Art 的
`minimax_h3_image_audio_to_video_v2_15s` ComfyUI 工作流。

## 已实现功能

- 四个 Tab：生成、任务队列、结果、设置
- 生成页支持逐个添加最多 9 张图片和 3 段音频
- 已选图片直接预览，音频可在提交前直接播放
- 自动转换为 API 要求的 `data:<mime>;base64,...` 格式
- 输入 Prompt、视频时长、分辨率和可选 Seed
- 提交任务并保存最近 30 条本机任务记录
- 轮询显示 `QUEUED`、`RUNNING`、`SUCCESS`、`FAILED` 等状态
- 成功后自动通过 Android 系统下载器保存到 `Movies/AutoDL-H3`
- 结果页可直接播放已下载的视频

## API 对接

提交：

```text
POST https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_image_audio_to_video_v2_15s
Authorization: <你的 ComfyUI 分组令牌>
Content-Type: application/json
```

查询：

```text
GET https://autodl.art/api/v1/comfyui/comfyui_workflow/result/<task_id>
Authorization: <你的 ComfyUI 分组令牌>
```

输入字段与 AutoDL 工作流页面一致：`prompt`、`duration`、`resolution`、`seed`、
`ref_image_0` 到 `ref_image_8`、`ref_audio_0` 到 `ref_audio_2`。

## 构建

如果已经安装 Android SDK、JDK 17 和 Android Studio，可以直接导入本目录。
当前工作区还提供了一个不依赖 Gradle 下载的构建脚本：

```bash
./build-apk.sh
```

脚本默认使用相邻目录的 `../build-tools/android-sdk` 和 `../build-tools/jdk17`，
也可以通过 `ANDROID_SDK_ROOT`、`JAVA_HOME` 指定自己的环境。生成的 APK 位于：

```text
app/build/AutoDL-H3-debug.apk
```

## 安全提示

令牌是账户凭据。此版本使用 Android Keystore 加密后保存，不会写入 APK 或 Git
仓库；请勿把自己的令牌分享给他人。由于图片和音频采用 Base64 直接随请求发送，
单次选择的文件总量限制为 50 MB，较大的素材建议先压缩或使用可访问的 HTTPS 文件 URL。
