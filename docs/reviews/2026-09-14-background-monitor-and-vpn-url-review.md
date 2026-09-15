# 后台任务监控可用性与 VPN 场景下载拦截审查

日期：2026-09-14。范围：当前 Android App（Expo 57 / React Native 0.86.3）。本文为评估交付，基于静态代码审查与既有评审/验证文档，未做真机复现；不代表修复已完成。

> 2026-09-15 复核：请以[复核及修复计划](2026-09-15-background-monitor-and-vpn-remediation-plan.md)为后续实施依据。本文的“VPN 感知放行安全性”“Fake-IP 根因已确证”“服务仅执行固定任务集”等结论已被修正；复核另补充监控范围不一致、状态失真及 Android 15+ dataSync 超时缺失。下文保留为原始评审记录，勿直接按原第 4 节实施。

## 1. 结论摘要

**后台监控在安卓"不可用"不是单一代码缺陷，而是架构分层设计与平台约束共同作用的结果**：JS 前台轮询设计上进后台即停；WorkManager 兜底受 15 分钟系统下限与 Doze/OEM 查杀约束；唯一可靠链路（前台服务）是 opt-in 且需通知权限，其 OEM 存活性从未真机验证。

**VPN 场景下载拦截的根因已在前次评审确认**（2026-09-07）：fake-ip DNS 返回的 `198.18.0.0/15` 与保留段黑名单碰撞。当前代码已实施诊断错误码 `ARTIFACT_VIRTUAL_DNS`，但未提供产品级兼容路径；用户侧规避依赖代理客户端配置。本文给出 VPN 感知放行（推荐）、DoH 自解析、强化引导三个候选方案及约束边界。

## 2. 后台任务监控：四条链路的实际行为

架构综述（引用 `docs/superpowers/archive/reviews/2026-09-04-task-list-refresh-performance-review.md` B1/B2/B3 表）与代码核验结果：

| 链路 | 触发/间隔 | 入口 | 可靠性 | 核验结论 |
| --- | --- | --- | --- | --- |
| JS 前台自适应轮询 | 1–10 s | `foregroundExecutorScheduler.ts` | 进后台即停 | 设计行为，非缺陷 |
| B1 前台服务（"开启持续监控"） | 2 min | `TaskMonitorService.kt` → Headless JS | 最可靠，但 opt-in + 多重门槛 | 平台约束显著 |
| B2 `expo-background-task` | ≥15 min，inexact | `mobile/src/tasks/background.ts` | 机会性 | 平台下限，不可依赖 |
| B3 回前台同步 | AppState→active | `mobile/app/_layout.tsx` | 非真后台 | — |

### 2.1 JS 前台轮询：设计上进后台即停

`mobile/app/_layout.tsx:43-46`：AppState 每次变化无条件 `foreground.stop()`，仅 `state === 'active'` 时重启。1–10 秒自适应调度（`foregroundExecutorScheduler.ts:14-51`）在进入后台的瞬间被杀死。这是 2026-08-31 性能解耦计划的既定决策（前台可见时抑制重复后台轮询），不是 bug。

### 2.2 B2 WorkManager 兜底：受平台硬约束

| 位置 | 代码事实 | 影响 |
| --- | --- | --- |
| `mobile/src/tasks/background.ts:17` | `registerTaskAsync(H3_BACKGROUND_TASK, { minimumInterval: 15 })` | 15 分钟是 WorkManager 系统下限，且 inexact |
| `background.ts:8-15` | 任务内 `runSlice({ trigger: 'background' })`，有余量时自重注册 | 依赖系统调度，无即时性 |
| `mobile/app/_layout.tsx:41` | `void registerBackgroundSync()` | **注册抛错会成为未处理 rejection：静默失败、无提示、无重试（改进项）** |

平台约束（既有文档 2026-08-31 plan 第 390 行已声明）：Doze、OEM 省电策略（小米/华为激进杀后台）、`requiresBatteryNotLow` 默认开启、用户强杀后不运行。实际频率可能是几十分钟到数小时甚至不跑。**架构上已明确不承诺精确频率，该链路只能当作兜底。**

### 2.3 B1 前台服务：唯一可靠路径，但 opt-in 且门槛多

