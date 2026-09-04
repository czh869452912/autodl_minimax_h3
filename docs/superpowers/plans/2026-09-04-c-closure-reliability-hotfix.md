# C 阶段可靠性收尾热修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v1.4.9 中阻止损坏视频进入画廊、恢复联网后的主动同步、限制任务刷新热路径成本、补齐任务结果通知，并在任何持久提交前拦截非法工作流参数。

**Architecture:** 保持 schema v6 和 durable operation ledger 不变，在其边界增加内容验证、SQL 调度摘要、分层同步策略与终态事件通知。创建页复用 workflow compiler 做唯一提交前校验；Android 原生模块负责真实文件、容器、MediaStore 和通知能力，JS 负责持久状态机和 UI 编排。

**Tech Stack:** React Native 0.86、Expo SDK 57、TypeScript 6、Expo SQLite、expo-network、Kotlin/Java Android、MediaExtractor/MediaMetadataRetriever、MediaStore、Jest、JUnit、adb。

---

## 实施约束

- 工作树：`D:\wt\c149`，分支：`codex/c-closure-hotfix`。
- 基线设计：`docs/superpowers/specs/2026-09-04-c-closure-reliability-hotfix-design.md`。
- 每个生产行为必须先有会因缺少该行为而失败的测试。
- 不修改 `APP_SCHEMA_VERSION=6`，不创建数据库 migration。
- 不在 UI 中直接下载、导出、删除 CAS 引用或写媒体投影。
- 不自动重放 UNKNOWN submit；联网恢复只提前已有可重试 operation。
- 每个任务完成后执行列出的聚焦测试并提交；全部完成后再跑完整门禁和 Android 设备矩阵。

## 文件职责图

- `mobile/src/create/submissionValidation.ts`：表单 draft 校验、字段路径归一化与中文错误。
- `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json`：新的 immutable H3 输入合同。
- `mobile/src/workflows/executor/operationRepository.ts`：due 查询、聚合摘要、scoped outstanding 和联网恢复提前到期。
- `mobile/src/tasks/syncPolicy.ts`：同步模式、维护 cooldown 和 settings fingerprint 缓存。
- `mobile/src/tasks/networkRecovery.ts`：离线到在线边沿判定及恢复编排。
- `mobile/src/native/media.ts`：文件 hash、视频探针和导出原生桥。
- `mobile/src/media/mediaValidation.ts`：稳定的媒体验证错误与 attempt 策略。
- `mobile/src/workflows/executor/mediaCommandService.ts`：坏副本失效和 durable redownload。
- `mobile/android/.../MediaIntegrity.kt`：SHA-256 与 MP4 可播放性探针。
- `mobile/android/.../MediaStorePublisher.kt`：按内容 hash 复用或替换系统相册条目。
- `mobile/src/tasks/terminalEvents.ts`：从持久 job event 读取可通知终态。
- `mobile/android/.../TaskNotificationManager.kt`：渠道、权限、通知和 event ID 去重。

### Task 1: 恢复创建页的 schema 驱动提交前校验

**Files:**
- Create: `mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json`
- Create: `mobile/src/create/submissionValidation.ts`
- Create: `mobile/src/create/submissionValidation.test.ts`
- Modify: `mobile/src/workflows/registry/builtin.ts`
- Modify: `mobile/src/workflows/registry/catalog.ts`
- Modify: `mobile/src/workflows/registry/catalog.test.ts`
- Modify: `mobile/src/workflows/registry/service.ts`
- Modify: `mobile/src/workflows/registry/service.test.ts`
- Modify: `mobile/src/workflows/registry/builtin.test.ts`
- Modify: `mobile/src/create/submissionInput.ts`
- Modify: `mobile/src/create/submissionInput.test.ts`
- Modify: `mobile/src/workflows/renderer/renderers.tsx`
- Modify: `mobile/src/workflows/renderer/WorkflowForm.tsx`
- Modify: `mobile/src/workflows/renderer/WorkflowForm.test.tsx`
- Modify: `mobile/src/create/CreateForm.tsx`
- Modify: `mobile/src/create/createForm.test.ts`

- [ ] **Step 1: 写 workflow 版本和输入合同失败测试**

在 registry 测试中断言：内置定义同时保留 `1.0.0` 和 `1.0.1`；新安装激活 `1.0.1`；已有 builtin `1.0.0` 自动升级；已激活的 local-import/remote 版本不被 bootstrap 覆盖。对 `1.0.1` 断言：

```ts
expect(prompt).toMatchObject({ minLength: 1, maxLength: 10_000 });
expect(seed).toMatchObject({ type: 'integer', minimum: 1, maximum: 999_999_999_999_999 });
```

Run:

```powershell
cd mobile
npm test -- --runInBand src/workflows/registry/builtin.test.ts src/workflows/registry/catalog.test.ts
```

Expected: FAIL，因为只有 `1.0.0` 且 bootstrap 只处理无 active record 的情况。

- [ ] **Step 2: 新增 immutable `1.0.1` 并让 catalog 安全升级 builtin**

复制现有定义为 `minimax-h3-i2v-15s-v1.0.1.json`，仅改变合同版本和已确认约束：

```json
{
  "version": "1.0.1",
  "prompt": { "type": "string", "minLength": 1, "maxLength": 10000 },
  "seed": { "type": "integer", "minimum": 1, "maximum": 999999999999999 }
}
```

