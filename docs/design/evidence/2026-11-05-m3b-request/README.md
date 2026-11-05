# M3b1 单次请求设备证据

日期：2026-11-05（Asia/Shanghai）。源码基于 `e6fc2dff` + 已认可 M3a 工作树继续，未提交。现有 Android APK、主题、RootApp 和路由；没有创建网页替代品。

## 版本与方法

使用任务创建的只读 AVD `AutoDL_Keyboard_QA_20261025`，serial `emulator-5556`，Android 17/API 37，x86_64，1080×2400、density 420、字体 1.0。隔离包 `com.example.autodlh3`，未操作 `.beta`。启动时系统 UI 曾 ANR，选择 Wait 后恢复；不计为应用流程通过或失败。

既有 debug 原生壳 SHA-256 `0d0df165df5594040b170fba3d842e2466841d4f866a88dd71aba282459b835a`。本轮使用 Expo export:embed 导出 Hermes，注入同一壳后 zipalign/debug 签名并安装；无新 Gradle 或发布构建。

- [基线身份](baseline-metadata.json)：M3a 工作树 + 同一 QA 入口，截图 01。
- [采样候选身份](verified-metadata.json)：M3b1，截图 02 起；APK SHA-256 `97b15449244e25a7461ae4e42acfda76d26025f84f99a01f853de82c639c7fbe`。中间导出的 candidate/final 包未作为设备验证版本，不混列。

QA 入口 `mobile/scripts/m3b-request-device.jsx` 显式替换图片 prepare：用真实 `prepareNovelAiRequest` 从真实 SQLite 合成草稿生成请求预览，但账号绑定为合成值，跳过真实账号/服务预检；confirm 被替换为拒绝提交。设备没有使用真实凭据、发送助手消息或调用生成供应商。该替代不能验证真实账号连接、授权持久化或入队。UI 成功回调与领域前置失败分别由自动测试覆盖。

## 操作与观察

1. [01 基线](01-baseline-alert.png)：从同一线程、同一非空图片草稿打开原确认 Alert。费用、有效期、JSON 规格同段显示，没有实际发送提示词；选择取消。
2. [02 审阅顶部](02-request-top.png)：新界面按对象、账号绑定版本、实际发送内容、负面描述、素材和规格分区。能看到预设扩展提示词，未显示令牌或请求媒体编码。
3. [03 默认许可](03-permission-default.png)：下滚到消费与许可，两项未选，提交不可用。
4. [04 仅外发](04-outbound-only.png)：只选择外发，提交仍不可用。
5. [05 两项已选](05-both-checked.png)：消费也选中后提交可用；**未点击提交**。
6. [06 系统返回](06-system-back.png)：按 Android Back 回原本轮创作。列表滚动位置重置，是当前已知限制；草稿身份和内容保留。
7. [07 重开清空](07-reopen-cleared.png)：重新打开同一请求并滚到许可，两项恢复未选、提交不可用；随后点“取消，返回本轮创作”。

[前后对照](comparison.png) 使用同视口、同项目/草稿/参数的真实截图拼接，仅缩放和标签。视觉复核未发现新增文本互相覆盖或底部操作不可到达；新增滚动距离属于分区审阅取舍。检查 03/04/05 的 XML `enabled` 字段确认提交门槛由不可用变可用，APK 哈希已回读一致。

## 验证边界

类型检查通过；6 套 31 项测试通过（34.192 秒）。包含双许可门槛、重复点击一次、取消清空、项目变化拒绝、缺账号后重新准备同草稿不自动提交，以及实际 SQLite 领域准备/确认的账号失效等原回归。源码仅将输入展示与操作组织重构，领域授权服务未重写。

普通图片界面为本轮设备范围。账号恢复、视频单次、自定义工作流、图生图/蒙版/增强、计划/批次、真实提交、结果恢复、TalkBack、旋转、键盘和其他字体/尺寸没有完整设备验收。不据截图宣称全部请求字段、无障碍或完整 M3b 通过。详见 [实现记录](../../agent-m3b1-implementation.md)。
