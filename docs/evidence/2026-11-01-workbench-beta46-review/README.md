# Beta 46 审查证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


2026-11-01；源码 865b57ff，对比 c13c0a09。报告：[再次审查](../../reviews/2026-11-01-workbench-beta46-review.md)。

## 设备

emulator-5554：com.example.autodlh3.beta，83 / 1.5.0-preview.4-beta.44。没有覆盖安装 beta.46，也没有强停或页面跳转；原 QA44-draft 未保存输入保留。

01-device-current.png/xml 为本轮捕获的原页面。device-state-thumb.png 为等比例缩小图；原图和缩小图均已打开检查。仅记录已有状态，不能证明 beta.46 的视觉、交互或新缺陷。

## 既有回归

targeted-tests.json/.log：7 suites、69 tests 通过，mobile 目录执行：

```powershell
npx jest src/agent/skills/runEvents.integration.test.tsx src/agent/skills/selectionEvents.integration.test.tsx src/agent/skills/SkillLibraryScreen.test.tsx src/agent/skills/SkillRunScreen.test.tsx src/agent/threadStore.test.ts src/agent/runtimeStore.test.ts src/agent/runtimeIntegration.test.ts --runInBand
```

typecheck.log：npm run typecheck 通过。verify-skills.log：npm run verify:skills 通过，36 文件一致。

## 独立探针

ReviewBeta46.probe.test.tsx 原运行位置 mobile/src/agent/skills，结束后移回本目录。复跑需暂时复制回原路径，在 mobile 目录执行 `npx jest src/agent/skills/ReviewBeta46.probe.test.tsx --runInBand`，结束后移出。

probes.json/.log 最终 5 项通过：

- completed/failed/cancelled 三个终态的实际持久化：原详情仍 queued，缺后续消息；切全部消息无效，重开恢复。3 项不良行为复现。
- recoverInterruptedRuns 的实际事务与列表通知：正常，重复恢复不重复通知。1 项正向验证。
- 实际 runtimeRegistry + H3AgUiAgent + 暂停/放行的离线测试图 + 实际 SQLite：答复与 completed 已持久化，原详情仍 running 且无最终答复。1 项不良行为复现。

自定义测试图没有外部网络或模型，绕过完整 SkillRunPreparer，显式调用产品 SkillStore.capture。最初测试搭建遗漏该快照，造成历史无法找到该测试运行；补齐后最终运行通过，没有修改产品实现。导航/焦点与原生文件选择使用替身；不能声称 Android 端到端通过。

日志含 SQLite experimental / 部分 React 测试警告；最终 Jest 退出码 0。不要把 4 项不良行为复现的通过解释成 E1 已修复，也不要与既有 69 项正向回归合并宣称产品全通过。


## 随仓库保留的文件

- [ReviewBeta46.probe.test.tsx](ReviewBeta46.probe.test.tsx)
- [device-state-thumb.png](device-state-thumb.png)
- [probes.json](probes.json)
- [probes.log](probes.log)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
