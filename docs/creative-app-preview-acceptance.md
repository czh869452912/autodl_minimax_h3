# 综合创作预览版验收与复测索引

交付版本：`1.5.0-preview.1`，Android versionCode 39，SQLite v25，分支 `codex/creative-app`。

这是可安装的开发预览，不是整条 6–10 周路线的正式发布。每个实现增量均独立提交，详见 [实施记录](creative-app-implementation-status.md)。设计 v1.3 保留为原始基线；此文件记录实际交付边界。

## 已接入的主链

1. 项目 → 保存简报 → 添加镜头；资产库支持独立图片、视频、音频、文档与 Prompt。
2. 创作 → NovelAI 新图片 → 填写 Prompt/角色/参数 → 保存草稿 → 绑定账号 → 确认一次授权 → 队列 → 原始图片候选入库。
3. 图片版本 → 创建 H3 草稿；或项目 → 选图与视频计划 → 固定候选集合 → 用户选定并继续 → 指定账号授权 → H3 队列。
4. 图片/视频以候选版本入库；用户显式设为资产默认、项目固定版本或镜头成果。三种选择互不覆盖。
5. Agent 页面选择项目并授予有限次数；工具调用共享项目/镜头/草稿/生成服务。计划等待用户选图，关闭聊天后由后台执行器继续；删除来源聊天阻止未发送的计划。
6. 文件丢失保留版本记录；图片可重新定位相同内容或从完整备份找回。图片/视频导出相册，文档/音频保存到下载目录。完整备份恢复隔离旧消费和计划，不自动重发。

## 安装与账号

- 交付 APK 支持 `arm64-v8a` 手机及 `x86_64` 模拟器，JS bundle 内置，不需要 Metro。它使用开发签名，同包名覆盖安装要求原安装签名一致；不要为解决签名冲突直接卸载有重要素材的安装。
- 在 app 的创作账号面板自行输入 NovelAI 持久令牌和 AutoDL ComfyUI Token。浏览器登录不等于 app 获得凭据；令牌不要发到聊天中。
- NovelAI 用只读订阅接口验证，无法获得稳定 principal 时使用不可覆盖的凭据代次。AutoDL 暂无已确认只读身份接口，明确是本地绑定，首次请求由服务端验证。
- 生成费用当前无法可靠估算，显示未知；单次手动授权最多一次、15 分钟。Agent 授权限项目、账号代次、次数和有效期。结果不明保留额度占用。
- 新创作账号与原有 AutoDL 设置独立，原设置不会被自动复制或覆盖。

## 自动化证据与复测范围

| 契约 | 主要证据 | 改动何处时复测 |
|---|---|---|
| 旧父记录原位更新、FK | jobs、artifactStatements、schemaParity 测试 | 任务/输出写入、迁移 |
| journal 回填、迟到状态及文件复制竞争 | creativeCapture、legacyMigration | 旧媒体写入/迁移 |
| 恢复代次、READY 操作与计划隔离 | restoreIsolation、fileBackup、plans、novelAiExecution | 备份/恢复/队列 |
| 账号代次、预留及未知消费 | budget、videoSubmission、planDispatch、agentScope | 凭据/授权/发送 |
| 发送后崩溃与并发重复 | NovelAiTransportTest（12 实例）及 novelAiExecution | 原生传输、响应缓存 |
| 独立文件导入、交付 | fileImport、exportExecution；Android CreativeImageInstrumentedTest | CAS、MediaStore、导出 |
| 候选/默认/项目 pin/镜头选择分离 | story、drafts、plans、authoredText | 版本与引用服务 |
| 决定事务、冻结输入、后台幂等 | plans（15 项）、executorRunner | 决策/计划/执行器 |
| 聊天删除不丢消费来源 | agentScope、projectActivity、plans | Agent 生命周期 |
| 既有执行器独立进程恢复 | verify:process-recovery（5 场景、10 进程） | 旧执行器/恢复协议 |

已有官网行为及样本见 [NovelAI 测试记录](novelai-browser-test-record.md)，无需每次重新点击官网生成。代码测试通过不替代真实账号 API 或设备交互验收。

## 尚未通过或尚未实现

- **真实服务端到端验收未完成**：尚未使用新版 app 的 NovelAI/AutoDL 凭据实际生成，不能把模拟响应/官网生成算作新适配器验收。需用户在设备安全输入凭据后验证一张基础图片、跨服务参考图上传及一个 H3 视频。
- **页面手动验收未完成**：Windows 模拟器窗口两次激活失败。已通过 Android MediaStore 仪器测试，但未宣称窄屏键盘、滚动与返回交互手测通过。
- **旧媒体权威源切换未完成**：保持 CATCHUP，历史变更由 journal 追平；PRIMARY 有 readiness 保护。仍需逐一桥接旧下载/导出/删除/恢复写入路径，迁移对账与回滚验收后再切换，不通过改标志伪造完成。
- **高级 NovelAI 能力仍关闭**：Vibe、精确参考、图生图、蒙版重绘未完成能力 PoC。PNG 标准文本块已支持；WebP 元数据与 alpha 隐写未支持。不能宣称完整恢复所有参数。
- **产品增强仍待后续增量**：项目封面/持久页签、完整版本差异比较、镜头拖拽、Agent 修改差异确认、音频/PDF 内嵌预览、非图片缺失文件的交互式重新定位，以及更丰富的有限批量计划。当前只开放固定候选选图→一次 H3 的持久计划。
- 用户数据回收站可恢复，不提供不可逆清空。对账不明的消费不自动释放额度，也不因“查不到”而重发。

## 可复现构建

在 `mobile/android`，配置本机 JDK 17 与 Android SDK 后运行：

```powershell
$env:NODE_ENV='production'
./gradlew.bat :app:testDebugUnitTest :app:assembleDebug '-PreactNativeArchitectures=arm64-v8a,x86_64' -I ../scripts/short-cxx.init.gradle --console=plain
```

`short-cxx.init.gradle` 在 Windows 上把生成的 CMake/Prefab 目录放入系统临时目录，避免 SDK Ninja 访问长路径时无限重复配置；保留原缓存及源文件。开发机常规 x86_64 构建不一定需要此选项。产物原路径为 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`。

最终测试统计、APK SHA-256 和交付路径以实施记录末尾为准。
