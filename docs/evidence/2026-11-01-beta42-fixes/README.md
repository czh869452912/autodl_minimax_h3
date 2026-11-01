# Beta 42 返回保护验证

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


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


## 随仓库保留的文件

- [07-edited.png](07-edited.png)
- [07-edited.xml](07-edited.xml)
- [08-header-guard.png](08-header-guard.png)
- [08-header-guard.xml](08-header-guard.xml)
- [09-kept.png](09-kept.png)
- [09-kept.xml](09-kept.xml)
- [10-system-guard.png](10-system-guard.png)
- [10-system-guard.xml](10-system-guard.xml)
- [12-models.png](12-models.png)
- [12-models.xml](12-models.xml)
- [13-model-return.png](13-model-return.png)
- [13-model-return.xml](13-model-return.xml)
- [15-returned.png](15-returned.png)
- [15-returned.xml](15-returned.xml)
- [16-reentered.png](16-reentered.png)
- [16-reentered.xml](16-reentered.xml)
