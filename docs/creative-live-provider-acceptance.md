# 创作服务真实接口验收记录

日期：2026-10-24（Asia/Shanghai）。用户授权使用仓库外工作区 `.env` 中的两项凭据测试。值未输出、未写入脚本或 Git；本记录不含账号信息和带签名的下载地址。

## 实际结果

| 检查 | 结果 |
|---|---|
| NovelAI 图片令牌只读验证 | 图片域名 HTTP 200；旧 API 域名 HTTP 400，已修复生产验证地址 |
| NovelAI 真实生成 | 仅提交一次，V4.5 Curated，832×1216，23 steps，seed 24102026；PNG 1,881,769 bytes |
| 图片传给 H3 | 固定上述 PNG 哈希作为 ref_image_0；仅提交一次，480p竖、5 秒、seed 24102026 |
| H3 真实返回 | SUCCEEDED，一个 MP4，2,839,093 bytes；容器尺寸 480×864、时长 5.167 秒 |
| 缓存复用 | 分别禁用 fetch 后重跑 image/video 模式成功，没有重新发送请求 |
| 视频归档回放 | 真实 H3 响应解析和 MP4 哈希验证通过；重复入库一个候选版本，外键检查无异常 |
| 图片归档回放 | 生产协议解析真实响应，真实 SQLite 内重复归档只有一个版本，H3 草稿引用精确版本与哈希，候选不自动采用 |

图片 SHA-256：`9eceb84f8f736612f4dd84b1589666abe44cae3c71c89426d0fa4ed0c1ac2ec8`。

视频 SHA-256：`3a3f76938788a698c2062ea978235d2c5636bb71a31b919b487e48b948d86dcf`。

**验收边界**：真实 HTTP 使用 Node 执行 app 的生产请求构造、账号验证、AutoDL client 与响应解析代码。数据库回放使用隔离的真实 SQLite 和测试凭据，未再次请求生成服务。并未在 Android 界面输入凭据，也未将这个结果宣称为 SecureStore、原生 HTTP、后台执行与页面操作的完整设备验收。MP4 容器检查不等于人工观看质量验收。

## 证据与复用

证据保存在 Git 忽略的 `build/creative-live-acceptance/`：两项发送标记、请求快照、响应、HTTP 状态、原件、哈希及离线入库回放报告。不要删除发送标记以重试消费请求；状态不明时保留标记，先对账。

脚本：`mobile/scripts/creative-live-acceptance.cjs`。从 `mobile` 运行：

```powershell
# 有已有结果时，以下两项只读缓存，不需要凭据，也不调用网络。
node scripts/creative-live-acceptance.cjs image
node scripts/creative-live-acceptance.cjs video

# 只读验证与任务查询会读取工作区 .env，不会重新提交。
node scripts/creative-live-acceptance.cjs verify
node scripts/creative-live-acceptance.cjs status

# 离线重放真实响应，测试不会读取 .env，也不会触发真实生成。
$env:CREATIVE_LIVE_EVIDENCE=(Resolve-Path '../build/creative-live-acceptance').Path
npx jest src/creative/novelAiExecution.test.ts src/creative/videoSubmission.test.ts --runInBand
```

首次发送必须明确传入 `--submit`；发送前以排他创建并 fsync 标记，异常后不自动重发。已有标记而无响应时脚本拒绝提交。普通单元测试默认跳过真实样本回放，不会消费额度。

只有模型/接口契约、请求字段或提供商行为发生相关变化时才需要重新进行真实消费测试。UI、迁移、恢复和版本引用的修改优先复用这里的响应与原件做离线回归。
