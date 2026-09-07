# C-Core Durable Local Executor 验收记录

> 验收时间：2026-09-03（Asia/Shanghai）  
> 代码提交：`7ef0857025f98e9a5997be1feac2ca437f2987bf`  
> 分支：`codex/c-core-plan-rewrite`  
> 结论：**PASS**

## 1. 范围与结论

C-Core 六项任务已实现：schema v6 migration/recovery、leased operation 与 job revision/CAS、durable submit/status、Artifact CAS、统一有界 tick，以及发布级恢复验收。D-Core 不再受 C-Core 技术门禁阻塞，但应先把本分支集成到 `dev`，再从 v6 基线开始 D-Core Task 1。

验收期间发现并修复了一个真实缺口：进程在 Artifact `.part` 写入期间终止时，随机临时文件会残留；最初的固定 operation 路径又会在 lease 过期且旧 worker 尚存时产生并发写。最终实现按 `SHA256(operationId + NUL + attempt)` 隔离写入，并在每块写入和发布前续租/校验 owner；新 attempt 清理旧 attempt，旧 owner 失去租约后不能发布。

## 2. 自动化门

在代码提交 `7ef08570` 上运行：

```powershell
cd mobile
npm run typecheck
npm test -- --runInBand
```

结果：

- TypeScript：PASS，0 error。
- Jest：99 suites 总计，98 passed、1 phase-gated skipped；462 tests 总计，460 passed、2 skipped、0 failed。
- 两个 skip 分别是既有 live-provider opt-in 用例，以及必须由外部 seed/recover 两阶段调用的 `recoveryProcessAcceptance.test.ts` 默认入口。
- `aguiAgent.test.ts` 会按测试设计输出一次受控 `console.error`（`provider failed`），suite 仍通过。

真实 SQLite migration matrix：

```powershell
npm test -- --runInBand --verbose src/storage/migrations/runner.test.ts
```

结果：14/14 PASS，覆盖 fresh v0、legacy v0、v4→v6、v5→v6、v4→v5→v6 顺序、重复 v6、v1–v3 legacy、future schema readonly、backup 失败、DDL rollback、fresh migration 失败冷启动和 recovery-only v0 readonly。

静态门：

- `git diff --check`：PASS。
- 最终文档修改前 `git status --short`：clean。
- DDL 扫描：生产 DDL 仅位于 `storage/schema.ts`、`storage/migrations/v6DurableExecutor.ts` 和 recovery marker；其余命中均为测试 fixture/assertion。
- secret 扫描：命中均为 credential kind `autodl-token` 或显式 fake/canary fixture；未发现真实 token 或私钥。

## 3. 跨进程恢复与重复提交

`recoveryProcessAcceptance.test.ts` 使用同一物理 SQLite 文件、外部 JSONL provider 计数文件和独立的 seed/recover Jest 进程。最终运行目录为 `D:\wt\c-core-evidence\process-20260903-164441`；目录仅是本机验收产物，不是运行时依赖。

每个 case 的 seed 与 recover 都由新的 Node/Jest 进程执行，共 10/10 独立阶段 PASS：

1. **PENDING stop/relaunch**：seed 进程只落库后退出；recover 进程只产生一次 fake provider submit。最终 SUBMIT=`SUCCEEDED`, attempt=1；job=`QUEUED`, revision=2；opaque handle 已持久化；下一条 STATUS_SYNC=`PENDING`。
2. **SUBMITTING 无 handle**：过期 lease 重开后 provider 调用数为 0；job=`UNKNOWN`；原 SUBMIT=`BLOCKED`, attempt=1；后续 claim 不会重新提交。
3. **handle 已持久化**：重开后 submit 调用数为 0，只产生一次 status 调用，参数严格为 `{providerJobId:"remote-original", opaque:"opaque-original"}`；原 SUBMIT=`SUCCEEDED`，status 沿原 handle 继续。
4. **foreground/background race**：两个独立 SQLite connection、tick 和 owner 并发争用同一个 SUBMIT；claimed 总数=1、provider submit=1、operation attempt=1。
5. **Artifact part stop/relaunch**：seed 进程留下 attempt 1 part；recover 进程以 attempt 2 重试，最终 parts=0、SHA 目录只有一个 blob。并发过期/替代 attempt 测试还验证不同内容不会交错写入同一个 part。

