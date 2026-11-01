# 2026-11-01 再次审查证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


源码 `3f7864a3`，基线 `03c0e588`；设备 `emulator-5554`，包 `com.example.autodlh3.beta`，versionCode 79 / beta.40。

## 独立回归

`targeted-tests.log/json`：14 文件、49 项通过。`typecheck.log`：tsc 无错误。`skill-bundle.log`：36 文件内容、哈希和元数据校验通过。

回归在 mobile 目录运行：

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/settings/llmConnections.test.ts src/settings/storage.test.ts src/route-tests/settings.test.tsx src/agent/skills/SkillLibraryScreen.test.tsx src/agent/skills/builtinCatalog.test.ts src/agent/skills/store.test.ts src/agent/skills/nextRun.test.ts src/agent/skills/runtime.test.ts src/agent/runUsage.test.ts src/creative/ProjectSearchScreen.test.tsx src/creative/TimelineScreen.test.tsx src/creative/SemanticPreparationScreen.test.tsx src/creative/CapabilityCatalogScreen.test.tsx src/navigation/creativeNavigation.test.ts
npm run typecheck
npm run verify:skills
```

## 离线不良行为探针

五个唯一复现场景全部复现。以下文件保存的是运行时使用的测试源码，已移出产品目录；它们断言不良行为存在，不应作为正确行为测试永久合并。连接和页面探针分别 mock 安全存储及服务，没有使用真实凭据或发起请求。

| 证据源码 | 运行时位置 | 输出 |
| --- | --- | --- |
| connections-probe.audit.test.ts | mobile/src/settings/navigationRereview.audit.test.ts | connection-probes.log/json（最终两项）；首次一项也见 reproduction-tests |
| timeline-probe.audit.test.tsx | mobile/src/creative/navigationRereview.audit.test.tsx | reproduction-tests.log/json |
| settings-screen-probe.audit.test.tsx | mobile/src/route-tests/navigationRereview.audit.test.tsx | reproduction-tests.log/json；包含复制的既有设置页测试 |
| usage-navigation-probe.audit.test.tsx | mobile/src/creative/usageNavigationRereview.audit.test.tsx | usage-navigation-test.log/json；包含复制的既有素材页测试 |

复跑方式：将所需证据副本复制至表中运行时位置，在 mobile 用 `jest --runInBand --runTestsByPath` 指定该临时文件；运行后移出。修复后应改为断言正确行为，当前探针不应再原样通过。部分输出包含重复既有测试，不能把输出总数相加当作新增覆盖数。

## 设备截图与 XML

- 01-current：当前包项目 Skill，“0 本地启用 · 9 内置可用”，音乐 MV Skill 英文描述、包指纹及展开文件。
- 02-project：项目概览，最近创作前移与分组可见。
- 03-timeline：项目时间线空列表；没有保存/合成。
- 04-shots、05-preparation：从项目镜头进入设定准备。
- 06-after-initial-focus：初次通用 label 点击匹配到了标题，未成功输入；该步不作为编辑验收。
- 07-edited：以新鲜 XML 的 EditText 边界输入 `QA-rereview-unsaved`，键盘收起后输入仍在。
- 08-back-guard：系统 Back 弹出未保存保护。
- 09-retained：继续编辑，临时输入保留。
- 10-header-guard：页头返回同样弹保护。
- 11-discarded：明确放弃临时输入，回原镜头。

`capture.cjs` 使用 adb、uiautomator 和 screencap；tap/type 每次先读取新鲜 UI XML，只以实际节点 bounds 定位。仅 type 命令选取 EditText，避免同名标题。没有修改已保存镜头描述、草稿、素材或连接。

本轮没有重建安装、真实模型请求或付费生成；没有真机 ARM/OEM、全路径无障碍或冷启动深链矩阵验收。


## 随仓库保留的文件

- [07-edited.png](07-edited.png)
- [07-edited.xml](07-edited.xml)
- [08-back-guard.png](08-back-guard.png)
- [08-back-guard.xml](08-back-guard.xml)
- [09-retained.png](09-retained.png)
- [09-retained.xml](09-retained.xml)
- [10-header-guard.png](10-header-guard.png)
- [10-header-guard.xml](10-header-guard.xml)
- [11-discarded.png](11-discarded.png)
- [11-discarded.xml](11-discarded.xml)
- [connection-probes.json](connection-probes.json)
- [connections-probe.audit.test.ts](connections-probe.audit.test.ts)
- [reproduction-tests.json](reproduction-tests.json)
- [settings-screen-probe.audit.test.tsx](settings-screen-probe.audit.test.tsx)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
- [timeline-probe.audit.test.tsx](timeline-probe.audit.test.tsx)
- [usage-navigation-probe.audit.test.tsx](usage-navigation-probe.audit.test.tsx)
- [usage-navigation-test.json](usage-navigation-test.json)