保留完整原文件为 `1.0.0`。`builtinWorkflowDefinitions` 同时导入两个定义。给 registry service 增加“安装但不激活 builtin record”的窄接口；catalog bootstrap 先安装所有缺失版本，再按 workflow ID 选择最高 builtin semver，并仅在 active 不存在或 active.source 为 `builtin` 且版本更旧时 `setActive`。

- [ ] **Step 3: 验证 workflow registry 测试转绿**

Run: Task 1 Step 1 命令。  
Expected: PASS，且旧 package record 未被覆盖。

- [ ] **Step 4: 写 snapshot 规范化和提交校验失败测试**

新增纯函数期望：空 seed 生成安全整数；合法数字字符串转 number；非数字字符串保留为非法值供 schema 报错。为 `validateSubmissionBeforeQueue` 写下列断言：

```ts
expect(validate(inputsWithPromptLength(10_000))).toMatchObject({ ok: true });
expect(validate(inputsWithPromptLength(10_001))).toMatchObject({
  ok: false,
  fieldErrors: [{ field: 'prompt', code: 'MAX_LENGTH' }],
});
expect(formatError(promptError, definition)).toBe(
  'Prompt（视频描述）最多 10,000 个字符，当前 10,001 个。',
);
```

同时覆盖 duration `0/16/1.5`、非法 resolution、seed `0/1000000000000000/abc`、images 10 项、audios 4 项和 provenance mismatch。

Run:

```powershell
npm test -- --runInBand src/create/submissionInput.test.ts src/create/submissionValidation.test.ts
```

Expected: FAIL，因为 seed 仍为 string 且校验适配器不存在。

- [ ] **Step 5: 实现纯校验边界**

`submissionValidation.ts` 导出：

```ts
export type SubmissionFieldError = {
  field?: string;
  path: string;
  code: string;
  message: string;
};

export function validateSubmissionBeforeQueue(input: {
  definition: WorkflowDefinition;
  loaded: RegistryRecord;
  active: RegistryRecord | undefined;
  inputs: Record<string, unknown>;
}): { ok: true } | { ok: false; fieldErrors: SubmissionFieldError[]; summary: string };
```

先比较 workflow ID/version/content hash，再调用 `compileWorkflow(definition, loaded.contentHash).validateDraft(inputs)`。把 `/prompt` 归一化为 `prompt`，读取 property title/limit/current length 生成中文信息；未知 path 进入 summary 而不伪造字段归属。

`buildSubmissionInputSnapshot` 对 seed 使用：空白则生成 number；纯十进制则 `Number`；其他内容保留原 string 让 TYPE_INVALID 生效。

- [ ] **Step 6: 写 CreateForm/WorkflowForm 失败测试**

测试注入 queue/token reader，输入 10,001 字符后点击提交，断言：

```ts
expect(Alert.alert).toHaveBeenCalledWith(
  '参数设置不合法',
  expect.stringContaining('最多 10,000 个字符'),
);
expect(readSettings).not.toHaveBeenCalled();
expect(queueSubmission).not.toHaveBeenCalled();
```

断言合法 10,000 字符只 queue 一次。WorkflowForm 测试断言字段下显示中文错误，counter 为 `10,001 / 10,000 字符` 且使用错误样式。

Run:

```powershell
npm test -- --runInBand src/create/createForm.test.ts src/workflows/renderer/WorkflowForm.test.tsx
```

Expected: FAIL，因为 CreateForm 仍先占 gate/读 token，WorkflowForm 没接收规范化字段错误和 max counter。

- [ ] **Step 7: 接入 UI 提交门**

CreateForm 提交顺序固定为：build snapshot → `workflowCatalog.getActive` → validate → 设置字段错误/Alert 并 return → acquire gate → read settings → queue。合法编辑后清除对应字段错误；所有错误继续保留用户输入。

WorkflowForm 将 `errors[].path` 与 property key 精确匹配；renderer 在 multiline schema 有 maxLength 时显示 `${length.toLocaleString()} / ${max.toLocaleString()} 字符`，只改变视觉颜色，不给 TextInput 设置截断式 `maxLength`。

- [ ] **Step 8: 运行创建页聚焦门禁并提交**

```powershell
npm test -- --runInBand src/create/createForm.test.ts src/create/submissionInput.test.ts src/create/submissionValidation.test.ts src/workflows/renderer/WorkflowForm.test.tsx src/workflows/registry/builtin.test.ts src/workflows/registry/catalog.test.ts
npm run typecheck
git add mobile/src/create mobile/src/workflows/definitions/autodl mobile/src/workflows/registry mobile/src/workflows/renderer
git commit -m "fix: validate workflow inputs before enqueue"
```

Expected: all selected tests and typecheck PASS。

### Task 2: 将 operation 调度热路径下推 SQLite

**Files:**
- Modify: `mobile/src/workflows/executor/operationRepository.ts`
- Modify: `mobile/src/workflows/executor/operationRepository.test.ts`
- Modify: `mobile/src/workflows/executor/tick.ts`
- Modify: `mobile/src/workflows/executor/tick.test.ts`
- Modify: `mobile/src/jobs/repository.ts`
- Modify: `mobile/src/jobs/repository.test.ts`