| 位置 | 代码事实 | 影响 |
| --- | --- | --- |
| `mobile/app/(tabs)/tasks.tsx:54` | 手动按钮"开启/停止持续监控" | 默认关闭，不开启则后台无可靠轮询 |
| `mobile/src/native/taskMonitor.ts:29` | 通知权限被拒 → `permission-denied`，不启动 | Android 13+ 运行时权限门槛 |
| `taskMonitor.ts:25` | 无活跃任务 → `no-active-tasks` | 无任务时不可开启 |
| `taskMonitor.ts:53` | `remainingDue + remainingScheduled === 0 && nextWakeAt == null` 时自动停服 | 任务全部终态后服务自停（v1.4.9 修复后的正确行为） |
| `TaskMonitorService.kt:14` | 主线程 `Handler.postDelayed` 2 min 循环 | Doze 下不保证精确；`START_STICKY` 被杀后重启时机不确定 |
| `TaskMonitorService.kt:28` | headless 只读取 `SharedPreferences` 中固化的 taskIds | 服务只轮询启动时的任务集，非全量 |
| `TaskMonitorHeadlessService.kt` | 90 s 超时、`allowsForegroundExecution = true` | 配置合理 |

既有评审（2026-09-04 review 第 103 行）明确记录：**各 OEM（小米/华为）下 FGS 存活、headless JS 真机行为从未验证**；2026-09-04 c-closure hotfix 验证覆盖了权限门、通知去重、自停条件（模拟器），真机生命周期验收仍缺。

### 2.4 "不可用"的归因

遇到后台监控不工作时，按概率排查：

1. **未开启持续监控**（默认关闭，无 B1 时后台只剩 ≥15 min 的机会性 B2）；
2. **通知权限被拒**（Android 13+，UI 已有 Alert 提示 `tasks.tsx:43`）；
3. **被省电策略查杀**（OEM 电池优化/一键清理，`START_STICKY` 不保证及时复活）;
4. 任务全部终态后服务自动停止（预期行为，易被误解为"坏了"）;
5. headless 仅轮询固化任务集，新增任务不在服务范围内（需停止后重开）。

改进项：`_layout.tsx:41` 的静默注册失败应捕获并上报/重试；B1 在 OEM 查杀后的恢复无自愈机制（可评估 WorkManager 周期任务作为 FGS 存活探针）。

## 3. VPN 场景下载拦截：现状与方案

### 3.1 根因（已确证，引用 2026-09-07 评审）

拦截点**不在域名白名单**：AutoDL manifest 使用 `allowProviderSuppliedPublicHosts: true`（`mobile/src/workflows/providers/autodl/manifest.ts:12`），`allowedHosts: ['autodl.art']` 实际不生效（`downloadPolicy.ts:18` 传空 policy）。真正的拦截点是 DNS 级检查：

- `ArtifactTransferPolicy.kt:124-152` `resolvePublic`：DNS 应答中任一非公网地址即拒；
- `ArtifactTransferPolicy.kt:58` `198.18/15`（IETF 基准测试保留段）显式列入黑名单；
- VPN fake-ip 模式（Clash 默认池 `198.18.0.1/16`、sing-box 默认 `198.18.0.0/15`）下 DNS 返回该段虚拟地址 → 全量命中 → 开 VPN 必失败、关 VPN 必成功（2026-09-07 用户实证）；
- fake-ip 地址仅是本地占位符，TCP 连接被 VPN TUN 截获后按域名（SNI/Host）转发，"私网地址"并非真实目的地——SSRF 防护在此场景下误伤。

2026-09-07 修复实施的是诊断方案（选项 B）：全部答案属于 `198.18/15` 且 host 为域名时返回不可重试的 `ARTIFACT_VIRTUAL_DNS`，文案引导用户配置真实 DNS（`artifactErrors.ts:65-67`）；混合答案与 IP 字面量仍报 `ARTIFACT_PRIVATE_NETWORK`。

### 3.2 不改代码的规避（现行方案）

