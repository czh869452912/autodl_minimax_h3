# 工作台改进台账

## 第一切片：统一提交装配

基线：13e6be6。2026-10-31 实施，未提交 Git commit。

- H01：已修复代码并通过离线入口回归。新增 preparedSubmission.ts，手动视频、手动图像、Agent、计划共用完整参数装配，保留音频、图片、版本引用和 sourceManifest。授权与 origin/planStep 仍由各入口提供。
- H02：仍为次数约束、允许有限未知费用；maximum:null 不变。本切片没有增加金额硬上限，不把估价视为保证。
- H03–H11：待后续实现/验证，不能由本切片推定完成。

新增 submissionEntries.test.ts 调用真实手动确认、LangChain generation_submit 与计划恢复入口，检查带音频和无音频时的提交边界。准备结果和最终提交被模拟，计划调度回调被模拟；它证明入口装配，不证明端到端供应商生成。现有 videoSubmission、budget、plans 等真实 SQLite 测试继续检查事务、输入、幂等和恢复行为。

验证：7 个测试文件全部通过，60 项通过、1 项既有跳过；覆盖 submissionEntries、novelAiRuntime、videoRuntime、videoSubmission、agentScope、plans、budget。没有调用真实模型或付费生成，没有 Android 设备验收。

下一切片：定义焦点上下文与 ReadyState，在现有镜头/决策/计划上打通指定对象的授权续跑。保留 Android 内编排边界，禁止桌面及远端 Worker。

## 第二切片：资源按需读取

- H04 部分完成：asset_search 使用数据库游标分页，每页最多 30 个资产、每资产 5 个版本摘要；新增 asset_versions 按版本号继续读取，每页最多 20 个版本。
- 所有读取沿用真实会话项目范围，并拒绝跨项目和回收站对象。原有 UI 全量 versions 调用保持兼容。
- 验证：agentScope 六项通过，包括 26 版本无重复无遗漏读取及跨项目拒绝；TypeScript 检查通过。
- 未完成：镜头上下文分页、全文索引、对象焦点与 ReadyState。

## 第三切片：无消费的草稿就绪诊断

- 新增 readDraftReadiness，接入 Agent draft_get：返回项目/草稿状态、原件可用性、账号绑定、工作流版本等结构化原因和下一动作。
- 本地检查通过只表示 needs_preparation；明确 executionAllowed=false，仍需实际参数、原件、凭据和提交授权检查。没有读取密钥或发送探测请求。
- H05 部分完成；不是任意 Provider 接入，不等于完整预检或外发授权。
- 验证：draftReadiness 与 agentScope 共七项通过；TypeScript 检查通过。测试确认诊断不创建 Job、授权或预算预留。

## 第四切片：镜头上下文分页与按对象读取

- creative_context 每页返回 30 个镜头和游标，描述限 500 字并标记截断；新增 shot_get 获取完整描述、revision 和采用版本。
- UI 的原有镜头列表保持兼容；分页针对 Agent 工具，不改变项目排序。
- 验证：agentScope 和 plans 共 25 项通过，包括 32 镜头分页无重复、完整读取与范围拒绝；TypeScript 检查通过。
- H04 仍未包含全文索引、授权剩余量；H10 的界面焦点传递尚待实现。