- [ ] **Step 1: 写真实 SQLite 查询失败测试**

用现有 `createInitializedRealSqliteTestDb` 插入 100 个 terminal operation、不同 kind 的 due/scheduled/leased rows，断言新 API：

```ts
operations.listDue({ kind: 'STATUS_SYNC', now: 1_000, limit: 8 });
operations.pendingSummary({ now: 1_000 });
operations.pendingSummary({ now: 1_000, jobIds: ['job-a'] });
operations.countOutstanding(['job-a']);
operations.expediteRetryableNetwork(['job-a'], 1_000);
```

摘要必须返回 `{ remainingDue, remainingScheduled, nextWakeAt }`；expedite 只更新 PENDING、retryable、network/timeout 类错误，不碰 UNKNOWN submit、auth、terminal 或其他 job。

Run:

```powershell
npm test -- --runInBand src/workflows/executor/operationRepository.test.ts src/workflows/executor/tick.test.ts src/jobs/repository.test.ts
```

Expected: FAIL，新 API 不存在且 tick 仍调用 `list()`。

- [ ] **Step 2: 实现有界 SQL API**

新增：

```ts
type PendingSummary = {
  remainingDue: number;
  remainingScheduled: number;
  nextWakeAt?: number;
};

listDue(options: { kind: OperationKind; now: number; limit: number }): WorkflowOperation[];
pendingSummary(options: { now: number; jobIds?: string[] }): PendingSummary;
countOutstanding(jobIds: string[]): number;
expediteRetryableNetwork(jobIds: string[], now: number): number;
```

`listDue` SQL 带 state、retry time、lease、ORDER BY、LIMIT。摘要用 `SUM(CASE...)` 与 `MIN(CASE...)`。动态 job ID 参数只生成受控 `?,?` placeholders；空数组立即返回零。网络错误用 `json_extract(last_error_json,'$.retryable')=1` 且 code 限定 provider NETWORK/TIMEOUT、ARTIFACT_CONNECT_TIMEOUT、ARTIFACT_IDLE_TIMEOUT。

为 `createJobRepository` 增加 `listRecent(limit)`，SQLite 直接 `LIMIT ?`，内存实现 slice。

- [ ] **Step 3: tick 改用 SQL 查询**

`dueSnapshot` 每 lane 调一次 `listDue`，每 lane limit 不超过本 tick budget；公平轮转保持不变。执行前后仅调 `pendingSummary`，删除 `operations.list().filter(...)`。保留 `list()` 供审计和非热路径测试。

- [ ] **Step 4: 验证并提交**

```powershell
npm test -- --runInBand src/workflows/executor/operationRepository.test.ts src/workflows/executor/tick.test.ts src/workflows/executor/cycle.test.ts src/jobs/repository.test.ts
npm run typecheck
git add mobile/src/workflows/executor/operationRepository.ts mobile/src/workflows/executor/operationRepository.test.ts mobile/src/workflows/executor/tick.ts mobile/src/workflows/executor/tick.test.ts mobile/src/jobs/repository.ts mobile/src/jobs/repository.test.ts
git commit -m "perf: bound durable operation queries"
```

### Task 3: 分离 poll、maintenance、service 与 command 同步

**Files:**
- Create: `mobile/src/tasks/syncPolicy.ts`
- Create: `mobile/src/tasks/syncPolicy.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/tasks/sync.test.ts`
- Modify: `mobile/src/tasks/background.ts`
- Modify: `mobile/src/media/reconciliation.ts`
- Modify: `mobile/src/media/reconciliation.test.ts`

- [ ] **Step 1: 写同步模式和 cooldown 失败测试**

定义请求：

```ts
type SyncRequest = {
  reason: 'foreground' | 'background' | 'service';
  mode: 'poll' | 'maintenance' | 'service' | 'command';
  taskIds?: string[];
  forceMaintenance?: boolean;
};
```

测试 poll 只调用 cycle/list/summary；maintenance 首次调用 repair/reconcile，5 分钟内生命周期重复不再调用；人工 force 总是调用；service 返回 scoped remaining。加入 100 个历史 task 的回归，断言 poll 的 fileExists、removeCasPath、repair 都是 0 次。

Run:

```powershell
npm test -- --runInBand src/tasks/syncPolicy.test.ts src/tasks/sync.test.ts src/media/reconciliation.test.ts
```

Expected: FAIL，runner 当前每次都 repair/reconcile。

- [ ] **Step 2: 实现持久维护窗口**

`syncPolicy.ts` 提供 `claimMaintenanceWindow(db, now, force, intervalMs=300_000)`，使用固定 key `foreground-maintenance-next`：

```sql
INSERT INTO app_scheduler_leases(lease_key,owner,expires_at)
VALUES ('foreground-maintenance-next','cooldown',?)
ON CONFLICT(lease_key) DO UPDATE SET expires_at=excluded.expires_at
WHERE ? OR app_scheduler_leases.expires_at <= ?
```

返回 changes 是否为 1。该 row 是持久 cooldown，不由 `withSchedulerLease` 删除；实际 reconciliation/CAS GC 仍保留各自的运行 lease。

- [ ] **Step 3: 拆分 runner 并限制 maintenance 范围**

