# Beta 41 增量审查证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


日期 2026-11-01，HEAD `096bd561`，基线 `3f7864a3`。本轮没有修改产品代码；三个临时探针运行后均移至本目录。报告：[工作台审查](../../reviews/2026-11-01-workbench-beta41-review.md)。

## 独立检查

- targeted-tests.log/json：8 个既有文件 60 项通过。
- runtime-probe.log/json：运行缓存既有 29 项通过，另有 1 项不良行为探针复现成功。
- settings-probe.log/json：复制既有设置页测试 16 项与不良行为探针 1 项；既有 16 项已包含在 targeted-tests 中，不重复计数。
- media-review-probe.log/json：1 项不良行为复现成功。
- 总计既有回归 9 文件、89 项；不良行为探针 3 项。“探针通过”表示问题复现，不能作为正确性验收。
- typecheck.log：TypeScript 通过；skill-bundle.log：36 文件校验通过。

既有相关回归在 mobile 运行：

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/settings/llmConnections.test.ts src/settings/storage.test.ts src/settings/draft.test.ts src/route-tests/settings.test.tsx src/creative/TimelineScreen.test.tsx src/creative/CreativeWorkspace.test.tsx src/creative/ProjectSearchScreen.test.tsx src/navigation/creativeNavigation.test.ts
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/agent/runtimeStore.test.ts
npm run typecheck
npm run verify:skills
```

探针副本与原运行位置：

| 证据副本 | 原运行位置 |
| --- | --- |
| runtime-probe.audit.test.ts | mobile/src/agent/beta41Runtime.audit.test.ts |
| settings-probe.audit.test.tsx | mobile/src/route-tests/beta41Settings.audit.test.tsx |
| media-review-probe.audit.test.tsx | mobile/src/creative/beta41MediaReview.audit.test.tsx |

复跑时复制到原位置，用 jest --runInBand --runTestsByPath 指定，运行后移出产品目录。三个文件都断言当前不良行为；修复后应改成正确期望，不应原样合并。运行缓存探针用 fake Agent factory，设置探针注入读取失败，媒体检查探针 mock 数据和外发入口；均不读设备密钥或发请求。

## 设备、构建与安装

设备 emulator-5554，ABI 列表 x86_64,arm64-v8a，包 com.example.autodlh3.beta。开始为 beta.40/code79。

1. install.log：现成手机 ARM beta.41 覆盖安装成功，但启动遇 SoLoader libreactnative.so 加载失败；launch-crash.log 保存原始日志。当前模拟器的转译问题不计为已确认手机端缺陷。
2. emulator-build.log：同 HEAD 用 JDK 17、Android SDK 和 reactNativeArchitectures=x86_64 构建 :app:assembleBeta，成功（5m50s）。没有修改源码。初次未设 JDK、随后 JDK 25 不兼容的环境问题已通过使用现有 JDK 17 解决；最终日志为成功构建。
3. install-x86.log：x86_64 beta.41 覆盖安装成功、数据保留；实际运行 versionName beta.41/code80。
4. emulator-apk-hash.txt：x86_64 包 SHA-256 `A5AE9001AD6BE087A77A16AFAAFCD1E2C713959191FF35BF9321C8B22F3D6922`。该包在 mobile/android/app/build/outputs/apk/beta/app-beta.apk；未覆盖 build/phone-beta/ 中手机 ARM 交付包。

## 本轮截图

- 01-start：安装前 beta.40；仅记录起始环境，不作为最新功能证据。
- 02-beta41：ARM 包在模拟器启动失败；不能作为正常页面截图。
- 03-beta41-start：x86 包启动后的创作入口；有既有数据，非本轮生成。
- 04-projects、05-overview、06-overview-tools：进入既有 QA 项目、概览和工具区。
- 07-review-default：媒体检查默认状态。
- 08-review-edited：检查要求末尾追加 QA-beta41-unsaved，键盘收起后保留。
- 09-left-without-confirmation：点击页头返回直接回项目，没有确认。
- 10-review-reset：重入后文本恢复默认，追加内容消失。最后已返回项目。
- media-review-flow.png：08/09/10 的缩小并排，仅用于显示原始证据；原图仍保留。由 make-contact-sheet.ps1 生成并已视觉检查。

capture.cjs 在每次 tap/type/scroll 前读取新鲜 uiautomator XML，坐标从目标或可滚动节点 bounds 计算；PNG 为 adb screencap 原图。没有重用旧轮次截图作为本轮证据。

没有配置/保存模型连接、安装 Skill、准备/发送媒体检查、创建/合成时间线或主动触发生成。应用原有页面可能有既有账号状态展示；本轮未点击刷新用量或对外请求按钮。未做 ARM 真机、OEM、TalkBack、大字、进程死亡与冷启动全矩阵验收。


## 随仓库保留的文件

- [08-review-edited.png](08-review-edited.png)
- [08-review-edited.xml](08-review-edited.xml)
- [09-left-without-confirmation.png](09-left-without-confirmation.png)
- [09-left-without-confirmation.xml](09-left-without-confirmation.xml)
- [10-review-reset.png](10-review-reset.png)
- [10-review-reset.xml](10-review-reset.xml)
- [emulator-apk-hash.txt](emulator-apk-hash.txt)
- [media-review-flow.png](media-review-flow.png)
- [media-review-probe.audit.test.tsx](media-review-probe.audit.test.tsx)
- [media-review-probe.json](media-review-probe.json)
- [runtime-probe.audit.test.ts](runtime-probe.audit.test.ts)
- [runtime-probe.json](runtime-probe.json)
- [settings-probe.audit.test.tsx](settings-probe.audit.test.tsx)
- [settings-probe.json](settings-probe.json)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
