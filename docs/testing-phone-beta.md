# 可与正式版共存的手机测试版

## 2026-10-28 · beta.20 历史分页与媒体性能

- 版本 `1.5.0-preview.4-beta.20`，versionCode 59；版本提交 `6e45de1d`。
- 包含结果历史游标分页、全历史搜索、跨页原图浏览、版本列表虚拟化、640px 缩略图及有界解码缓存、视频记录批量读取。数据库从 v27 升级到 v28，新增历史分页索引。
- 功能实现及验收详见 `docs/reviews/2026-10-28-history-media-performance.md`：全量 270 套 / 1700 项通过，另补分页竞态 2 项和最终结果页相关 19 项回归通过；类型检查、原生缓存测试、x86_64 构建及模拟器缩略图/历史/全屏验证通过。
- 本次双 ARM 手机构建成功，APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.20-android.apk`，169,066,102 字节，最低 Android 8.0。
- SHA-256：`D5EF357BEA08BAA8AB605AD797C12080F0D1BBA76914FA7374098FDD7A76A371`。
- 包名、版本码、版本名、双 ARM 架构、Hermes bundle、签名及 16KB ZIP 对齐通过；证书与 beta.19 相同，可覆盖升级测试版。报告：`build/phone-beta/beta20-verification.json`。
- 手机 ARM 包未安装到用户手机。本次仅更新版本并打包，没有重复发起付费生成；沿用上一轮功能验收证据。

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

## 2026-10-27 · beta.14 视频保存与任务列表

- 版本 `1.5.0-preview.4-beta.14`，versionCode 53；功能提交 `b459e01e`。
- 视频结果取消底部大保存按钮，标题栏显示保存、保存中、已保存或失败重试；持续发现延迟创建的自动保存记录。任务卡片按状态、缩略图、提示词与耗时分层展示，下载进度折叠可见，删除重复详情入口。
- 上一轮 TypeScript、3 套件 35 项测试通过，最后标题栏调整后的结果页 15 项测试再次通过；x86_64 模拟器验证窄屏任务布局及展开收起。视频自动保存状态由组件回归验证，未发起付费生成。
- 本次手机双 ARM 构建成功，包名、版本、ABI、v2 签名与 16 KB ZIP 对齐核验通过；签名与 beta.13 一致，可覆盖升级。最终 ARM 包未安装到真实手机。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.14-android.apk`；169,002,138 字节；arm64-v8a / armeabi-v7a，最低 Android 8.0。
- SHA-256：`9BC58E1E9EA4E33072ACAACE93C4CDBC074ECDD0CC44DDAEF393F6756B644235`。

## 2026-10-27 · beta.15 预览手势与 Enhance 面板

- 版本 `1.5.0-preview.4-beta.15`，versionCode 54；本轮功能提交 `522b407d`，同时包含最近任务优化 `4fbd454a`。
- 移除预览和全屏双击缩放、预览单击全屏手势；保留双指缩放与拖动，通过按钮进入全屏；统一全屏、还原、放大和缩小按钮样式。
- Enhance 面板改为覆盖层，修复排在画布后被裁掉的问题；普通生成设置与增强临时参数分离。已在登录的官方页面确认 Enhance 与普通设置面板的交互。
- 上一轮 TypeScript、3 套件 / 21 项测试通过；x86_64 模拟器验证窄屏增强面板、普通设置切换、单击不打开全屏、全屏按钮及缩放还原按钮。未发起付费生成。
- 本次双 ARM 手机包构建成功，包名、版本、ABI、v2 签名和 16 KB ZIP 对齐核验通过，签名与 beta.14 一致，可覆盖安装测试版。最终 ARM 包未安装到真实手机。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.15-android.apk`；169,001,946 字节；arm64-v8a / armeabi-v7a，最低 Android 8.0。
- SHA-256：`6BA4B54587B7D615392810D43B93337BD6C12D5CA807C668E41784373EB1F970`。

## 2026-10-27 · beta.16 画廊、视频记录与费用信息

- 功能提交：`e4bd212d`；版本 `1.5.0-preview.4-beta.16`，versionCode 55。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.16-android.apk`，169,005,514 字节；包含 arm64-v8a / armeabi-v7a，最低 Android 8.0。
- SHA-256：`1AEBCC33E8BB51CAF8FA83AFF9087BBA7C04B284ED06A506015BC61E93DC28BC`。
- 精简图片全屏操作并复用相邻图片；视频生成记录增加紧凑封面、状态筛选与宽屏侧栏；加入 H3 动态估价、提交时报价快照和独立开发者 Token 余额查询。
- 上一轮相关回归 74 项通过、1 项原有跳过，类型检查通过；模拟器确认费用与余额设置布局。手机双 ARM beta 构建成功，APK v2 签名、版本、ABI、16KB ZIP 对齐通过，证书与 beta.15 相同，可覆盖升级测试版。
- 真实开发者 Token 余额查询和真实多轮视频播放仍待实机验证。本次未发送付费生成请求，也未操作用户手机。


