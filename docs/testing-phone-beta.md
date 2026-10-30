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

## 2026-10-29 · beta.23 导航闭环与本地技能

- 版本 `1.5.0-preview.4-beta.23`，versionCode 62；包含本轮 b80d8621 至 8595a825 的生产调整，文档收口 2d090a7d。
- 修复精确结果版本、旧任务产物范围、旧交接转换、工作台输入保护、镜头返回、项目/提案定位及设置工具恢复；增加最小运行适配层、本地文本技能导入/启用/固定快照/撤销，强化计划依赖及全部步骤完成条件。
- 数据库由 v28 升至 v29，迁移前自动备份；技能版本与运行引用包含在完整本地备份中。降级旧 APK 不能直接写入新数据库。DeepAgents 仍为 1.13.2；隔离的 1.16.0 与 3D 实验没有进入手机包。
- 功能基线：全量 282 组、1760 项通过，原有 1 组/4 项跳过；TypeScript 与同源码 x86_64 APK/模拟器验证通过，详情见 [本轮调整验收](reviews/2026-10-29-research-adoption-and-adjustment-plan.md)。本次只递增测试版身份并打包，没有重复收费生成。
- 双 ARM 手机 APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.23-android.apk`，169249662 字节，最低 Android 8.0。
- SHA-256：`21AAC04EFD4A81AC565DA0732E10A74C160051EABBFC10F8443FB35618178E4A`。
- 最终包的包名/版本、独立协议与 FileProvider、非 debuggable、禁止明文/系统备份、嵌入 Expo 身份、Hermes 字节码、双 ARM、v2 签名、16 KB ZIP 对齐及 arm64 ELF 对齐通过；86 个 native libraries 已检查，证书与 beta.22 一致，可覆盖升级测试版。32 位 ABI 不套用 64 位的 16 KB ELF 门槛，参见 [Android 官方说明](https://developer.android.com/guide/practices/page-sizes)。
- 校验报告 `build/phone-beta/beta23-verification.json`；构建日志 `build/phone-beta23-build.log`。ARM 分发包未安装到真实手机，未推送或发布远端 Release。


## 2026-10-29 · beta.24 失败任务整理与技能提炼

- 版本 1.5.0-preview.4-beta.24，versionCode 63；功能提交 c578c3a1、a8ef7079、e2b8b580。
- 失败任务可归档/恢复；终态创作任务可从全部、失败、归档和最近任务列表移除，保留草稿/成果/消费引用，后台投影修复不复活记录。
- 本地技能新增“从对话提炼技能”：选择已保存文本证据、脱敏并审阅发送内容、生成可编辑草稿、保存恢复、检查发布、独立启用。没有自动发布或自动启用，未运行付费模型验收。
- schema 29 → 30 → 31，增加任务移除记录和技能提炼草稿，沿用迁移前备份与完整本地备份；旧 APK 不可直接写入升级后的数据库。
- 全量 285 组/1777 项通过，原有 1 组/4 项跳过；最终 TypeScript 检查通过。Android 17 x86_64 模拟器验证归档/恢复/移除后重启、最近任务、证据脱敏、草稿重启恢复、审阅发布及单独启用；原数据库恢复且逐字节核对。真实模型的创作效果与 ARM 实机尚未验收。
- 双 ARM APK：build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.24-android.apk，169282642 字节，最低 Android 8.0。
- SHA-256：F2A32B0417198EBFC251723274646DE41743B934A10B6339B0CDDB4BA09E463B。
- 包名/版本、独立协议/FileProvider、非 debuggable、禁止明文及系统备份、嵌入 Expo 身份、Hermes、双 ARM、86 个原生库、v2 签名、16 KB ZIP 和 arm64 ELF 对齐通过。签名与 beta.23 相同，可覆盖升级测试版；未推送或发布远端。
- 日志与校验：build/phone-beta24-build.log、build/phone-beta/beta24-verification.json、build/followup-final-tests.log、build/followup-final-typecheck.log、build/followup-device-verification.json。

## 2026-10-30 · beta.25 素材去重与标签补全

- 版本 `1.5.0-preview.4-beta.25`，versionCode 64；功能提交 `2d272081`、`01bf5227`。
- 相同类型、相同原件的独立外部导入复用素材与真实文件；历史重复项归并展示，保留旧引用。导入到不同项目只增加关联，不覆盖用户编辑的资料。
- 标签候选带滚动条，最多 40 项；本地支持多词、词中前缀、包含、别名和现有翻译匹配。修复补全后光标偏移及吞掉右侧文本，兼容已有逗号和权重闭合。
- 全量 288 组 / 1797 项通过，原有 1 组 / 4 项跳过；TypeScript 通过。Android 17 x86_64 模拟器验证滚动选择第八项、插入后继续输入的光标落点、保留后续文本和历史音频去重显示；原数据库已恢复并核对 SHA-256。详见 [实现与验收记录](reviews/2026-10-30-import-dedup-and-tag-completion.md)。
- 双 ARM APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.25-android.apk`，186,176,021 字节，最低 Android 8.0。新版词库增加约 23 MB 未压缩体积，APK 比 beta.24 增加约 16.9 MB。
- SHA-256：`B926F0BC0692AE65BE42210CEF36FBDB51ED7B00CB3B623283D091EEF310DB6E`。
- 最终包名/版本、独立协议/FileProvider、非 debuggable、禁止明文及系统备份、嵌入 Expo 身份、Hermes、双 ARM、86 个原生库、v2 签名、16 KB ZIP 和 arm64 ELF 对齐、新词库内容哈希校验通过。签名与 beta.24 一致，可覆盖升级测试版。
- 构建与校验：`build/phone-beta25-build.log`、`build/phone-beta/beta25-verification.json`。未运行收费生成，ARM 手机及不同输入法组合尚未实机验收；未推送或发布远端。

