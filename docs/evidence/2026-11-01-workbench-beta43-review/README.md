# Beta 43 独立复审证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


源码 a291e9d7，比较 a0ac2adf；包 com.example.autodlh3.beta，versionCode 82 / beta.43。使用已有安装，不重新构建、安装或配置真实模型。

- `device-version.txt`：精确 beta 包版本。
- `targeted-tests.json/log`：7 个既有测试文件、65 项通过；具体路径在日志末尾。
- `typecheck.log`：类型检查退出 0。
- `skills-check.log`：36 文件包内容/哈希/元数据一致性检查通过。
- `probes.json/log`：2 个探针文件、3 项不良行为复现。
- `run-evidence.probe.test.tsx`：C1，正常消息归一化可识别的图片附件，在实际运行证据组件两种视图均被遗漏。原位置 mobile/src/agent/skills/beta43-run-evidence.probe.test.tsx。
- `library-state.probe.test.tsx`：C2/C3，未保存单次选择不触发注册离开保护；已有添加草稿→历史→添加隐藏表单。原位置 mobile/src/agent/skills/beta43-library-state.probe.test.tsx。
- `01`–`04` PNG/XML：起点、项目列表、项目、当前技能库。
- `05`–`07`：本项目历史、全部历史、新建添加表单。设备历史为空，不据此宣称已设备验证多项目分页。
- `08`–`11`：有草稿→历史→添加隐藏→再添加恢复，C3 设备证据。
- `12`：离开文本草稿时正常确认；之后明确放弃临时用途输入，未保存或安装。
- `13`、`14`：COLD 能力页→页头返回项目列表。
- `15`、`16`：再次 COLD 能力页→系统返回项目列表。
- `cold-start.txt`、`cold-system-start.txt`：两个 am start -S -W 的 Status ok / LaunchState COLD。
- `verified-fixes.png`、`draft-navigation.png`：本轮原图缩小并排，已打开核对；contact-sheets.ps1 可重建。
- `capture.cjs`：每次先获取新 UI XML，按标签和真实 bounds 操作，截图与层级成对保存。

临时探针相对 import 对应原位置；需要复跑时放回原测试目录，再使用 Jest --runTestsByPath，完成后移回证据目录。本轮没有保留任何产品源码或既有测试修改。探针模拟加载结果/范围读取，不调用模型，不需要真实图片文件；图片探针验证附件字段被忽略，不能当作真实文件预览测试。


## 随仓库保留的文件

- [08-draft.png](08-draft.png)
- [08-draft.xml](08-draft.xml)
- [09-history-with-draft.png](09-history-with-draft.png)
- [09-history-with-draft.xml](09-history-with-draft.xml)
- [10-add-after-draft-history.png](10-add-after-draft-history.png)
- [10-add-after-draft-history.xml](10-add-after-draft-history.xml)
- [13-cold-capabilities.png](13-cold-capabilities.png)
- [13-cold-capabilities.xml](13-cold-capabilities.xml)
- [14-cold-header-exit.png](14-cold-header-exit.png)
- [14-cold-header-exit.xml](14-cold-header-exit.xml)
- [15-cold-system-before.png](15-cold-system-before.png)
- [15-cold-system-before.xml](15-cold-system-before.xml)
- [16-cold-system-exit.png](16-cold-system-exit.png)
- [16-cold-system-exit.xml](16-cold-system-exit.xml)
- [device-version.txt](device-version.txt)
- [draft-navigation.png](draft-navigation.png)
- [library-state.probe.test.tsx](library-state.probe.test.tsx)
- [probes.json](probes.json)
- [probes.log](probes.log)
- [run-evidence.probe.test.tsx](run-evidence.probe.test.tsx)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
- [verified-fixes.png](verified-fixes.png)
