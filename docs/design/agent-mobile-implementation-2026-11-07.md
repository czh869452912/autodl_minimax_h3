# Agent 移动界面实施记录 · 2026-11-07

依据 [改造计划](agent-mobile-refactor-plan-2026-11-07.md)，按部分提交。

## N0b · 入口恢复

完成重试、数据维护、可复制的脱敏诊断分类。背景刷新失败保留已挂载会话；显式项目范围不被回退项目覆盖。只在数据库可访问且有明确项目范围时开放本地只读历史，数据库保护状态下不开放。

验证：AgentWorkspace 4 项测试、sqliteBusy 4 项测试通过，TypeScript 检查通过；Android 17 / 411dp / 字号 1.0 的实际失败画面见 evidence/2026-11-07-agent-refactor/n0-matched-entry.png。

N0a 继续排查：当前源码 x86_64 原生构建成功；完整应用的 projects() 查询仍出现 map/undefined，独立数据库保护层、维护层和新连接的同步/异步以及 12 路并发查询均正常。未用空数组掩盖错误，尚不声称正常会话基线通过。QA 使用独立包 com.example.autodlh3 和合成离线数据；既有 beta 包未更改。

## N0a · 已恢复正常入口

最小复现将同一异步 SQL 包在带默认参数的方法中即丢失返回值；直接 await 和 Promise.all 正常。问题位于当前 Android Hermes 原生 async 编译路径，不是项目 SQL 或保护策略。Android Babel 仅增加 async-to-generator 转换，保留默认的类与其他语言特性转换，避免更换整个旧版编译 profile 破坏第三方类继承。web/iOS 编译配置沿用默认。

当前源码构建的 x86_64 原生包 + 新编译 JS 已进入真实 AgentSession，恢复原合成会话、4 条待审阅提议与图片草稿。见 n0-normal-conversation.png/xml。新增独立原生异步探针入口 scripts/native-async-device.jsx，供后续升级编译链时重测。不能以 Node/Jest 通过替代此设备检查。未改变数据库结构或吞掉查询异常。

原生构建：assembleDebug -PreactNativeArchitectures=x86_64 成功。采样包 n1-async 的 SHA-256 及 bundle 身份保存在本地 build/roadmap-qa/n1-async-metadata.json；不是发布 APK。此结论不等于真实模型/生成服务联调已完成。

## N1 · 技能目录与全屏详情

目录使用范围、搜索、带选中背景的分类和两行用途；首项内置能力在项目目录首屏 y=868px（411dp 设备）出现，位于内容区上半部。删除常驻重复边界说明，停用确认仍保留影响范围。目录元信息最低 12sp。

详情优先读取已有 desc-cn 中文描述，原始文件和版本指纹按需展开；执行快照 description 保持原文。目录仍保留默认启停开关和项目继承操作。

ADR：使用现有 agent-skills 内部全屏 Modal 承载详情，以原版本 ID/内置路径寻址，兼容 initialVersionId，不新增路由。目录保持挂载，因此搜索、筛选和滚动位置不因查看详情丢失。会话内管理也改用全屏 Modal，底下 AgentSession 保持挂载；系统返回与关闭继续复用未保存选择守卫。长正文从目录抽离。

验证：技能目录/内置包/AgentScreen 共 29 项测试通过；实际设备完成会话→技能管理→中文详情→返回目录，目录与详情截图及同技能前后比较见 n1-*。TypeScript 检查通过。设备为合成离线数据；安装与单次选择恢复由现有交互测试覆盖，未以只读截图冒充真实服务运行。

## N2 · 范围准确的运行记录

历史展示抽成 SkillRunHistory；标题随本会话/本项目/全部变化。查询保持原有技能证据存储、可信范围和游标分页，明确只覆盖保存了技能证据的运行；不把空列表解释成没有对话或生成任务。无来源范围时不显示重复的范围切换。

运行详情改为返回/标题/刷新顶栏，事实状态与本轮消息先读，工具原始记录与版本诊断移至末尾，消息角色改为中文。查看与刷新不创建运行时、不改变选择。缺快照继续明确告知。实际设备打开早期无技能证据的合成运行，依然可显示本轮消息。

验证：目录、运行详情、真实 SQLite 运行状态更新集成测试共 27 项通过；TypeScript 通过。设备截图 n2-history 和 n2-run-detail 覆盖空范围/无技能证据运行。Android 当前日期 locale 回退仍显示英文顺序，列入 N5 修正。
