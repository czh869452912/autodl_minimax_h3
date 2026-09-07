# Provider 集成与 AutoDL 对接复核

复核范围：工作流运行时、provider adapter、AutoDL client、任务同步与结果投影。

## 结论

当前 emulator 截图中的错误是 DNS/网络层问题，不是 API 地址配置错误。

在宿主机直接请求当前配置的地址：

```text
POST https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_image_audio_to_video_v2_15s
```

未带有效 Token 时返回 HTTP 401，而不是 404 或 DNS 错误，说明 API 域名、路径、workflow ID 和请求方法均能到达 AutoDL 鉴权层。emulator 同时无法解析 `autodl.art` 和 `www.baidu.com`，因此当前 `UnknownHostException` 发生在请求发出之前。

AutoDL 官方 API 文档使用 `https://autodl.art/api/v1/comfyui/comfyui_workflow/{workflow_id}` 作为提交地址：[ComfyUI API 文档](https://autodl.art/docs/comfyui_api/)。对应工作流页面：[MiniMax H3 工作流](https://www.autodl.art/large-model/comfyui/minimax_h3_image_audio_to_video_v2_15s)。

## 发现的问题

### HIGH-1：成功任务的 artifacts 没有投影到任务记录

位置：

- `mobile/src/workflows/runtime/runtime.ts:32`
- `mobile/src/tasks/sync.ts:20`
- `mobile/src/jobs/repository.ts:46`

`runtime.sync()` 已经从 provider adapter 获取并持久化 artifacts，但只返回 `JobRecord`。随后 `tasks/sync.ts` 调用：

```ts
jobRecordToTaskProjection(updated, [])
```

这里把 artifacts 固定传成空数组，因此成功任务的视频 URL 不会写入 `TaskRecord.videoUrl`，自动下载、保存到相册以及结果页展示可能不会触发。

建议：让 `runtime.sync()` 返回 `{ job, artifacts }`，或在 `tasks/sync.ts` 中重新读取 `jobStore.listArtifacts(updated.id)` 后再生成投影，并增加 `SUCCEEDED + video artifact` 回归测试。

### HIGH-2：旧任务同步仍绕过 provider adapter

位置：

- `mobile/src/tasks/sync.ts:2`
- `mobile/src/tasks/sync.ts:23`
- `mobile/src/tasks/api.ts:27`

新工作流已经通过 AutoDL adapter 访问 API，但旧任务轮询仍直接使用 `tasks/api.ts` 中的全局 `fetch`。这会使旧任务继续受到 LLM/CopilotKit 网络层影响，并造成两份 AutoDL 请求逻辑长期漂移。

建议：将旧任务轮询迁移到 AutoDL adapter，或把 `tasks/api.ts` 改为 AutoDL client 的兼容封装，并增加旧任务轮询的 provider transport 回归测试。

### MEDIUM-1：AutoDL 鉴权错误没有解析实际错误结构

位置：`mobile/src/workflows/providers/autodl/client.ts:41`

当前只解析 `{ code, msg, data }`，而实际鉴权失败响应为：

```json
{
  "error": {
    "message": "Invalid authentication credentials",
    "type": "invalid_request_error"
  }
}
```

因此 Token 失效时用户只能看到笼统的 HTTP 401。

建议：支持 `error.message`，并将 401/403 映射为 `auth` 类型错误，在 UI 中提示 Token 无效或已过期。

### MEDIUM-2：workflow ID 仍硬编码在 AutoDL client

位置：

- `mobile/src/workflows/providers/autodl/client.ts:5`
- `mobile/src/workflows/runtime/runtime.ts:30`

当前 AutoDL client 固定使用 `minimax_h3_image_audio_to_video_v2_15s`。这对当前工作流可用，但 runtime 提交时只传 `draft.inputs`，没有将 workflow schema 中的 provider operation/workflow ID 传给 adapter，因此导入其他 AutoDL workflow config 仍需要修改代码。

建议：由受信任的 workflow definition 解析出 provider operation，例如：

```ts
{
  "provider": "autodl",
  "operation": "comfyui_workflow",
  "workflowId": "minimax_h3_image_audio_to_video_v2_15s"
}
```

再由 adapter 根据该 operation 组装请求。不要允许 config 注入任意 URL。

### MEDIUM-3：provider registry 的凭据模型仍是 AutoDL 专用

位置：

- `mobile/src/workflows/providers/registry.ts:14`
- `mobile/src/workflows/runtime/runtime.ts:24`

registry 当前接收 `{ token }`，runtime 的 credential provider 也只是返回 `{ ok: true }`，没有真正调用 adapter 的 `validateCredentials()`。这会限制 NovelAI 等 provider 的独立凭据结构和校验方式。

建议：引入通用的 `ProviderCredentialStore`/provider-specific credential resolver，由各 adapter 负责凭据校验；runtime 在提交前调用对应 adapter 的 `validateCredentials()`。

## 已确认无误的部分

- `autodl.art` API 域名正确
- workflow ID 与页面 slug 匹配
- 提交路径和 POST 方法正确
- 轮询路径 `/result/{task_id}` 正确
- 当前 emulator 的失败发生在 DNS 解析阶段，不是 payload 或鉴权阶段

## 修复状态

上述 HIGH-1/HIGH-2、MEDIUM-1/MEDIUM-2/MEDIUM-3 已在 dev 分支完成：任务同步会读取并投影 artifacts，旧任务复用 native provider transport，AutoDL 错误支持 `error.message`/鉴权分类，workflow ID 与 request bindings 来自受信任定义，registry 使用通用 credential resolver 且 runtime 会执行 adapter credential validation。另补充了 Android 前台服务 + Headless JS 每 2 分钟后台同步、任务/画廊分页和媒体处理并发上限。

结果画廊现已从 TaskRecord 临时投影迁移到通用 `MediaAsset` 仓库。每个 workflow artifact 独立 materialize，并保留 `jobId/artifactId/workflowId/kind` 来源；系统相册写入作为 `MediaDelivery` 记录，不再作为应用画廊的媒体来源。现有任务的本地/远端产物会在同步入口进行幂等迁移。

## 测试状态与缺口

现有全量测试通过：62 个测试套件、186 个测试通过；类型检查和 Android `:app:assembleDebug` 也通过。

后续仍建议在真实 Android 设备上补充：

1. 前台服务被系统回收后的重启与通知权限行为
2. 弱网/断网恢复时的端到端任务进度和媒体下载
3. 1000+ 任务数据下的真机滚动帧率与内存曲线
