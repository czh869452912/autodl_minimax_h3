# 本轮审计证据

先打开 [证据浏览器](evidence.html) 或 [主报告](../../reviews/2026-10-31-full-product-ux-audit.md)。本目录仅文档/取证，不修改产品。

- 66张原始PNG：状态统计见manifest.json；编号跳号是捕获失败，不补造。
- 664个UI树控件实例：包括跨截图重复出现的控件；不是独立按钮数，也不是通过数。
- 59条实际路径/组合操作记录：见navigation-trace.md。
- 762项源码交互声明/工厂调用、112处router调用、22个route文件：见source-controls.json/source-navigation.json/source-routes.json及[source-behavior.md](source-behavior.md)逐项回调与验收提示。
- [逐步截图](evidence-steps.md)、[按钮台账](ui-controls.md)、[执行交接](../../reviews/2026-10-31-ux-execution-handoff.md)。

状态/真实画面名/文件SHA256以manifest.json为准。25的XML/JSON是已知旧树，保留取证失败痕迹但拒绝用于该面板证明。01/02不算App状态；24/31/46/51不算新验证。56是真实素材操作菜单，57是真实镜头卡。系统选择器45/47格子中的旧截图只作输入素材。

capture.py用于adb操作与捕获；source-inventory.cjs做静态索引；make-sheets.py拼接原始图供视觉核对；publish-evidence.py生成本交付。后续修改截图或数据后需重跑生成器和验证，不能沿用原哈希。
