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

## 第五切片：授权账本摘要与工具使用契约

- creative_context 返回有界授权摘要，给出剩余总次数与剩余未知费用次数；排除过期、撤销、旧 epoch、非当前凭据及归档项目授权。
- 非 RELEASED 预留继续占用次数；摘要不替代 dispatch 原子校验，不承诺金额上限。
- Agent 指导同步说明分页、完整镜头读取与诊断边界。
- 验证：budget 十项与 agentScope 七项通过；TypeScript 检查通过。覆盖未知费用占用、释放、过期和撤销。

## 第六切片：镜头焦点与运行快照

- 镜头页新增“交给助手”，携带项目与镜头 ID；助手显示可移除的镜头上下文。
- 用户消息接受事务从数据库校验会话范围，固定镜头 revision、标题与已采用版本绑定，保存在现有 run payload；无新事实表。
- creative_context 返回该运行固定焦点及 stale 状态；页面焦点变化不重写旧 run。重试沿用原 run 的焦点。
- 验证：ProjectShots、submissionCommands、threadStore、agentScope 共 22 项通过；TypeScript 检查通过。覆盖入口参数、重复接受、跨项目拒绝、镜头修改后过期。
- 限制：本切片只有组件与 SQLite 验证，尚无新构建 Android 截图/TalkBack 验收；焦点暂限镜头，未覆盖角色/场景实体。

## 第七切片：授权绑定实际请求

- schema 32 新增不可变授权请求绑定，限制 commandId 与 requestHash；旧授权保持原语义。
- 手动图像/视频确认绑定已准备请求；不同草稿命令或修改后的请求无法使用该授权。绑定授权不计入通用项目可用额度，也不在通用授权摘要中推荐给 Agent。
- 迁移只增加表与触发器；恢复继续依赖既有撤销/epoch 隔离，不自动恢复消费。
- 验证：六个文件 31 项通过，包含历史 schema 升级与全新 schema 一致、恢复隔离、请求变更拒绝和重复预留；TypeScript 检查通过。
- 前六切片扩大回归另有 144 文件通过，868 项通过、2 项跳过（不代表第七切片的全量回归）。
- 尚未完成授权决策的持久续跑事件；本切片只是它的请求范围前置约束。

## 第八切片：草稿卡确认后直接入队

- Agent 成果卡从“授予项目额度后再发继续”改为准备当前草稿、确认固定修订/素材数量/规格，再通过共享确认入口授予请求绑定权限并直接创建持久 Job。
- 确认前后核对项目/数据库，拒绝直接提交计划所属草稿；未确认不提交，不启动额外模型轮次。
- 验证：AgentCreativeCards 与 submissionEntries 八项通过，TypeScript 检查通过。
- 限制：这不是任意 Plan 的持久决策事件。授权落库到 Job 入库间若进程退出，不自动重发；遗留授权仅绑定原命令/hash，15 分钟失效。完整决策持久续跑仍待后续切片。

## 第九切片：项目 Skill 组合

- schema 33 增加项目技能覆盖：同名版本固定、项目排除、恢复全局。项目概览可进入项目技能页；默认全局界面保持兼容。
- run 捕获按可信会话项目解析组合，最多八项；旧 run 使用原快照，项目普通调整不撤销旧运行。全局紧急撤销同时移除项目选用并阻断旧快照。
- 验证：store/runtime/schemaParity/schemaOwnership 共 16 项通过，技能界面和项目对象组件另五项通过；TypeScript 检查通过。
- H06 部分完成：尚无单次运行临时选择、能力 metadata 与样例质量评估。
