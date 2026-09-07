# ARTIFACT_PRIVATE_NETWORK 下载失败静态审查

> 审查时间：2026-09-07（同日补充用户实证，见第 8 节：根因已确认为 VPN Fake-IP 与保留段黑名单碰撞）
> 审查对象：任务成功后下载报 `ARTIFACT_PRIVATE_NETWORK`（真机任务队列截图：job `submission-1788748457837-…` 状态"成功"、下载错误 `ARTIFACT_PRIVATE_NETWORK`、非重试类永久失败）。审查起因是用户怀疑"最终结果的下载 CDN 是 AutoDL 上的随机节点，URL 不稳定被拦截"。
> 审查方法：纯静态审查。追踪该错误码的定义、触发点与调用链：`tasks/downloadPolicy.ts` → `security/urlPolicy.ts`（TS 路径）；`native/media.ts` → Android `ArtifactTransferPolicy.kt`（原生路径）；下载入口 `workflows/executor/artifactOperation.ts` 与 `tasks/executorRuntime.ts`；产物 URL 来源 `workflows/providers/autodl/{adapter,mapping,client,manifest}.ts`。

## 1. 总体结论

**根因已确认（第 8 节用户实证）：VPN Fake-IP 地址池与 `isPublic` 保留段黑名单精确碰撞。** 手机开启代理客户端（Clash/sing-box 等，fake-ip DNS 模式）时，`InetAddress.getAllByName()` 对下载域名返回 `198.18.0.0/15` 虚拟地址；`ArtifactTransferPolicy.kt:55` 恰好显式拒绝该段（IETF 基准测试保留段）→ 触发点 ② → `ARTIFACT_PRIVATE_NETWORK`。关闭 VPN 则解析到真实公网 IP，下载正常。表现为确定性复现（开 VPN 必失败、关 VPN 必成功），与"随机 CDN 节点、URL 不稳定"无关，也不是域名拦截（HOST_DENIED 被 `allowProviderSuppliedPublicHosts: true` 实际关闭）。

原静态分析的两个触发点依然成立，优先级修正为：

1. **DNS 解析结果含任一非公网地址**（已实证的主因：fake-ip 虚拟地址被拒）。且这是**假阳性**——连接 fake-ip 的流量会被 VPN TUN 截获并按域名代理转发，"私网地址"并非真实目的地，SSRF 防护在虚拟化 DNS 环境下误伤正常下载。
2. **DNS 解析异常被误报为"私网错误"**（次因：VPN 处于 DNS 拦截/故障模式时走触发点 ①，同样表现为该错误码）。

两者叠加"错误码混淆 + 根因被吞"两个设计缺陷，导致现场无法区分、UI 只显示单一错误码。

## 2. 拦截点定位

Android 原生传输路径的 DNS 校验（`mobile/android/app/src/main/java/com/example/autodlh3/ArtifactTransferPolicy.kt:121-131`）：

```kotlin
fun resolvePublic(host: String): List<InetAddress> {
  val addresses = try {
    dns(host)
  } catch (error: Exception) {
    throw ArtifactTransferException("ARTIFACT_PRIVATE_NETWORK", false, error)  // 触发点 ①
  }
  if (addresses.isEmpty() || addresses.any { !isPublic(it) }) {
    throw ArtifactTransferException("ARTIFACT_PRIVATE_NETWORK", false)         // 触发点 ②
  }
  return addresses
}
```

调用链：任务成功 → `ARTIFACT_DOWNLOAD` 操作 → `handleArtifactDownload`（`workflows/executor/artifactOperation.ts:264-308`）→ 原生 `transferArtifact`（`native/media.ts:164-172`）→ `ArtifactTransferPolicy.validate`（`ArtifactTransferPolicy.kt:133-158`，第 156 行 `resolvePublic(host)`）。

TS 回退路径（无原生模块时）只做 URL 字面量校验、不做 DNS 解析（`security/urlPolicy.ts:73-82`），不会因 DNS 抖动触发该码——因此该问题仅在 Android 真机（原生模块可用）路径出现。

## 3. 触发条件详析

### 触发点 ①：DNS 异常 → `ARTIFACT_PRIVATE_NETWORK`（高危设计缺陷）

- `dns` 默认实现 `InetAddress.getAllByName`（`ArtifactTransferPolicy.kt:36`），抛出的任何异常（`UnknownHostException`、DNS 超时、`SocketTimeoutException` 等）都被 catch 后改判为 `ARTIFACT_PRIVATE_NETWORK`，`retryable=false`。
- 语义混淆：**DNS 解析失败 ≠ 私网地址**。这与 TS 侧 `urlPolicy.ts:79` 的 `PRIVATE_NETWORK`（仅字面量私网地址）语义不一致。
- `retryable=false` 使 executor 不自动重试，UI 呈现"成功 + 下载永久失败"，与截图现象完全吻合。
- 间歇性成功任务失败的最可能解释：生成期间网络正常（Provider API 请求均成功），下载触发时 DNS 瞬时抖动。