`createSyncTaskRunner` 按 mode 选择步骤。maintenance 中 `repairTaskProjections` 改用 `compatibilityJobs.listRecent(32)`；reconcile 只在 claim 成功时运行。未运行 maintenance 时返回零值 `ReconciliationSummary` 和 `maintenanceRan:false`。

service 使用 task IDs 调 scoped summary、terminal event reader（Task 9 接入前先返回空 events），其 `summary.remaining` 不再来自全局 operation。

- [ ] **Step 4: 缓存 settings 驱动的 executor**

`syncPolicy.ts` 增加：

```ts
export function executorSettingsFingerprint(settings: AppSettings): string {
  return JSON.stringify({
    token: settings.token,
    autoExportToGallery: settings.autoExportToGallery,
    keepPrivateCopy: settings.keepPrivateCopy,
  });
}
```

实现 `getOrCreate(settings)`：fingerprint 相同返回同一 adapters/runtime/durable；变化重建。测试连续 4 pass 只构建一次，token 或媒体策略改变各重建一次。

- [ ] **Step 5: 更新调用边界并提交**

background task 用 `{ reason:'background', mode:'maintenance' }`；command facade 继续直接运行 cycle，不触发 maintenance。先更新编译范围内所有 `syncTaskRun` 调用，使没有隐式旧签名。

```powershell
npm test -- --runInBand src/tasks/syncPolicy.test.ts src/tasks/sync.test.ts src/media/reconciliation.test.ts src/workflows/executor/tick.test.ts src/workflows/executor/cycle.test.ts
npm run typecheck
git add mobile/src/tasks mobile/src/media/reconciliation.ts mobile/src/media/reconciliation.test.ts
git commit -m "perf: separate task polling from maintenance"
```

### Task 4: 联网恢复和任务页精确唤醒

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Create: `mobile/src/tasks/networkRecovery.ts`
- Create: `mobile/src/tasks/networkRecovery.test.ts`
- Create: `mobile/src/tasks/pollSchedule.ts`
- Create: `mobile/src/tasks/pollSchedule.test.ts`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/src/route-tests/root-layout.test.tsx`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/src/route-tests/tasks.test.tsx`
- Modify: `mobile/app/video/[id].tsx`

- [ ] **Step 1: 安装 SDK 匹配的联网模块**

```powershell
cd mobile
npx expo install expo-network
```

Expected: package/lock 中为 `expo-network ~57.0.1`；运行 `npx expo install --check` 无版本不匹配。

- [ ] **Step 2: 写网络边沿和 timer 失败测试**

`networkRecovery.test.ts` 覆盖 unknown→true 不触发、true→true 不触发、false→false 不触发、false→true 只触发一次。恢复函数断言先 `expediteRetryableNetwork(activeIds, now)`，仅 changes>0 或存在活跃任务时运行 poll。

`pollSchedule.test.ts` 对纯函数：

```ts
nextPollDelay({ now, hasActiveTasks, nextWakeAt, remainingDue })
```

断言 due work 立即/最小 250ms、活跃 provider 最多 10s、未来 retry 精确对齐 `nextWakeAt`、完全无工作返回 undefined。

Tasks route 测试使用 fake timers，确认只存在 60s 后 scheduled retry 时不会在前 10/20/30/40/50s 重复 load。

Run:

```powershell
npm test -- --runInBand src/tasks/networkRecovery.test.ts src/tasks/pollSchedule.test.ts src/route-tests/root-layout.test.tsx src/route-tests/tasks.test.tsx
```

Expected: FAIL，新模块和精确 timer 不存在。

- [ ] **Step 3: 实现网络恢复监听**

根布局订阅 `Network.addNetworkStateListener`。用 `createConnectivityEdgeDetector` 保存已知状态，仅明确观察过离线后第一次在线触发：读取活跃 job IDs、调用 repository expedite、执行 `{ reason:'foreground', mode:'poll' }`。cleanup 时移除 listener。

冷启动与 AppState active 使用 maintenance（if-due），避免网络事件与 lifecycle 双重完整维护。

- [ ] **Step 4: 将固定 interval 改为一次性 timer**

sync summary 暴露 `nextWakeAt`。TasksScreen 每次 load 后根据可见 active tasks 和 summary 安排一次 `setTimeout`；回调执行 poll 并重新计算。focus 使用 maintenance if-due，人工按钮使用 maintenance force。VideoDetail 只使用 poll。

- [ ] **Step 5: 验证并提交**

```powershell
npm test -- --runInBand src/tasks/networkRecovery.test.ts src/tasks/pollSchedule.test.ts src/route-tests/root-layout.test.tsx src/route-tests/tasks.test.tsx src/route-tests/video-detail.test.tsx
npm run typecheck
npx expo install --check
git add mobile/package.json mobile/package-lock.json mobile/app mobile/src/tasks mobile/src/route-tests
git commit -m "fix: resume task sync when connectivity returns"
```

### Task 5: 增加 Android 文件 hash 与视频可播放性探针

