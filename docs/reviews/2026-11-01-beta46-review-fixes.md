# Beta 46 审查问题修复与自查

2026-11-01；基线 865b57ff。确认 E1 / P2：提前进入运行证据页后，终态和后续消息仍停留在旧读取结果。

修复提交：96b28c1a。

## 修复

SkillRunScreen 订阅当前会话的提交后 runEvents，在受理/运行状态提交后重新读取持久数据；重新获得焦点和“获取最新记录”也可恢复数据新鲜度。不创建 runtime、不重放请求、不按流式 token 全量查询。保留同一 ScrollView 和消息 key，不主动滚动或重置本次/全部消息选择。

每次读取分配序号，旧请求晚到不能覆盖新结果；路由切换/离页清理使旧请求失效并注销订阅。后台刷新失败保留已读内容，明确提示可能不是最新记录，允许重试。首次无数据或会话已删除有明确提示。切换到其他 thread/run 时清除旧内容和旧筛选。

## 自查与证据

新增真实 SQLite + 实际 SkillLibraryScreen/SkillRunScreen/threadStore 的联合回归，覆盖 queued 提前进入后 completed/failed/cancelled、最终消息/错误/工具结果，以及 interrupted 恢复。列表、已打开详情、重新打开详情一致；全部消息选择不因后台刷新丢失。

另用实际 createPromptRuntimeRegistry + H3AgUiAgent 和可暂停的离线测试图，验证 running 时打开详情、放行运行、AGUI 完成并 flush 后，原详情显示 completed 与最终输出。测试图不访问模型，显式捕获技能快照；不等同完整模型/授权准备链验收。

组件自查补充：失败保留内容、手动重试、重新聚焦、旧读取晚到、路由切换、其他会话过滤及卸载取消订阅。既有图片缩略图、只读预览和图片失败回归保持通过。源码核对返回仍调用 useSourceBack，未改来源栈逻辑；刷新不主动改变滚动位置，精确设备滚动/大字/TalkBack 未作验收。

本轮定向证据页 2 套件 / 11 项通过；另外既有运行历史和单次消费联合回归通过。审查范围内未发现新的功能缺陷。长会话仍沿用已有全量 load，仅在生命周期/焦点/用户刷新时触发；有界读取性能优化未在本轮完成。

## 全量检查与测试包

全量 323 个套件、1982 项通过；1 个套件、4 项按既有配置跳过。TypeScript、内置技能包 36 文件校验通过。全量通过后构建 Beta47 成功。

- APK：build/phone-beta/AutoDL-H3-1.5.0-preview.4-beta.47-android.apk。
- versionCode 86；com.example.autodlh3.beta；ARM64 / ARMv7。
- 签名与既有测试版一致；apksigner、zipalign 16 KB 对齐校验通过。
- SHA-256：3F0D707B2A84A65C935F1B74A0A593B85BD1B73BC67BDB639971C4690FB3CA52。

保留设备原有 QA44-draft 未保存输入，不强停或覆盖安装；更新可下载 APK。没有真实模型、付费生成或外部执行架构变更。
