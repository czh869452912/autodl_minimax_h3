# Beta 44 独立审查证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


源码 3673cca9；设备 emulator-5554，包 com.example.autodlh3.beta，83 / 1.5.0-preview.4-beta.44。日期 2026-11-01。报告：[工作台审查](../../reviews/2026-11-01-workbench-beta44-review.md)。

## 设备记录

每次动作前重新读取 UI XML，按当前节点边界点击。capture.cjs 保存 PNG 与 XML。截图已打开查看，draft-navigation.png 是本轮原图等比例缩小排列。

| 文件 | 状态 |
| --- | --- |
| 01-current | 初始已存在的未保存警告；选择继续编辑 |
| 02-existing-draft | 原有 QA44-draft 输入 |
| 03-history | 历史即时空态 |
| 04-draft-restored | 从历史一次添加恢复原输入 |
| 05-collapsed | 收起表单后内置技能列表可见 |
| 06-reopened-draft | 再次添加，原内容仍在 |
| 07-leave-guard | 本轮点击返回后的警告 |
| 08-preserved-final | 继续编辑，最终保留原输入 |

没有覆盖、保存或放弃既有草稿；没有强停应用或冷启动。无真实模型和生成请求。

## 独立检查

- targeted-tests.json / .log：7 suites、39 tests 通过。
- integration-tests.json / .log：5 suites、94 tests 通过。
- consumption-probe.json / .log：1 个不良行为探针通过，确认已消费的覆盖仍显示等待消费。不是修复后通过。
- typecheck.log：npm run typecheck 通过。
- verify-skills.log：npm run verify:skills 通过，36 文件一致。

第一组命令（mobile 目录）：

```powershell
npx jest src/agent/skills/SkillRunScreen.test.tsx src/agent/skills/SkillLibraryScreen.test.tsx src/agent/skills/nextRun.test.ts src/agent/skills/store.test.ts src/agent/agentPresentation.test.ts src/ui/ImagePreview.test.tsx src/agent/agentRuntimeAdapter.test.ts --runInBand
```

第二组命令：

```powershell
npx jest src/agent/AgentScreen.test.tsx src/agent/PromptAssistantUi.test.tsx src/agent/threadStore.test.ts src/agent/runtimeIntegration.test.ts src/agent/skills/runtime.test.ts --runInBand
```

探针运行时临时位于 mobile/src/agent/skills/ReviewBeta44.probe.test.tsx；完成后移入本目录，保持产品目录不变。复跑时先将其复制回原路径，再在 mobile 目录执行 `npx jest src/agent/skills/ReviewBeta44.probe.test.tsx --runInBand`，结束后移出。使用真实 SQLite/技能存储/事务消费/组件，只替换导航及原生文件选择能力；没有调用模型。

现有回归日志含 react-test-renderer 弃用及部分 React act 警告，Jest 退出码为 0。报告没有将测试通过等同于设备、无障碍或真实生成端到端通过。


## 随仓库保留的文件

- [04-draft-restored.png](04-draft-restored.png)
- [04-draft-restored.xml](04-draft-restored.xml)
- [05-collapsed.png](05-collapsed.png)
- [05-collapsed.xml](05-collapsed.xml)
- [06-reopened-draft.png](06-reopened-draft.png)
- [06-reopened-draft.xml](06-reopened-draft.xml)
- [07-leave-guard.png](07-leave-guard.png)
- [07-leave-guard.xml](07-leave-guard.xml)
- [ReviewBeta44.probe.test.tsx](ReviewBeta44.probe.test.tsx)
- [consumption-probe.json](consumption-probe.json)
- [consumption-probe.log](consumption-probe.log)
- [draft-navigation.png](draft-navigation.png)
- [integration-tests.json](integration-tests.json)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
