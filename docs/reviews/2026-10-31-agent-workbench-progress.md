# 工作台改进台账

## 第一切片：统一提交装配

基线：13e6be6。2026-10-31 实施，未提交 Git commit。

- H01：已修复代码并通过离线入口回归。新增 preparedSubmission.ts，手动视频、手动图像、Agent、计划共用完整参数装配，保留音频、图片、版本引用和 sourceManifest。授权与 origin/planStep 仍由各入口提供。
- H02：仍为次数约束、允许有限未知费用；maximum:null 不变。本切片没有增加金额硬上限，不把估价视为保证。
- H03–H11：待后续实现/验证，不能由本切片推定完成。

新增 submissionEntries.test.ts 调用真实手动确认、LangChain generation_submit 与计划恢复入口，检查带音频和无音频时的提交边界。准备结果和最终提交被模拟，计划调度回调被模拟；它证明入口装配，不证明端到端供应商生成。现有 videoSubmission、budget、plans 等真实 SQLite 测试继续检查事务、输入、幂等和恢复行为。

验证：7 个测试文件全部通过，60 项通过、1 项既有跳过；覆盖 submissionEntries、novelAiRuntime、videoRuntime、videoSubmission、agentScope、plans、budget。没有调用真实模型或付费生成，没有 Android 设备验收。

下一切片：定义焦点上下文与 ReadyState，在现有镜头/决策/计划上打通指定对象的授权续跑。保留 Android 内编排边界，禁止桌面及远端 Worker。