### 触发点 ②：解析结果含任一非公网地址

- `addresses.any { !isPublic(it) }`：混合记录中只要一条不过关即整体拒绝（fail-closed 是有意的，但与 CDN 随机解析叠加后变成间歇性故障）。
- `isPublic` 的拒绝范围（`ArtifactTransferPolicy.kt:47-119`）：回环/链路本地/站点本地/组播，`0.0.0.0/8`、CGNAT `100.64.0.0/10`、`192.0.0.0/24`、TEST-NET、`198.18/15`、保留段 `≥240`，IPv6 非 `2000::/3` 全拒、NAT64 内嵌 v4 独立复检等。
- **`198.18.0.0/15` 条目（第 55 行）与代理客户端 Fake-IP 模式精确碰撞**（已实证，见第 8 节）：Clash 默认 fake-ip 池 `198.18.0.1/16`、sing-box 默认 `198.18.0.0/15`。VPN 开启时 DNS 应答是该池内的虚拟地址，被当成非公网地址整体拒绝。
- TS 回退路径同样拒绝该段（`security/urlPolicy.ts:23` `(a === 198 && (b === 18 || b === 19))`），即该碰撞是双端一致的策略选择，只是 TS 路径不做 DNS 解析、真机上不会走到。
- 边界：URL 主机名为 `*.local`/`*.localhost` 或私网 IP 字面量时，TS 侧（`urlPolicy.ts:59-63,79`）与原生侧都会稳定拒绝；但那样会 100% 失败而非偶发，与本案例（此前同类任务成功）不符，基本可排除。

## 4. 可排除的假设

| 假设 | 证据 | 结论 |
|---|---|---|
| 域名白名单拦截（HOST_DENIED） | `autodl/manifest.ts:11` 配置 `allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true`；`downloadPolicy.ts:16` 在 opt-in 时传 `{}` 跳过白名单；原生侧 `ArtifactTransferPolicy.kt:150-155` 同样跳过 | 排除。任意公网 HTTPS 主机均放行（此特权此前已被 2026-09-03 评审记录） |
| 重试复用过期签名 URL（403） | 重试复用存储的 `artifact.uri`（`artifactOperation.ts:269,296-297`），若 URL 过期应报 `ARTIFACT_HTTP_REJECTED`（HTTP 403 → 不可重试分支，`downloadPolicy.ts:133-137`）而非 `ARTIFACT_PRIVATE_NETWORK` | 排除 |
| URL 字面量本身是私网地址 | 该情况会 100% 失败，且 TS 侧同样会拦；与"同类任务此前成功"矛盾 | 基本排除 |
| MIME/大小/超时类失败 | 均有独立错误码（`ARTIFACT_MIME_REJECTED`/`ARTIFACT_SIZE_REJECTED`/`ARTIFACT_*_TIMEOUT`），不会归并为该码 | 排除 |

## 5. 设计问题清单

1. **[高] 错误码混淆 + retryable 错误判定**：`resolvePublic` 将 DNS 异常改判为 `ARTIFACT_PRIVATE_NETWORK`、`retryable=false`（`ArtifactTransferPolicy.kt:124-126`）。DNS 故障多为瞬时可恢复，应拆出独立的可重试错误码（如 `ARTIFACT_DNS_FAILED`，retryable=true），否则任务被错误地呈现为永久失败。
2. **[高] 根因信息丢失**：异常 `cause`（如 `UnknownHostException: Unable to resolve host "…"`）虽随异常携带（第 125 行），但 UI/诊断仅显示 `diagnosticCode`，现场无法区分触发点 ① 与 ②。建议诊断信息附加 cause 摘要及（调试构建下）解析到的地址列表。
3. **[中] 单次 DNS 判定、无重试与宽容度**：`resolvePublic` 只查询一次，任一记录非公网即整体拒绝。对混合记录主机可考虑：仅记录告警并剔除非公网地址继续、或二次查询复核，避免 CDN 随机解析导致的间歇性全拒。
4. **[中] 双端策略不一致**：TS 回退路径不做 DNS 校验（`urlPolicy.ts` 仅查字面量），原生路径做 DNS 级校验。同一 URL 在两端的拦截行为不同，安全策略应显式声明差异或对齐。
5. **[低] 复用此前评审已记录的开放面**：`allowProviderSuppliedPublicHosts: true` 使 `allowedHosts: ['autodl.art']` 形同虚设（见 2026-09-03-a-b-stage-review-for-c-d.md 问题 7）。与本次故障无直接因果，但意味着"域名拦截"永远不是该错误码的来源。

## 6. 验证方法（下步动作）

