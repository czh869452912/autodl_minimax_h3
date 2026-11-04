# M2 分步添加：设备与验证证据

日期：2026-11-04，Asia/Shanghai。对应 [M2 实施](../../agent-m2-implementation.md)、[D003](../../decisions/0003-skill-add-stages.md)。本目录保留实际 Android 截图及同次 UI 层级；不把测试渲染器输出当作设备截图。

先看 [正常字体前后对照](comparison.png)、[大字体修复对照](font2-comparison.png) 和 [业务链采样](flow-samples.png)。对照仅缩放排列原截图与加标题，没有重绘界面。

## 构建身份与环境

- 源码：`db7aa4d6` 加已认可 M1 工作区改动及本轮 M2；未提交。对应源文件指纹见 page-catalog.json 的 M2 revision/sourceDigests。
- 基线：M1 最终采样包，SHA-256 `483f6fa0b3baa6c3da8cf2e0c69ee319d91d31ed084ad28314435a6eb4ff6f11`，见 [baseline-metadata.json](baseline-metadata.json)。沿用其原 metadata 身份与 M1 路径，本轮复制为 `build/m2-qa/baseline.apk`。
- M2 初版：见 [candidate-initial-metadata.json](candidate-initial-metadata.json)，对应截图 03–29；发现旧键盘高度占用来源页后，再限定键盘避让的阶段与焦点。
- 最终采样 APK：`build/m2-qa/candidate.apk`，SHA-256 `a128b1c87e6f9e9d3e542346570a9d6294b4867817a947a957154688cc3312bd`，对应截图 30–38，详见 [candidate-metadata.json](candidate-metadata.json)。Hermes bundle SHA-256 `c171eac6208836284fb9c12b9eee695fe1d65ec002f1d37bdac81c153bcbb0fe`。
- 原生 x86_64 debug 构建成功，再注入以既有 `scripts/m1-skill-device.jsx` 启动的最新 Hermes bundle，zipalign/debug 签名。原生壳 SHA-256 `0d0df165df5594040b170fba3d842e2466841d4f866a88dd71aba282459b835a`。M1 基线与本轮重新构建的原生壳哈希不同，不能声称共用同一 APK 字节；没有原生业务改动。此包用于隔离 QA，不是发布包。
- 设备：任务创建的 read-only AVD，`emulator-5556`，Android 17 / API 37；包名 `com.example.autodlh3`，未替换 `.beta`。普通采样 1080×2400、density 420、字体 1.0（约 411dp 宽）；大字体采样 1008×2240、同密度、字体 2.0（384dp 宽）。采样后恢复尺寸与字体设置。
- 数据：合成的“ M1 离线交互测试”项目、测试会话、手写文本和本机创建的 MD/ZIP；没有使用真实业务会话。沿用夹具的 loopback 模型配置，但本轮没有启动模型服务、发送消息、发起提炼或生成请求。

夹具异步初始化时，冷启动深链接可能被初始化导航覆盖；等待启动完成后重新发送 warm link 进入添加。这里不据此声明生产冷启动深链接通过。

## 实际完成的设备任务

| 任务 | 证据 | 观察与边界 |
| --- | --- | --- |
| 同任务基线 | 01、02 | M1 全局目录里展开旧添加与示例正文；同普通尺寸/字体与最终 33、34 比较 |
| 来源 → 用途 → 本地草稿 → 检查 | 03–08 | 本地模板按钮创建可编辑文本；07 真实软键盘展开时检查按钮仍可点击；05 文件名含 keyboard，但当时没有软键盘，不用作 IME 证据 |
| 覆盖取消、离开保护 | 09、10 | 填入示例先确认，取消保留原文；系统返回出现未保存确认，继续编辑保留输入 |
| 手写安装与定位 | 11、12 | 保存 my-creative-skill 后查看确切版本，置顶、展开；没有自动启用 |
| 原生文件选择器取消、错误恢复 | 13–16 | DocumentPicker 实际打开并取消；无 YAML 的 MD 保留编辑正文并显示错误；新导入覆盖草稿先确认 |
| ZIP 编辑、附加文件审阅与安装 | 17–20 | 根 SKILL.md 与 notes.md 保持；切换查看完整 notes.md；安装 m2-device-review 固定版本 |
| 原会话进入管理、安装、明确单次使用、返回 | 21–26 | 输入为 M2 retained input；项目管理无旧单次编辑区；相同 ZIP 再安装得到同一版本；明确用于下次消息后返回快速层，新选择替代旧未确认勾选；关闭快速层回原输入，文字保留 |
| 初版大字体问题 | 27–29 | 27 在显示设置变化后出现底部旧键盘空白；28 重启后恢复，只是现象对照，不能当作修复；29 是初版静态大字体检查页 |
| 最终大字体复核 | 30–32 | 在原输入获得焦点后切换显示设置，再 warm link 进入来源页；页面使用全高，编辑与检查主操作可达；长正文位于可滚动区域，未要求一次显示完整正文 |
| 最终普通字体与键盘、安装、定位 | 33–38 | 最终包来源与编辑对照；35 软键盘展开，直接点击检查进入 36；安装 scene-review 后 37 完成、38 定位并展开确切版本，默认仍不变 |

