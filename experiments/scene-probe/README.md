# 离线静态 3D Android 实验

独立应用 `com.example.autodlh3.sceneprobe`，不修改生产数据库、依赖或路由。Three.js 0.180.0 随实验 APK 打包，无 INTERNET 权限；WebView 禁止网络与外部导航。原理 API 参考：[Three.js 官方文档](https://threejs.org/docs/)。

```powershell
cd experiments/scene-probe
npm ci
npm run bundle
# 配置 JAVA_HOME=JDK 17，ANDROID_HOME=Android SDK（已安装 API 36）
../../mobile/android/gradlew.bat -p android :app:assembleDebug --max-workers=2 --no-parallel
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.example.autodlh3.sceneprobe/.MainActivity
```

操作：拖动取景 → 保存 → 导出 PNG → 重开场景；另外提供 20/100 对象测试和 context 丢失/恢复。场景 JSON 按内容 SHA-256 保存不可变版本，导出清单固定 sceneVersion 与 imageSha256。JavaScript bridge 只接受场景保存/读取、单次 PNG 文件交接和指标记录，不暴露任意文件或网络操作。JSON schema 是实验级白模场景，不等于生产 SceneDocumentVersion 或 GLB 支持。

## 实测（2026-10-29）

设备：AutoDL_Keyboard_QA_20261025 / emulator-5554，Android 17 x86_64，1080×2400，density 420，字体 1.0，Android System WebView 156.0.8078.47。渲染缓冲区 960×540、PNG 1280×720，pixelRatio 1。20/100 个立方体，共用几何体、逐对象材质；不含骨骼、纹理、阴影或外部模型。

| 测量 | 20 对象 | 100 对象 |
| --- | --- | --- |
| 预热 30 帧后的 150 帧 p50 | 17.8 ms | 18.8 ms |
| p95 / 最大帧间隔 | 30.6 / 41.0 ms | 32.8 / 47.0 ms |
| 渲染调用 / 实际可见三角形 | 21 / 240 | 94 / 1116（部分视锥裁剪） |
| 主进程 PSS 快照 | 96353 KiB | 101981 KiB |

帧间隔由 requestAnimationFrame 采集，包含系统调度，不等于 GPU 执行耗时。内存是主进程瞬时快照，**未计独立 WebView renderer 的峰值**，不能作为总内存预算。

100 对象拖动产生 24 次更新，JS render 调用最大 1.7 ms（不是端到端触摸延迟）。一次 PNG 导出约 443.4 ms、93426 字节。实际 PNG 已拉取并目视核对；PNG 与场景 SHA-256 都与导出清单一致。

WebGL context 丢失后恢复约 960.9 ms（包括人为等待的 750 ms）；保留 100 对象。前后台切换后重新绘制；强制结束进程再启动恢复 100 对象，重开后的摄影机仍为 `[9.340414428710938,4,8]`。独立 debug APK 313162 字节，打包 JS 494411 字节；这个 APK 大小不等于生产应用引入 React Native WebView 的增量。

## 决策

候选路线具备继续做产品原型的基础，**未达到正式产品化门槛**。本实验没有低端/中端实机、总进程峰值内存、缺失 GLB/纹理恢复，也未接入生产资产/草稿/镜头来源链。不能仅凭模拟器 p95 宣称目标设备达标。生产 SceneDocumentVersion、类型化 bridge、PNG → 素材 → 草稿 → 镜头应作为下一阶段完整功能交付，不把本实验伪装成已交付的 3D 导演台。

不新增空 local.render handler；通用计划扩展等待可交付的第三种业务步骤。当前取景参考图也不是深度/姿态控制接口，不承诺生成模型严格遵守空间构图。

证据文件：仓库忽略的 build/scene-*。实验应用仅有自造场景，不接触用户创作内容；验证结束可卸载。