**Files:**
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/MediaIntegrity.kt`
- Create: `mobile/android/app/src/test/java/com/example/autodlh3/MediaValidationPolicyTest.kt`
- Create: `mobile/android/app/src/androidTest/java/com/example/autodlh3/MediaIntegrityInstrumentedTest.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/MediaModule.kt`
- Modify: `mobile/android/app/build.gradle`
- Modify: `mobile/src/native/media.ts`
- Modify: `mobile/src/native/media.test.ts`

- [ ] **Step 1: 写 JS bridge 和 Kotlin policy 失败测试**

JS 测试期望：

```ts
await sha256File('file:///video.mp4', nativeModule);
await probeVideo('file:///video.mp4', nativeModule);
```

拒绝空 URI、缺失 module、非 64 位小写 hash，以及 `{ hasVideoTrack:false }`、`durationMs<=0`、`decodedFrames<3`。

Kotlin `MediaValidationPolicyTest` 覆盖探针结果的稳定错误码映射。先在 `android/app/build.gradle` 增加 `testImplementation("junit:junit:4.13.2")`、`androidTestImplementation("androidx.test.ext:junit:1.2.1")` 和 `androidTestImplementation("androidx.test:runner:1.6.2")`。Run:

```powershell
npm test -- --runInBand src/native/media.test.ts
cd android
./gradlew.bat :app:testDebugUnitTest --no-daemon --console=plain
```

Expected: FAIL，新 bridge/Kotlin 类不存在。

- [ ] **Step 2: 实现原生 hash 与 probe**

`MediaIntegrity` 接受 file path/content URI opener，SHA-256 使用 64 KiB buffer。probe 用 `MediaExtractor` 遍历 track 和 samples，拒绝负 sample size/无 video track；读取正 duration；用 `MediaMetadataRetriever.getFrameAtTime` 在 0、duration/2、max(0,duration-100ms) 解码三帧并及时 recycle。

返回：

```kotlin
data class VideoProbeResult(
  val durationMs: Long,
  val videoTrackCount: Int,
  val decodedFrames: Int,
  val sampleCount: Long,
)
```

MediaModule 暴露 `sha256File` 和 `probeVideo` Promise 方法，所有工作在现有单线程 executor 上执行。

- [ ] **Step 3: 写真实 Android instrumentation fixture**

instrumentation 测试用 `MediaCodec` 的 AVC encoder 编码三张纯色 YUV420 frame，把 output format 和 encoded buffers 写入 `MediaMuxer`，生成一个最小有效 MP4；再创建截断副本和纯文本 `.mp4`。断言有效文件能发现视频轨/正时长/3 个解码帧，损坏文件抛出 `MEDIA_INVALID`。不提交大型二进制 fixture。

- [ ] **Step 4: 验证并提交**

```powershell
cd mobile
npm test -- --runInBand src/native/media.test.ts
cd android
./gradlew.bat :app:testDebugUnitTest :app:connectedDebugAndroidTest --no-daemon --console=plain
cd ../..
git add mobile/android/app mobile/src/native/media.ts mobile/src/native/media.test.ts
git commit -m "feat: verify downloaded video integrity natively"
```

### Task 6: 在 CAS 和 artifact operation 中强制媒体验证

**Files:**
- Create: `mobile/src/media/mediaValidation.ts`
- Create: `mobile/src/media/mediaValidation.test.ts`
- Modify: `mobile/src/media/cas.ts`
- Modify: `mobile/src/media/cas.test.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.ts`
- Modify: `mobile/src/workflows/executor/artifactOperation.test.ts`
- Modify: `mobile/src/workflows/executor/artifactErrors.ts`
- Modify: `mobile/src/tasks/sync.ts`

- [ ] **Step 1: 写 CAS 重读验证失败测试**

构造 files fake：输入流 hash 为 A，但 publish 后 `readChunks(relativePath)` 返回 B。断言 `put` 抛 `ARTIFACT_INTEGRITY_FAILED`，不会返回 blob，坏的无引用文件进入可清理状态。正确重读、既有相同 blob 和 copy race 都通过。

Run:

```powershell
npm test -- --runInBand src/media/cas.test.ts
```

Expected: FAIL，CasFiles 没有 readChunks 且只验证 size。

- [ ] **Step 2: 实现分块重读 hash**

扩展 `CasFiles.read(path, offset, length)` 或 `readChunks(path)`，生产实现使用 `File.open('r')`/handle 分块读取并 finally close。发布后计算 hash 与 byteSize，必须同时匹配。保持所有现有 `casFailure` 为 canonical non-retryable 完整性错误；下载 attempt 策略在上层决定是否临时重试。

- [ ] **Step 3: 写 artifact attempt 失败测试**

probe 在 attempt 1/2 抛媒体无效，断言 operation 回到 PENDING、错误码 `ARTIFACT_MEDIA_INVALID_RETRYABLE`；attempt 3 进入 FAILED、错误码 `ARTIFACT_MEDIA_INVALID`。三个场景都断言 task/asset 未成为 DOWNLOADED、没有 EXPORT operation。

Run:

```powershell
npm test -- --runInBand src/media/mediaValidation.test.ts src/workflows/executor/artifactOperation.test.ts
```

Expected: FAIL，handler 没有 probe 且完整性错误当前直接终态。

- [ ] **Step 4: 接入验证策略**

`mediaValidation.ts` 导出 `classifyMediaValidationFailure(attempt)` 和安全中文投影信息。artifact handler 在 `cas.put` 后、commit 前调用 `verifyVideo(localUri)`。attempt `<3` 时用现有指数退避 retry；attempt `>=3` finish FAILED。非 video artifact 不运行视频 probe，但仍执行 CAS 重读 hash。

`sync.ts` 注入 `probeVideo`，并把错误码写入 download projection；不暴露原生异常细节。

- [ ] **Step 5: 验证并提交**

```powershell
npm test -- --runInBand src/media/cas.test.ts src/media/mediaValidation.test.ts src/workflows/executor/artifactOperation.test.ts src/workflows/executor/mediaDeliveryAcceptance.test.ts
npm run typecheck
git add mobile/src/media mobile/src/workflows/executor mobile/src/tasks/sync.ts
git commit -m "fix: reject invalid media before durable commit"
```

### Task 7: 提供坏副本的 durable 重新下载路径

**Files:**
- Modify: `mobile/src/workflows/executor/mediaCommandService.ts`
- Modify: `mobile/src/workflows/executor/mediaCommandService.test.ts`
- Modify: `mobile/src/workflows/executor/manualMediaAcceptance.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/media/VideoPlayer.tsx`
- Modify: `mobile/src/media/VideoPlayer.test.tsx`
- Modify: `mobile/app/video/[id].tsx`
- Modify: `mobile/src/route-tests/video-detail.test.tsx`

- [ ] **Step 1: 写坏副本失效事务失败测试**

seed DOWNLOADED/EXPORTED task、asset、delivery、CAS ref 和 SUCCEEDED canonical download。调用 `requestRedownload(taskId)` 后断言：

- task local_uri/gallery_uri 清空，download_state=ENQUEUED，export_state=NOT_REQUESTED；
- asset local_path 清空、status=queued、export_status=NOT_REQUESTED；
- 精确 workflow-artifact ref 删除，其他 ref 保留；
- delivery 保留审计但变为 FAILED/`SOURCE_INVALIDATED`；
- 创建 `manual:1`，并发两次收敛为同一 active operation；
- 任一步 SQL 失败全部回滚。

Run:

```powershell
npm test -- --runInBand src/workflows/executor/mediaCommandService.test.ts src/workflows/executor/manualMediaAcceptance.test.ts
```

Expected: FAIL，service 无 `requestRedownload`。

- [ ] **Step 2: 实现 transactional redownload**

复用 literal-safe manual family generation。事务内读取 blob ref、更新三个投影、标记 delivery、删除精确 ref、append ARTIFACT_DOWNLOAD。事务外由 facade 运行 command cycle；物理 CAS 文件交给既有 GC，不在 UI/事务中删除。

- [ ] **Step 3: 写播放器错误分流失败测试**

VideoPlayer 收到本地 source 的 status error 后调用 probe：探针成功只显示“重试播放”；探针失败显示“重新下载”并触发 `onInvalidSource`。远程 source 或 transient probe failure 不误删。VideoDetail 点击重新下载后调用 durable facade 并 reload。

Run:

```powershell
npm test -- --runInBand src/media/VideoPlayer.test.tsx src/route-tests/video-detail.test.tsx
```

Expected: FAIL，无 probe 和 redownload callback。

- [ ] **Step 4: 接入 UI 并提交**

VideoPlayer 增加可选 `validateSource`、`onInvalidSource`，error overlay 异步判定且按 source generation 忽略过期结果。VideoDetail 只有已验证 localSource 时提供 redownload，执行中禁用按钮并显示明确 Alert。

```powershell
npm test -- --runInBand src/workflows/executor/mediaCommandService.test.ts src/workflows/executor/manualMediaAcceptance.test.ts src/media/VideoPlayer.test.tsx src/route-tests/video-detail.test.tsx
npm run typecheck
git add mobile/src/workflows/executor/mediaCommandService* mobile/src/tasks/sync.ts mobile/src/media/VideoPlayer* mobile/app/video mobile/src/route-tests/video-detail.test.tsx
git commit -m "fix: redownload invalid gallery media durably"
```

### Task 8: 让 MediaStore 按内容身份复用或替换

**Files:**
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/MediaStoreGateway.kt`
- Create: `mobile/android/app/src/test/java/com/example/autodlh3/MediaStorePublisherTest.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/MediaStorePublisher.kt`

