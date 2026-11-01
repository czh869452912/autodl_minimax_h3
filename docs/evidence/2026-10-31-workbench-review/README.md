# 20 切片复审证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


基线：`13e6be6f361e8c1b207484c9eeca956e9f6504ce..b19c9133`，2026-10-31。

- targeted-tests.log/json：本轮 10 个相关测试文件，58 项通过。
- typecheck.log：本轮 `npm run typecheck`，退出码 0。
- repro-tests.log/json：本轮两个临时探针文件，6 项复现断言通过。断言描述现有有问题行为，不是正确行为验收。
- workbenchReview.repro.test.ts：真实 SQLite；计划专属意图的 grant 可被无关请求预留、设定参考可被移出/回收且 usage 无引用、绑定满 8 项无解除命令、纯排序使计划被阻断。
- workbenchReview.ui-repro.test.tsx：组件状态；采用导致未保存文本被清空、当前采用版本落在最近20项之外导致绑定入口消失。不是设备 UI 验收。

没有真实网络、LLM 或生成消费。测试数据库为隔离测试库，组件使用模拟读写。

探针原运行位置：`mobile/src/creative/`，测试完成后移到本目录，产品源码未修改。若要复跑，先确认目标路径不存在，再将两文件复制到该目录；在 mobile 中执行下方命令。复跑后将仅本次复制的探针移回独立证据目录，避免将“期望现有错误存在”的断言误纳入正常回归。

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/creative/workbenchReview.repro.test.ts src/creative/workbenchReview.ui-repro.test.tsx
```

相关既有测试命令：

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/creative/submissionEntries.test.ts src/creative/semanticResources.test.ts src/creative/plans.test.ts src/creative/agentScope.test.ts src/creative/budget.test.ts src/agent/runSpecification.test.ts src/agent/skills/store.test.ts src/agent/skills/runtime.test.ts src/creative/shotQuality.test.ts src/creative/SemanticResourcesScreen.test.tsx
```

第一次探针运行中排序用例的测试准备曾因虚构授权 ID 触发外键约束；修正为创建真实本地 grant 后重新执行。最终日志/JSON 保存的是修正后运行。没有将测试准备错误当成产品问题。


## 随仓库保留的文件

- [repro-tests.json](repro-tests.json)
- [repro-tests.log](repro-tests.log)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
- [workbenchReview.repro.test.ts](workbenchReview.repro.test.ts)
- [workbenchReview.ui-repro.test.tsx](workbenchReview.ui-repro.test.tsx)