| 方式 | 说明 |
| --- | --- |
| 代理客户端 `fake-ip-filter` | Clash/Mihomo 将 AutoDL 下载域名加入过滤（real-ip 解析）；sing-box 对应 realip 配置。错误文案已引导此路径 |
| 域名 DIRECT + real-ip | 仅设 DIRECT 不保证应用获得真实 IP（2026-09-07 评审已澄清），必须同时保证 DNS 真实解析 |

局限：依赖用户自行配置代理客户端，产品层面不可控。

### 3.3 产品级候选方案

**方案 1：VPN 感知放行（推荐）**

检测 `ConnectivityManager` 存在活跃 `TRANSPORT_VPN` 网络时，对"域名 host + 全部答案 ∈ `198.18/15`"放行连接；其余情况维持现状。

- 安全性论证：TLS 仍按域名校验真实证书，端点身份保证不变；fake-ip 流量只能经 TUN 按域名转发，不存在对内网的真实访问；未开 VPN 时该段无真实目的地，仍保持拒绝。
- 与 2026-09-07 评审的关系：该评审基于 IANA "Globally Reachable=false" 拒绝的是**无条件放行**（选项 A）；条件化为 VPN 感知后，"本地网络可能路由该段"的担忧不再成立——非 VPN 环境下连接 `198.18.x.x` 依旧失败/被拒。
- 注意点：`mobile/src/security/urlPolicy.ts:23`（TS 侧字面 IP 检查）有同样的 `198.18/15` 拒绝，需同步决策保持一致；混合答案（fake-ip + 其他非公网）仍应拒绝；错误码保留，作为非 VPN 环境的诊断路径。

**方案 2：DoH 自解析**

为 `ArtifactTransferPolicy` 与 OkHttp 换用 DoH（自定义 `Dns` 实现），绕开被 VPN 接管的系统 DNS，直接获得真实 IP；`resolvePublic` 校验照常且结果真实。

- 优点：不依赖 VPN 类型判断，对全局/规则模式均有效。
- 代价：实现工作量较大（DoH 客户端、缓存、失败回退）；部分代理规则可能拦截 DoH 服务器本身，需多 provider 容错。

**方案 3：维持现状 + 强化引导**

保留 `ARTIFACT_VIRTUAL_DNS`，检测到 VPN 活跃时升级文案为具体配置指引（一键复制 `fake-ip-filter` 片段 / 说明页深链）。零安全面变化，但可用性仍依赖用户配置。

### 3.4 不要踩回去的约束（来自既有评审的既定决策）

| 约束 | 依据 |
| --- | --- |
| 不恢复固定域名白名单 | AutoDL 存储节点动态无稳定前缀，v1.4.5 曾因此 HOST_DENIED 误杀（2026-09-01 handoff） |
| 不无条件放行 `198.18/15` | IANA 特殊用途表 + 2026-09-07 评审决议；IP 字面量、混合答案仍拒绝 |
| `allowProviderSuppliedPublicHosts` 维持现状 | 已知"形同虚设"风险（2026-09-03 M6）为记录在案的可接受约束 |
| 下载仍限 HTTPS + 每跳重校验 + SHA-256 | 既有 M6 安全框架，任何方案不得削弱 |

## 4. 后续建议

1. **实施方案 1（VPN 感知放行）**，配套单测：VPN 活跃 + 全 fake-ip → 放行；VPN 活跃 + 混合答案 → 拒绝；无 VPN + fake-ip → `ARTIFACT_VIRTUAL_DNS`。真机验收：Clash/sing-box 各一，开/关 VPN 对照下载。
2. **修复 `_layout.tsx:41` 静默注册失败**（捕获 + 诊断上报 + 择机重试）。
3. **补齐 B1 真机生命周期验收**（2026-09-04 review 遗留）：至少覆盖一台激进省电 OEM，验证 FGS 查杀后通知/恢复行为。
4. 监控文案补充"任务终态后自动停止"的预期说明，减少"坏了"的误报。

## 5. 证据边界

本文所有代码行为结论来自静态审查（文件与行号均已列出）；四链路在真机上的实际频率、OEM 查杀行为、VPN 放行方案的有效性均未实测。既有验证文档（2026-09-04 c-closure hotfix）基于模拟器。方案 1 的实施不得以本文替代真机验收。