## 2026-10-30 · beta.26 历史分页、资源清理与管理界面

- 版本 `1.5.0-preview.4-beta.26`，versionCode 65；功能提交 `a09c7a2e`、`9720c916`、`d230f060`、`4958be68`、`cd29740d`，包含此前入口调整 `e1ffced7`。
- 素材列表、详情版本、视频历史和计划候选分页；管理列表虚拟化，保留旧默认/指定版本与轮次恢复。
- 项目和素材页直接进入技能、存储清理、回收站；整理项目页签、封面说明、版本比较与使用位置。清理先扫描、确认、退出，启动阶段重新验证后执行，保留原件/回收站/任务回执和发送标记。
- 全量 289 组 / 1802 项通过，既有 1 组 / 4 项跳过；最终保护测试及 TypeScript 通过。Android 17 模拟器验证 40 项跨页、85 个版本中的旧默认定位、清理重启、大字体入口；数据库逐字节恢复。详见 [本轮交付记录](reviews/2026-10-30-management-completion.md)。
- 双 ARM APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.26-android.apk`，186,200,549 字节，最低 Android 8.0。
- SHA-256：`04AAFBE3E91CAE9C64A9D8A6BB85E90A2D7D3F28A91FB95E0B6016A39EB15F14`。
- 包名/版本、独立协议/FileProvider、非 debuggable、禁止明文及系统备份、嵌入 Expo 身份、Hermes、双 ARM、86 个原生库、v2 签名、16 KB ZIP 与 arm64 ELF 对齐及词库内容哈希校验通过；签名与 beta.25 一致。
- 最终日志 `build/phone-beta26-final-build.log`，校验 `build/phone-beta/beta26-verification.json`。未触发收费生成、未安装到 ARM 手机、未发布远端。

## 2026-10-30 · beta.27 主导航与素材库改版

- 版本 `1.5.0-preview.4-beta.27`，versionCode 66；功能提交 `229a21ed`、`708c092c`。
- 固定四个主入口：创作、助手、项目、素材。主入口切换保留状态，并沿用草稿保存和未保存修改确认；键盘展开隐藏底栏。
- 素材库改为标题操作、范围、搜索、类型和双列缩略图；导入与管理使用弹出面板。技能在助手首屏，清理从素材管理进入。文档筛选排除音频。
- 导航关系、截图及测试细节：[本轮记录](reviews/2026-10-30-library-navigation.md)。全量 290 组 / 1803 项通过，既有 1 组 / 4 项跳过，类型检查及版本配置 3 项通过。
- Android 17 x86_64 验证素材详情返回、音频去重、技能与清理入口、导入/回收站、键盘隐藏底栏、未保存项目切换确认及 1.3 倍字体；测试后恢复字体与原数据库，逐字节核验。
- 双 ARM APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.27-android.apk`，186,203,857 字节，最低 Android 8.0。
- SHA-256：`995B44C2BE241253660456B88C993C018937D5875D6F342912C2F62CFA2552CC`。
- 签名与 beta.26 一致；最终包身份、非 debuggable、独立协议、Hermes、双 ARM、86 个原生库、16 KB ZIP / arm64 ELF 对齐及词库内容哈希均通过。校验：`build/phone-beta/beta27-verification.json`。
- 本地旧 C++ 缓存缺失预编译头，以独立新缓存目录重新构建全部原生依赖；构建日志 `build/beta27-build.log`。未调用付费生成服务、未安装到 ARM 手机、未推送远端。

## 2026-10-30 · beta.28 对话入口与素材详情

