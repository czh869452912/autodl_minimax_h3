# 可与正式版共存的手机测试版

测试构建使用独立 Android 应用身份，不覆盖正式版：

| 项目 | 正式版 | 手机测试版 |
| --- | --- | --- |
| 包名 | `com.example.autodlh3` | `com.example.autodlh3.beta` |
| 桌面名称 | AutoDL H3 | AutoDL H3 测试版 |
| 链接协议 | `autodlh3` | `autodlh3-beta` |
| 文件分享 authority | `com.example.autodlh3.media` | `com.example.autodlh3.beta.media` |

两者没有 shared UID，数据库、私有原件与 SecureStore 由 Android 分开存储。测试版首次打开使用独立空数据，需要重新连接创作账号和助手设置；不会读取正式版账号或复制其素材。向系统相册保存是显式操作，仍进入手机公共媒体库。

## 构建

配置 JDK 17 和 Android SDK 后，在 `mobile` 运行：

```powershell
./scripts/build-phone-beta.ps1
```

默认包含 `arm64-v8a` 和 `armeabi-v7a`，最低 Android 8.0 / API 26。也可以传 `-Architectures arm64-v8a` 单独构建 64 位手机包。

该脚本设置测试版 Expo 身份、生产 JS 环境和 `EXPO_NO_DOTENV=1`，执行 `assembleBeta`，完成后恢复调用环境变量。产物复制到 `build/phone-beta/`，带同名 SHA-256 文件。

`beta` 继承 release 运行配置、不可调试，内置 JS/Hermes 产物，不依赖 Metro。使用开发测试签名，与正式 release 的签名配置分开。后续覆盖升级测试版应使用同一测试签名；此包不用于正式发布。正式 release 仍要求外部签名凭据。

测试变体使用独立 manifest 名称和协议；原生通知使用当前变体的协议，FileProvider 由实际 applicationId 生成。`app.config.js` 仅在脚本设置 `AUTODL_BUILD_VARIANT=beta` 时改变 Expo 身份，普通构建保留原配置。

## 产物核验

交付前检查最终 APK，而不只检查源码：

- applicationId、应用名称、主 Activity / Application 类及文件分享 authority。
- 手机 ABI、最低系统版本、非 debuggable、无开发悬浮窗权限，以及禁用明文流量和系统备份。
- 独立链接协议、嵌入的 Expo config、JS bundle 和相应 native libraries。
- APK 签名及原生 ELF / ZIP 对齐。

测试版独立安装仅用于真实使用测试，不替代正式包的覆盖升级验收。各轮是否执行设备测试见下方交付记录；不自动操作用户手机。

## 2026-10-25 交付记录

- 版本：`1.5.0-preview.4-beta`，versionCode 42；双架构 APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta-android.apk`。
- 大小：158,505,363 字节；SHA-256：`C68CE9473AB2827ED32372915F044B4C227A43F7B2BEA8BF26FA48B0FF3F79F3`。
- Beta 构建与 Lint 通过；配置安全回归 3 项通过，TypeScript 检查通过。
- 最终 APK 的包名、桌面名称、独立 scheme、全部 provider authority、Application/Activity 类和内嵌 Expo config 检查通过；无 shared UID、可调试/testOnly 标记、悬浮窗权限，禁用明文与系统备份。
- 内含 12,931,008 字节 Hermes bundle；确认原生通知指向测试版协议。
- APK v2 签名验证通过；86 个原生库的 ELF / ZIP 对齐通过，64 位为 16KB、32 位为 4KB。
- 脱离 APK 的核验文本与 `verification.json` 存在同一交付目录，不含账号秘密。未在设备安装或启动，真实手机运行由本次测试反馈确认。

## 2026-10-25 Agent 实机反馈修正版

- 版本：`1.5.0-preview.4-beta.2`，versionCode 42；APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.2-android.apk`。
- 大小：158,511,431 字节；SHA-256：`D5C6C2EDD85679A013F0D12497F0595B1CF54D7D13D740ADFC55F4D32D157799`。
- 修正 Agent 多层页头、输入区占位和日志展开行为；增加固定创作入口，按实际任务和归档成果显示进度并打开生成原图。详见 [修正说明](agent-phone-ux-2026-10-25.md)。
- Beta 构建与 Lint、TypeScript、完整 Jest 回归通过（242 个套件、1584 项测试）。
- 最终 APK 的独立包名、Beta.2 原生与 Expo 版本、双手机 ABI、安全 manifest、Hermes 产物和通知协议核验通过。
- v2 签名验证通过，证书与上一 Beta 相同；可覆盖安装测试版并保留测试数据。86 个原生库与上一包内容相同，ELF / ZIP 对齐复核通过。
- 检查结果在 `build/phone-beta/beta2-verification.json`，相邻 `beta2-*.txt` 为 APK 核验输出。未执行手机或模拟器安装，也未发起付费生成；新版触控和键盘体验仍需实机复测。

