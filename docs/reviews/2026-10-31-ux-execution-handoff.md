# UX/UI 审计执行交接包

基线：`5185fe2099834d4848befd70ce20dc5bb0babfcb`，2026-10-31，Android 1.5.0-preview.4/code70。本包是待实施方案，没有改产品代码。

先读 [主审计](2026-10-31-full-product-ux-audit.md)，再按下列任务实施。原始截图、UI 树、当前处理器快照在 [离线证据浏览器](../evidence/2026-10-31-full-ux-audit/evidence.html)、[逐按钮台账](../evidence/2026-10-31-full-ux-audit/ui-controls.md)、[跳转轨迹](../evidence/2026-10-31-full-ux-audit/navigation-trace.md)。这些资料足够理解与定位问题；修复仍要进行真实回归。

## 不应回退的现状

- 保留创作、助手、项目、素材四主入口；当前任务入口采用收件箱＋全部任务。
- 保留不可变版本、显式采用、精确结果校验、未知任务先核查、消费幂等与恢复隔离。
- 保留 FlatList 与版本分页；不能为了界面整合重新一次加载全部版本。
- 图片 `/image-draft/[id]` 与视频 `/creative-draft/[id]` 的宿主不同；后者直接渲染 VideoDraftScreen。
- `/creative-shot/[id]` 当前是视频成果审阅，不是已完成的通用镜头编辑器。
- `useFallbackBack` 是无历史时兜底；不要全局改为 replace。`returnToProject` 已处理项目/镜头/计划来源，应增量完善。
- 本地事实不迁到远端；画布、角色设定、3D 只是后续扩展，不在本轮最小修复中建立第二套素材系统。

## 执行任务

### A1 · 镜头阶段动作稳定化（F01）

证据：19→22→57；58→59→60→61 证明已有的选图、采用与视频草稿链路可用。

文件：`mobile/src/creative/ProjectShots.tsx`、`ProjectOverview.tsx`、`story.ts`、`drafts.ts`，相关既有测试。

把“成果阶段”和“可继续草稿”分开投影。未采用图片时，选已有图/制作参考图保持直接可见；图片草稿另列“继续图片草稿”，显示更新时间。已采用图片后主操作为制作视频；已有视频草稿可继续，但不得遮蔽换图、审阅候选。文件缺失应是“恢复原件”，不伪装为未制作。

验收：空镜头→开图片草稿→不生成返回→选项目已有图→采用 v1→制作视频；分别覆盖有两个编辑草稿、已提交草稿、图片采用但原件缺失、取消选材。采用必须仍由服务命令完成并受 revision 约束，不能在渲染中写入。

### A2 · 空选择器有闭环（F02；依赖 A1 的返回约定）

文件：`CreativeAssetPicker.tsx`、`fileImport.ts`、`openCreativeRequest.ts`、`mobile/src/navigation/creativeNavigation.ts`。

区分“项目暂无可用版本”“当前筛选无匹配”“全库为空”。分别给切全库/清筛选/设备导入/制作参考图；空态保留目标镜头。导入返回同一选择任务并定位新版本，等待显式确认，不直接采用。生成路径返回时显示新候选，不自动采用。

验收：项目空但全局有图、全局全空、相册取消/拒绝权限、导入失败、多个版本、返回期间目标镜头被修改/删除。截图21作为前态，不能以本轮已有86.png仅测非空路径替代。

### A3 · 生成就绪条件一致（F04）

文件：`ImageDraftScreen.tsx`、`VideoDraftScreen.tsx`、`CreativeAccountPanel.tsx`、`accountRuntime.ts`、`accounts.ts`、`mobile/app/(tabs)/settings.tsx`。

统一交互层 ReadyState，并保留各 provider 的真实协议/费用差异。显示缺描述、缺连接、核查用量、可生成、提交中；缺账号时操作应说明“连接哪个服务”。账号配置成功后回原 draft/工具/参数，不新建副本。不要把缓存余额当实时预算保证。

验收：图片/视频均测未连接、已连接未验证、验证失败、可生成、断网、重复点、恢复未知任务；未授权时不发生成请求。

### B1 · 单一主动表面与返回契约（F03/F14）

证据：53→54→55，55系统返回→56。文件：`CreativeWorkspace.tsx`、`ImageProcessingSheet.tsx`、`PromptAssistSheet.tsx`、`ImageEditorDrawer.tsx`、`mobile/src/navigation/creativeNavigation.ts`、`useFallbackBack.ts`。

