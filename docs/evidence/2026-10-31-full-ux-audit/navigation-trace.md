# 导航与操作轨迹

T为操作记录，数字为截图编号。含“via”的行有未单独截图的中间动作，只证明此路径终态可达，不表示来源截图内存在所有列出的按钮。未执行按钮见ui-controls.md；不能将表中没有的操作标为通过。

| ID | 起点 | 动作/中间路径 | 终点 | 类别 | 本次结果 |
| --- | --- | --- | --- | --- | --- |
| T001 | [03 创作：独立视频草稿](03-create.png) | 图片 | [04 创作：图片空画布](04-image.png) | 模式切换 | 已到图片工作台 |
| T002 | [04 创作：图片空画布](04-image.png) | 生成设置 | [05 图片生成设置抽屉](05-image-settings.png) | 局部表面 | 已打开参数抽屉 |
| T003 | [05 图片生成设置抽屉](05-image-settings.png) | 关闭；via 底栏助手 | [06 助手首页](06-agent.png) | 组合跳转 | 已到助手；保留图片输入 |
| T004 | [06 助手首页](06-agent.png) | 助手菜单 | [07 助手菜单](07-agent-menu.png) | 局部菜单 | 已打开菜单 |
| T005 | [07 助手菜单](07-agent-menu.png) | 技能管理 | [08 内嵌技能面板](08-skills.png) | 局部表面 | 内嵌技能面板 |
| T006 | [08 内嵌技能面板](08-skills.png) | 添加技能 | [09 技能导入展开](09-skills-import.png) | 展开 | 导入选项可见，未安装 |
| T007 | [09 技能导入展开](09-skills-import.png) | 关闭技能；via 项目 | [10 项目列表：原KeyboardQA](10-projects.png) | 组合跳转 | 已到项目列表 |
| T008 | [10 项目列表：原KeyboardQA](10-projects.png) | KeyboardQA | [11 项目详情：空镜头页](11-project-detail.png) | 项目卡 | 已到项目镜头页 |
| T009 | [11 项目详情：空镜头页](11-project-detail.png) | 概览 | [12 项目概览](12-project-overview.png) | 页签 | 概览可达 |
| T010 | [12 项目概览](12-project-overview.png) | 计划 | [13 项目计划空态](13-project-plans.png) | 页签 | 计划空态可达 |
| T011 | [13 项目计划空态](13-project-plans.png) | 活动 | [14 项目活动](14-project-activity.png) | 页签 | 活动可达 |
| T012 | [14 项目活动](14-project-activity.png) | 项目设置 | [15 项目设置内联展开](15-project-settings.png) | 内联展开 | 项目设置内容展开 |
| T013 | [15 项目设置内联展开](15-project-settings.png) | 返回；via 新建项目 | [16 新建项目表单](16-new-project.png) | 组合跳转 | 新建表单可见 |
| T014 | [16 新建项目表单](16-new-project.png) | 填写UX-AUDIT-1031并创建 | [17 已创建UX-AUDIT-1031](17-audit-project.png) | 本地写入 | 创建完成 |
| T015 | [17 已创建UX-AUDIT-1031](17-audit-project.png) | 添加镜头 | [18 添加镜头表单](18-shot-edit.png) | 编辑表面 | 镜头编辑可达 |
| T016 | [18 添加镜头表单](18-shot-edit.png) | 填写AUDIT-Shot-01并保存 | [19 已创建AUDIT-Shot-01](19-shot.png) | 本地写入 | 镜头创建完成 |
| T017 | [19 已创建AUDIT-Shot-01](19-shot.png) | 更多操作 | [20 镜头更多操作](20-shot-actions.png) | 局部菜单 | 镜头动作展开 |
| T018 | [20 镜头更多操作](20-shot-actions.png) | 选定图片 | [21 空图片版本选择器](21-shot-picker.png) | 选择任务 | 空版本选择器 |
| T019 | [21 空图片版本选择器](21-shot-picker.png) | 取消；via 制作新的参考图 | [22 镜头来源的图片草稿](22-shot-image.png) | 组合跳转 | 项目图片草稿可达，未生成 |
| T020 | [22 镜头来源的图片草稿](22-shot-image.png) | 返回；via 素材 | [23 全局素材空态](23-library.png) | 组合跳转 | 素材空库；镜头草稿已保留 |
| T021 | [23 全局素材空态](23-library.png) | 导入（首次目标匹配失败后重新定位） | [25 素材导入面板：仅截图有效](25-library-import.png) | 局部表面 | 导入截图可见，树无效；未从此面板导入 |
| T022 | [23 全局素材空态](23-library.png) | via 关闭导入、素材管理 | [28 素材管理菜单](28-library-menu.png) | 组合跳转 | 管理菜单可达 |
| T023 | [28 素材管理菜单](28-library-menu.png) | 存储与清理 | [29 存储与数据管理](29-storage.png) | 直达设置 | 存储分区可达；返回来源另已观察 |
| T024 | [29 存储与数据管理](29-storage.png) | 返回来源；via 创作、任务入口 | [30 最近任务浮层](30-tasks.png) | 组合跳转 | 最近任务浮层可达 |
| T025 | [30 最近任务浮层](30-tasks.png) | 全部任务 | [32 全部任务空队列](32-all-tasks.png) | 队列 | 任务页可达 |
| T026 | [32 全部任务空队列](32-all-tasks.png) | via 设置入口 | [33 设置分类](33-settings.png) | 组合跳转 | 设置分类可达 |
| T027 | [33 设置分类](33-settings.png) | 助手模型 | [34 助手模型设置](34-assistant-settings.png) | 设置分区 | 模型字段可见；未保存 |
| T028 | [34 助手模型设置](34-assistant-settings.png) | 返回分类；via 工作流 | [35 工作流设置](35-workflows.png) | 组合跳转 | 工作流设置可达；未同步 |
| T029 | [35 工作流设置](35-workflows.png) | 返回分类；via 视频播放 | [36 视频播放设置](36-playback.png) | 组合跳转 | 播放设置可达；未改解码 |
| T030 | [36 视频播放设置](36-playback.png) | 返回分类；via 显示与诊断 | [37 显示与诊断设置](37-display.png) | 组合跳转 | 显示设置可达；未改开关 |
| T031 | [37 显示与诊断设置](37-display.png) | via 创作账号 | [38 创作账号面板](38-accounts.png) | 组合跳转 | 创作账号面板可达；未连接 |
| T032 | [38 创作账号面板](38-accounts.png) | via 素材、管理、创作草稿 | [41 创作草稿列表](41-drafts.png) | 组合跳转 | 草稿列表可达 |
| T033 | [41 创作草稿列表](41-drafts.png) | 返回；via 历史作品 | [42 旧历史作品空态](42-gallery.png) | 组合跳转 | 旧作品空态可达 |
| T034 | [42 旧历史作品空态](42-gallery.png) | via 创作、创作记录 | [43 创作记录浮层](43-creation-records.png) | 组合跳转 | 创作记录可达 |
| T035 | [43 创作记录浮层](43-creation-records.png) | 关闭；via 视频、添加参考图 | [44 添加视频参考图来源弹窗](44-video-reference.png) | 组合跳转 | 来源弹窗可见 |
| T036 | [44 添加视频参考图来源弹窗](44-video-reference.png) | 从设备选择 | [45 Android系统相册选择器](45-device-picker.png) | 系统输入 | 系统相册可达 |
| T037 | [45 Android系统相册选择器](45-device-picker.png) | via 重新观察、选择已有图 | [47 系统相册已选一图](47-picker-selected.png) | 系统输入 | 一项已选；具体格子由新树bounds定位 |
| T038 | [47 系统相册已选一图](47-picker-selected.png) | Done | [48 视频草稿带一张参考图](48-video-with-reference.png) | 系统返回 | 回原视频草稿，参考图1/9 |
| T039 | [48 视频草稿带一张参考图](48-video-with-reference.png) | 素材 | [49 素材库出现导入项86.png](49-library-with-asset.png) | 主导航 | 导入项自动归档可见 |
| T040 | [49 素材库出现导入项86.png](49-library-with-asset.png) | 86.png素材卡 | [50 内嵌素材详情v1](50-asset-detail.png) | 对象检查器 | 具体版本v1详情 |
| T041 | [50 内嵌素材详情v1](50-asset-detail.png) | 素材操作 | [52 素材操作菜单](52-asset-menu.png) | 局部菜单 | 操作菜单可见；未执行导出 |
| T042 | [52 素材操作菜单](52-asset-menu.png) | 关闭；via 加入项目 | [53 加入项目内嵌区域](53-asset-link.png) | 组合跳转 | 加入项目区域展开 |
| T043 | [53 加入项目内嵌区域](53-asset-link.png) | 加入UX-AUDIT-1031 | [54 已加入审计项目](54-linked.png) | 本地写入 | 项目引用建立；非镜头采用 |
| T044 | [54 已加入审计项目](54-linked.png) | via 素材操作、增强/放大 | [55 增强/放大与下层菜单同时保留](55-processing.png) | 组合跳转 | 处理表面可达但菜单仍保留，F03 |
| T045 | [55 增强/放大与下层菜单同时保留](55-processing.png) | Android系统返回 | [56 系统返回后仍在素材操作菜单](56-picker-with-asset.png) | 返回 | 回下层素材操作菜单，F03 |
| T046 | [56 系统返回后仍在素材操作菜单](56-picker-with-asset.png) | via 关闭、项目、UX-AUDIT-1031、镜头 | [57 有图片草稿的镜头卡](57-shot-available.png) | 组合跳转 | 主动作继续已有草稿，F01 |
| T047 | [57 有图片草稿的镜头卡](57-shot-available.png) | 更多；via 选定图片 | [58 非空图片版本选择器](58-picker-available.png) | 组合跳转 | 非空版本选择器 |
| T048 | [58 非空图片版本选择器](58-picker-available.png) | 86.png v1 | [59 已选v1待确认采用](59-picker-confirm.png) | 选择 | 版本选中，尚未采用 |
| T049 | [59 已选v1待确认采用](59-picker-confirm.png) | 确认采用 | [60 镜头已采用图片固定版本](60-shot-adopted.png) | 本地写入 | 镜头固定图片版本，成功 |
| T050 | [60 镜头已采用图片固定版本](60-shot-adopted.png) | 更多；via 另建视频草稿 | [61 镜头来源的视频草稿](61-shot-video.png) | 组合跳转 | 项目视频草稿，已带图 |
| T051 | [61 镜头来源的视频草稿](61-shot-video.png) | 帮我写提示词 | [62 视频提示词协作抽屉](62-prompt-assistant.png) | 局部工具 | 提示词助手可见，未发送 |
| T052 | [62 视频提示词协作抽屉](62-prompt-assistant.png) | via 关闭、返回项目、返回列表、创作、参考图菜单 | [63 原独立视频的参考图移除菜单](63-reference-cleanup.png) | 组合跳转 | 回原独立keyboard视频草稿，准备移除新增引用 |
| T053 | [63 原独立视频的参考图移除菜单](63-reference-cleanup.png) | 移除引用 | [64 原独立视频参考图恢复0/9](64-original-reference-restored.png) | 本地写入 | 参考图0/9；未删素材原件 |
| T054 | [64 原独立视频参考图恢复0/9](64-original-reference-restored.png) | deep link creative-task/audit-missing | [65 缺失任务结果](65-task-missing.png) | 缺失态 | 未找到任务，可靠说明 |
| T055 | [65 缺失任务结果](65-task-missing.png) | deep link creative-output（首次缺参数） | [66 不完整成果链接](66-output-missing.png) | 不完整链接 | 明确链接不完整 |
| T056 | [66 不完整成果链接](66-output-missing.png) | deep link video/audit-missing | [67 旧视频不存在](67-video-missing.png) | 缺失态 | 旧作品不存在 |
| T057 | [67 旧视频不存在](67-video-missing.png) | deep link agent-skill-extract | [68 从对话提炼技能初态](68-skill-extract.png) | 独立路由 | 提炼初态；无模型请求 |
| T058 | [68 从对话提炼技能初态](68-skill-extract.png) | deep link creative-output（asset/job/draft完整） | [69 参数完整但指定版本不存在](69-output-missing-complete-link.png) | 缺失态 | 指定版本不可用，未替换 |
| T059 | [69 参数完整但指定版本不存在](69-output-missing-complete-link.png) | deep link agent-skills | [70 独立技能页空态](70-skills-standalone.png) | 独立路由 | 全屏技能空态 |
