# 工作台路线图最终验收

日期：2026-11-01。实现切片 21–40，在修复 R1–R6 后顺序推进；每切片独立提交。最终架构见 [设计与迁移](../architecture/agent-video-workbench.md)，各切片改动见 [台账](../reviews/2026-10-31-agent-workbench-progress.md)。

## 自动验证

- `npx jest --runInBand`：313 个文件通过、1 个既有文件跳过；1915 项通过、4 项既有跳过，139.959 秒。首次联合回归暴露的旧“升级绝不 DROP TABLE”测试已更新为迁移事务/备份/外键保护；有数据迁移另由真实 SQLite 测试核验。
- `npx tsc --noEmit`：通过。
- `npm run verify:skills`：36 文件的内容、哈希与 metadata 一致。
- `npm run verify:workflow-releases`：2 个固定工作流发布校验通过。
- `npm run verify:process-recovery`：5 场景、10 个独立进程全部通过，涵盖 pending、unknown、handle、redaction、part。此项为独立 Node 进程/SQLite 故障恢复，不等于 Android OEM 后台测试。
- Android Debug 及 androidTest 构建通过；TimelineRendererInstrumentedTest 设备 4 项通过，含两段真实合成/音轨/字幕/解码、错误哈希与越界拒绝、本地探测/抽帧、ZIP 清单与原件一致性。使用仓库合成样例，无真实模型或付费生成。

证据：[全仓结果](../evidence/2026-11-01-workbench-completion/jest-results.txt)、[设备原生结果](../evidence/2026-10-31-workbench-timeline/package-device-tests.txt)。

## 生命周期与失败覆盖

| 条件 | 证据与结论 |
| --- | --- |
| 失效输入、缺原件、错误 hash、裁剪越界 | 领域真实 SQLite + 原生设备测试拒绝；不创建输出候选 |
| 并发/重复、取消、过期租约、恢复 epoch | 自动测试验证授权/幂等/租约和结果提交栅栏；旧 attempt 不能取消新 attempt |
| 本地合成重建 | 真实 SQLite 重新构造 repository、回收过期租约，新执行仅创建一个候选，旧执行无副作用；不是设备 FFmpeg 断点续算 |
| 存储不足 | 原生预检/运行低空间守卫与失败清理已实现；服务故障注入验证无半成品；未填满用户设备来实测 |
| 模型/媒体请求失败 | UNKNOWN 不自动重发；预算占用不由缺响应自行释放；未实调付费服务 |
| 系统强停、设备重启 | 用户重新打开后才可恢复，强停期间不承诺运行；不推定所有 OEM 行为相同 |

## 未覆盖与明确限制

本轮没有真实模型或媒体生成消费，没有执行真实感知模型检查；不从离线供应商测试推导真实服务质量和账单保证。本地合成验证使用 x86_64 Android 17 模拟器；未覆盖 ARM 手机性能、全部编解码器/OEM、大字体/TalkBack 全路径和持续后台。既有截图不能替代这些验收。

全链条接口、状态、授权和本地执行已实现；真实付费供应商端到端验收仍需具体账户/次数授权后另行执行。向量索引、任意 DAG/供应商热插拔、音视频全维度感知评价与外部 ZIP 自动恢复执行不在本期实现范围。

## Beta 39 界面与设备检查

- `com.example.autodlh3.beta`，versionCode 78；x86_64 构建通过（3m18s）并更新安装成功。
- APK SHA-256：`7ECB74410307393D32D79139E829C95207AC652AF845D3FBBA6A009FDB276AE7`。
- Android 17 / emulator-5554：飞机模式开启后，旧项目与新时间线入口可用；Home→重新前台仍保留时间线页面；force-stop→重新打开→项目页可读，既有 `QA-Workbench-Lead` 仍显示已有采用版本。
- UI 操作坐标来自每一步新鲜 UI 树，检查了最终构建截图。测试后恢复飞机模式原值 0。没有创建/覆盖用户素材或发起生成。
- 此检查验证离线读取、更新迁移与重开，不是正在合成时强杀/重启的设备验收；相应执行重建由真实 SQLite 故障注入和独立进程测试覆盖。没有实测整机重启。
- 证据目录：[最终构建/界面](../evidence/2026-11-01-workbench-completion/)。