1. 真机重试时抓取 logcat：`adb logcat | findstr /i "UnknownHost resolve autodl"`——若出现 `UnknownHostException` 即坐实触发点 ①。
2. 需精确定位时，在 `resolvePublic` 临时打印 `dns(host)` 返回的地址列表（注意勿在生产日志泄露用户网络拓扑）。
3. 复现触发点 ① 的单测已存在（`ArtifactTransferPolicyTest.kt:129` 以 dns 抛异常断言该码），修复时应同步更新断言为新错误码与 retryable 语义。

## 7. 修复建议（供决策）

- 拆分错误码：DNS 异常 → `ARTIFACT_DNS_FAILED`（retryable=true）；解析结果非公网 → 维持 `ARTIFACT_PRIVATE_NETWORK`（retryable=false）。
- executor 侧对可重试 DNS 失败走既有退避重试，而非永久失败。
- 诊断投影中透出 cause 摘要（错误类名 + 主机名即可，不含完整堆栈）。
- 同步补齐 TS/原生两端策略一致性文档（或行为对齐）。

## 8. 用户实证补充（2026-09-07）：与 VPN 开关 100% 相关

用户在真机上观察到确定性规律：**关闭 VPN 不报错，开启 VPN 必报 `ARTIFACT_PRIVATE_NETWORK`**。结合第 3 节代码证据，根因锁定为：

### 根因链（Fake-IP 碰撞，触发点 ②）

1. 代理客户端（Clash/sing-box 等 Android VPN 类应用）以 **fake-ip DNS 模式**运行：DNS 查询不返回真实 IP，而是返回虚拟地址池中的占位 IP（sing-box 默认 `198.18.0.0/15`，Clash 默认 `198.18.0.1/16`），并在本地维护"域名 ↔ 虚拟 IP"映射。
2. `ArtifactTransferPolicy.resolvePublic` → `InetAddress.getAllByName("下载域名")` 返回 `198.18.x.x`（虚拟地址，非真实目的地）。
3. `isExplicitlyNonPublicV4`（`ArtifactTransferPolicy.kt:55`）将 `198.18.0.0/15` 判为非公网 → `ARTIFACT_PRIVATE_NETWORK`，`retryable=false`，任务呈现"成功但下载永久失败"。
4. 关闭 VPN → DNS 返回真实公网 IP → 校验通过，下载正常。

### 为什么这是假阳性

fake-ip 模式下，应用后续对 `198.18.x.x` 的 TCP 连接会被 VPN 的 TUN 接口截获，由代理客户端按**原始域名**（SNI/Host）转发——该"地址"根本不会路由到任何私网。SSRF 防护的意图（阻止 App 访问本机/局域网服务）在虚拟化 DNS 环境下不成立：地址是虚拟占位符，真实路由决策完全在 VPN 客户端。防护逻辑只看 DNS 应答的地址字面量，无法感知这一层，造成确定性误杀。

同样机制下，VPN 处于 DNS 拦截/故障模式时走触发点 ①（解析异常 → 同一错误码），两条路径在 VPN 环境下均可达。

### 修复选项（针对 fake-ip 碰撞，需权衡）

- **选项 A（推荐）：将 `198.18.0.0/15` 从"拒绝"降级为"VPN 虚拟地址"特判**——放行并继续连接。安全性论证：该段不可路由到真实网络，开启 VPN 时连接由 TUN 按域名接管；未开 VPN 时连接 `198.18.x.x` 会直接失败（无目的地），不会造成私网访问。SSRF 防护对其余私网段（10/8、172.16/12、192.168/16、127/8、CGNAT 等）保持不变。
- **选项 B：引入独立错误码 `ARTIFACT_VIRTUAL_DNS`**（提示"检测到 VPN/代理虚拟 DNS 地址，请为下载域名配置 real-ip/直连或关闭 fake-ip-filter"），retryable=false 但文案可指导用户。可与 A 叠加：A 保障可用性，B 保留知情权。
- **选项 C（不改代码的用户侧规避）**：在代理客户端配置中将 AutoDL 下载域名加入 `fake-ip-filter`（real-ip 模式）或设为 DIRECT——立即可用，但依赖用户自行配置，不应作为产品方案。
- TS 侧（`urlPolicy.ts:23`）如需对齐，仅影响无原生模块回退路径，可暂不动。

### 对原假设清单的修正

- 第 1 节原"最可能根因：DNS 瞬时抖动（触发点 ①）"降级为次因；主因是触发点 ② 的 fake-ip 碰撞（确定性、可复现、与 VPN 开关强相关）。
- 第 3 节"CDN 随机解析混合记录"假设不再必要——单段 `198.18/15` 的碰撞已足以解释全部现象。
- 第 5 节问题 1/2（错误码混淆、根因被吞）维持有效：若当时透出了 cause 或解析地址，本根因可提前定位。
