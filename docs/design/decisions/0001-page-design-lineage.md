# D001：在仓库维护页面目录、任务流程和设计历史

日期：2026-11-01。状态：文档体系已建立；产品导航重组为 proposed，待原型与任务验证。影响范围：Android APK 页面与交互设计，不改变执行边界。

## 背景

连续功能切片已经补齐大量正确能力和数据语义；既有 `docs/reviews` 是按时间积累的审查，难回答“这个页面现在应该是什么”。路由文件也无法表达抽屉、设置 section、项目子视图、助手工具层。继续增加入口会放大页面负担。

## 决策

采用一个稳定 ID 的机器可读目录，生成逐页报告；Markdown/Mermaid 记录目标 IA、任务流、状态和返回合同；每次结构变化附设计决策与版本截图。研究来源与本项目证据分级。行业依据见 research.md 的 R1–R6；这一 JSON schema 为项目自定义。

## 考虑过的方案

- 只画一张 Figma/白板地图：表达便捷，但代码漂移和弹层状态不可自动检查，单图容易混淆从属与跳转。
- 只维护 Expo Router 文件树：覆盖真实路径，但漏掉工作区子视图和状态，也不说明为何变更。
- 每轮再写一份日期审计：保留历史有用，但不能成为当前目录的唯一真相。
- 立即引入完整 Storybook/设计文档平台：可补组件状态，但不是页面谱系本身；当前先避免工具建设压过任务组织。

## 后果与边界

目录和源码同 PR 更新，路由增删可校验；对每个组件状态和实际导航仍需人工/设备审查。无法自动从 TypeScript 推导所有条件权限和业务回流。未验证设计不可标为已完成。

## 目标迁移谱系（均为提案）

| 现有稳定 ID | 演进关系 | 保留 / 兼容方式 | 验证依据 |
| --- | --- | --- | --- |
| project-overview | 提取资料、交付、权限、能力管理入口到相应层 | 概览主任务改为进展与下一步；旧链接仍精确定位 | F2/F5/F7 |
| project-shots + shot-review + request-setup | 镜头列表瘦身；成果审阅演进为镜头工作区；准备请求成为输入步骤 | 保留 shotId / projectId / revision 与旧路径 | F2 |
| skills + skill-quick + skill-add + skill-history | 同一组件承载的多任务分表面；历史归助手运行 | 不复制技能记录或改变不可变版本/撤销规则 | F4 |
| settings-legacy + settings | 双宿主向统一 utility shell 收敛 | 旧 section / surface / draftId 链接兼容 | F1/F5 |
| connections + settings-assistant + capabilities | 统一发现入口和用途摘要，保留连接与能力不同模型 | 原连接明确来源；不迁移密钥到不安全存储 | F5 |
| project-assets + semantic-library | 项目资料内分媒体/设定，绑定进入选择器 | 相同 asset/version/entity 身份，不复制原件 | F2/F6 |
| timeline | 工程列表 / 编辑 / 合成 / 导出分层为交付 | 旧 timelineId 和本机渲染记录可定位 | F7 |
| legacy-gallery + legacy-video + draft-list | 兼容 / 迁移入口，不再作为第二套主导航 | 迁移可中断；保留旧记录直到验证 | F1/F7 |
| asset-detail + media-review | 检查从具体版本进入，项目通用工具入口保留兼容 | 固定 versionId，检查不自动外发、不自动采用 | F6 |

后续实现应另写 D002…，注明沿用/替代本提案哪部分、变更原因、采样与未覆盖项。一个切片实现了部分 UI，不代表该行迁移全完成。
