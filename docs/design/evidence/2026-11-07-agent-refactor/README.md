# Agent N0–N5 设备证据

使用匹配当前源码的 x86_64 原生壳、各阶段 Android minified JS，运行 Android 17 / API 37。默认1080×2400、density420（约411dp）、字体1.0。独立QA包 com.example.autodlh3，原beta包未改。审阅准备使用离线替身，未发起生成；主数据与输入是明确的合成测试样本。APK不是发布包，构建SHA与身份保留在本地build/roadmap-qa/。

| 范围 | 证据 | 实际完成 |
|---|---|---|
| N0 | n0-matched-entry、n0-normal-conversation | 匹配原生壳复现读取错误；Android异步转换后进入原会话 |
| N1 | n1-directory-comparison、n1-detail-comparison | 同设备、同技能前后比较，管理/详情/返回 |
| N2 | n2-history、n2-run-detail | 技能证据历史空态；原无技能快照运行的消息与事实状态 |
| N3 | n3-keyboard、n3-picker-return、n3-draft-return | 键盘，管理往返后原草稿保留，未发送 |
| N4 | n4-review-comparison、n4-single-consent | 同草稿审阅前后；只确认一项不能生成，取消回原对象 |
| N5 | n5-conversation-comparison、n5-time-comparison | 同会话顶栏/触控；同运行的本地数字时间，保留秒 |
| 窄屏 | n5-narrow-* | 360dp/字体1.3，键盘可达、技能管理/详情/系统返回、重启后草稿恢复 |
| 大字体 | n5-font2-* | 360dp目录/运行；411dp会话/审阅，长内容与许可可滚动 |
| 辅助技术 | n5-talkback-focus | TalkBack成功绑定，Tab返回控件焦点抽查；不代表完整语音或手势验收 |
| 偶发问题 | n5-resize-transient-lock | 动态改屏幕后一次保存锁提示；后续重启新增草稿恢复，未清数据 |

图片为实际截图，对应XML是同次UI树。XML中屏外子项可能保留反向/裁切bounds，不能据此声称屏外动作已经可点；本轮动作均先滚动/展开后操作。相同会话的输入框含逐步追加的测试文字，比较图不把这一差异当作视觉回归。

完整真实模型/媒体/消费/采用链、预测性返回/旋转/更大窗口、TalkBack全任务与语音播报未在本轮重验。实现、源码测试、设备采样的精确边界见[实施记录](../../agent-mobile-implementation-2026-11-07.md)。
