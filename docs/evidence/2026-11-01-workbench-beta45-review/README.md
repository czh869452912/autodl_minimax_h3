# Beta 45 源码审查证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


2026-11-01；源码 c13c0a09，对比 3673cca9。报告：[再次审查](../../reviews/2026-11-01-workbench-beta45-review.md)。

## 版本与设备边界

emulator-5554 实际安装 com.example.autodlh3.beta，versionCode 83 / 1.5.0-preview.4-beta.44。未覆盖安装 beta.45，以保留原有 QA44-draft 未保存状态。没有强停应用。

- 01-installed-state.png/xml：现有草稿，内容未改动。
- 02-installed-history.png/xml：点击历史后空态。
- 03-installed-preserved.png/xml：点击添加后原输入仍在，最终状态。
- installed-state.png：以上原图等比例并排，已实际查看，明确标注 beta.44。
- capture.cjs：动作前读取最新 UI XML，按实际节点边界点击。

这些图片仅描述当前设备页面，不证明 beta.45 修复或新缺陷。新缺陷的证据是实际组件与真实 SQLite 联合探针。

## 独立回归

targeted-tests.json/.log：6 suites / 109 tests 全通过；在 mobile 目录运行：

```powershell
npx jest src/agent/skills/selectionEvents.integration.test.tsx src/agent/skills/SkillLibraryScreen.test.tsx src/agent/skills/nextRun.test.ts src/agent/threadStore.test.ts src/agent/AgentScreen.test.tsx src/agent/PromptAssistantUi.test.tsx --runInBand
```

typecheck.log：npm run typecheck 通过。verify-skills.log：npm run verify:skills 通过，36 文件内容、哈希和元数据一致。

## 独立探针

ReviewBeta45.probe.test.tsx 运行时暂存 mobile/src/agent/skills，结束后已移回本证据目录。使用实际组件、SkillStore、threadStore、nextRun、runState 与初始化后的真实 SQLite；导航/焦点及原生文件选择用替身。终态通过实际 threadStore.save 写入，没有运行真实模型。

- 旧 pending 读取延迟返回，不能覆盖消费后新结果：通过。
- 一个观察者抛错不破坏已提交受理；未保存空选继续保留并有离开保护：通过。
- completed / failed / cancelled 分别持久化后，原历史仍 queued，但实际 SkillRunScreen 显示正确终态：3 项不良行为复现通过。

最终记录为 probes.json/.log，共 5 项。race-probes.json/.log 为同一文件早期的前 2 项单独运行，不重复计数。复跑时将源文件暂时复制到原路径，再执行 `npx jest src/agent/skills/ReviewBeta45.probe.test.tsx --runInBand`，结束后移出。

部分既有回归输出 React act / react-test-renderer 警告，Jest 退出码 0。没有把测试通过解释成完整设备端到端、无障碍或性能验收。


## 随仓库保留的文件

- [ReviewBeta45.probe.test.tsx](ReviewBeta45.probe.test.tsx)
- [installed-state.png](installed-state.png)
- [probes.json](probes.json)
- [probes.log](probes.log)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
