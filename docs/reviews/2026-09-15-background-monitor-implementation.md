# 后台监控与 VPN 下载实施记录

日期：2026-09-15。对应[复核及修复计划](2026-09-15-background-monitor-and-vpn-remediation-plan.md)。代码及本记录随本轮修复提交，未发布。

## 已实施

- 后台注册有共享状态、并发合并、固定诊断分类和最多三次退避重试；回前台重试，后台/卸载取消定时器，任务页可手动重试。只读及维护入口保持准入限制。
- 持续监控使用全局执行/待办汇总，新增任务自动纳入。停服前在 SQLite 写事务内先获取 writer lock，再检查全局 PENDING/CLAIMED、执行器租约、wake generation 和未读事件，避免 WAL 快照与并发提交的竞态。该停服提交后创建的新任务属于监控已结束之后的工作，需用户重新开启。
- 每次开启生成独立原生 sessionId，旧 headless 回调只能影响原会话。同会话 JS tick 合并，通知分批读取、游标持久化，原生按会话校验后发布；启动 Promise 在服务真正进入前台后完成。
- 数据库版本 10 → 11 → 12，新增 task_monitor_events 及事件插入/删除触发器，v12 补齐提交/状态同步终态失败事件。AUTOINCREMENT 序列即使事件删除也不回退；开启时取当前序列，避免重放历史事件。升级不回填旧事件，已有任务/媒体数据保留。维护替换数据库前停止监控由 `_layout.tsx` 与 `getMonitorQueue` 维护门控共同实现。
- 服务状态来自当前进程生命周期，持久启用意图单独呈现。任务页订阅状态事件并在聚焦/回前台刷新；停止原因区分完成、用户停止、系统超时及启动失败。空 intent 重启重建全局通知。
- dataSync 实现 onTimeout，及时撤销 tick、停止前台服务及 stopSelf，不等待 JS 完成，也不后台强拉重启。持久操作仍通过现有 lease/recovery 恢复。
- 通知权限拒绝及权限请求失败不阻止 FGS 启动，UI 告知普通完成提醒不可用。禁用通知时游标仍消费，后续开启权限不会补发整个历史。
- VPN 下载仍拒绝私网/保留地址；补充纯 benchmark 测试，保留公网+benchmark、其他私网混合、IP 字面量和 IPv6 校验。增加网络错误中文分类与任务卡片内排查说明，包含 Mihomo 模式差异、sing-box 1.12+ 说明及官方链接，复用现有重试下载入口。

没有添加“复制下载域名配置”：现有持久化诊断刻意不保存实际失败跳域名，原始产物 URL 也不能可靠代表重定向失败跳。UI 明确让用户在代理客户端确认该域名，避免生成错误规则或泄漏签名 URL。

## 默认关闭的 DoH 原型

`DohTransferPrototype.kt` 已接入原生下载入口，但必须同时满足 Debug 构建和显式 `-PartifactDohPrototype=true` 才启用。Release 即使传此属性也不会启用；普通 Debug 构建同样关闭。验证命令示例：

```powershell
$env:JAVA_HOME='C:/Users/fai_l/.jdks/jbr-21.0.11'
./gradlew.bat :app:assembleDebug '-PreactNativeArchitectures=x86_64' '-PartifactDohPrototype=true' --console=plain --max-workers=2
```

原型使用 OkHttp 4.12.0 DnsOverHttps、Cloudflare HTTPS 端点和固定 bootstrap IP；DNS POST，5 秒超时，不使用解析/HTTP 缓存（有效 TTL=0），无系统 DNS 回退。每次下载独立解析会话，可取消正在等待的 DoH 请求。URL 预检和实际连接 DNS 共用公网校验器，原始 hostname/SNI/证书校验及每跳校验保留。

DNS 与下载 socket 绑定启动时的 Android activeNetwork，保留该网络上的 VPN 路由；禁用 HTTP/SOCKS 代理选择，避免代理远端重新解析绕过本地检查。网络身份变化后后续解析失败重试，不复用旧缓存；在途连接仍绑定旧网络，断开按现有网络重试恢复。

原型限制：这是一个单解析服务、零缓存、以验证安全边界为目的的实现。启用后域名查询会交给 Cloudflare；其在用户 VPN/地区下的可达性、CDN 区域结果和生产隐私配置尚未验收。OkHttp DoH 对 A/AAAA 部分查询失败的处理及生产缓存策略仍需独立评估，不应据此宣布任意 VPN 透明兼容已交付。尚未启用该原型访问用户真实下载地址。

## 验证

