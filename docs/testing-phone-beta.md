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

## 2026-10-26 · beta.11 设置布局与输入修复

- 版本 1.5.0-preview.4-beta.11，versionCode 50。包含上一轮原生光标避让、滚动保持键盘、数据库准备阶段有限重试及友好错误提示。
- 最终提示词预览仅在提示词页显示，参考图/片段均隐藏入口与已展开内容。
- 根据用户官方设置截图与之前窄屏实测记录调整设置层级：模型、画风、Effort；尺寸预设与比例、张数；步数/引导滑块与数字输入、Seed、采样器；高级设置收纳 Rescale 等。当前会话没有可调用的内置浏览器控制工具，没有声称重新操作官网。
- 导入图片只保留参考图页入口，画风只在设置页，透明背景只在提示词页；Seed 重置收纳到 Seed 旁。
- TypeScript 与全量 Jest 通过：257 套件、1641 项测试（原有 1 套件/4 项跳过）。模拟器 720×1280 检查设置排版后修正滑块纵向滚动误触；修正后的相关 3 项测试再次通过。最终手机包包含该修正。
- Android x86_64 QA 包安装成功，检查设置层级、参数展示及滑块；没有提交生成。最终 ARM 手机包需在用户设备继续确认。
- 最终 APK 签名与 beta.10 一致、双 ARM 架构和 ZIP 对齐核验通过。SHA-256：`13C61FA1BC919AEB64A0496BB0FBC30716C3AD1FD9CDE329CDDD365D47A3A125`。

## 2026-10-26 · beta.12 图片手势、独立讨论与视频轮次

- 版本 `1.5.0-preview.4-beta.12`，versionCode 51；功能提交 `926d94ab`，存储边界修复 `e71fe440`。
- 包含 Anlas估算、离线标签补全、图片页内与全屏双指缩放拖动、助手覆盖布局、独立讨论及视频轮次记录。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.12-android.apk`；168,982,054字节；arm64-v8a / armeabi-v7a，最低Android 8.0。
- SHA-256：`0B74216287FCC2CDD7AF816243D9DF5A8F1E3315BC132A7EB61E8CA2DE3ACC07`。
- TypeScript通过。全量Jest首次262套件/1652项通过、1项存储架构检查失败，原有1套件/4项跳过；将词库数据库访问移入storage层后，架构检查及标签补全相关3套件/5项复测全部通过，没有修改测试规则。
- 最终双ARM包重建成功，包名/版本/ABI、v2签名、ZIP及86个原生库ELF对齐验证通过；签名与beta.11一致，可覆盖升级测试版。
- 图片手势、助手布局及键盘行为已有x86_64模拟器实测；本次手机ARM包未安装到真实手机，未触发付费生成。多轮视频由带任务数据的组件测试验证，仍需有视频数据的设备实测。

## 2026-10-27 · beta.13 标签补全开关与视频素材卡片

- 版本 `1.5.0-preview.4-beta.13`，versionCode 52；功能提交 `4c3a9956`。
- 提示词编辑区增加常驻标签补全开关，关闭浮层后可重新开启；视频参考图片和音频使用卡片，序号整合到标题，排序和移除在卡片内展开。
- 音频支持就地播放、暂停与时长显示；切换试听或离开编辑区停止播放，修复播放器释放后重复暂停导致的闪退。
- 上一轮 TypeScript 和 5 套件 / 21 项相关测试通过；x86_64 模拟器验证补全开关、音频时长与播放、移除引用和切换页面。最终手机 ARM 包未安装到真实手机。
- 本次双 ARM 手机包构建成功，包名、版本、ABI、签名及 16 KB ZIP 对齐核验通过；签名与 beta.12 相同，可覆盖升级测试版。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.13-android.apk`；169,000,606 字节；arm64-v8a / armeabi-v7a，最低 Android 8.0。
- SHA-256：`3CA339B3A414E16AC4E9DCDECA8B2F551C91B3FB7F6B53FF423EDE7574E6EF1F`。