- [ ] **Step 1: 写 publisher 失败测试**

用 fake gateway 覆盖：同 display name + 同 SHA 返回 alreadyExisted 且不 insert；不同 SHA 删除旧 row 后 insert/write/finalize；旧 row hash 读取失败也替换；写入失败删除 pending；多个旧 row 时删除全部不一致条目，最终仅一个完成条目。

Run:

```powershell
cd mobile/android
./gradlew.bat :app:testDebugUnitTest --no-daemon --console=plain
```

Expected: FAIL，publisher 直接依赖 ContentResolver 且无 hash 比较。

- [ ] **Step 2: 提取 gateway 并实现内容判断**

`MediaStoreGateway` 只暴露 query/insert/openInput/openOutput/finalize/delete；Android 实现包装 ContentResolver。Publisher 复用 `MediaIntegrity.sha256(InputStream)` 对源和候选目标计算 hash。先完整读取源 hash，再决定 REUSE/REPLACE，避免在判断前消耗实际复制流。

只查询 `Movies/AutoDL-H3/` + sanitized display name，不碰其他目录或用户文件。

- [ ] **Step 3: 验证并提交**

```powershell
cd mobile/android
./gradlew.bat :app:testDebugUnitTest --no-daemon --console=plain
cd ../..
git add mobile/android/app/src/main/java/com/example/autodlh3/MediaStoreGateway.kt mobile/android/app/src/main/java/com/example/autodlh3/MediaStorePublisher.kt mobile/android/app/src/test/java/com/example/autodlh3/MediaStorePublisherTest.kt
git commit -m "fix: replace stale gallery media by content"
```

