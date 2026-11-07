# Beta.49 测试 APK · 2026-11-07

源码提交 `2c2f1729`，包含 Agent N0–N5 界面改造及 `a549e79f` 历史范围、Android 返回和目录位置复核修复。版本配置已同步更新 Gradle 与 Expo。

| 项目 | 实际产物 |
|---|---|
| 文件 | `build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.49-android.apk` |
| 应用 | AutoDL H3 测试版 / `com.example.autodlh3.beta` |
| 版本 | `1.5.0-preview.4-beta.49` / versionCode 88 |
| 系统 | minSdk 26（Android 8.0+）、targetSdk 36 |
| 架构 | arm64-v8a、armeabi-v7a、x86_64 |
| 文件大小 | 261,860,707 字节，约 262 MB |
| SHA-256 | `e80a87230a16c848b2d760067c77f0ed3aeed50fb5b91b62e6d4de1452efed3e` |
| 签名 | apksigner 验证通过；与 Beta.48 的测试签名证书一致 |
| 证书 SHA-256 | `3c5f2249f3f505951babcc68a283f4bfe8e4f3d8e364b0b99b67bf2473ea4ea0` |
| JS | 生产 `mobile/index.js`，内嵌 14,060,808 字节 Hermes 字节码；不依赖 Metro，未使用离线 QA 替身 |
| 原生库 | 129 个库，ELF / 未压缩 ZIP 对齐通过；64 位 16KB、32 位 4KB |
| 运行配置 | 不可调试；禁用明文流量、备份和悬浮窗权限；内嵌 Expo 包名、版本及 scheme 与原生一致 |

构建：JDK 21、Android SDK 36，执行 `mobile/scripts/build-phone-beta.ps1 -Architectures 'arm64-v8a,armeabi-v7a,x86_64'`，`:app:assembleBeta` 成功（6 分 28 秒）。配置一致性现有测试 3 项通过；本次 Agent 源码仍对应上一轮复核通过的 149 项相关测试，没有将该结果扩称全仓库或真实服务验收。

在 Android 17 / API 37 / x86_64 模拟器 `emulator-5556` 上，将原有 Beta.44 通过 `adb install -r` 更新至这份 Beta.49，未清除测试版应用数据。冷启动进入生产 Agent 未配置模型的正常引导；通过助手菜单打开技能目录、进入技能运行记录，再按系统返回，正确回到目录。当前进程 ReactNativeJS:E / AndroidRuntime:E 日志采样为空。没有修改模型或供应商配置，没有调用真实生成服务。未验证 ARM 手机安装、完整生成链或完整 TalkBack。

模拟器初次覆盖安装因剩余空间不足失败；清缓存不足以解决，随后用 `uninstall -k` 临时移除上一轮独立 QA 包的程序文件，保留其数据后重试成功。安装验证后，原 QA 包已重新安装。该操作没有清除 Beta 应用数据。此空间处理属于本机模拟器准备，不是测试 APK 的安装步骤。

本地核验记录：`build/phone-beta/beta49-verification.json`、同目录 `.apk.sha256`；构建与安装日志：`build/beta49-build.log`、`build/beta49-install.log`；UI XML、截图与进程错误日志位于 `build/beta49-device/`。本次仅生成本地测试 APK，未发布 GitHub Release。