额外 redaction case 把 `Authorization: Bearer C_CORE_CANARY token=C_CORE_CANARY` 注入 provider timeout；recover 后 operation/job/event capture 均不含 canary，只保留稳定码 `AUTODL_SUBMIT_TIMEOUT` 和通用安全消息。

独立代码审查首次报告 2 Important（固定 part 并发写、重开连接不等于进程重启）和 1 Minor（无 canary 的空泛脱敏断言）。修复后复审为 0 Critical / 0 Important / 0 Minor。

## 4. Android 构建

环境：

- 真实短 worktree：`D:\wt\cc`（不是 junction）。
- JDK：JetBrains Runtime OpenJDK `21.0.11`。
- Gradle task：`:app:assembleDebug -PreactNativeArchitectures=x86_64`。
- 最终结果：`BUILD SUCCESSFUL in 53s`；358 actionable tasks，23 executed、335 up-to-date。
- 首次完整短路径构建同样 PASS：358/358 executed，2m34s。

最终 APK：

- 路径：`D:\wt\cc\mobile\android\app\build\outputs\apk\debug\app-debug.apk`
- 大小：`125881899` bytes
- SHA-256：`1977964124DA7CC380796E23B34EC93079C34EAF0B464E4781E1FA7FF26F300A`

已知非阻塞 warning：Gradle 9 deprecation、LangChain package exports fallback、跨卷 hard-link 降级为 copy、Node `node:sqlite` experimental warning。最初通过 junction `D:\wt\c-core` 构建失败是因为 CMake 解析回长 worktree 路径并报 `build.ninja still dirty after 100 tries`；改用真实短 worktree 后问题消失，未修改 Gradle/JDK 兼容策略。

## 5. Emulator fresh install 与升级保留

设备：

- serial：`emulator-5554`
- model：`sdk_gphone16k_x86_64`
- API：37
- Android：17
- ABI：`x86_64`

Fresh install：

- `adb uninstall` + `adb install` 均返回 Success。
- `MainActivity` 为 `topResumedActivity`，CreateForm 实际渲染。
- `PRAGMA user_version=6`。
- `workflow_operations`、`workflow_job_events`、`artifact_blobs`、`artifact_blob_refs` 均存在。
- `FATAL EXCEPTION|SQLiteException|NativeDatabase|no such table`：0 match。

最终 APK `197796…F300A` 的覆盖升级：

| Fixture | 结果 | Sentinel | Backfill | Backup | Fatal scan |
|---|---|---|---|---|---|
| v4 | v6 / PASS | `task-v4`, `job-v4`, registry `hash-v4` 保留 | `remote-v4`, `OLD_v4` 保留 | `autodl-h3-v4-to-v6-1788425558084.backup.db` | 0 |
| v5 | v6 / PASS | `task-v5`, `job-v5`, registry `hash-v5` 保留 | `remote-v5`, `OLD_v5` 保留 | `autodl-h3-v5-to-v6-1788425604218.backup.db` | 0 |

两条路径均确认四张 v6 表齐全。

## 6. C-Core 提交链

- `cdbd9c46` — design C-Core durable executor
- `a1bd6962` — rewrite C-Core execution plan
- `c9e05e32` — Task 1 versioned durable executor schema
- `070f75c2` — Task 2 leased/idempotent repositories
- `e8932c4a` — Task 3 durable submit/status operations
- `c342cf1c` — Task 4 resumable Artifact CAS
- `1782119b` — Task 5 bounded scheduling/recovery
- `ad94e363`, `7ef08570` — Task 6 验收发现的 interrupted artifact 修复、attempt isolation 与 lease fencing

本记录与 handoff 更新构成 Task 6 文档提交。验收结论为 PASS。