03–29 的业务采样属于初版；最终代码相对初版只增加焦点限定的键盘避让及对应回归测试。30–38 对最终包重测了受影响的显示与主要安装链；没有将初版所有分支伪称最终包逐项重跑。

## 写入核对

[state-installed.json](state-installed.json)：手写与 ZIP 安装后，项目默认与全局默认计数都是 0，原会话没有单次选择、没有新运行快照。

[state-selected.json](state-selected.json)：只有明确点击用于下次消息后才出现单次覆盖，固定 `9bb7c707…`；项目/全局默认仍为 0；相同 ZIP 重装未增加另一固定版本，保留 SKILL.md、notes.md。

[state-final.json](state-final.json)：最终安装后默认计数仍为 0，已有单次选择保持；`installedFinalSample` 记录最终示例 `8d6fd04c…`。这些 readback 只摘录测试范围的版本身份、文件名、默认计数及单次选择，不导出原始会话或整个数据库。本轮未发送消息，单次覆盖尚未消费；消费规则沿用 M1 设备证据及 nextRun 回归。

## 自动验证与复现

最终代码 TypeScript 检查通过；10 套相关测试、141 项全部通过。覆盖真实 SQLite 安装/幂等、编辑后重检、ZIP 附加文件、导入取消、覆盖确认、安装失败重试、明确单次选择及范围漂移拒绝、快速层管理返回、未保存保护和键盘避让。

命令在 mobile 目录运行，使用环境提供的 Node（不是 Volta shim）：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --experimental-sqlite node_modules/jest/bin/jest.js --runInBand src/agent/skills/SkillAddFlow.integration.test.tsx src/agent/skills/SkillLibraryScreen.test.tsx src/agent/skills/SkillQuickPicker.integration.test.tsx src/agent/skills/package.test.ts src/agent/skills/store.test.ts src/agent/skills/nextRun.test.ts src/agent/PromptAssistantUi.test.tsx src/agent/AgentScreen.test.tsx src/ui/draggableBottomSheet.test.tsx src/ui/KeyboardSurface.test.tsx
# android 目录，JDK 21 / Android SDK 已配置
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64
```

最终采样 bundle 用 Expo `export:embed --platform android --entry-file scripts/m1-skill-device.jsx --dev false --minify true --bytecode` 生成；最后的焦点修复由最新 bundle 进入采样包。原生构建发生在该 JS 修复之前，不能把标准 Gradle 输出误称为包含最终夹具 bundle 的采样 APK。

相关构建与测试日志在本地 `build/m2-native-build.log`、`build/m2-final-tests.log`；关键验证摘要保存在本目录 verification.txt。谱系生成与严格源码检查另在仓库根运行 `node scripts/design/check-page-catalog.mjs --write`、`--check-sources`，并检查 `git diff --check`。

## 尚未覆盖

TalkBack、旋转、全部字体档位、大文件性能、真实模型/供应商、提炼执行，以及设备上的磁盘失败和范围漂移注入均未完成。本轮没有重测附件往返或发送消费，不能用文字草稿采样代替它们；参照 M1 证据与相关回归。未安装草稿只在当前添加任务内存保留，退出放弃或进程结束不承诺恢复。M3/M4/M5 仍待实施。
