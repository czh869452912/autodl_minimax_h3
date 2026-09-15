# 窄屏与折叠屏布局适配

## 实现

- 生成、设置、任务、结果页统一横向留白：窗口小于 400dp 时为 12dp，小于 600dp 时为 16dp，其余为 24dp。生成与设置内容最大宽度 760dp，任务 900dp，结果 1200dp。
- 结果网格通过 FlatList 的 onLayout 测量实际容器宽度，结合字体缩放选择 1–4 列；单行未填满时卡片不会拉伸。列数变化重新挂载 FlatList，筛选和选择状态保留在页面；滚动位置可能重置。
- 紧凑导航使用“助手”“任务”短标签，保留完整无障碍名称与系统字体缩放。横向安全区由页面外壳处理。
- 参数选项、素材操作、列表操作允许换行，并避免长文字超过容器。Prompt 助手复用统一紧凑阈值，保留原有宽屏判断。
- 设置页底部新增默认收起的“屏幕适配诊断”，显示窗口 dp、density、fontScale 和安全区，无须读取或输出连接密钥。

## 验证

- `npm run typecheck` 通过。
- 相关 Jest 套件通过：tabs-layout、settings、gallery、tasks、WorkflowForm、PromptAssistantUi、GalleryCard、CreateFormHandoff、createForm。
- 新增结果页回归：四列切换为窄屏大字体单列，保留已选择作品，单列不传 columnWrapperStyle。
- 使用 JBR 21 构建并安装 x86_64 debug APK：`:app:installDebug -PreactNativeArchitectures=x86_64 --max-workers=2`。
- emulator-5554：360 × 800dp、fontScale 1.3，检查生成、设置、诊断及结果页截图。五个导航入口同一行，诊断数值正确，结果卡片单列。
- 同一模拟器调整为 900 × 800dp、fontScale 1.0，检查生成表单居中和结果卡片按四列宽度排列；设备中只有一个现有作品，多卡片数据排列未做原生验证。
- 截图和 UI 树保存在本地忽略目录 `.superpowers/adaptive-qa/`。模拟器已恢复原始 1080 × 2400、density 420、fontScale 1.0。

## 验证边界

- Find N5 未连接；上述尺寸是模拟测试条件，不代表其内外屏真实参数。
- 键盘显隐的导航行为已通过 Jest 回归；原生测试中输入框聚焦后导航隐藏，但当前模拟器未显示可供确认的软键盘，未判定原生键盘避让验证通过。
- 本次没有新增任务详情双栏或侧边导航。宽屏支持采用表单最大宽度、结果动态列数以及既有 Prompt 助手宽屏布局。
