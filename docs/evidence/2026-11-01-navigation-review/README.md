# 2026-11-01 页面导航复审证据

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


- 源码 HEAD：03c0e588；设备为已安装 beta.39/versionCode78，没有本轮构建。
- targeted-tests.log/json：17文件81项通过；typecheck.log：tsc通过。
- repro-tests.log/json：2文件2项观察探针通过，证明当前不良行为存在，不是正确行为通过验收。
- navigationReview.repro.test.ts 原位于 mobile/src/settings；navigationReview.repro.test.tsx 原位于 mobile/src/creative。复跑前确认原路径不存在再复制回去，使用 Jest --runInBand --runTestsByPath 指向两文件；完成后移出产品测试目录。
- capture.cjs：ADB新鲜UI树定位点击和原始截图保存辅助。只控制 emulator-5554，截图按步骤命名。01为系统启动阻塞，02为既有创作页，均不作为本轮产品缺陷证据。
- 03–17 为本轮保存的页面/步骤；15/16/17复现未保存编辑丢失。每次点击前重新dump，用节点bounds中心定位。
- 未调用模型、生成或合成；未保存账号、安装Skill、修改现有素材或创建工程。只在未保存准备输入中写入 QA-review-unsaved，再返回丢弃。
- 模拟器初始未启动，先启动无beta安装的Medium_Phone_API_37.0后关闭，改用已有QA模拟器；未删除数据或安装APK。启动时System UI曾ANR，Wait恢复，不视为本应用缺陷。
- LLM未配置，内嵌会话Skill范围问题来自源码调用链，设备只核对独立项目/全局技能入口。没有声称完成真实Agent运行或全量导航验收。

完整报告：[页面导航复审](../../reviews/2026-11-01-workbench-navigation-review.md)。


## 随仓库保留的文件

- [04-project.png](04-project.png)
- [04-project.xml](04-project.xml)
- [05-project-skills.png](05-project-skills.png)
- [05-project-skills.xml](05-project-skills.xml)
- [06-capabilities.png](06-capabilities.png)
- [06-capabilities.xml](06-capabilities.xml)
- [07-model-connections.png](07-model-connections.png)
- [07-model-connections.xml](07-model-connections.xml)
- [08-agent.png](08-agent.png)
- [08-agent.xml](08-agent.xml)
- [10-global-skills.png](10-global-skills.png)
- [10-global-skills.xml](10-global-skills.xml)
- [12-timeline.png](12-timeline.png)
- [12-timeline.xml](12-timeline.xml)
- [13-shots.png](13-shots.png)
- [13-shots.xml](13-shots.xml)
- [14-semantic-preparation.png](14-semantic-preparation.png)
- [14-semantic-preparation.xml](14-semantic-preparation.xml)
- [15-preparation-dirty.png](15-preparation-dirty.png)
- [15-preparation-dirty.xml](15-preparation-dirty.xml)
- [16-left-without-confirm.png](16-left-without-confirm.png)
- [16-left-without-confirm.xml](16-left-without-confirm.xml)
- [17-preparation-lost.png](17-preparation-lost.png)
- [17-preparation-lost.xml](17-preparation-lost.xml)
- [navigationReview.repro.test.ts](navigationReview.repro.test.ts)
- [navigationReview.repro.test.tsx](navigationReview.repro.test.tsx)
- [repro-tests.json](repro-tests.json)
- [repro-tests.log](repro-tests.log)
- [targeted-tests.json](targeted-tests.json)
- [targeted-tests.log](targeted-tests.log)
