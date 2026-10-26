# 图片结果手势修复验证

2026-10-26。修复前的工作区已提交为 `27cc4455`；本次修复在其后独立修改。

页内结果原先是点击打开全屏的 Pressable，没有缩放实现。全屏原先使用 JS PanResponder；本次统一为原生 Gesture Handler 的同时捏合、拖动与互斥单/双击识别。全屏 Modal 内单独提供 GestureHandlerRootView，遵循 [官方安装说明](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/fundamentals/installation/)。

- 1–4倍缩放，双指中心作为缩放锚点；抬起一指后连续拖动。
- 放大时拖动只移动图片；100%时全屏左右翻页、下滑关闭。
- 双击放大/还原；页内提供浮动还原与全屏按钮，不改变预览布局。
- 切换版本还原缩放；按住原图对照沿用当前视口。
- 手势的跨回调状态存于ref，避免回调转换造成状态失联。

验证：TypeScript通过，6组49项相关测试通过。x86_64 Android beta构建成功并安装到专用模拟器。

在1080×2400模拟器上向Android输入系统注入双指 MotionEvent（不是直接调用JS回调）：页内及全屏均从100%放大至179%。随后单指拖动，截图确认图片移动，未翻页或关闭。还原后左右滑动，版本2→1→2正常，保持100%。验证后关闭全屏并恢复版本2。没有触发付费生成。

截图位于本机临时目录：zoom-full-pinch.png、zoom-full-pan.png、zoom-inline.png、zoom-inline-pan.png。此验证为模拟器功能验证，不代表所有实体手机性能结果。本次未更新手机发布APK。