将菜单、加入项目、处理工具等互斥操作建为带对象参数的判别状态，而非并存 boolean。转入处理工具先退出素材菜单；保留asset/version，不跨到默认版本。键盘、局部工具、全屏任务、来源对象按顺序处理返回。设置保留 section/requestId 消费，补来源锚点，保存与返回分开。

验收：菜单→加入项目→增强/放大，不得同时显示两层可交互 Sheet；系统返回/顶部关闭/遮罩点按结果一致；编辑中的输入有既有 leave guard；冷链接无backstack有可靠兜底；同一设置分区连续直达两次均生效。关闭面板不能停止无关助手运行。

### B2 · 命中区、名称和视觉层级（F08）

文件：`WorkbenchUI.tsx`、`LibraryToolbar.tsx`、`mobile/src/navigation/PrimaryNavigation.tsx`、各工作台 header。

以48dp不重叠命中区为设计目标，图标绘制尺寸可小；减少记录/任务等近似图标，必要时加短文本。处理底部系统栏、安全区、键盘与大字体。现有 hitSlop 不能直接删掉，也不能当作已验收命中区。

验收：窄屏、字体1.0/1.3/2.0、读屏标签/焦点顺序、边界触摸、横屏/宽屏；当前报告只识别风险，没有完成这些测试。

### C1 · 最近工作投影和可读活动（F05/F07）

文件：`CreativeHome.tsx`、`creationRecords.ts`、`mobile/app/creative-drafts.tsx`、`ProjectActivityPanel.tsx`、`projectActivity.ts`、`CreativeResults.tsx`。

新增摘要查询而非新建另一套记录事实。统一行字段：标题fallback、项目/镜头、媒体类型、草稿/任务/候选状态、更新时间、缩略图、稳定open target。任务列表保留执行事实；旧作品独立标记兼容身份。活动命令映射为自然语言，诊断详情保留原值。

验收：截图41两个同名空草稿能区分；同名项目、空prompt、已归档项目、删除来源、单任务多候选、结果失效；从草稿/任务/助手入口打开同一结果不替换具体版本。

### C2 · 封面与导出（F06/F09）

文件：`CreativeWorkspace.tsx`、`CreativeAssetPicker.tsx`、`service.ts`、`enqueueVersionExport.ts`、`exportExecution.ts`。

项目设置提供“选择封面”，服务层一次命令确保引用与固定版本；取消不写入。归并详情导出/保存相册的命名，未来分享单独设计。导出状态来自 delivery，不能用素材可见性猜测成功。

验收：更换封面/取消/版本删除保护；保存到手机成功、拒权、失败重试、DELIVERY_UNKNOWN核查；导出不改变镜头采用/项目默认版本。

### D1 · 技能作为完整编辑任务（F10）

文件：`mobile/app/agent-skills.tsx`、`agent-skill-extract.tsx`、`mobile/src/agent` 内技能组件及相应存储服务（以 source-controls.json 定位）。

助手快速面板仅选用/查看能力；导入、编辑、提炼进入全屏。先用途与适用范围，格式放高级。保留不可变 skill version 和每次run快照；停用、撤销、保存、启用的执行含义不能被文案合并。

验收：空技能、导入失败、同名版本、运行中停用、撤销/重启；提炼发送前看到实际证据，保存不等于启用。当前08/09/68/70仅覆盖空态和展开，不是安装成功证据。

### D2 · 计划授权与空间管理（F11/F12/F13）

文件：`ProjectPlans.tsx`、`plans.ts`、`planDispatch.ts`、`planRunner.ts`、`budget.ts`、`mobile/app/(tabs)/settings.tsx`、`mobile/src/storage/backup.ts`、`restoreIsolation.ts`。

空项目先补镜头与参考图，不先显示编排字段。授权明确输入版本、规格、次数、时间、估价与币种，未知费用不得伪造精确上限；继续保留一次/15分钟/未知任务防重发。维护页拆日常空间、完整备份、高级数据库备份、危险区；说明数据库备份不等于媒体备份。

验收：授权失效、报价变更、未知任务、重复点击、重启；数据库/完整备份、损坏包、缺媒体、旧schema恢复均隔离执行，不自动恢复消费权。不要在真实用户库跑清除测试。

### E · 资源关系与性能（C1之后；画布/3D之前）

