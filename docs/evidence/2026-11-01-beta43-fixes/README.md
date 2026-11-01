# Beta 43 模拟器验证

> 历史证据精选（2026-11-01 整理）：这里只保留最小可复核材料。原采样过程、重复截图、构建日志和自动生成索引在本地 ZIP 中，见[归档说明](../../reviews/archive/2026-10-31-agent-workbench.md#local-archive)。下文旧记录提到的文件不保证全部随 Git 分发；以文末精选清单及总清单为准。原有版本和验证限制保持，不因归档补记而升级为当前验收。探针只用于历史基线，不原样运行到现行产品测试中。


2026-11-01，emulator-5554，com.example.autodlh3.beta，beta.43 / versionCode 82，x86_64 专用包覆盖安装，数据保留。手机 ARM 包单独保留。

- 02/03：am start -S 深链返回 LaunchState: COLD；能力页页头返回进入项目列表。
- 04/05：再次 COLD 进入能力页，系统 Back 进入项目列表。
- 06–10：项目→能力→账号配置→返回能力→返回原项目，未修改账号。
- 11：中文名称、短用途、版本显示；已打开截图检查。
- 12/13：点击历史后首屏出现本项目空态；显式切换全部，范围标签更新。已打开截图检查。
- 14/15：返回技能列表、筛选本地导入，内置卡隐藏。
- 20–22：最终代码重新构建并安装后，COLD 打开技能页，历史→添加技能立即显示导入表单；未输入或安装技能。

01、17–19 是安装后首次 UNKNOWN 启动/未到预期页的记录，不用于成功验收。关键截图/XML 随交付提交，其他过程原件留在本地。设备没有历史运行，因此多项目分页与精确运行查看以真实 SQLite/组件测试验收，不冒充设备验证。

没有模型请求、付费生成、工程合成、业务检查准备或修改技能选择。最后返回主工作台。没有进行 ARM 真机性能、TalkBack、进程死亡全矩阵验收。


## 随仓库保留的文件

- [02-cold-capabilities.png](02-cold-capabilities.png)
- [02-cold-capabilities.xml](02-cold-capabilities.xml)
- [03-cold-header-return.png](03-cold-header-return.png)
- [03-cold-header-return.xml](03-cold-header-return.xml)
- [04-cold-system-before.png](04-cold-system-before.png)
- [04-cold-system-before.xml](04-cold-system-before.xml)
- [05-cold-system-return.png](05-cold-system-return.png)
- [05-cold-system-return.xml](05-cold-system-return.xml)
- [07-project-capabilities.png](07-project-capabilities.png)
- [07-project-capabilities.xml](07-project-capabilities.xml)
- [08-account-settings.png](08-account-settings.png)
- [08-account-settings.xml](08-account-settings.xml)
- [09-settings-return.png](09-settings-return.png)
- [09-settings-return.xml](09-settings-return.xml)
- [10-project-return.png](10-project-return.png)
- [10-project-return.xml](10-project-return.xml)
- [11-skill-library.png](11-skill-library.png)
- [12-history-current.png](12-history-current.png)
- [12-history-current.xml](12-history-current.xml)
- [13-history-all.xml](13-history-all.xml)
- [22-final-add.png](22-final-add.png)
- [22-final-add.xml](22-final-add.xml)