- 版本 `1.5.0-preview.4-beta.28`，versionCode 67；功能提交 `5fa0a97f`、`fba91ab5`、`caa7e216`。
- 创作页移除重复标题；助手直接进入对话，项目切换仅在对话页头；历史、任务、新会话、更多集中为图标，技能和模型设置放入更多菜单，无项目时前往项目页。
- 历史图标保留全部对话检索；从其他项目的历史对话新建会话时沿用实际项目，不修改原会话归属。
- 项目素材页精简为工具栏、页签、搜索、分类和网格。详情展示预览、格式、文件状态、大小/尺寸、来源、日期、标签、描述和项目归属；编辑、版本、项目关联与低频操作分面板；图片可全屏缩放。
- 研究依据、截图和取舍：[本轮记录](reviews/2026-10-30-chat-asset-ux.md)。全量回归 290 组 / 1802 项通过，既有 1 组 / 4 项跳过；随后新增回归与最终相关 23 项通过，TypeScript 和 Android 配置检查通过。
- Android 17 模拟器验证助手直接进入、历史/技能入口、项目素材与详情、真实文件信息、加入项目、全屏查看、未保存关闭与放弃恢复。原数据库逐字节恢复；无模型调用、未改助手凭据。
- 双 ARM APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.28-android.apk`，186,207,629 字节；最低 Android 8.0。
- SHA-256：`7F3CE6529AC5F193C3CD1DAE223E2B06E37275F4CD7CBFADED145706B26F7F36`。
- 包身份、非 debuggable、独立协议、双 ARM、Hermes、86 个原生库、16 KB ZIP / arm64 ELF 对齐及词库哈希校验通过；签名与 beta.27 一致，可覆盖升级。
- 构建：`build/beta28-final-build.log`；校验：`build/phone-beta/beta28-verification.json`。手机最终包未安装到 ARM 设备；未推送远端。


## 2026-10-30 · beta.29 紧凑管理工作区

- 版本 `1.5.0-preview.4-beta.29`，versionCode 68。
- 助手技能在对话内打开，保留输入草稿；技能列表搜索、行内启停和正文展开，按需导入，并保护上下文切换中的未安装草稿。
- 素材页内检查与编辑，保留原列表；手机横向切换素材、宽屏列表详情分栏，网格列数自适应；名称标签、加入项目和版本历史页内展开。
- 项目统一紧凑工具栏，去除重复管理卡，进度与草稿整行可进入，镜头参考图与操作更紧凑。
- 全量290套件1807项通过；新增定向回归、TypeScript通过。Android模拟器验证手机/宽屏、键盘、技能安装启用及未保存修改保护。测试后原数据库逐字节恢复，屏幕尺寸和临时存储设置已还原；未发起付费生成。
- 实现提交：`07ee68cb`、`e045e28d`、`c0f26705`。详细记录：`docs/reviews/2026-10-30-compact-management-workspaces.md`。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.29-android.apk`，186,212,593 字节。双ARM、Hermes、独立测试版身份、86个原生库及16KB对齐均通过；证书与beta.28一致，可覆盖升级测试版。
- SHA-256：`F391ADAE523719230C41EE2394AADE72F68A241E651AB42C0DDBC03436F2EADE`。
- 核验报告：`build/phone-beta/beta29-verification.json`。ARM包未安装到用户手机。


## 2026-10-30 · beta.30 素材分组版本修复

- 版本 `1.5.0-preview.4-beta.30`，versionCode 69；实现提交 `7cb114ac`。
- 素材详情预览上方直接展示版本缩略图；自动合并新增生成版本，保留已选旧版本和未保存元数据。保留历史分页和版本比较。
- TypeScript与3套件17项针对性测试通过。本轮未进行模拟器交互验收。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.30-android.apk`，186213997字节；双ARM、Hermes、86个原生库16KB对齐及独立测试身份核验通过，证书与beta.29一致。
- SHA-256：`9FB9A78B0A99639E262C61B8444D56C516300CC0A54CD62437838D642C3560D7`。核验报告：`build/phone-beta/beta30-verification.json`。


## 2026-10-30 · beta.31 素材详情导航调整

- 版本 `1.5.0-preview.4-beta.31`，versionCode 70；功能提交 `27400532`。
- 移除素材详情顶部跨素材组的横向浏览条，保留当前组内版本切换。返回素材列表继续选择其他组，并保留未保存编辑保护。
- 沿用本次修改的14项回归测试和TypeScript通过结果；本轮未新增模拟器验收。
- APK：`build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.31-android.apk`，186213261字节；独立测试版身份、双ARM、Hermes、86个原生库及16KB对齐均核验通过，证书与beta.30一致。
- SHA-256：`BFF783675E281AD31885FAA89197BFFA5B647831D95E8C23E0A6D818DFFADB61`；报告：`build/phone-beta/beta31-verification.json`。
