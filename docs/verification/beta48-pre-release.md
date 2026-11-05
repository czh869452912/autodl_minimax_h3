# Beta.48 预发布构建与核验

2026-11-05，分支 `codex/creative-app`。目标标签 `preview/1.5.0-preview.4-beta.48`；沿用 beta.47 的独立测试版发布方式，不使用正式版 `v*` 标签。

## 本次范围

包含 Agent M1–M5、项目权限及改造后复核修正：技能快速选用/分步添加、建议/请求审阅、计划/批次、任务/候选、提炼/历史、输入/版本，以及计划终态、跨项目迟到读取、图片处理审阅和文档校正。详见 [50 项收尾](../design/agent-final-reconciliation.md) 和 [复核报告](../design/agent-post-implementation-review.md)。

原生 `versionCode` 从 86 增至 87，Beta 后缀从 47 增至 48；同时纠正 Expo 配置此前停留在 beta.38 的漂移。安全配置测试新增两种版本来源一致性断言。

## 最终 APK

| 项目 | 核验结果 |
| --- | --- |
| 文件 | `AutoDL-H3-1.5.0-preview.4-beta.48-android.apk` |
| 包名 / 名称 | `com.example.autodlh3.beta` / AutoDL H3 测试版 |
| 版本 | `1.5.0-preview.4-beta.48` / versionCode 87 |
| 内嵌 Expo 配置 | 版本同上，包名及 `autodlh3-beta` scheme 一致 |
| 系统 / ABI | minSdk 26、targetSdk 36；arm64-v8a、armeabi-v7a |
| 大小 | 186,688,621 字节 |
| SHA-256 | `208d57f515d36a794238bcb9f3252e8b4125a8e111882acd1ec8b30a7e4c867b` |
| 签名 | apksigner 验证通过；证书与已发布 beta.47 相同 |
| 证书 SHA-256 | `3c5f2249f3f505951babcc68a283f4bfe8e4f3d8e364b0b99b67bf2473ea4ea0` |
| 运行配置 | 不可调试，禁用明文流量、系统备份及悬浮窗权限 |
| Hermes / 原生库 | 内嵌 13,885,288 字节字节码；86 个原生库通过 ELF / ZIP 对齐（64 位 16KB，32 位 4KB） |

构建使用生产 `mobile/index.js` 和 `mobile/scripts/build-phone-beta.ps1`，JDK 21 / SDK 36；未使用先前隔离 QA 入口或离线模型替换。Beta 构建通过，不依赖 Metro。

## 验证

- 全量 Jest：332 个套件、2041 项通过；1 个套件、4 项按既有配置跳过。
- TypeScript 通过；内置技能 36 文件的内容、哈希和 metadata 一致；工作流固定发布身份检查通过。
- 跨进程恢复：5 场景、10 个独立进程通过；发布脚本 Python 15 项、注册表发布器 Node 1 项通过。
- 页面谱系严格检查通过：31 个路由文件、67 个条目、74 条点击边。
- 原生 Debug 单元测试：12 套、71 项通过，无失败或跳过；不等同 Beta 真机测试。
- 最终 APK 的包身份、版本、签名、manifest、Hermes、ABI 与原生对齐均直接检查实际产物。

媒体依赖固定来源与 beta.47 相同。重新核对旧源码包及各固定载荷哈希，复用已验证的来源存档，再用当前 Gradle 配置、许可证和打包脚本生成本次源码包及校验记录；不是直接上传旧源码包。

本地日志：`build/beta48-build.log`、`build/beta48-full-tests.log`、`build/beta48-native-tests.log`、`build/beta48-process-recovery.log`。公开附件为 APK、`SHA256SUMS.txt`、`beta48-verification.json`、`AutoDL-media-sources.zip` 与 `AutoDL-media-sources-verification.json`；不上传账号配置或完整构建日志。

## 覆盖边界

本次未安装到用户手机，未执行真实 ARM 手机完整升级、媒体采用/导出、长时合成、OEM 后台或完整可访问性验收；未调用真实模型/生成服务。已发布 beta.47 的本地 APK 与公开校验值匹配，签名相同及更高 versionCode 只能证明满足对应的签名/版本条件，不等于所有设备升级流程已验收。

测试版与正式版并行安装，数据独立，不自动迁移正式版数据；不能据此认定正式版 v1.4.28 覆盖升级已验证。结果未知时仍先核查原任务，不重复提交。

目标发布页：[Beta.48](https://github.com/czh869452912/autodl_minimax_h3/releases/tag/preview/1.5.0-preview.4-beta.48)。
