# 后台监控与 VPN 下载：复核及修复计划

日期：2026-09-15。复核基线：`14ec370b`，App 1.4.25，Expo 57，React Native 0.86.3，实际 Gradle 配置 compileSdk/targetSdk 均为 36。

范围：复核 [9 月 14 日评审](2026-09-14-background-monitor-and-vpn-url-review.md)，对照当前源码、既有测试、9 月 7 日最终处置及 Android 官方资料制定计划。本次交付是评估与规划，不代表功能修复或真机复现完成。

> 实施更新：工作区修复及默认关闭的 DoH 原型已完成，测试与尚待设备验收的边界见[实施记录](2026-09-15-background-monitor-implementation.md)。以下保留为实施前复核基线。

## 1. 决策

- 后台注册失败未处理确实存在；监控范围不一致、运行状态失真以及 Android 15+ 超时未处理也应修复。
- Fake-IP 地址被拒的代码路径确实存在，但用户现场根因仍待 DNS/错误码证据确认。不能把“开 VPN 失败、关闭成功”直接等同于已确认 Fake-IP。
- 不采用“检测到 VPN 就放行 198.18/15”。短期完善诊断和真实 DNS 配置引导；透明兼容作为独立 DoH 原型验证，达到验收标准后再纳入产品。
- 前台调度停止、后台任务机会性执行属于既定行为。持续监控也不能承诺无限运行、固定两分钟执行或强停后自动恢复。

## 2. 逐项核实

| 原评审结论 | 复核结果与当前证据 | 处置 |
| --- | --- | --- |
| JS 进后台即停，固定 1–10 秒轮询 | 部分正确。`mobile/app/_layout.tsx:74–84` 停止调度；`foregroundExecutorScheduler.ts` 的 stop 只取消后续定时与订阅，不取消已在执行的 slice。当前调度按 nextWakeAt，积压时 1 秒，错误退避可到约 60 秒，无工作则 idle；不是固定 1–10 秒。 | 修正文档，不恢复后台 JS 定时器。 |
| B2 最小 15 分钟、不可保证准点 | 成立。`mobile/src/tasks/background.ts:16–18` 配置 15 分钟，系统仍可推迟。 | 保留兜底定位。 |
| B2 默认要求电量不低，自重注册调度下次 | 不符合本地 Expo 57 实现。`BackgroundTaskScheduler.kt` 未设置 requiresBatteryNotLow；API 26+ 使用带 CONNECTED 约束和初始延迟的一次性工作链，旧系统分支使用周期工作。App 的 registerBackgroundSync 已注册时直接返回，并非每次主动重排。 | 删除不适用的实现描述，勿把周期 WorkManager 下限当成所有分支的实现原理。 |
| 后台注册失败未处理 | 成立。`_layout.tsx:74` 直接 void，`background.ts` 的查询/注册无 catch；失败路径没有诊断、用户状态或重试。运行时可能报未处理 rejection，不能断言一定完全静默。 | P1。 |
| Android 13+ 必须允许通知才能启动 FGS | App 当前确实这样限制（`taskMonitor.ts:29`），但这是产品门槛，不是 Android 启动 FGS 的必需权限。 | P2：解耦通知能力与运行能力。 |
| 服务只执行固化任务集 | 描述错误，但存在更实质的范围缺陷。原生固化 IDs；`executorRuntime.ts:170` 调用全局 cycle，`:173` 的 pendingSummary 才按 IDs 过滤，`:179` 的终态通知也按 IDs 过滤。 | P1：统一执行、通知与停服范围。 |
| 所有任务终态后自停是正确行为 | 对所监控范围无剩余操作且无 nextWakeAt 时成立；不是仅看任务终态。旧任务集为空闲时，即使全局仍有新任务操作，也可能停服。 | 与范围修复合并；区分任务终态与下载/导出完成。 |
| FGS 是唯一可靠路径，START_STICKY 可恢复 | 只能称可提高持续性，无法保证。遗漏 dataSync 超时处理；running 持久化也不能证明服务存活。 | P1 超时，P2 状态。 |
| Fake-IP 根因已由 9 月 7 日确证 | 错误引用。9 月 7 日文档第 9 节已明确撤回“已确认”，承认没有现场 DNS/异常证据。 | 保留为首要假设，补设备对照证据。 |
| 仅全部答案为 Fake-IP 才报 VIRTUAL_DNS，混合均为 PRIVATE_NETWORK | 描述不准。`ArtifactTransferPolicy.kt:141–153` 检查的是非公网答案子集：公网 + benchmark 仍报 VIRTUAL_DNS；benchmark + 其他非公网才报 PRIVATE_NETWORK。已有 Kotlin 测试明确断言此前者。两者均拒绝连接。 | 修正文档，保留既有安全行为及分类，不为迎合旧文档改代码。 |
| AutoDL 动态公网主机放行、HTTPS/逐跳 DNS 校验仍有效 | 成立。manifest 显式开启 allowProviderSuppliedPublicHosts；原生 validate 和实际连接 DNS 均校验。原文“downloadPolicy.ts:18 传空 policy”不是当前 providers/downloadPolicy.ts 的逻辑，策略归一化仍保留 allowedHosts。 | 保留动态 CDN 权限与原生检查。 |
| VPN 感知放行不扩大安全面 | 不成立，见下一节。 | 撤回原推荐。 |
| OEM 生命周期、Clash/sing-box 下载需真机验收 | 成立；本次静态复核及单测不能替代。 | 作为发布验收，不宣称已复现或解决。 |