## 2026-10-27 · beta.17 会话体验与生成栏收敛

- 版本 `1.5.0-preview.4-beta.17`，versionCode 56。
- 手工辅助与 Agent 复用消息、工具活动、输入和列表组件；成果按轮次归属，会话上下文保持隔离。项目、工作流选择、创作记录改为紧凑列表。
- 图片工作台撤销改为工具栏临时图标，10 秒自动消失，不再撑出独立提示栏。H3 估价与“生成 N 秒视频”同排，费用说明独立点击，不提交生成。
- 会话改造全量 Jest 266 套件 / 1672 项通过，原有 4 项跳过；最终文案调整相关 17 项、服务相关 6 项通过。本轮生成栏与费用相关 32 项通过；类型检查通过。
- x86_64 验证包构建及覆盖安装成功，模拟器确认生成按钮和费用说明同排，独立点击只打开估价说明。图片撤销超时和不回滚已编辑内容通过自动化测试验证。
- 功能提交：`1105b3eb`。手机 APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.17-android.apk`，169,030,922 字节；双 ARM 架构，最低 Android 8.0。
- SHA-256：`2C2866362F07A5CB6B3D0EDD8C57FFD6C2313D3675F3FB7D71D27A65E797E0B9`。
- 最终 APK 包名、versionCode 56、beta.17 版本、ABI、v2 签名与 16 KB ZIP 对齐校验通过；签名证书与 beta.16 一致。ARM 手机包未安装到真实手机；模拟器验证使用同源码的 x86_64 包。

## 2026-10-28 · beta.18 智能体时间线与中间过程

- 功能提交：`d626a4a8`；版本 `1.5.0-preview.4-beta.18`，versionCode 57。
- 手工助手与 Agent 共用有序过程投影、步骤展示、展开状态和运行尾部提示；修复思考/回复/工具错序、并发工具误标完成、虚拟列表回收丢失展开状态。运行时直接呈现步骤，结束后收拢过程，保留手动检查的详情。中间回复去除重复复制操作，增加待办和校验等可读摘要。
- 本轮功能全量回归 267 套 / 1681 项通过；最终相关 8 套 / 111 项通过，TypeScript 通过。原生 x86_64 回放验证运行、完成、过程展开及两个入口；临时回放页面已从源码移除，正式构建完成后覆盖安装到模拟器。未验证真实线上模型调用。
- 手机双 ARM beta 构建成功；APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.18-android.apk`，169,042,002 字节，最低 Android 8.0。
- SHA-256：`6D9710C54130A5A0F25CDCC96A6DF12BCDF4C24118702914508D1A9D834064E5`。
- 最终 APK 包名、版本码、版本名、双 ARM 架构、Hermes bundle、v2 签名和 16KB ZIP 对齐验证通过；证书与 beta.17 相同，可覆盖升级测试版。验证记录：`build/phone-beta/beta18-verification.json`。
- 手机 ARM 包未安装到用户手机；此前界面验证使用同功能源码的 x86_64 构建。本轮仅更新版本并打包，不重复触发生成任务。
# 2026-10-28 · beta.19 执行恢复、素材读取与镜头回路