### Task 9: 补齐权限、终态通知、去重和 scoped 停服

**Files:**
- Create: `mobile/src/tasks/terminalEvents.ts`
- Create: `mobile/src/tasks/terminalEvents.test.ts`
- Create: `mobile/android/app/src/main/java/com/example/autodlh3/TaskNotificationManager.kt`
- Create: `mobile/android/app/src/test/java/com/example/autodlh3/TaskNotificationPolicyTest.kt`
- Modify: `mobile/src/workflows/executor/jobStateRepository.ts`
- Modify: `mobile/src/workflows/executor/jobStateRepository.test.ts`
- Modify: `mobile/src/tasks/sync.ts`
- Modify: `mobile/src/native/taskMonitor.ts`
- Modify: `mobile/src/native/taskMonitor.test.ts`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorModule.kt`
- Modify: `mobile/android/app/src/main/java/com/example/autodlh3/TaskMonitorService.kt`
- Modify: `mobile/index.js`
- Modify: `mobile/app/(tabs)/tasks.tsx`
- Modify: `mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 1: 写终态事件筛选失败测试**

job state repository 新增 `listTerminalEvents(jobIds)`。真实 SQLite 测试插入 STATUS_RECONCILED 的 RUNNING/SUCCEEDED/PARTIAL/CANCELLED、STATUS_SYNC_FAILED、网络 retry 事件，断言仅最终 SUCCESS/PARTIAL_SUCCESS/FAILED/CANCELLED 返回，按 created_at/id 稳定排序，并携带 eventId/taskId/status。

Run:

```powershell
npm test -- --runInBand src/tasks/terminalEvents.test.ts src/workflows/executor/jobStateRepository.test.ts
```

Expected: FAIL，repository 无批量终态事件查询。

- [ ] **Step 2: 实现安全的通知事件投影**

SQL 限定 job IDs 和终态 event 类型，结合事件 payload/current job status。`terminalEvents.ts` 生成不含 URL、token、完整 Prompt 的短 title/body：成功、部分成功、失败、取消。service sync summary 返回 `terminalEvents` 和 scoped `remaining`。

- [ ] **Step 3: 写 JS monitor 权限与 headless 编排失败测试**

测试 start 顺序：requestPermission→native.start→service tick。拒绝返回 `{ started:false, reason:'permission-denied' }`，不调 start。Headless tick 先 publish terminal events，再在 scoped remaining=0 时 stop；publish/stop 重试不会重复事件。

Run:

```powershell
npm test -- --runInBand src/native/taskMonitor.test.ts src/tasks/terminalEvents.test.ts src/route-tests/tasks.test.tsx
```

Expected: FAIL，native bridge 没有 permission/publish 方法，UI 静默失败。

- [ ] **Step 4: 写 Kotlin 通知 policy 失败测试**

用内存 preference gateway 测 event IDs 原子去重、最多保留最近 256 条、重复 publish 不调用 notifier；任务状态映射到不同标题；常驻文案为 `正在监控 N 个任务`。

Run:

```powershell
cd mobile/android
./gradlew.bat :app:testDebugUnitTest --no-daemon --console=plain
```

Expected: FAIL，TaskNotificationManager 不存在。

- [ ] **Step 5: 实现原生权限和通知**

TaskMonitorModule 实现 `PermissionListener`，暴露：

```kotlin
requestNotificationPermission(promise)
publishTerminalEvents(events, promise)
```

Android <33 直接允许；>=33 使用 `PermissionAwareActivity.requestPermissions`，同一时间只允许一个 pending promise。TaskNotificationManager 建立 LOW 的 monitor channel 和 DEFAULT 的 result channel；SharedPreferences 以 JSON/有序字符串保存最近 256 个 event ID；PendingIntent 使用 `autodlh3://tasks`、immutable/update-current 与唯一 request code。

TaskMonitorService 每次 start/update task IDs 后用 `NotificationManager.notify` 更新 `N`。stop 时清 running 标志但不清已通知集合。

- [ ] **Step 6: 接入 JS、UI 和 headless**

`startTaskMonitor` 返回 discriminated result 而不是 boolean。TasksScreen 对 permission denied、no-active-tasks、native-unavailable 和 start-failed 分别 Alert。`mobile/index.js` 使用 service sync 返回的 terminalEvents 调 publish，再按 scoped remaining 停止。

- [ ] **Step 7: 验证并提交**

