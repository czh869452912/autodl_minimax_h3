# Beta 42 返回保护验证

2026-11-01，emulator-5554；x86_64 专用 beta.42 / versionCode 81 覆盖安装成功，数据保留。手机目录 ARM 包未覆盖。

- 07-edited：追加 QA-beta42-unsaved，仅临时输入。
- 08-header-guard：点击页头返回来源，出现未保存确认。
- 09-kept：继续编辑，输入仍在。
- 10-system-guard：系统 Back 出现相同确认。
- 11-kept-system：继续编辑，输入仍在。
- 12-models / 13-model-return：进入连接管理再返回，输入保留；没有保存任何连接。
- 14-discard-dialog / 15-returned：明确放弃才返回项目。
- 16-reentered：重新进入恢复默认要求；随后返回项目，没有业务写入或模型检查请求。

同名 PNG/XML 是原始设备证据。app-logcat.txt 是当前应用进程日志，未发现 FATAL EXCEPTION。此为模拟器导航验证，不代表 ARM 真机性能、真实模型调用或 B1/B2 的设备验收；B1/B2 使用离线配置/组件回归。
