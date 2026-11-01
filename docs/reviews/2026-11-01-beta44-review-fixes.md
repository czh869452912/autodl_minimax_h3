# Beta 44 复审问题修复

2026-11-01；基线 3673cca9。确认审查中唯一新增问题 F1 / P2 成立；保留原审查材料及设备未保存草稿。

## F1：消费后同步仍打开的技能面板

修复提交：9d402974。

消息受理成功且 SQLite 写事务提交后，threadStore.accept 发布会话级技能选择变更。保存或取消单次覆盖同样在提交后通知。acceptNextRunSkills 仍只负责事务内部消费，不提前发布通知。面板仅订阅当前会话，重新读取持久覆盖、技能列表与运行历史；不依赖父级重渲染，不随流式 token 查询数据库。

后台刷新保留面板和未保存的 once 编辑，仅更新 savedOnce 等持久状态。读取序号阻止较旧请求覆盖较新结果，卸载或切换订阅时使旧请求失效。失败回滚不通知、不提前清空；重试保持原运行快照，不误消费新覆盖。

## 回归范围

新增 selectionEvents.integration.test.tsx，使用实际 SkillLibraryScreen、SkillStore、threadStore.accept 与初始化后的真实 SQLite，共 6 项：

- 非空与空选覆盖提交后，原面板立即恢复默认提示；重新编辑不带入已消费版本；历史出现运行；后续普通新运行采用默认组合。
- 在写入 agent_submissions 时用 SQLite trigger 故意失败，验证整个受理回滚、覆盖和提示保留、无提交事件或残留快照。
- 重试读取原运行快照，保留后来保存的新覆盖。
- 后台刷新保留未保存勾选，其他会话通知不触发本面板查询。
- 实际 Composer 发送回调连接实际持久受理，确认原技能面板未卸载且提示更新。

最后一项是 Composer + 面板 + SQLite 联合回归，发送回调使用测试桥接调用实际 threadStore.accept；没有挂载完整 AgentSession、启动真实模型或网络，不能称为设备端到端验收。导航焦点采用稳定 effect 替身。既有 AgentScreen/runtime 回归另由全量测试覆盖。

定向 4 个套件 / 26 项通过。TypeScript 检查、内置 Skill 包 36 文件内容/哈希/元数据校验通过。

## 测试版交付

- 全仓 321 个套件、1968 项通过；1 个套件、4 项按原配置跳过。日志 mobile/beta45-full.log。
- ARM64 / ARMv7：build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.45-android.apk；versionCode 84；包名 com.example.autodlh3.beta。
- apksigner 签名验证及 zipalign 16 KB 对齐检查通过，签名与原测试版一致。
- SHA-256：1E56DA5DEE47FD2355D42DE5C6D39A4D037A1CA33180319012D808A0DCC5A109。

不强停或覆盖安装当前设备，以保留审查留下的 QA44-draft 未保存输入；本次未调用真实模型、付费生成或修改设备业务资产。长会话分页属于审查提到的待验性能项，本轮没有复现的新缺陷，不扩大为已完成范围。
