# 综合创作 App 实施记录

基线：[交互与数据设计 v1.3](creative-app-interaction-data-design.md)。2026-10-23 开始实施。整体尚未完成，数据库当前为 v14（捕获阶段，未切换创作写入源）。

## 增量 01：任务与输出引用兼容

已实现：

- jobs/repository.ts 的 workflow_jobs 写入由 INSERT OR REPLACE 改为 ON CONFLICT DO UPDATE，保留身份与原 created_at；内存仓库采用相同创建时间语义。
- jobs/artifactStatements.ts 统一结果快照写入：原位 upsert 保留输出，只删除快照中不再存在的输出。常规仓库及持久化执行器共用，仍处于各自事务内。
- 对结果所属 job 不一致及重复 artifact ID，在执行 SQL 前拒绝。
- 新增真实 SQLite 外键验收：父任务与保留输出更新不删除引用；有引用的输出移除失败后，先前写入、job 状态、事件及任务清理均回滚。

验证：

- npm run typecheck：通过。
- npm test -- --runInBand src/jobs src/workflows/executor src/tasks/repository.test.ts：17 套、206 项通过；默认跳过的跨进程测试另由下列脚本执行。
- npm run verify:process-recovery：5 个场景、10 个独立进程通过（pending、unknown、handle、redaction、part）。这是既有执行器进程恢复验证，不是新设计的旧备份隔离验收。
- git diff --check：通过（Git 提示 Windows 换行转换，不影响检查结果）。

限制：本增量没有新增创作表、切换写入权威、实现账号/授权账本、增加项目页或 NovelAI API。测试子表用于验证 FK 行为，不等同于实际创作迁移已验收。任务删除遇引用时目前按原事务报错回滚；新领域接入时仍需提供“改为归档”的明确交互。

## 后续实施顺序

1. 实现存储写门、变更捕获和可恢复切换；在测试库验证回填与并发删除。
2. 实现文件资源状态、备份 pins/完整包及恢复 epoch 隔离，完成故障注入。
3. 上线项目与独立资产数据/页面、版本选择和独立导出。
4. 实现账号凭据代次、授权账本，接入 NovelAI 与 Agent 执行。

只有对应实现测试通过的条目才能从“设计已回应”提升为“实现已验证”。

## 增量 02：旧媒体变更捕获与投影水位

- v14 原子安装旧媒体 INSERT/UPDATE/DELETE 捕获触发器，保留完整快照和删除事件。
- 实现事务式主键游标回填和 sequence 水位追平，可跨数据库关闭/重开继续。
- 投影只接收当前 epoch 的更高 revision 完整快照，保留删除水位。
- 尚未接好新写入桥时 PRIMARY 切换由数据库触发器拒绝；生产仍走旧媒体事实源。
- 验证：77 项存储测试通过；全量 174 套、1263 项通过，2 项按原条件跳过；类型检查通过。新测试包含中途新增较小主键、更新与删除、重开恢复、乱序事件及事务失败注入。
- 本增量不等于完整写入切换已完成；后续须接入新领域服务和写入桥后再开放切换。