当前事实表位于 `mobile/src/storage/schema.ts`：`creative_projects`、`creative_assets`、`creative_asset_versions`、`creative_project_assets`、`creative_shots`、`creative_shot_assets`、`creative_generation_drafts`、`workflow_jobs`、`creative_file_resources`、`creative_recovery_sources`、`creative_deliveries`、`artifact_blobs`、`artifact_blob_refs`、命令/授权/计划表。具体字段以基线源码为准；主报告ER图是逻辑模型。

实施顺序：

1. `StageSummary`/`RecentWorkItem`只读投影：从采用、草稿、任务、版本和健康状态批量查询，定义分页游标与失效revision。
2. `UsageGraph`：覆盖项目固定/默认引用、镜头采用、封面、草稿输入、任务冻结输入；删除检查继续落服务事务，不仅UI提示。
3. `ResourceHealth`/`DeliverySummary`：复用fileResources/export状态；不要把缺原件改成“生成失败”或自动重生成。
4. 对象事件/页面focus/AppState控制刷新；保留虚拟列表。当前2–3秒轮询只是源码风险，先量化。
5. 角色/场景/道具先增用途关系；画布仅存引用/布局；3D文档、场景版本、取景图不同身份，任务固定取景版本。

若需要schema迁移：补现有引用→回填→审计孤立/缺文件/跨版本引用→切新投影，保留旧读路径；不在UI提交期间扫描全库。备份manifest与恢复隔离同步升级，回滚不得丢已采用版本。新增缓存必须可重建。

规模验收：100/1000/10000版本，重复导入、缺Blob、多项目共用、多轮结果、长prompt、后台恢复；记录列表首屏/选材响应、帧与内存。不要将本轮无性能测量写成“已优化”。

## 必补验证矩阵

| 范围 | 本轮证据 | 后续必补 |
| --- | --- | --- |
| 本地项目/镜头/选图/采用/视频草稿 | 实际完成 | 修复前后同路径，新增多版本/跨项目/并发revision |
| 生成/对话/授权 | 入口、源码、未连接状态 | 受控mock先行；真实服务需可用账号和明确消费范围 |
| 任务与精确结果 | 空队列、缺失链接 | 成功/失败/UNKNOWN/下载失败/多候选；指定版本不能降级替换 |
| 导出/恢复/删除 | 入口、源码 | 隔离测试数据，权限失败/结果未知/损坏恢复/引用保护 |
| 文本/音频/PDF/视频媒体 | 静态分支 | 有效媒体加载、不可读、离线恢复与解码；不是只验证图片 |
| 技能 | 空态/导入入口/提炼初态 | 安装、版本、运行快照、撤销、提炼保存与启用 |
| 可访问性/布局 | 截图和bounds风险 | TalkBack、大字体、窄屏、键盘、横屏与触控边界 |
| 冷恢复/性能 | 未量化 | 杀进程重启、无backstack、过期来源、后台任务、大库基准 |

## 本次保留的审计对象与环境

- 模拟器 `AutoDL_Keyboard_QA_20261025 / emulator-5554`；包 `com.example.autodlh3`。最后停在独立技能空态（70），不是新增产品页面。
- 项目 `UX-AUDIT-1031`、镜头 `AUDIT-Shot-01`、图片及视频审计草稿保留；`86.png` 已入素材、加入该项目并采用为镜头图片v1。该输入是已有测试截图，不是本轮生成图。
- 原独立视频草稿prompt为 `keyboard`。本次导入时临时增加的参考图已通过UI移除，64显示恢复0/9；不声称数据库字节级恢复或更新时间未变。
- `/sdcard/Download/UX-AUDIT-reference.webp` 为本次复制的仓库测试文件，媒体扫描过但未选用。不要误当当前86.png来源。
- 原有 `KeyboardQA` 项目、助手草稿、掩码密钥、假LLM地址没有本次主动改配或发送。本次没有真实模型调用、付费生成、清除、覆盖恢复或删除原有对象。
- 不建议为了“清理审计”直接删底层文件/数据库；若后续需要移除测试对象，应按引用关系从UI或服务命令操作。

## 完成定义

每个修复提交附：问题ID、before证据编号、修改后的流程截图、重要状态回归、已知限制。涉及服务/资源生命周期时跑相关既有测试并补有意义的边界测试；仅文案/间距不要堆实现镜像测试。未覆盖项继续标未覆盖，不能用静态762条交互清单当作全按钮通过率。