- 版本 `1.5.0-preview.4-beta.19`，versionCode 58；功能提交 `fcb73e50`、`0224cbb1`、`fc02212f`、`38ad086f`、`28635cbf`，版本提交 `95eb262d`。
- 默认执行周期保留恢复后的派发预算；UNKNOWN 查询限制每轮数量并持久化退避；原生生成、回执和媒体工作隔离，回执采用流式校验。未增加自动重发付费请求。
- 素材选择按版本分页，未变化结果不再重复解析完整 recipes；镜头采用前检查文件，采用与预览选择分离，保留候选记录入口并支持返回原镜头。
- TypeScript 通过；全量 Jest 267 套 / 1693 项通过，原有 1 套 / 4 项跳过。原生回执相关 9 项通过；跨进程恢复 5 场景 / 10 进程通过；工作流与内置技能包校验通过。
- 同源码 x86_64 beta 包覆盖安装成功，验证新增镜头、项目/全局选材切换、同素材历史版本选择、固定参考图创建视频草稿、所属项目返回原镜头、继续已有草稿。检查 360dp / 1.3 倍字体滚动可达性，随后恢复模拟器显示配置。应用 crash buffer 无记录；启动阶段遇到一次模拟器 System UI 无响应，等待后恢复。
- QA 截图：`build/conversation-qa/beta19-picker.png`、`beta19-shot-return.png`、`beta19-shot-360-large.png`。候选采用和不会隐式提交由组件/数据库回归覆盖，未用真实账号执行付费生成。
- 双 ARM APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.19-android.apk`；169,047,246 字节；arm64-v8a / armeabi-v7a；最低 Android 8.0。
- SHA-256：`CC1C0E968C06F4CE3E84B933A472CA3420BFA73DAF7ECE4D37D48B85C4CC3F4B`。
- 包名、版本码、版本名、Hermes bundle、双 ARM、签名与 16KB ZIP 对齐校验通过；证书与 beta.18 一致。校验报告：`build/phone-beta/beta19-verification.json`。手机包未安装到用户手机。
- 本轮已完成与后续性能事项详见 `docs/reviews/2026-10-28-beta19-implementation.md`，不将本次 beta 视为全部审查项关闭。


## 2026-10-28 · beta.21 创作记录与时间线修复

- 版本 `1.5.0-preview.4-beta.21`，versionCode 60；功能提交 `04c2fbed`、`6e2de271`、`3218177d`、`40ceabcd`。
- 完整统计创作组生成次数；旧编辑器入口改为当前工作流管理；图片底栏改为固定工具栏样式；修复后续 Agent 思考插回首条用户消息下方的问题。
- 功能相关 4 套 / 24 项测试及 TypeScript 检查通过。此次为手机打包，未进行手机安装实测。
- 双 ARM APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.21-android.apk`，169069038 字节，最低 Android 8.0。
- SHA-256：`B6CCF211B5C5BCC6B25280AA22ACF854C67AB2D4C53960FA72BB178256C4A897`。
- 包名、版本码、版本名、双 ARM 架构、签名和 16KB ZIP 对齐检查通过；签名证书与 beta.20 一致，可覆盖升级。

## 2026-10-29 · beta.22 提示词助手交互与角色创建

- 版本 `1.5.0-preview.4-beta.22`，versionCode 61；功能提交 `72b2b308`、`981cc7d1`，版本提交 `4c84d884`。
- 图片/视频助手新建与历史入口分离，历史显示主题、摘要及轮数；扩大阅读区域，支持长建议展开和按需编辑；NovelAI 助手支持提议新增角色并显式采用。
- 功能验证：7 套 / 46 项测试、TypeScript 检查和 x86_64 模拟器布局检查通过，详见 `docs/reviews/2026-10-29-prompt-assistant-ux.md`。未验证真实模型的创作质量。
- 双 ARM 手机 APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.22-android.apk`，169076326 字节，最低 Android 8.0。
- SHA-256：`278AA7D23376A5FED589646C122EEE28A3E57790122E937DB3A4D9F0CF0B0AB2`。
- 包名、版本、双 ARM、签名和 16KB ZIP 对齐校验通过；证书与 beta.21 一致，可覆盖升级。校验报告 `build/phone-beta/beta22-verification.json`。手机分发包未安装到真实手机。
