# Beta 45 审查问题修复

2026-11-01；基线 c13c0a09。确认 R1 / P2 成立，修复提交 5da81124。

## R1：历史跟随持久运行状态

新增独立 runEvents，区分 accepted 与 status-changed；单次覆盖保存/取消仍使用 skillSelectionEvents。threadStore.save 在写事务内比对受影响运行的已持久状态，只在状态变化且事务提交成功后通知；同状态 token/消息更新不触发面板全量读取。中断恢复事务提交后也通知受影响会话。

面板订阅运行事件；当前会话过滤，全范围历史及独立历史页可接收跨会话变化并按原查询范围重读。点击打开历史主动刷新，覆盖其他持久化入口导致的缓存陈旧。保留读取代次保护、未保存 once 编辑和 historyAfter 分页游标，不自动跳回首页。

## 验证

新增 6 项真实 SQLite 联合回归，采用实际面板、threadStore、SkillStore、endPromptRun 和 SkillRunScreen：

- completed / failed / cancelled 三种终态：保持历史打开，保存后即时更新，和新打开详情一致；再次打开历史仍正确。
- SQLite trigger 拒绝终态保存：无通知、历史保持 queued；解除拒绝后保存成功才更新；同状态重复保存和消息更新不追加状态通知。
- 不经过通知入口的持久记录变化：打开历史时重新读取，未保存编辑保留。
- 22 条运行翻至第二页：终态刷新保留页内记录、游标及未保存编辑。

定向 4 个套件 / 30 项通过，包含既有单次消费、Composer 桥接和 threadStore 回归。测试为组件 + 真实 SQLite，导航使用测试替身，终态通过产品保存入口写入；不冒充真实模型执行或设备端到端验收。

## 发布

全量 322 个套件、1974 项通过；1 个套件、4 项按原配置跳过（mobile/beta46-full.log）。TypeScript 检查通过，内置技能包 36 文件校验通过。

- Beta46 / versionCode 85，包名 com.example.autodlh3.beta；ARM64 / ARMv7。
- APK：build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.46-android.apk。
- apksigner 签名校验及 zipalign 16 KB 对齐检查通过，签名与原测试版一致。
- SHA-256：D026F1C7C253891C01AB19DBCC7156BA565FC3225356F21BEA4F4FAE847DAA47。

保留设备 QA44-draft 未保存输入，不强停、不覆盖安装。没有真实模型或付费生成调用，没有增加桌面执行端、远端 Worker 或改变外发授权边界。