## 2026-10-25 全应用键盘避让修正版

- 版本：`1.5.0-preview.4-beta.3`，versionCode 42；APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.3-android.apk`。
- 大小：158,516,567 字节；SHA-256：`AD0A70BDCDE28E1D42060CF92CF04835152A8848D23B391C87EADBCD8A9D0399`。
- 全量检查 21 个文件的 39 处输入框声明及动态字段，统一原生窗口坐标避让和聚焦滚动；覆盖 Agent、设置、图片 / 视频、项目内容表单、弹窗和抽屉。图片生成设置的内嵌滚动面板也已接入。详见 [输入框审查记录](keyboard-input-audit-2026-10-25.md)。
- TypeScript、完整 Jest 回归通过（244 个套件、1593 项测试；1 个套件 / 4 项测试跳过）；最后补充内嵌面板后，相关图片测试 15 项及公共组件测试 9 项再次通过。
- 自包含 Debug QA 构建和双架构 Beta 构建通过。最终包的独立身份、Beta.3 原生 / Expo 版本、Hermes、通知协议、安全 manifest、v2 签名和 86 个原生库的内容及 ELF / ZIP 对齐检查通过，详见 `build/phone-beta/beta3-verification.json`。
- 签名与前两版 Beta 相同，可覆盖安装测试版并保留测试数据；正式版身份不变。
- 在独立新建的 Android QA 模拟器执行键盘交互抽查，确认 Agent 主输入框、设置页下方字段及连续切换焦点、创作信息抽屉、图片编辑和内嵌数字字段、视频提示词及底部 Seed 弹窗可见。完成后已关闭本轮 QA 模拟器；未操作用户手机、使用真实账号或提交付费生成。用户所用 OEM 输入法仍需原手机复测。
- Android Lint 本轮未通过：第三方 `react-native-worklets:lintAnalyzeRelease` 的 Kotlin UAST 分析崩溃，错误为 `Cannot find a KaModule for the VirtualFile`，见 `mobile/keyboard-beta-lint.log`。没有将构建成功等同于 Lint 成功。

## 2026-10-26 · beta.10 编辑抽屉与创作工作台更新

- 版本 `1.5.0-preview.4-beta.10`，versionCode 49，包名 `com.example.autodlh3.beta`。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.10-android.apk`，158,605,279 字节，包含 arm64-v8a / armeabi-v7a，最低 Android 8.0。
- SHA-256：`ED8DE4AE9D2352253285B786A43DB40269297B69B63E0C137C0C03C4535EABFB`。
- 包含此前尚未提交的工作台、任务中心、提示词协作、全屏预览、元数据检查及本次覆盖式编辑抽屉、权重高亮、选择性元数据导入改进。
- TypeScript 检查通过，完整 Jest：255 个套件 / 1635 项通过；1 个套件 / 4 项按原配置跳过。
- 手机双架构 Beta 构建成功；最终 APK 包名、版本、ABI、v2 签名及 16 KB ZIP 对齐检查通过，签名证书与 beta.9 一致，可覆盖升级现有测试版。
- 编辑器功能已在上一轮 x86_64 模拟器构建实测；本次手机包未安装至真实手机。检查输出见 `build/phone-beta/beta10-badging.txt` 和 `beta10-signature.txt`。