```powershell
cd mobile
npm test -- --runInBand src/native/taskMonitor.test.ts src/tasks/terminalEvents.test.ts src/workflows/executor/jobStateRepository.test.ts src/route-tests/tasks.test.tsx src/tasks/sync.test.ts
npm run typecheck
cd android
./gradlew.bat :app:testDebugUnitTest --no-daemon --console=plain
cd ../..
git add mobile/index.js mobile/app/'(tabs)'/tasks.tsx mobile/src/native/taskMonitor* mobile/src/tasks/terminalEvents* mobile/src/tasks/sync.ts mobile/src/workflows/executor/jobStateRepository* mobile/src/route-tests/tasks.test.tsx mobile/android/app/src/main/java/com/example/autodlh3/Task* mobile/android/app/src/test/java/com/example/autodlh3/TaskNotificationPolicyTest.kt
git commit -m "feat: notify terminal monitored task results"
```

### Task 10: 自动化总门禁、Android 验收与发布证据

**Files:**
- Modify: `docs/superpowers/verification/2026-09-04-c-closure-hotfix.md`
- Modify: `docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md`
- Modify: `docs/superpowers/reviews/2026-09-04-task-list-refresh-performance-review.md` only if the user explicitly wants the untracked dev review imported into this branch; otherwise reference it without copying.

- [ ] **Step 1: 跑完整 JS/SQLite 门禁**

```powershell
cd mobile
$env:CI='true'
npm run typecheck
npm test -- --runInBand
npx expo install --check
```

Expected: zero failed suites/tests/type errors/dependency mismatches。记录 suite/test 精确计数和唯一预期 console fault-injection 输出。

- [ ] **Step 2: 跑 Android 单元、instrumentation 和 debug build**

```powershell
cd mobile/android
$env:JAVA_HOME='C:\Users\fai_l\.jdks\jbr-21.0.11'
./gradlew.bat :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --console=plain
```

Expected: BUILD SUCCESSFUL；记录 task 数、APK byte size、SHA-256、设备 ABI 和测试数。

- [ ] **Step 3: fresh install 与 schema/崩溃检查**

```powershell
$adb='C:\Users\fai_l\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb uninstall com.example.autodlh3
& $adb install mobile/android/app/build/outputs/apk/debug/app-debug.apk
& $adb shell am start -W -n com.example.autodlh3/.MainActivity
& $adb logcat -d | Select-String 'FATAL EXCEPTION|SQLiteException|ReactNativeJS.*Error'
```

拉取 DB，确认 `user_version=6`、现有表完整且无 migration。

- [ ] **Step 4: 执行本轮八项设备场景**

逐项记录 task/job/operation/artifact/blob/ref/asset/delivery/event row 和文件/MediaStore/通知证据：

1. 有效视频下载、本地播放、相册播放；
2. 纯文本/截断 MP4 不进入 DOWNLOADED/EXPORTED，第三次后明确失败；
3. 已有坏副本重新下载，新文件可播放且相册同名只有一个有效条目；
4. 活跃任务断网超过 60 秒再联网，不重启/不提交即可继续并下载；
5. seed 100+ 历史任务，普通 poll 的 maintenance probes 为零且 UI 无明显卡顿；
6. Android 13+ 权限拒绝不启动监控，允许后显示 `N` 个任务；
7. 完成/失败各一条结果通知，重复 headless tick 和重启不重复，结束后服务停止；
8. Prompt 10001、非法 duration/resolution/seed 分别在创建页拦截且 DB 无新增，修正后只提交一次。

若任何项失败：停止发布，用 `superpowers:systematic-debugging` 建立聚焦失败测试后再修复。

- [ ] **Step 5: 回归既有 v1.4.9 设备门**

重新验证 auto-export on/off、keep-private-copy on/off、manual save/retry、native publish 后重启幂等、缺失投影修复、background/foreground 状态，以及 Prompt/Timeline 携带项。此前 v1.4.8→v1.4.9 数据保留证据仍有效；若 APK 行为影响启动或 schema，则重新跑覆盖升级。

- [ ] **Step 6: 独立审查**

使用 `superpowers:requesting-code-review`，审查基线 `ae526b97` 到最终 HEAD，重点：

- 未验证媒体是否能进入成功投影；
- redownload 是否误删其他 ref/相册文件；
- network recovery 是否重放 UNKNOWN submit；
- SQL summary 是否遗漏终态任务的下载/导出；
- notification 是否泄露敏感字段或重复；
- 表单失败路径是否写数据库/读 token；
- maintenance cooldown 是否会永久饿死修复。

必须无 Critical/Important；对合理 finding 走 TDD 修复并重新完整验证。

- [ ] **Step 7: 更新证据并提交**

把真实命令、计数、APK hash、设备证据、性能观察和审查结论写入 verification/handoff。不得把未执行项标为 PASS。

```powershell
git diff --check
git status --short
git add docs/superpowers/verification/2026-09-04-c-closure-hotfix.md docs/superpowers/handoffs/2026-09-01-c-d-stages-handoff.md
git commit -m "docs: record v1.4.9 reliability verification"
```

- [ ] **Step 8: 最终发布前只读检查**

```powershell
git diff --check 8a6ec4d3...HEAD
git status --short
git log --oneline 8a6ec4d3..HEAD
rg -n 'ensureTaskMedia|ensureTaskDownloaded|exportTaskVideo|createTaskCoordinator|createMediaDeliveryQueue' mobile
```

Expected: diff clean、工作树无意外文件、旧媒体直连符号零匹配。只有用户确认所有人工设备场景 PASS 后，才能进入 PR、合并、annotated `v1.4.9` tag、Release workflow 和签名资产复核。