## 3. 新确认的缺陷及触发条件

### M1 / P1：监控范围不一致，可能提前停服及漏通知

入口：`TaskMonitorService.kt:16–28` 固化 IDs；`taskMonitor.ts:18–20,49–54` 传给执行器与通知读取；`executorRuntime.ts:170–179` 使用不同范围。

触发例：开启监控时只有 A，之后创建 B。服务 slice 可处理 B，但 A 完成后，按 A 汇总无工作且无待处理 wake generation 时就调用 stop；B 可能仍有下次轮询/下载，且 B 的终态不在通知读取范围。全局 wake 的 trailing generation 可能延缓一次停服，但不能消除这一不一致。

这比“新增任务完全不执行，重开即可”更准确。新测试必须经过真实 runtime wiring，不能只 mock runSlice 的返回值。

### M2 / P1：dataSync 缺失超时退出

`AndroidManifest.xml` 将 TaskMonitorService 声明为 dataSync；实际 targetSdk=36；服务没有 `onTimeout(int,int)`。在 Android 15+ 达到后台 dataSync 时限后，当前代码没有按平台要求及时 stopSelf，存在进程异常风险。触发依赖实际后台累计运行时间，尚未在设备复现。

平台对这类服务有每 24 小时累计 6 小时预算，回到前台会重置计时；超时后必须在数秒内退出，不能靠重启服务绕过。[Android FGS 超时说明](https://developer.android.com/develop/background-work/services/fgs/timeout)

### M3 / P2：监控状态可失真

`TaskMonitorModule.kt:getStatus` 仅读 SharedPreferences.running；正常 onDestroy 才清 false，进程非正常死亡不能依赖该回调。START_STICKY 空 intent 重启没有重建 running/任务数通知，onCreate 先显示 0 个任务。

`mobile/app/(tabs)/tasks.tsx:27` 仅 mount 时读状态，服务自行停止后已挂载页面仍显示“停止持续监控”，用户下一次点击先执行 stop 而不是 start。添加解释文案不能单独修好这个缺陷。

### V1：VPN 存在不是目标地址安全性的证明

Android VPN 可按应用、路由范围配置，存在旁路能力。即使确认当前连接走 VPN，VPN 也可能是普通企业内网隧道，不提供 Fake-IP 映射；路由到 benchmark 地址也不等于路由到公网。网络能力快照还可能在连接前后变化。[Android VPN 配置 API](https://developer.android.com/reference/android/net/VpnService.Builder)

TLS 验证域名证书，只能帮助确认域名身份，不能证明最终 IP 是公网。原文“fake-ip 只能经 TUN 转发、不存在内网访问”的推论没有足够依据。SHA-256 本地计算也不是公网地址证明，且当前 expectedSha256 为可选字段。

TS 的 urlPolicy 仅做 URL 字面量检查，没有 DNS 能力。继续拒绝 198.18/15 字面 IP 与“域名解析到 fake-ip 的兼容”并不冲突；不应为此同步放宽 TS 黑名单。

## 4. 按依赖排序的修复计划

### 第一批：后台可靠性，优先完成

1. **注册状态与重试（P1）。** 在 `background.ts` 提供共享的注册协调逻辑，合并并发查询/注册，捕获两类失败；`_layout.tsx` 启动及回前台调用，失败时有限退避重试并在退出/数据库维护时取消。持久或可订阅状态包含未注册、已注册、失败及最后尝试时间；UI 提供非阻塞提示与手动重试。诊断只保存固定错误分类，避免持久化异常原文。验收：查询失败、注册失败、失败后成功、并发调用、卸载取消及只读/维护期间不启动写入。
2. **统一为开启期间的全局监控（P1）。** 配合目前全局执行器的语义，服务存储监控会话/用户启用意图，而不是把启动 IDs 当永久执行范围；启动仍需有可处理任务。service slice 用全局 pendingSummary，终态通知按会话范围及持久 eventId 游标/去重读取，避免重放开启前所有历史事件。新增任务自动纳入；结束前在同一协调机制中复核队列与 wake generation，解决“确认空闲后恰好提交任务”的竞态；手动停止不可被旧 headless slice 或新任务反向重启。验收：A 完成而 B 定时待处理时保持服务，B 通知恰好一次；下载/导出待处理时不误停；全部操作结束后停；重启及并发 stop/start 的会话隔离。
3. **处理系统超时（P1）。** 原生 onTimeout 取消后续 tick、记录停止原因、撤销前台状态并及时 stopSelf；不要等待 JS/下载结束才退出。确保在途操作由现有持久 lease/recovery 恢复，旧回调不能影响新会话。保持 B2 兜底并在回前台提供重新开启入口。验收：API 35+ 缩短系统测试时限，无 RemoteServiceException，无自动重启循环，恢复后不重复发布或丢失工作。
4. **状态与文案（P2，与上述同批）。** getStatus 以当前进程服务生命周期为准，持久启用意图与实际运行状态分开；重启重建通知和状态。任务页通过原生事件更新，回前台/重新聚焦再读取，启动失败及停止原因有明确文案。说明“任务和相关媒体操作完成后自动停止；系统可能延迟或终止后台执行”。验收：自动停服、进程重启、空 intent、页面保持挂载、快速点击与启动异步失败。

建议拆为三个可独立审查的改动：注册恢复、全局监控及状态、系统超时。全局监控涉及通知游标/会话持久化时，应沿现有数据库迁移规则实现。

### 第二批：VPN 下载恢复体验

1. **固定当前拒绝策略，完善诊断矩阵。** 保留 DNS_FAILED 可自动重试，VIRTUAL_DNS / PRIVATE_NETWORK 不自动重试；增加纯 benchmark、公网+benchmark、benchmark+私网、IP 字面量、IPv6 与 DNS 异常的明确断言。用现有固定错误码/原因说明问题；不记录完整签名 URL、DNS 原始地址或用户网络拓扑。
2. **真实 DNS 配置引导与恢复入口。** 任务失败信息说明该错误仅提示可能的 Fake-IP；区分 DNS 解析失败、保留地址拒绝、一般连接失败。提供适用代理客户端的版本化说明与手动重试入口。复制配置时仅取实际失败跳的合法域名，不复制 URL 查询参数；不能假设 autodl.art 覆盖所有 CDN。仅 DIRECT 不足以保证真实 DNS。
3. **通知权限解耦（P2）。** 通知被拒时仍允许用户开启 FGS，显式提示普通完成通知不可见；权限请求异常与原生启动失败分别处理，保留创建 FGS 通知的要求。Android 并不要求先授予 POST_NOTIFICATIONS 才能启动 FGS。[通知权限说明](https://developer.android.com/develop/ui/compose/notifications/notification-permission)

这批改善可诊断性和恢复流程，但不声称实现透明 Fake-IP 兼容。

### 第三批：DoH 透明兼容原型及发布门槛

目标是在用户不改代理配置时获得可验证公网解析；原型默认关闭，验证通过再决定正式启用方式。

- 将解析器抽象注入 ArtifactTransferPolicy 与实际 OkHttp Dns，两处均使用同一策略，避免只修预校验、连接仍走系统 Fake-IP。
- 保持原始 HTTPS hostname/SNI/证书校验；逐跳校验并确保实际连接采用已校验解析结果；不得在解析失败时回退到未经检查的地址。
- 定义 DoH bootstrap、超时、TTL/有界缓存、取消、网络切换清缓存及失败分类；检查系统 HTTP 代理路径，不能仅凭 Dns 注入宣称所有连接都受控。
- 先验证一个明确的解析服务及其可达性、域名查询隐私、CDN 区域性；第二解析服务不是无条件必需项。DoH 受阻时保持明确失败/安全回退，不承诺覆盖所有 VPN。
- 单测覆盖 rebinding、每跳私网、混合答案、解析失败、缓存过期、网络切换及取消。保留 HTTPS、主机策略、大小/MIME 校验、哈希与临时文件清理。
- Clash/Mihomo 与 sing-box 分别验证 fake-ip、real-ip、规则/全局、App 排除及开关切换；确认 VPN 下载成功且私网仍拒绝后，才可把“兼容”写入发布说明。

不实施 WorkManager 定期强拉 FGS 的通用“自愈”：Android 12+ 限制后台启动 FGS，且不能借此突破时限或用户强停意图。探针可做诊断，恢复入口留在合法生命周期或用户操作中。[后台启动限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)

## 5. 验证与证据边界

本次已运行当前基线的 Jest 定向测试：taskMonitor、executorRunner、foregroundExecutorScheduler、root-layout、tasks、artifactErrors、urlPolicy；7 个套件，44 项全部通过。它们证明已有约定仍成立，不代表新发现的跨层缺陷已被覆盖；例如 taskMonitor 单测 mock 了 executorRuntime，无法发现全局执行与局部汇总不一致。

Android 当前基线测试：`gradlew.bat :app:testDebugUnitTest --tests 'com.example.autodlh3.ArtifactTransfer*' --console=plain --max-workers=2`，使用 JBR 21；BUILD SUCCESSFUL，ArtifactTransferPolicyTest 10 项、ArtifactTransferTest 18 项，共 28 项通过，无失败或错误。`git diff --check` 通过。本次仅修改评审及计划文档。

修复后的发布验收还须包含：至少一台 Android 15+ 设备、一台激进省电 OEM；锁屏/Doze、断网重连、系统回收与用户强停分开记录、服务自动停止/重新开启、A/B 动态任务、下载/导出未结束、通知拒绝、系统超时。留存版本、OS、时间戳、前后台状态和固定诊断码。OEM 存活、真实 Fake-IP 根因、DoH 可达性目前均未实测。

参考：15 分钟及系统延迟的产品契约见 [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)，具体实现以本地安装的 57.0.16 为准；VPN 历史证据以 [9 月 7 日评审第 9 节](../superpowers/archive/reviews/2026-09-07-artifact-private-network-download-review.md) 为准，不能只引用其前文已修正的推断。