- TypeScript `tsc --noEmit` 通过。
- Jest 全套（审查修复后）：171 suites 通过、1 suite 跳过；1221 tests 通过、2 tests 跳过。
- Android JVM 全套：55 项通过，0 failures / errors；包含 5 项 DoH 测试（HTTPS POST、本地可信证书、无缓存重解析、公网转私网、重定向校验、网络切换、取消等待、DNS 失败分类）。测试未关闭 TLS 主机名验证。
- Android 17 / API 37、x86_64、16KB page 模拟器：TaskMonitorInstrumentedTest 3 项通过，验证真实服务启动、空 intent 入口、旧会话拒绝、过期启动不停止新会话、无效冷启动退出、直接调用超时回调退出及持久意图不伪装运行状态。此测试直接调用 onTimeout，并未等待系统累计六小时或修改设备时限；无效冷启动经过真实 startForegroundService 并等待 6 秒检查退出，尚未在 Android 8–11 验证。
- Debug x86_64 APK 构建通过；安装后任务页正常显示，点击无任务的监控入口显示“当前没有可监控的任务”。日志有 ReactHost 启动阶段 context-not-ready 的非致命 SoftException，页面加载和交互成功，未发现本次 App 致命崩溃。
- 数据库测试包括历史版本迁移与新建结构一致、v10 数据保留、事件分页/删除不回退游标、WAL 独立写连接无法越过停服确认、真实 executorRuntime 不再按旧 IDs 过滤 B 的待办。

原生验证命令：

```powershell
./gradlew.bat :app:testDebugUnitTest :app:connectedDebugAndroidTest '-Pandroid.testInstrumentationRunnerArguments.class=com.example.autodlh3.TaskMonitorInstrumentedTest' '-PreactNativeArchitectures=x86_64' --console=plain --max-workers=2
```

## 合并审查修复复核（2026-09-15）

五项 Important 已处理：

1. FGS 在校验会话前创建通知并调用 startForeground；无效会话按 startId 退出，已运行的新会话不受旧启动 intent 影响。新增上述原生回归覆盖。
2. v12 迁移 DROP + CREATE 插入触发器，补获实际执行器写入的 SUBMIT_FAILED / STATUS_SYNC_FAILED；读取侧直接映射 FAILED，不依赖这些事件并不存在的 payload.status。真实 durableExecutor 测试覆盖提交拒绝、状态同步 HTTP 400 失败及游标消费；真实 SQLite 测试覆盖已安装 v11 升级、保留序列和不重放升级前遗漏事件。
3. headless 增加错误边界，单 tick 的维护准入、执行器、队列读取、原生发布或停服拒绝不会成为未处理 rejection；测试验证后续 tick 能重试。另补四页 drain 上限及下一 tick 从持久游标继续的用例。
4. 补齐 PRIVATE_NETWORK / NETWORK / CONNECT_TIMEOUT / IDLE_TIMEOUT 的中文文案、重试性与原始错误不外泄断言。
5. 下载帮助入口集中支持原始错误码及统一 formatter 输出，保留历史中文匹配；包含 HTTP_RETRYABLE。错误映射及组件测试均按七种网络错误码验证入口，不再单独依赖手写中文 regex。

顺手修复：ensure 主动重试取消已有退避计时器；任务页显示用户停止原因；说明停服事务跨原生 await 的必要性及主线程停顿可能耗尽其他写者重试预算的限制。

两项审查陈述经核对不适用：当前安装的 Expo SQLite `SQLiteDatabase.ts` 中 withExclusiveTransactionAsync 使用独立连接上的普通 BEGIN，因此仍需显式首次写入获取 writer lock；[Mihomo 官方 DNS 文档](https://wiki.metacubex.one/config/dns/)明确支持 blacklist / whitelist / rule，现有 rule 模式说明保留。

Minor 跟踪：监控事件表仍随 job-events 删除触发清理，尚未独立按游标修剪，中间 STATUS_RECONCILED 也会占用记录；DoH 传输失败仍归 DNS_UNKNOWN_HOST；原型和依赖仍打入 Release 但门控关闭。这些项目保留到事件保留策略及 DoH 产品化时处理。快速连续 start 拒绝旧 Promise 的会话语义保持不变。

本次最终验证：TypeScript 通过；Jest 全套 171 suites / 1221 tests 通过（1 suite / 2 tests 跳过），随后加强迁移版本断言的 7 项定向测试通过；Android JVM 8 suites / 55 tests 与模拟器 3 项 instrumented tests 均无失败，Gradle BUILD SUCCESSFUL。`git diff --check` 通过。

## 发布前仍需验收

提交前复核 Approved 报告：五项 Important 的通过结论成立。遗留项中“失败映射无测试覆盖”需要澄清：`durableExecutor.test.ts` 的 submit/status 参数化测试通过真实执行器生成事件，直接调用真实 `queue.read()` 断言 FAILED 及游标消费，已同时覆盖触发器和消费映射。ensure 定时器取消、用户停止文案、四页 drain 测试也已完成，不再列为待办；rule 模式的官方依据见上文。尚待处理的是事件修剪、DoH reason/Release 依赖隔离及以下发布验收。

实际 Android 15/16 设备的系统时限触发、锁屏 Doze、OEM 回收/省电、强停后行为；Clash/Mihomo 与 sing-box 的真实 Fake-IP 下载、规则/全局模式、App 排除、网络切换；通知权限拒绝下长时间监控。当前模拟器测试及 MockWebServer 不能替代这些场景。通知沿用既有“先记录 eventId 再发布”的去重策略，极端进程死亡窗口可能漏一次提示，未承诺跨系统通知服务的严格 exactly-once。
