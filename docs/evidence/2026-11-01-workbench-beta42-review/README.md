# Beta 42 独立复审证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


源码 a0ac2adf；比较 096bd561。模拟器 emulator-5554，com.example.autodlh3.beta，versionCode 81，beta.42。使用现成安装，无模型/生成消费。

- `targeted-tests.json/log`：8 文件、98 项既有回归通过；测试范围见日志末尾。
- `typecheck.log`：npm run typecheck 退出 0。
- `skills-check.log`：内置包 36 文件校验通过。
- `history-probe.test.tsx`、`history-probe.json/log`：1 项 UI 不良行为探针，确认项目 A 页面消费全局 B 历史、无来源与跳转。原临时位置 mobile/src/agent/skills/beta42-review.probe.test.tsx。
- `history-store-probe.test.ts`、`history-store-probe.json/log`：1 项真实 SQLite 不良行为探针，确认 B 的 20 条新运行会使 A 的旧记录无法从当前唯一历史查询返回。原临时位置 mobile/src/agent/skills/beta42-history-store.probe.test.ts。复跑时复制回原位置，再用 Jest runTestsByPath；不要直接将证据文件的相对 import 当作产品路径。
- `01`–`09` PNG/XML：项目、媒体检查、编辑、页头确认、继续编辑、模型连接、返回保留、系统确认、明确放弃回项目。
- `10`、`11` PNG/XML：项目技能，点击历史后当前视口不变。内置可见，9 项。
- `12`、`13` PNG/XML：冷启动 autodlh3-beta://creative-capabilities，点击返回项目后仍在能力页。启动命令返回 LaunchState COLD，Status ok。
- `14` PNG/XML：结束时恢复到项目列表。
- `media-guard-flow.png`、`navigation-findings.png`：原图等比例缩小并排；contact-sheets.ps1 可重建，未生成虚构 UI。
- `capture.cjs`：每次操作先读取新 UI XML，再按实际标签和 bounds 点击；截图同时保存层级。仅本地 ADB，无付费服务。

相关设备命令：

```powershell
adb -s emulator-5554 shell dumpsys package com.example.autodlh3.beta
adb -s emulator-5554 shell am force-stop com.example.autodlh3.beta
adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d autodlh3-beta://creative-capabilities com.example.autodlh3.beta
```

检查包版本时另查询过未带 .beta 的包前缀，它的输出不作为版本证据；随后用精确 beta 包核实 81/beta.42。beta 是非 debuggable 包，run-as 被拒绝，没有提取或修改应用数据库。历史跨项目验证使用临时初始化的离线 SQLite。设备 logcat 筛选没有输出匹配行，没有声称完整日志无错。


## 随仓库保留的文件

- [03-edited.png](03-edited.png)
- [03-edited.xml](03-edited.xml)
- [04-header-guard.png](04-header-guard.png)
- [04-header-guard.xml](04-header-guard.xml)
- [07-after-config.png](07-after-config.png)
- [07-after-config.xml](07-after-config.xml)
- [08-system-guard.png](08-system-guard.png)
- [08-system-guard.xml](08-system-guard.xml)
- [10-project-skills.png](10-project-skills.png)
- [10-project-skills.xml](10-project-skills.xml)
- [11-history-click.png](11-history-click.png)
- [11-history-click.xml](11-history-click.xml)
- [12-cold-capabilities.png](12-cold-capabilities.png)
- [12-cold-capabilities.xml](12-cold-capabilities.xml)
- [13-cold-back.png](13-cold-back.png)
- [13-cold-back.xml](13-cold-back.xml)
- [device-version.txt](device-version.txt)
- [history-probe.json](history-probe.json)
- [history-probe.test.tsx](history-probe.test.tsx)
- [history-store-probe.json](history-store-probe.json)
- [history-store-probe.test.ts](history-store-probe.test.ts)
- [media-guard-flow.png](media-guard-flow.png)
- [navigation-findings.png](navigation-findings.png)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
