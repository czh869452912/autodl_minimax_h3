# 逐状态按钮、输入与控件台账

本台账按当前截图UI树逐节点列出。节点实例数包括重复出现在不同状态的同一按钮，不是独立功能数。只记录当前视口与树中节点；滚动外、条件分支、原生调用、手势另见静态索引与待补验证。

源码位置是**同名候选**，并非运行栈证明；没有候选不表示没有实现。完整事件处理器和JSX见 [source-controls.json](source-controls.json)，候选ID与其一一对应。

bounds是物理像素，尺寸按420dpi换算可见bounds的dp；不包含hitSlop，也不能独自证明实际命中范围。默认“仅可见”不算按钮验证通过。

[页面分析](../../reviews/2026-10-31-full-product-ux-audit.md) · [操作轨迹](navigation-trace.md) · [源码声明清单](source-index.md)

## 01 · 启动瞬态

状态：excluded。未形成可审查的业务页面；不作为App缺陷。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 02 · Android System UI无响应

状态：excluded。系统阻塞，不归因于App；点等待后可继续。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 03 · 创作：独立视频草稿

状态：accepted。缺AutoDL连接，生成禁用；四主入口可见。F04/F08。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U03-001 | 图片 | RadioButton | true | [26,73][165,157] / [53.0, 32.0] | 有该起点操作轨迹 T001；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U03-002 | 视频 | RadioButton | true | [171,73][310,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-003 | 新建创作 | Button | true | [665,71][755,160] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0244: mobile/src/creative/CreativeHome.tsx:91 |
| U03-004 | 创作记录 | Button | true | [765,71][854,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0245: mobile/src/creative/CreativeHome.tsx:91; C0250: mobile/src/creative/CreativeHome.tsx:96 |
| U03-005 | 打开任务中心 | Button | true | [865,63][959,168] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-006 | 打开设置 | Button | true | [970,71][1059,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U03-007 | MiniMax H3 · 详情 | Button | true | [754,213][1038,307] / [108.2, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-008 | 连接 AutoDL 创作账号 | Button | true | [42,355][1038,450] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0638: mobile/src/creative/VideoDraftScreen.tsx:222 |
| U03-009 | 添加参考图 | Button | true | [857,497][1038,592] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-010 | 添加参考音频 | Button | true | [825,739][1038,834] / [81.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-011 | 帮我写提示词 | Button | true | [825,981][1038,1075] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0641: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U03-012 | 视频镜头提示词 | EditText | true | [42,1091][1038,1439] / [379.4, 132.6] | 仅可见/树中声明，未证明点击执行成功 | C0642: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U03-013 | 横屏 | RadioButton | true | [47,1490][537,1574] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-014 | 竖屏 | RadioButton | true | [543,1490][1033,1574] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-015 | 480p | RadioButton | true | [47,1606][537,1690] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-016 | 768p | RadioButton | true | [543,1606][1033,1690] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-017 | 选择视频时长 | Button | true | [42,1716][192,1821] / [57.1, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0645: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U03-018 | 更多设置 | Button | true | [213,1721][362,1815] / [56.8, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0646: mobile/src/creative/VideoDraftScreen.tsx:228; C0648: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U03-019 | 生成视频 | Button | false | [32,1988][722,2103] / [262.9, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0652: mobile/src/creative/VideoDraftScreen.tsx:234 |
| U03-020 | 视频预估费用说明 | Button | true | [723,1988][1049,2103] / [124.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0630: mobile/src/creative/VideoCostHint.tsx:15 |
| U03-021 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-022 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U03-023 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U03-024 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 04 · 创作：图片空画布

状态：accepted。缺NovelAI连接时生成仍启用；没有点生成，不推断后果。F04/F08。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U04-001 | 图片 | RadioButton | true | [26,73][165,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-002 | 视频 | RadioButton | true | [171,73][310,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-003 | 新建创作 | Button | true | [665,71][755,160] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0244: mobile/src/creative/CreativeHome.tsx:91 |
| U04-004 | 创作记录 | Button | true | [765,71][854,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0245: mobile/src/creative/CreativeHome.tsx:91; C0250: mobile/src/creative/CreativeHome.tsx:96 |
| U04-005 | 打开任务中心 | Button | true | [865,63][959,168] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-006 | 打开设置 | Button | true | [970,71][1059,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U04-007 | 连接 NovelAI 以查看用量 | Button | true | [26,176][991,255] / [367.6, 30.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-008 | 刷新 NovelAI 用量 | Button | true | [991,171][1080,260] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0525: mobile/src/creative/NovelAiUsageBar.tsx:46; C0527: mobile/src/creative/NovelAiUsageBar.tsx:54 |
| U04-009 | 拖动编辑抽屉, 已收起 | SeekBar | true | [1,1805][1079,1868] / [410.7, 24.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-010 | 图片提示词 | EditText | true | [54,1882][959,1987] / [344.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0397: mobile/src/creative/ImageDraftScreen.tsx:215; C0462: mobile/src/creative/NovelAiPromptEditor.tsx:30 |
| U04-011 | 提示词助手 | Button | true | [958,1890][1047,1979] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0398: mobile/src/creative/ImageDraftScreen.tsx:215 |
| U04-012 | 生成设置 | Button | true | [26,2025][116,2115] / [34.3, 34.3] | 有该起点操作轨迹 T002；见轨迹中的终态与组合动作说明 | C0405: mobile/src/creative/ImageDraftScreen.tsx:225; C0520: mobile/src/creative/NovelAiSettings.tsx:56 |
| U04-013 | 展开画面编辑 | Button | true | [131,2025][221,2115] / [34.3, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0406: mobile/src/creative/ImageDraftScreen.tsx:225 |
| U04-014 | 生成 1 张图片 | Button | true | [236,2025][949,2115] / [271.6, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-015 | 生成历史 | Button | true | [964,2025][1053,2115] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0408: mobile/src/creative/ImageDraftScreen.tsx:225 |
| U04-016 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-017 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U04-018 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U04-019 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 05 · 图片生成设置抽屉

状态：accepted。参数在局部表面内可滚动；命中区与大字体仍需专项测试。F08。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U05-001 | 图片 | RadioButton | true | [26,73][165,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-002 | 视频 | RadioButton | true | [171,73][310,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-003 | 新建创作 | Button | true | [665,71][755,160] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0244: mobile/src/creative/CreativeHome.tsx:91 |
| U05-004 | 创作记录 | Button | true | [765,71][854,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0245: mobile/src/creative/CreativeHome.tsx:91; C0250: mobile/src/creative/CreativeHome.tsx:96 |
| U05-005 | 打开任务中心 | Button | true | [865,63][959,168] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-006 | 打开设置 | Button | true | [970,71][1059,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U05-007 | 连接 NovelAI 以查看用量 | Button | true | [26,176][991,255] / [367.6, 30.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-008 | 刷新 NovelAI 用量 | Button | true | [991,171][1080,260] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0525: mobile/src/creative/NovelAiUsageBar.tsx:46; C0527: mobile/src/creative/NovelAiUsageBar.tsx:54 |
| U05-009 | 拖动编辑抽屉, 已展开 | SeekBar | true | [1,785][1079,848] / [410.7, 24.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-010 | 关闭生成设置 | Button | true | [968,848][1058,937] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0519: mobile/src/creative/NovelAiSettings.tsx:56 |
| U05-011 | V5 Full | Button | true | [880,960][1058,1054] / [67.8, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-012 | Anime | Button | true | [886,1076][1058,1171] / [65.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-013 | High | RadioButton | true | [564,1196][806,1280] / [92.2, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-014 | Medium | RadioButton | true | [811,1196][1052,1280] / [91.8, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-015 | 标准 | Button | true | [22,1382][165,1477] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-016 | 竖图 | RadioButton | true | [191,1387][475,1471] / [108.2, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-017 | 方图 | RadioButton | true | [480,1387][764,1471] / [108.2, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-018 | 横图 | RadioButton | true | [769,1387][1052,1471] / [107.8, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-019 | 1 | RadioButton | true | [27,1577][279,1661] / [96.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-020 | 2 | RadioButton | true | [285,1577][537,1661] / [96.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-021 | 3 | RadioButton | true | [542,1577][794,1661] / [96.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-022 | 4 | RadioButton | true | [800,1577][1052,1661] / [96.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-023 | 步数 | EditText | true | [22,1815][222,1910] / [76.2, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-024 | 步数 滑块 | SeekBar | true | [253,1779][1058,1895] / [306.7, 44.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-025 | 引导强度 | EditText | true | [22,1983][222,2001] / [76.2, 6.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-026 | 引导强度 滑块 | SeekBar | true | [253,1947][1058,2001] / [306.7, 20.6] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-027 | 图片 Seed | EditText | true | [22,2151][948,2001] / [352.8, -57.1] | 仅可见/树中声明，未证明点击执行成功 | C0508: mobile/src/creative/NovelAiSettings.tsx:43 |
| U05-028 | 恢复随机种子 | Button | false | [968,2128][1058,2001] / [34.3, -48.4] | 仅可见/树中声明，未证明点击执行成功 | C0509: mobile/src/creative/NovelAiSettings.tsx:43 |
| U05-029 | 生成设置 | Button | true | [26,2025][116,2115] / [34.3, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0405: mobile/src/creative/ImageDraftScreen.tsx:225; C0520: mobile/src/creative/NovelAiSettings.tsx:56 |
| U05-030 | 展开画面编辑 | Button | true | [131,2025][221,2115] / [34.3, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0406: mobile/src/creative/ImageDraftScreen.tsx:225 |
| U05-031 | 生成 1 张图片 | Button | true | [236,2025][949,2115] / [271.6, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-032 | 生成历史 | Button | true | [964,2025][1053,2115] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0408: mobile/src/creative/ImageDraftScreen.tsx:225 |
| U05-033 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U05-034 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 有该起点操作轨迹 T003；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U05-035 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U05-036 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 06 · 助手首页

状态：accepted。当前项目和输入可见；没有发送真实对话。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U06-001 | 切换创作项目 | Button | true | [47,63][571,179] / [199.6, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0206: mobile/src/creative/AgentCreativePanel.tsx:41 |
| U06-002 | 打开对话历史 | ViewGroup | true | [597,63][723,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0087: mobile/src/agent/PromptAssistantUi.tsx:335 |
| U06-003 | 新建对话 | ViewGroup | true | [723,63][849,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0088: mobile/src/agent/PromptAssistantUi.tsx:347 |
| U06-004 | 打开任务中心 | Button | true | [849,74][944,179] / [36.2, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-005 | 助手菜单 | Button | true | [944,68][1059,184] / [43.8, 44.2] | 有该起点操作轨迹 T004；见轨迹中的终态与组合动作说明 | C0216: mobile/src/creative/AssistantActions.tsx:8; C0217: mobile/src/creative/AssistantActions.tsx:8 |
| U06-006 | 使用建议 温暖的 3D 动画短片 | Button | true | [74,427][530,548] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-007 | 使用建议 一镜到底的城市夜跑 | Button | true | [551,427][1007,548] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-008 | 使用建议 极简风格的香水广告 | Button | true | [74,569][530,690] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-009 | 使用建议 纸艺风格的产品广告 | Button | true | [551,569][1007,690] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-010 | 添加图片附件 | Button | true | [34,2037][150,2152] / [44.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0122: mobile/src/agent/PromptAssistantUi.tsx:1070 |
| U06-011 | 创作想法 | EditText | true | [168,2042][778,2147] / [232.4, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0123: mobile/src/agent/PromptAssistantUi.tsx:1072 |
| U06-012 | 更多创作操作 | Button | true | [796,2037][911,2152] / [43.8, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0124: mobile/src/agent/PromptAssistantUi.tsx:1074 |
| U06-013 | 发送消息 | Button | true | [930,2037][1046,2152] / [44.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-014 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U06-015 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 有该起点操作轨迹 T004；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U06-016 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U06-017 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 07 · 助手菜单

状态：accepted。技能管理、助手设置可发现；入口位于二级菜单。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U07-001 | 关闭助手菜单 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U07-002 | 完成 | Button | true | [943,1767][1038,1893] / [36.2, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0686: mobile/src/creative/WorkbenchUI.tsx:57 |
| U07-003 | 技能管理，导入、启用或停用技能 | Button | true | [53,1958][1028,2118] / [371.4, 61.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U07-004 | 助手设置 | Button | true | [53,2159][1028,2285] / [371.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0219: mobile/src/creative/AssistantActions.tsx:8 |

## 08 · 内嵌技能面板

状态：accepted。技能与聊天输入同屏；空态。F10。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U08-001 | 切换创作项目 | Button | true | [47,63][571,179] / [199.6, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0206: mobile/src/creative/AgentCreativePanel.tsx:41 |
| U08-002 | 打开对话历史 | ViewGroup | true | [597,63][723,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0087: mobile/src/agent/PromptAssistantUi.tsx:335 |
| U08-003 | 新建对话 | ViewGroup | true | [723,63][849,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0088: mobile/src/agent/PromptAssistantUi.tsx:347 |
| U08-004 | 打开任务中心 | Button | true | [849,74][944,179] / [36.2, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-005 | 助手菜单 | Button | true | [944,68][1059,184] / [43.8, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0216: mobile/src/creative/AssistantActions.tsx:8; C0217: mobile/src/creative/AssistantActions.tsx:8 |
| U08-006 | 使用建议 温暖的 3D 动画短片 | Button | true | [74,427][530,548] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-007 | 使用建议 一镜到底的城市夜跑 | Button | true | [551,427][1007,548] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-008 | 使用建议 极简风格的香水广告 | Button | true | [74,569][530,690] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-009 | 使用建议 纸艺风格的产品广告 | Button | true | [551,569][1007,690] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-010 | 添加图片附件 | Button | true | [34,1042][150,1157] / [44.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0122: mobile/src/agent/PromptAssistantUi.tsx:1070 |
| U08-011 | 创作想法 | EditText | true | [168,1047][778,1152] / [232.4, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0123: mobile/src/agent/PromptAssistantUi.tsx:1072 |
| U08-012 | 更多创作操作 | Button | true | [796,1042][911,1157] / [43.8, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0124: mobile/src/agent/PromptAssistantUi.tsx:1074 |
| U08-013 | 发送消息 | Button | true | [930,1042][1046,1157] / [44.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-014 | 关闭技能 | Button | true | [21,1185][110,1275] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-015 | 添加技能 | Button | true | [865,1185][954,1275] / [33.9, 34.3] | 有该起点操作轨迹 T006；见轨迹中的终态与组合动作说明 | C0163: mobile/src/agent/skills/SkillLibraryScreen.tsx:56 |
| U08-016 | 技能运行记录 | Button | true | [970,1185][1059,1275] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0164: mobile/src/agent/skills/SkillLibraryScreen.tsx:57 |
| U08-017 | 搜索技能 | EditText | true | [31,1308][1048,1425] / [387.4, 44.6] | 仅可见/树中声明，未证明点击执行成功 | C0172: mobile/src/agent/skills/SkillLibraryScreen.tsx:80 |
| U08-018 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-019 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U08-020 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U08-021 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 09 · 技能导入展开

状态：accepted。SKILL.md/ZIP等入口可见；未安装或启用技能。F10。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U09-001 | 切换创作项目 | Button | true | [47,63][571,179] / [199.6, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0206: mobile/src/creative/AgentCreativePanel.tsx:41 |
| U09-002 | 打开对话历史 | ViewGroup | true | [597,63][723,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0087: mobile/src/agent/PromptAssistantUi.tsx:335 |
| U09-003 | 新建对话 | ViewGroup | true | [723,63][849,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0088: mobile/src/agent/PromptAssistantUi.tsx:347 |
| U09-004 | 打开任务中心 | Button | true | [849,74][944,179] / [36.2, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-005 | 助手菜单 | Button | true | [944,68][1059,184] / [43.8, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0216: mobile/src/creative/AssistantActions.tsx:8; C0217: mobile/src/creative/AssistantActions.tsx:8 |
| U09-006 | 使用建议 温暖的 3D 动画短片 | Button | true | [74,427][530,548] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-007 | 使用建议 一镜到底的城市夜跑 | Button | true | [551,427][1007,548] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-008 | 使用建议 极简风格的香水广告 | Button | true | [74,569][530,690] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-009 | 使用建议 纸艺风格的产品广告 | Button | true | [551,569][1007,690] / [173.7, 46.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-010 | 添加图片附件 | Button | true | [34,1042][150,1157] / [44.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0122: mobile/src/agent/PromptAssistantUi.tsx:1070 |
| U09-011 | 创作想法 | EditText | true | [168,1047][778,1152] / [232.4, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0123: mobile/src/agent/PromptAssistantUi.tsx:1072 |
| U09-012 | 更多创作操作 | Button | true | [796,1042][911,1157] / [43.8, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0124: mobile/src/agent/PromptAssistantUi.tsx:1074 |
| U09-013 | 发送消息 | Button | true | [930,1042][1046,1157] / [44.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-014 | 关闭技能 | Button | true | [21,1185][110,1275] / [33.9, 34.3] | 有该起点操作轨迹 T007；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U09-015 | 添加技能 | Button | true | [865,1185][954,1275] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0163: mobile/src/agent/skills/SkillLibraryScreen.tsx:56 |
| U09-016 | 技能运行记录 | Button | true | [970,1185][1059,1275] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0164: mobile/src/agent/skills/SkillLibraryScreen.tsx:57 |
| U09-017 | 导入 SKILL.md 或 ZIP | Button | true | [66,1343][461,1437] / [150.5, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0165: mobile/src/agent/skills/SkillLibraryScreen.tsx:63 |
| U09-018 | 从对话提炼技能 | Button | true | [478,1343][781,1437] / [115.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0166: mobile/src/agent/skills/SkillLibraryScreen.tsx:64 |
| U09-019 | 技能文本 | EditText | true | [66,1458][1016,1721] / [361.9, 100.2] | 仅可见/树中声明，未证明点击执行成功 | C0167: mobile/src/agent/skills/SkillLibraryScreen.tsx:66 |
| U09-020 | 检查粘贴的技能 | Button | false | [66,1742][368,1836] / [115.0, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0168: mobile/src/agent/skills/SkillLibraryScreen.tsx:68 |
| U09-021 | 填入技能示例 | Button | true | [385,1742][653,1836] / [102.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0169: mobile/src/agent/skills/SkillLibraryScreen.tsx:69 |
| U09-022 | 搜索技能 | EditText | true | [31,1896][1048,2013] / [387.4, 44.6] | 仅可见/树中声明，未证明点击执行成功 | C0172: mobile/src/agent/skills/SkillLibraryScreen.tsx:80 |
| U09-023 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-024 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U09-025 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 有该起点操作轨迹 T007；见轨迹中的终态与组合动作说明 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U09-026 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 10 · 项目列表：原KeyboardQA

状态：accepted。新建和项目卡可达；归档未执行。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U10-001 | 历史与迁入 | Button | true | [816,95][1049,189] / [88.8, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U10-002 | 新建项目 | Button | true | [32,221][229,315] / [75.0, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0323: mobile/src/creative/CreativeWorkspace.tsx:228 |
| U10-003 | 查看归档项目 | Button | true | [251,221][519,315] / [102.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U10-004 | 搜索项目 | EditText | true | [32,347][1049,473] / [387.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0326: mobile/src/creative/CreativeWorkspace.tsx:229; C0350: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U10-005 | KeyboardQA | Button | true | [32,499][1049,712] / [387.4, 81.1] | 有该起点操作轨迹 T008；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U10-006 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U10-007 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U10-008 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U10-009 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 11 · 项目详情：空镜头页

状态：accepted。项目页签清楚，当前无镜头。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U11-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U11-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U11-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 有该起点操作轨迹 T009；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U11-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U11-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U11-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U11-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U11-008 | 添加镜头 | Button | true | [32,526][1049,620] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 12 · 项目概览

状态：accepted。简报、进度及助手入口可见；未编辑原项目。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U12-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U12-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U12-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U12-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U12-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U12-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 有该起点操作轨迹 T010；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U12-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U12-008 | 编辑项目简报 | Button | true | [926,365][1015,454] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0538: mobile/src/creative/ProjectOverview.tsx:29 |
| U12-009 | 查看镜头与下一步 | Button | true | [32,599][1049,813] / [387.4, 81.5] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U12-010 | 在助手中继续 | Button | true | [32,840][370,934] / [128.8, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0540: mobile/src/creative/ProjectOverview.tsx:35 |

## 13 · 项目计划空态

状态：accepted。尚无镜头仍显示编排表单。F13；授权风险另以源码为证。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U13-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U13-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U13-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U13-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U13-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U13-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U13-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 有该起点操作轨迹 T011；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U13-008 | 计划视频提示词 | EditText | true | [32,655][1049,892] / [387.4, 90.3] | 仅可见/树中声明，未证明点击执行成功 | C0548: mobile/src/creative/ProjectPlans.tsx:70 |
| U13-009 | 读取项目图片候选 | Button | true | [32,912][1049,1007] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0549: mobile/src/creative/ProjectPlans.tsx:71 |
| U13-010 | 保存计划（不消费） | Button | true | [32,1028][1049,1122] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0552: mobile/src/creative/ProjectPlans.tsx:74 |

## 14 · 项目活动

状态：accepted。显示project.create内部命令。F07。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U14-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U14-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 有该起点操作轨迹 T012；见轨迹中的终态与组合动作说明 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U14-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U14-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U14-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U14-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U14-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 15 · 项目设置内联展开

状态：accepted。封面说明要求跨页面操作；不是独立设置页。F06。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U15-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 有该起点操作轨迹 T013；见轨迹中的终态与组合动作说明 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U15-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U15-003 | 历史作品 | Button | true | [32,210][229,305] / [75.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0320: mobile/src/creative/CreativeWorkspace.tsx:224; C0377: mobile/src/creative/CreativeWorkspace.tsx:303 |
| U15-004 | 创作草稿 | Button | true | [251,210][449,305] / [75.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0321: mobile/src/creative/CreativeWorkspace.tsx:224; C0378: mobile/src/creative/CreativeWorkspace.tsx:303 |
| U15-005 | 概览 | RadioButton | true | [32,331][159,426] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U15-006 | 镜头 | RadioButton | true | [176,331][304,426] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U15-007 | 素材 | RadioButton | true | [319,331][446,426] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U15-008 | 计划 | RadioButton | true | [463,331][591,426] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U15-009 | 活动 | RadioButton | true | [606,331][733,426] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U15-010 | 归档项目 | Button | true | [32,452][1049,546] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 16 · 新建项目表单

状态：accepted。列表内展开创建表单；下一步只创建审计项目。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U16-001 | 历史与迁入 | Button | true | [816,95][1049,189] / [88.8, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U16-002 | 新建项目 | Button | true | [32,221][229,315] / [75.0, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0323: mobile/src/creative/CreativeWorkspace.tsx:228 |
| U16-003 | 查看归档项目 | Button | true | [251,221][519,315] / [102.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U16-004 | 搜索项目 | EditText | true | [32,347][1049,473] / [387.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0326: mobile/src/creative/CreativeWorkspace.tsx:229; C0350: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U16-005 | 项目名称 | EditText | true | [66,640][1016,766] / [361.9, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0327: mobile/src/creative/CreativeWorkspace.tsx:234 |
| U16-006 | 创作简报 | EditText | true | [66,798][1016,1087] / [361.9, 110.1] | 仅可见/树中声明，未证明点击执行成功 | C0328: mobile/src/creative/CreativeWorkspace.tsx:235 |
| U16-007 | 创建项目 | Button | true | [66,1118][1014,1213] / [361.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U16-008 | 取消编辑 | Button | true | [66,1244][1014,1339] / [361.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0330: mobile/src/creative/CreativeWorkspace.tsx:241 |
| U16-009 | KeyboardQA | Button | true | [32,1398][1049,1611] / [387.4, 81.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U16-010 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U16-011 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U16-012 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U16-013 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 17 · 已创建UX-AUDIT-1031

状态：accepted。本地项目创建完成；审计对象保留。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U17-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U17-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U17-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U17-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 有该起点操作轨迹 T015；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U17-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U17-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U17-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U17-008 | 添加镜头 | Button | true | [32,526][1049,620] / [387.4, 35.8] | 有该起点操作轨迹 T015；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |

## 18 · 添加镜头表单

状态：accepted。全屏编辑任务；只写入审计镜头。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U18-001 | 关闭镜头编辑 | Button | true | [53,116][1028,211] / [371.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0568: mobile/src/creative/ProjectShots.tsx:85 |
| U18-002 | 镜头名称 | EditText | true | [52,444][1027,567] / [371.4, 46.9] | 仅可见/树中声明，未证明点击执行成功 | C0569: mobile/src/creative/ProjectShots.tsx:89 |
| U18-003 | 镜头描述 | EditText | true | [52,704][1027,941] / [371.4, 90.3] | 仅可见/树中声明，未证明点击执行成功 | C0570: mobile/src/creative/ProjectShots.tsx:91 |
| U18-004 | 创建镜头 | Button | true | [53,983][1028,1078] / [371.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 19 · 已创建AUDIT-Shot-01

状态：accepted。空镜头有选择参考图和制作新图两个直接入口。F01前态。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U19-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U19-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U19-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-008 | 更多镜头操作 | Button | true | [926,475][1015,565] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-009 | 选择参考图 | Button | true | [66,731][1014,825] / [361.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U19-010 | 制作新的参考图 | Button | true | [66,847][1014,942] / [361.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0559: mobile/src/creative/ProjectShots.tsx:74 |
| U19-011 | 添加镜头 | Button | true | [32,1007][1049,1102] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 20 · 镜头更多操作

状态：accepted。编辑、选图、选视频、另建草稿、移除；没有执行移除。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U20-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U20-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U20-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-008 | 收起镜头操作 | Button | true | [926,475][1015,565] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-009 | 选择参考图 | Button | true | [66,731][1014,825] / [361.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U20-010 | 制作新的参考图 | Button | true | [66,847][1014,942] / [361.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0559: mobile/src/creative/ProjectShots.tsx:74 |
| U20-011 | 编辑镜头 | Button | true | [66,962][263,1056] / [75.0, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0560: mobile/src/creative/ProjectShots.tsx:76 |
| U20-012 | 选定图片 | Button | true | [285,962][483,1056] / [75.4, 35.8] | 有该起点操作轨迹 T018；见轨迹中的终态与组合动作说明 | C0561: mobile/src/creative/ProjectShots.tsx:77 |
| U20-013 | 选定视频 | Button | true | [504,962][702,1056] / [75.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0562: mobile/src/creative/ProjectShots.tsx:77 |
| U20-014 | 另建视频草稿 | Button | true | [722,962][990,1056] / [102.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0563: mobile/src/creative/ProjectShots.tsx:78 |
| U20-015 | 移除镜头 | Button | true | [66,1078][263,1173] / [75.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0566: mobile/src/creative/ProjectShots.tsx:80 |
| U20-016 | 添加镜头 | Button | true | [32,1238][1049,1333] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 21 · 空图片版本选择器

状态：accepted。目标镜头清楚，确认禁用；缺直接导入/生成出口。F02。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U21-001 | 取消 | Button | true | [943,84][1028,178] / [32.4, 35.8] | 有该起点操作轨迹 T019；见轨迹中的终态与组合动作说明 | C0140: mobile/src/agent/PromptVersionPanel.tsx:186; C0235: mobile/src/creative/CreativeAssetPicker.tsx:54 |
| U21-002 | 搜索素材 | EditText | true | [52,297][1027,413] / [371.4, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0236: mobile/src/creative/CreativeAssetPicker.tsx:56 |
| U21-003 | 从全部素材选择 | Button | true | [53,445][1028,540] / [371.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U21-004 | 采用为镜头成果 | Button | false | [53,2212][1028,2306] / [371.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 22 · 镜头来源的图片草稿

状态：accepted。来源条含项目/镜头；未生成直接返回。F01中间态。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U22-001 | 返回 | Button | true | [16,63][105,152] / [33.9, 33.9] | 有该起点操作轨迹 T020；见轨迹中的终态与组合动作说明 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U22-002 | 创作账号 | Button | true | [975,63][1064,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0394: mobile/src/creative/ImageDraftScreen.tsx:208; C0623: mobile/src/creative/UpscaleDraftScreen.tsx:38; C0632: mobile/src/creative/VideoDraftScreen.tsx:213 |
| U22-003 | 返回所属项目：UX-AUDIT-1031 / AUDIT-Shot-01 | Button | true | [0,153][1080,223] / [411.4, 26.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U22-004 | 连接 NovelAI 以查看用量 | Button | true | [26,228][991,306] / [367.6, 29.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U22-005 | 刷新 NovelAI 用量 | Button | true | [991,223][1080,313] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0525: mobile/src/creative/NovelAiUsageBar.tsx:46; C0527: mobile/src/creative/NovelAiUsageBar.tsx:54 |
| U22-006 | 拖动编辑抽屉, 已收起 | SeekBar | true | [1,1964][1079,2027] / [410.7, 24.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U22-007 | 图片提示词 | EditText | true | [54,2041][959,2146] / [344.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0397: mobile/src/creative/ImageDraftScreen.tsx:215; C0462: mobile/src/creative/NovelAiPromptEditor.tsx:30 |
| U22-008 | 提示词助手 | Button | true | [958,2049][1047,2138] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0398: mobile/src/creative/ImageDraftScreen.tsx:215 |
| U22-009 | 生成设置 | Button | true | [26,2185][116,2274] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0405: mobile/src/creative/ImageDraftScreen.tsx:225; C0520: mobile/src/creative/NovelAiSettings.tsx:56 |
| U22-010 | 展开画面编辑 | Button | true | [131,2185][221,2274] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0406: mobile/src/creative/ImageDraftScreen.tsx:225 |
| U22-011 | 生成 1 张图片 | Button | true | [236,2185][949,2274] / [271.6, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U22-012 | 生成历史 | Button | true | [964,2185][1053,2274] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0408: mobile/src/creative/ImageDraftScreen.tsx:225 |

## 23 · 全局素材空态

状态：accepted。管理/导入等入口；没有项目内容。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U23-001 | 导入素材 | Button | true | [699,106][908,201] / [79.6, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0314: mobile/src/creative/CreativeWorkspace.tsx:222; C0318: mobile/src/creative/CreativeWorkspace.tsx:222; C0368: mobile/src/creative/CreativeWorkspace.tsx:292; C0439: mobile/src/creative/LibraryToolbar.tsx:8 |
| U23-002 | 素材管理 | Button | true | [939,95][1049,210] / [41.9, 43.8] | 有该起点操作轨迹 T022；见轨迹中的终态与组合动作说明 | C0375: mobile/src/creative/CreativeWorkspace.tsx:303; C0440: mobile/src/creative/LibraryToolbar.tsx:9 |
| U23-003 | 全部素材 | View | true | [32,226][180,320] / [56.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-004 | 未归入项目 | View | true | [227,226][412,320] / [70.5, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-005 | 回收站 | View | true | [460,226][571,320] / [42.3, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-006 | 搜索资产 | EditText | true | [134,337][1017,432] / [336.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0371: mobile/src/creative/CreativeWorkspace.tsx:293; C0442: mobile/src/creative/LibraryToolbar.tsx:12 |
| U23-007 | 全部 | RadioButton | true | [32,447][175,542] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-008 | 图片 | RadioButton | true | [197,447][341,542] / [54.9, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-009 | 视频 | RadioButton | true | [361,447][504,542] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-010 | 音频 | RadioButton | true | [526,447][670,542] / [54.9, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-011 | 文档 | RadioButton | true | [690,447][833,542] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-012 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-013 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U23-014 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U23-015 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 有该起点操作轨迹 T022；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |

## 24 · 仍是素材空态

状态：duplicate。点击导入时目标匹配失败；此图不能证明导入面板已经打开。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 25 · 素材导入面板：仅截图有效

状态：visual-only。相册/文件/新建Prompt入口视觉可见；当时dump失败后读到旧树，拒绝此文件XML和JSON作为控件证据。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 28 · 素材管理菜单

状态：accepted。存储、历史作品、创作草稿、迁入入口。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U28-001 | 关闭素材管理 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U28-002 | 完成 | Button | true | [953,1549][1038,1644] / [32.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0686: mobile/src/creative/WorkbenchUI.tsx:57 |
| U28-003 | 存储与清理，查看占用，清理缓存与孤儿文件 | Button | true | [32,1687][1049,1835] / [387.4, 56.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U28-004 | 历史作品，查看旧版作品并迁入素材库 | Button | true | [32,1862][1049,2010] / [387.4, 56.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U28-005 | 创作草稿，继续尚未完成的创作 | Button | true | [32,2037][1049,2185] / [387.4, 56.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U28-006 | 迁入历史作品（可中断） | Button | true | [32,2212][1049,2306] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0374: mobile/src/creative/CreativeWorkspace.tsx:300; C0379: mobile/src/creative/CreativeWorkspace.tsx:303 |

## 29 · 存储与数据管理

状态：accepted。完整备份/数据库备份/清理/清除同区同色。F11；未执行维护写入。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U29-001 | 返回来源 | Button | true | [21,63][110,152] / [33.9, 33.9] | 有该起点操作轨迹 T024；见轨迹中的终态与组合动作说明 | C0011: mobile/app/(tabs)/settings.tsx:84 |
| U29-002 | 全部设置 | Button | true | [42,196][1038,290] / [379.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0017: mobile/app/(tabs)/settings.tsx:91 |
| U29-003 | 自动保存到系统相册 | Switch | true | [885,462][1007,533] / [46.5, 27.0] | 仅可见/树中声明，未证明点击执行成功 | C0030: mobile/app/(tabs)/settings.tsx:125 |
| U29-004 | 图片生成后自动保存 | Switch | true | [885,625][1007,696] / [46.5, 27.0] | 仅可见/树中声明，未证明点击执行成功 | C0031: mobile/app/(tabs)/settings.tsx:125 |
| U29-005 | 保留应用内副本 | Switch | true | [885,862][1007,933] / [46.5, 27.0] | 仅可见/树中声明，未证明点击执行成功 | C0032: mobile/app/(tabs)/settings.tsx:125 |
| U29-006 | 扫描可清理空间 | Button | true | [87,1232][993,1358] / [345.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0695: mobile/src/settings/DataManagementPanel.tsx:25 |
| U29-007 | 立即备份数据库 | Button | true | [87,1358][993,1484] / [345.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0697: mobile/src/settings/DataManagementPanel.tsx:27 |
| U29-008 | 查看可恢复备份 | Button | true | [87,1484][993,1610] / [345.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0698: mobile/src/settings/DataManagementPanel.tsx:28 |
| U29-009 | 备份数据库与创作文件 | Button | true | [87,1610][993,1736] / [345.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0700: mobile/src/settings/DataManagementPanel.tsx:30 |
| U29-010 | 查看含文件的备份 | Button | true | [87,1736][993,1862] / [345.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0701: mobile/src/settings/DataManagementPanel.tsx:31 |
| U29-011 | 清除应用数据 | Button | true | [87,1862][993,1988] / [345.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0703: mobile/src/settings/DataManagementPanel.tsx:33; C0711: mobile/src/storage/DatabaseRecoveryScreen.tsx:78 |
| U29-012 | 保存设置 | Button | false | [42,2206][1038,2316] / [379.4, 41.9] | 仅可见/树中声明，未证明点击执行成功 | C0034: mobile/app/(tabs)/settings.tsx:135 |

## 30 · 最近任务浮层

状态：accepted。空收件箱与全部任务入口；不是全部任务页。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U30-001 | 关闭最近任务 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | C0729: mobile/src/tasks/TaskInboxButton.tsx:30 |
| U30-002 | 收起最近任务 | Button | true | [931,215][1020,304] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0730: mobile/src/tasks/TaskInboxButton.tsx:30 |
| U30-003 | 全部任务 | Button | true | [147,670][1026,764] / [334.9, 35.8] | 有该起点操作轨迹 T025；见轨迹中的终态与组合动作说明 | C0732: mobile/src/tasks/TaskInboxButton.tsx:36 |

## 31 · 仍是最近任务浮层

状态：duplicate。设置目标未找到；此图不能证明已进入设置。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 32 · 全部任务空队列

状态：accepted。刷新/持续监控/筛选可见；没有真实任务或开启监控。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U32-001 | 返回工作台 | Button | true | [42,63][168,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0043: mobile/app/(tabs)/_layout.tsx:18 |
| U32-002 | 打开任务中心 | Button | true | [797,74][891,179] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-003 | 打开设置 | Button | true | [912,63][1038,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U32-004 | 开启持续监控 | Button | true | [583,221][832,326] / [94.9, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-005 | 刷新任务 | Button | true | [853,221][1038,326] / [70.5, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0039: mobile/app/(tabs)/tasks.tsx:78 |
| U32-006 | 全部 | RadioButton | true | [42,429][258,555] / [82.3, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-007 | 进行中 | RadioButton | true | [279,429][530,555] / [95.6, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-008 | 失败 | RadioButton | true | [551,429][766,555] / [81.9, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-009 | 已归档 | RadioButton | true | [787,429][1038,555] / [95.6, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-010 | 开始创作 | Button | true | [375,1207][705,1333] / [125.7, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-011 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-012 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U32-013 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U32-014 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 33 · 设置分类

状态：accepted。分类入口已走通；分区成功不等于设置保存成功。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U33-001 | 返回来源 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0011: mobile/app/(tabs)/settings.tsx:84 |
| U33-002 | 创作账号，NovelAI · AutoDL | Button | true | [74,307][1007,455] / [355.4, 56.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U33-003 | 助手模型，提示词与创作辅助 | Button | true | [74,456][1007,605] / [355.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U33-004 | 工作流，已安装能力与同步 | Button | true | [74,605][1007,754] / [355.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U33-005 | 存储与导出，保存、备份与恢复 | Button | true | [74,896][1007,1045] / [355.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U33-006 | 视频播放，解码模式 | Button | true | [74,1045][1007,1194] / [355.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U33-007 | 显示与诊断，布局与运行信息 | Button | true | [74,1194][1007,1343] / [355.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 34 · 助手模型设置

状态：accepted。端点为已有假地址，密钥掩码；未保存或验证连接。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U34-001 | 返回设置分类 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U34-002 | LLM API 地址 | EditText | true | [74,548][1007,652] / [355.4, 39.6] | 仅可见/树中声明，未证明点击执行成功 | C0020: mobile/app/(tabs)/settings.tsx:105 |
| U34-003 | LLM 模型 | EditText | true | [74,740][1007,844] / [355.4, 39.6] | 仅可见/树中声明，未证明点击执行成功 | C0021: mobile/app/(tabs)/settings.tsx:105 |
| U34-004 | LLM API Key | EditText | true | [74,928][1007,1033] / [355.4, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0022: mobile/app/(tabs)/settings.tsx:105 |
| U34-005 | 显示LLM API Key | Button | true | [74,1043][1007,1158] / [355.4, 43.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U34-006 | 切换 LLM 高级设置 | Button | true | [74,1184][1007,1300] / [355.4, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0023: mobile/app/(tabs)/settings.tsx:105 |
| U34-007 | 保存设置 | Button | false | [42,2206][1038,2316] / [379.4, 41.9] | 仅可见/树中声明，未证明点击执行成功 | C0034: mobile/app/(tabs)/settings.tsx:135 |

## 35 · 工作流设置

状态：accepted。内置包v1.0.1与同步入口；未执行同步。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U35-001 | 返回设置分类 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U35-002 | 同步工作流 | Button | true | [74,637][1007,754] / [355.4, 44.6] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 36 · 视频播放设置

状态：accepted。自动/硬件/软件解码选项；未修改，未验证视频播放。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U36-001 | 返回设置分类 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U36-002 | 视频解码：自动 | RadioButton | true | [74,438][212,558] / [52.6, 45.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U36-003 | 视频解码：硬解码 | RadioButton | true | [233,438][406,558] / [65.9, 45.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U36-004 | 视频解码：软解码 | RadioButton | true | [428,438][601,558] / [65.9, 45.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U36-005 | 保存设置 | Button | false | [42,2206][1038,2316] / [379.4, 41.9] | 仅可见/树中声明，未证明点击执行成功 | C0034: mobile/app/(tabs)/settings.tsx:135 |

## 37 · 显示与诊断设置

状态：accepted。诊断开关可见；未改配置。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U37-001 | 返回设置分类 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U37-002 | 显示诊断信息 | Switch | true | [871,351][993,422] / [46.5, 27.0] | 仅可见/树中声明，未证明点击执行成功 | C0705: mobile/src/settings/DisplayDiagnostics.tsx:12 |

## 38 · 创作账号面板

状态：accepted。NovelAI/AutoDL均未连接；没有连接真实账号。F04。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U38-001 | 返回设置分类 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U38-002 | 连接 NovelAI | Button | true | [774,297][1038,392] / [100.6, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U38-003 | 连接 AutoDL | Button | true | [781,467][1038,561] / [97.9, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U38-004 | 配置余额查询 | Button | true | [825,588][1038,683] / [81.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 41 · 创作草稿列表

状态：accepted。两个图片新草稿无法从标题区分项目/镜头。F05。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U41-001 | 返回 | Button | true | [42,105][1038,231] / [379.4, 48.0] | 有该起点操作轨迹 T033；见轨迹中的终态与组合动作说明 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U41-002 | 打开创作工作台 | Button | true | [42,263][1038,389] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0046: mobile/app/creative-drafts.tsx:14 |
| U41-003 | 图片 · 编辑中 · 新草稿 | Button | true | [42,537][1038,663] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U41-004 | 图片 · 编辑中 · 新草稿 | Button | true | [42,694][1038,820] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U41-005 | 视频 · 编辑中 · keyboard | Button | true | [42,852][1038,978] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 42 · 旧历史作品空态

状态：accepted。历史作品/结果双重命名；无旧视频可播放。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U42-001 | 返回工作台 | Button | true | [42,63][168,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0043: mobile/app/(tabs)/_layout.tsx:18 |
| U42-002 | 打开任务中心 | Button | true | [797,74][891,179] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-003 | 打开设置 | Button | true | [912,63][1038,189] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U42-004 | 管理作品 | Button | true | [780,252][1038,378] / [98.3, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0001: mobile/app/(tabs)/gallery.tsx:105 |
| U42-005 | 搜索作品 | EditText | true | [155,491][1002,623] / [322.7, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0005: mobile/app/(tabs)/gallery.tsx:110 |
| U42-006 | 全部 | RadioButton | true | [42,667][258,793] / [82.3, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-007 | 已下载 | RadioButton | true | [279,667][530,793] / [95.6, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-008 | 准备中 | RadioButton | true | [551,667][801,793] / [95.2, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-009 | 失败 | RadioButton | true | [822,667][1038,793] / [82.3, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-010 | 去生成视频 | Button | true | [357,1374][723,1500] / [139.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-011 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 有该起点操作轨迹 T034；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U42-012 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U42-013 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U42-014 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 43 · 创作记录浮层

状态：accepted。Prompt/未命名标题缺项目镜头归属。F05。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U43-001 | 关闭创作记录 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U43-002 | 完成 | Button | true | [953,1314][1038,1408] / [32.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0686: mobile/src/creative/WorkbenchUI.tsx:57 |
| U43-003 | 搜索创作记录 | EditText | true | [31,1466][1048,1582] / [387.4, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0251: mobile/src/creative/CreativeHome.tsx:97 |
| U43-004 | 全部 | RadioButton | true | [32,1608][159,1703] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U43-005 | 图片 | RadioButton | true | [176,1608][304,1703] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U43-006 | 视频 | RadioButton | true | [319,1608][446,1703] / [48.4, 36.2] | 有该起点操作轨迹 T035；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U43-007 | 未命名创作 | RadioButton | true | [32,1729][1049,1942] / [387.4, 81.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U43-008 | keyboard | RadioButton | true | [32,1970][1049,2183] / [387.4, 81.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U43-009 | 项目 | Button | true | [32,2211][117,2306] / [32.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U43-010 | 素材库 | Button | true | [149,2211][266,2306] / [44.6, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0256: mobile/src/creative/CreativeHome.tsx:104 |
| U43-011 | 管理工作流 | Button | true | [297,2211][478,2306] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0257: mobile/src/creative/CreativeHome.tsx:105 |

## 44 · 添加视频参考图来源弹窗

状态：accepted。设备/素材库来源；只测了设备路径。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U44-001 | 从设备导入 | Button | true | [102,1265][349,1407] / [94.1, 54.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U44-002 | 从素材库选择 | Button | true | [526,1265][810,1407] / [108.2, 54.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U44-003 | 取消 | Button | true | [810,1265][978,1407] / [64.0, 54.1] | 仅可见/树中声明，未证明点击执行成功 | C0140: mobile/src/agent/PromptVersionPanel.tsx:186; C0235: mobile/src/creative/CreativeAssetPicker.tsx:54 |

## 45 · Android系统相册选择器

状态：system-input。当前系统输入过程；格子内是旧测试图，内部UI不作为本轮App证据。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U45-001 | Drag handle | View | true | [477,601][603,728] / [48.0, 48.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-002 | Collections | View | true | [592,728][922,854] / [125.7, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-003 | More | View | true | [944,729][1070,855] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-004 | (无可访问名称) | Button | true | [954,739][1059,844] / [40.0, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-005 | Dismiss | View | true | [823,1056][1017,1182] / [73.9, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-006 | (无可访问名称) | Button | true | [823,1066][1017,1171] / [73.9, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-007 | Photo taken on Oct 27, 2026 11:54 AM | View | true | [0,1271][358,1629] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-008 | Photo taken on Oct 27, 2026 11:02 AM | View | true | [361,1271][719,1629] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-009 | Photo taken on Oct 26, 2026 2:59 PM | View | true | [722,1271][1080,1629] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-010 | Photo taken on Oct 26, 2026 2:56 PM | View | true | [0,1632][358,1990] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-011 | Photo taken on Oct 26, 2026 1:21 PM | View | true | [361,1632][719,1990] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-012 | Photo taken on Oct 26, 2026 1:12 PM | View | true | [722,1632][1080,1990] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-013 | Photo taken on Oct 26, 2026 1:12 PM | View | true | [0,1993][358,2351] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-014 | Photo taken on Oct 26, 2026 12:44 PM | View | true | [361,1993][719,2351] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U45-015 | Photo taken on Oct 26, 2026 12:43 PM | View | true | [722,1993][1080,2351] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 46 · 系统选择器再次观察

状态：duplicate。扫描测试WebP后仍是同一选择器；不额外证明App路径。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 47 · 系统相册已选一图

状态：system-input。选择已有86.png，Done可见；不是本轮生成图，也不是推送WebP。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U47-001 | Drag handle | View | true | [477,601][603,728] / [48.0, 48.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-002 | Collections | View | true | [592,728][922,854] / [125.7, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-003 | More | View | true | [944,729][1070,855] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-004 | (无可访问名称) | Button | true | [954,739][1059,844] / [40.0, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-005 | Dismiss | View | true | [823,1056][1017,1182] / [73.9, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-006 | (无可访问名称) | Button | true | [823,1066][1017,1171] / [73.9, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-007 | Photo taken on Oct 27, 2026 11:54 AM | View | true | [0,1271][358,1629] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-008 | Photo taken on Oct 27, 2026 11:02 AM | View | true | [361,1271][719,1629] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-009 | Photo taken on Oct 26, 2026 2:59 PM | View | true | [722,1271][1080,1629] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-010 | Photo taken on Oct 26, 2026 2:56 PM | View | true | [0,1632][358,1990] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-011 | Photo taken on Oct 26, 2026 1:21 PM | View | true | [361,1632][719,1990] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-012 | Photo taken on Oct 26, 2026 1:12 PM | View | true | [722,1632][1080,1990] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-013 | Photo taken on Oct 26, 2026 1:12 PM | View | true | [0,1993][358,2351] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-014 | Photo taken on Oct 26, 2026 12:44 PM | View | true | [361,1993][719,2351] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-015 | Selected Photo taken on Oct 26, 2026 12:43 PM / 1 | View | true | [722,1993][1080,2351] / [136.4, 136.4] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-016 | Deselect all | View | true | [69,2139][195,2265] / [48.0, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-017 | (无可访问名称) | Button | true | [79,2149][184,2254] / [40.0, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-018 | Preview | View | true | [590,2139][782,2265] / [73.1, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-019 | (无可访问名称) | Button | true | [590,2149][782,2254] / [73.1, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U47-020 | Done | View | true | [803,2139][1012,2265] / [79.6, 48.0] | 有该起点操作轨迹 T038；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |
| U47-021 | (无可访问名称) | Button | true | [803,2149][1012,2254] / [79.6, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 48 · 视频草稿带一张参考图

状态：accepted。系统Done返回原草稿；自动归档素材，未生成。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U48-001 | 图片 | RadioButton | true | [26,73][165,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-002 | 视频 | RadioButton | true | [171,73][310,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-003 | 新建创作 | Button | true | [665,71][755,160] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0244: mobile/src/creative/CreativeHome.tsx:91 |
| U48-004 | 创作记录 | Button | true | [765,71][854,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0245: mobile/src/creative/CreativeHome.tsx:91; C0250: mobile/src/creative/CreativeHome.tsx:96 |
| U48-005 | 打开任务中心 | Button | true | [865,63][959,168] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-006 | 打开设置 | Button | true | [970,71][1059,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U48-007 | MiniMax H3 · 详情 | Button | true | [754,213][1038,307] / [108.2, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-008 | 连接 AutoDL 创作账号 | Button | true | [42,355][1038,450] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0638: mobile/src/creative/VideoDraftScreen.tsx:222 |
| U48-009 | 添加参考图 | Button | true | [857,497][1038,592] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-010 | 预览参考图 1 | Button | true | [45,616][375,879] / [125.7, 100.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-011 | 管理参考图 1 | Button | true | [287,880][376,969] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-012 | 添加参考音频 | Button | true | [825,1021][1038,1115] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-013 | 帮我写提示词 | Button | true | [825,1263][1038,1357] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0641: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U48-014 | 视频镜头提示词 | EditText | true | [42,1373][1038,1720] / [379.4, 132.2] | 仅可见/树中声明，未证明点击执行成功 | C0642: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U48-015 | 横屏 | RadioButton | true | [47,1772][537,1856] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-016 | 竖屏 | RadioButton | true | [543,1772][1033,1856] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-017 | 480p | RadioButton | true | [47,1888][537,1966] / [186.7, 29.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-018 | 768p | RadioButton | true | [543,1888][1033,1966] / [186.7, 29.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-019 | 选择视频时长 | Button | true | [42,1998][192,1966] / [57.1, -12.2] | 仅可见/树中声明，未证明点击执行成功 | C0645: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U48-020 | 更多设置 | Button | true | [213,2003][362,1966] / [56.8, -14.1] | 仅可见/树中声明，未证明点击执行成功 | C0646: mobile/src/creative/VideoDraftScreen.tsx:228; C0648: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U48-021 | 生成视频 | Button | false | [32,1988][722,2103] / [262.9, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0652: mobile/src/creative/VideoDraftScreen.tsx:234 |
| U48-022 | 视频预估费用说明 | Button | true | [723,1988][1049,2103] / [124.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0630: mobile/src/creative/VideoCostHint.tsx:15 |
| U48-023 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-024 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U48-025 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U48-026 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 有该起点操作轨迹 T039；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |

## 49 · 素材库出现导入项86.png

状态：accepted。全局库能看到导入输入；图片内容本身不作为当前UI证据。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U49-001 | 导入素材 | Button | true | [699,106][908,201] / [79.6, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0314: mobile/src/creative/CreativeWorkspace.tsx:222; C0318: mobile/src/creative/CreativeWorkspace.tsx:222; C0368: mobile/src/creative/CreativeWorkspace.tsx:292; C0439: mobile/src/creative/LibraryToolbar.tsx:8 |
| U49-002 | 素材管理 | Button | true | [939,95][1049,210] / [41.9, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0375: mobile/src/creative/CreativeWorkspace.tsx:303; C0440: mobile/src/creative/LibraryToolbar.tsx:9 |
| U49-003 | 全部素材 | View | true | [32,226][180,320] / [56.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-004 | 未归入项目 | View | true | [227,226][412,320] / [70.5, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-005 | 回收站 | View | true | [460,226][571,320] / [42.3, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-006 | 搜索资产 | EditText | true | [134,337][1017,432] / [336.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0371: mobile/src/creative/CreativeWorkspace.tsx:293; C0442: mobile/src/creative/LibraryToolbar.tsx:12 |
| U49-007 | 全部 | RadioButton | true | [32,447][175,542] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-008 | 图片 | RadioButton | true | [197,447][341,542] / [54.9, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-009 | 视频 | RadioButton | true | [361,447][504,542] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-010 | 音频 | RadioButton | true | [526,447][670,542] / [54.9, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-011 | 文档 | RadioButton | true | [690,447][833,542] / [54.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-012 | 打开资产 86.png | Button | true | [32,583][530,1119] / [189.7, 204.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-013 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-014 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U49-015 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U49-016 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 有该起点操作轨迹 T040；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |

## 50 · 内嵌素材详情v1

状态：accepted。导出/加入项目/更多与文件事实可见；独立素材路由未在本轮打开。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U50-001 | 关闭素材详情 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U50-002 | 编辑名称与标签 | Button | true | [850,95][939,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0311: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U50-003 | 素材操作 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 有该起点操作轨迹 T041；见轨迹中的终态与组合动作说明 | C0312: mobile/src/creative/CreativeWorkspace.tsx:222; C0354: mobile/src/creative/CreativeWorkspace.tsx:271 |
| U50-004 | 全屏查看图片 | Button | true | [32,305][1049,1068] / [387.4, 290.7] | 仅可见/树中声明，未证明点击执行成功 | C0268: mobile/src/creative/CreativeResults.tsx:195; C0346: mobile/src/creative/CreativeWorkspace.tsx:263; C0752: mobile/src/ui/ZoomableImage.tsx:17 |
| U50-005 | 导出 | Button | true | [32,1104][230,1199] / [75.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0347: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U50-006 | 加入项目 | Button | true | [252,1104][521,1199] / [102.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0348: mobile/src/creative/CreativeWorkspace.tsx:267; C0349: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U50-007 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U50-008 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U50-009 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U50-010 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 有该起点操作轨迹 T041；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |

## 51 · 仍是素材详情

状态：duplicate。滚动未改变有效状态；不是素材操作菜单证据。

此状态不生成有效控件台账；见排除/视觉限制说明。

## 52 · 素材操作菜单

状态：accepted。信息、增强/放大、保存相册、设默认等可见；导出未执行。F09。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U52-001 | 关闭素材操作 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U52-002 | 完成 | Button | true | [953,1242][1038,1336] / [32.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0686: mobile/src/creative/WorkbenchUI.tsx:57 |
| U52-003 | 信息 | Button | true | [32,1380][1049,1475] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U52-004 | 增强 / 放大 | Button | true | [32,1500][1049,1594] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0355: mobile/src/creative/CreativeWorkspace.tsx:272; C0436: mobile/src/creative/ImageProcessingSheet.tsx:25; C0601: mobile/src/creative/ResultActionBar.tsx:10 |
| U52-005 | 保存到系统相册 | Button | true | [32,1621][1049,1715] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U52-006 | 设为默认版本 | Button | true | [32,1742][1049,1837] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0361: mobile/src/creative/CreativeWorkspace.tsx:280 |
| U52-007 | 从此版本创建视频草稿 | Button | true | [32,1947][1049,2042] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0365: mobile/src/creative/CreativeWorkspace.tsx:285 |

## 53 · 加入项目内嵌区域

状态：accepted。项目搜索与固定版本加入入口；尚未证明写入。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U53-001 | 关闭素材详情 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U53-002 | 编辑名称与标签 | Button | true | [850,95][939,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0311: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U53-003 | 素材操作 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0312: mobile/src/creative/CreativeWorkspace.tsx:222; C0354: mobile/src/creative/CreativeWorkspace.tsx:271 |
| U53-004 | 全屏查看图片 | Button | true | [32,305][1049,1068] / [387.4, 290.7] | 仅可见/树中声明，未证明点击执行成功 | C0268: mobile/src/creative/CreativeResults.tsx:195; C0346: mobile/src/creative/CreativeWorkspace.tsx:263; C0752: mobile/src/ui/ZoomableImage.tsx:17 |
| U53-005 | 导出 | Button | true | [32,1104][230,1199] / [75.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0347: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U53-006 | 加入项目 | Button | true | [252,1104][521,1199] / [102.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0348: mobile/src/creative/CreativeWorkspace.tsx:267; C0349: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U53-007 | 关闭加入项目 | Button | true | [931,1737][1021,1826] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U53-008 | 搜索项目 | EditText | true | [60,1847][1020,1973] / [365.7, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0326: mobile/src/creative/CreativeWorkspace.tsx:229; C0350: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U53-009 | 加入 UX-AUDIT-1031（固定此版本） | Button | true | [61,1994][1021,2089] / [365.7, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U53-010 | 加入 KeyboardQA（固定此版本） | Button | true | [61,2110][1021,2177] / [365.7, 25.5] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U53-011 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U53-012 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U53-013 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U53-014 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 54 · 已加入审计项目

状态：accepted。本地加入成功，封面入口藏在此区域；区域仍保持展开。F06。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U54-001 | 关闭素材详情 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U54-002 | 编辑名称与标签 | Button | true | [850,95][939,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0311: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U54-003 | 素材操作 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 有该起点操作轨迹 T044；见轨迹中的终态与组合动作说明 | C0312: mobile/src/creative/CreativeWorkspace.tsx:222; C0354: mobile/src/creative/CreativeWorkspace.tsx:271 |
| U54-004 | 全屏查看图片 | Button | true | [32,305][1049,1068] / [387.4, 290.7] | 仅可见/树中声明，未证明点击执行成功 | C0268: mobile/src/creative/CreativeResults.tsx:195; C0346: mobile/src/creative/CreativeWorkspace.tsx:263; C0752: mobile/src/ui/ZoomableImage.tsx:17 |
| U54-005 | 导出 | Button | true | [32,1104][230,1199] / [75.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0347: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U54-006 | 加入项目 | Button | true | [252,1104][521,1199] / [102.5, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0348: mobile/src/creative/CreativeWorkspace.tsx:267; C0349: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U54-007 | 关闭加入项目 | Button | true | [931,1737][1021,1826] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U54-008 | 搜索项目 | EditText | true | [60,1847][1020,1973] / [365.7, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0326: mobile/src/creative/CreativeWorkspace.tsx:229; C0350: mobile/src/creative/CreativeWorkspace.tsx:267 |
| U54-009 | 加入 KeyboardQA（固定此版本） | Button | true | [61,1994][1021,2089] / [365.7, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U54-010 | 设为 UX-AUDIT-1031 封面 | Button | true | [61,2110][1021,2177] / [365.7, 25.5] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U54-011 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U54-012 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U54-013 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U54-014 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 有该起点操作轨迹 T044；见轨迹中的终态与组合动作说明 | 需结合页面组件定位，见source-index |

## 55 · 增强/放大与下层菜单同时保留

状态：accepted。两层Sheet与加入区域同时保留；没有启动处理。F03。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U55-001 | 关闭增强 / 放大 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U55-002 | 完成 | Button | true | [953,1748][1038,1843] / [32.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0686: mobile/src/creative/WorkbenchUI.tsx:57 |
| U55-003 | 细节增强 · Enhance，调整倍率与变化强度，重新绘制细节 | Button | false | [32,1901][1049,2050] / [387.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U55-004 | 清晰放大 · 2×，宽高各放大 2 倍，尽量保留原画面 | Button | true | [32,2158][1049,2307] / [387.4, 56.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 56 · 系统返回后仍在素材操作菜单

状态：accepted。真实状态是素材菜单，不是文件名所称选择器；证明返回层级。F03。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U56-001 | 关闭素材操作 | Button | true | [0,0][1080,2400] / [411.4, 914.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U56-002 | 完成 | Button | true | [953,1026][1038,1121] / [32.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0686: mobile/src/creative/WorkbenchUI.tsx:57 |
| U56-003 | 信息 | Button | true | [32,1164][1049,1258] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U56-004 | 增强 / 放大 | Button | true | [32,1284][1049,1379] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0355: mobile/src/creative/CreativeWorkspace.tsx:272; C0436: mobile/src/creative/ImageProcessingSheet.tsx:25; C0601: mobile/src/creative/ResultActionBar.tsx:10 |
| U56-005 | 保存到系统相册 | Button | true | [32,1405][1049,1500] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U56-006 | 设为默认版本 | Button | true | [32,1526][1049,1620] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0361: mobile/src/creative/CreativeWorkspace.tsx:280 |
| U56-007 | 从此版本创建视频草稿 | Button | true | [32,1731][1049,1825] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0365: mobile/src/creative/CreativeWorkspace.tsx:285 |
| U56-008 | 从 UX-AUDIT-1031 移出 | Button | true | [32,2090][1049,2185] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U56-009 | 让 UX-AUDIT-1031 跟随默认版本 | Button | true | [32,2211][1049,2306] / [387.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 57 · 有图片草稿的镜头卡

状态：accepted。真实状态不是选图页；主入口已变为继续已有草稿，选图退至更多。F01后态。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U57-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U57-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U57-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-008 | 更多镜头操作 | Button | true | [926,475][1015,565] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-009 | 继续已有草稿 | Button | true | [66,731][1014,825] / [361.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U57-010 | 添加镜头 | Button | true | [32,891][1049,985] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 58 · 非空图片版本选择器

状态：accepted。从镜头更多选定图片进入；项目已有86.png v1可用。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U58-001 | 取消 | Button | true | [943,84][1028,178] / [32.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0140: mobile/src/agent/PromptVersionPanel.tsx:186; C0235: mobile/src/creative/CreativeAssetPicker.tsx:54 |
| U58-002 | 搜索素材 | EditText | true | [52,297][1027,413] / [371.4, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0236: mobile/src/creative/CreativeAssetPicker.tsx:56 |
| U58-003 | 从全部素材选择 | Button | true | [53,445][1028,540] / [371.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U58-004 | 选择 86.png · 版本 1 | Button | true | [53,680][541,1313] / [185.9, 241.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U58-005 | 采用为镜头成果 | Button | false | [53,2212][1028,2306] / [371.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 59 · 已选v1待确认采用

状态：accepted。显示具体版本及确认；选中与采用分开。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U59-001 | 取消 | Button | true | [943,84][1028,178] / [32.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0140: mobile/src/agent/PromptVersionPanel.tsx:186; C0235: mobile/src/creative/CreativeAssetPicker.tsx:54 |
| U59-002 | 搜索素材 | EditText | true | [52,297][1027,413] / [371.4, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0236: mobile/src/creative/CreativeAssetPicker.tsx:56 |
| U59-003 | 从全部素材选择 | Button | true | [53,445][1028,540] / [371.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U59-004 | 选择 86.png · 版本 1 | Button | true | [53,680][541,1313] / [185.9, 241.1] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U59-005 | 采用为镜头成果 | Button | true | [53,2212][1028,2306] / [371.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 60 · 镜头已采用图片固定版本

状态：accepted。显式确认后采用成功；主动作变制作视频。F01边界：采用后动作正常。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U60-001 | 返回 | Button | true | [32,95][121,184] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U60-002 | 项目设置 | Button | true | [960,95][1050,184] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0316: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U60-003 | 概览 | RadioButton | true | [32,210][159,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U60-004 | 镜头 | RadioButton | true | [176,210][304,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U60-005 | 素材 | RadioButton | true | [319,210][446,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U60-006 | 计划 | RadioButton | true | [463,210][591,305] / [48.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U60-007 | 活动 | RadioButton | true | [606,210][733,305] / [48.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U60-008 | 收起镜头操作 | Button | true | [926,475][1015,565] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U60-009 | 制作视频 | Button | true | [66,865][1014,960] / [361.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0297: mobile/src/creative/CreativeResults.tsx:239 |
| U60-010 | 编辑镜头 | Button | true | [66,981][263,1076] / [75.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0560: mobile/src/creative/ProjectShots.tsx:76 |
| U60-011 | 选定图片 | Button | true | [285,981][483,1076] / [75.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0561: mobile/src/creative/ProjectShots.tsx:77 |
| U60-012 | 选定视频 | Button | true | [504,981][702,1076] / [75.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0562: mobile/src/creative/ProjectShots.tsx:77 |
| U60-013 | 另建视频草稿 | Button | true | [722,981][990,1076] / [102.1, 36.2] | 有该起点操作轨迹 T050；见轨迹中的终态与组合动作说明 | C0563: mobile/src/creative/ProjectShots.tsx:78 |
| U60-014 | 移除镜头 | Button | true | [66,1097][263,1191] / [75.0, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0566: mobile/src/creative/ProjectShots.tsx:80 |
| U60-015 | 添加镜头 | Button | true | [32,1256][1049,1350] / [387.4, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 61 · 镜头来源的视频草稿

状态：accepted。另建视频草稿成功且带采用图片；没有提交任务。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U61-001 | 返回 | Button | true | [16,63][105,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U61-002 | 创作账号 | Button | true | [975,63][1064,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0394: mobile/src/creative/ImageDraftScreen.tsx:208; C0623: mobile/src/creative/UpscaleDraftScreen.tsx:38; C0632: mobile/src/creative/VideoDraftScreen.tsx:213 |
| U61-003 | 返回所属项目：UX-AUDIT-1031 / AUDIT-Shot-01 | Button | true | [0,153][1080,223] / [411.4, 26.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-004 | MiniMax H3 · 详情 | Button | true | [754,265][1038,359] / [108.2, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-005 | 连接 AutoDL 创作账号 | Button | true | [42,407][1038,502] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0638: mobile/src/creative/VideoDraftScreen.tsx:222 |
| U61-006 | 添加参考图 | Button | true | [857,549][1038,644] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-007 | 预览参考图 1 | Button | true | [45,668][375,931] / [125.7, 100.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-008 | 管理参考图 1 | Button | true | [287,932][376,1021] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-009 | 添加参考音频 | Button | true | [825,1073][1038,1167] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-010 | 帮我写提示词 | Button | true | [825,1315][1038,1409] / [81.1, 35.8] | 有该起点操作轨迹 T051；见轨迹中的终态与组合动作说明 | C0641: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U61-011 | 视频镜头提示词 | EditText | true | [42,1425][1038,1772] / [379.4, 132.2] | 仅可见/树中声明，未证明点击执行成功 | C0642: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U61-012 | 横屏 | RadioButton | true | [47,1824][537,1908] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-013 | 竖屏 | RadioButton | true | [543,1824][1033,1908] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-014 | 480p | RadioButton | true | [47,1940][537,2024] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-015 | 768p | RadioButton | true | [543,1940][1033,2024] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U61-016 | 选择视频时长 | Button | true | [42,2050][192,2126] / [57.1, 29.0] | 仅可见/树中声明，未证明点击执行成功 | C0645: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U61-017 | 更多设置 | Button | true | [213,2055][362,2126] / [56.8, 27.0] | 仅可见/树中声明，未证明点击执行成功 | C0646: mobile/src/creative/VideoDraftScreen.tsx:228; C0648: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U61-018 | 生成视频 | Button | false | [32,2148][722,2264] / [262.9, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0652: mobile/src/creative/VideoDraftScreen.tsx:234 |
| U61-019 | 视频预估费用说明 | Button | true | [723,2148][1049,2264] / [124.2, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0630: mobile/src/creative/VideoCostHint.tsx:15 |

## 62 · 视频提示词协作抽屉

状态：accepted。用途、预设、历史和输入可见；未发送对话。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U62-001 | 返回 | Button | true | [16,63][105,152] / [33.9, 33.9] | 有该起点操作轨迹 T052；见轨迹中的终态与组合动作说明 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U62-002 | 创作账号 | Button | true | [975,63][1064,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0394: mobile/src/creative/ImageDraftScreen.tsx:208; C0623: mobile/src/creative/UpscaleDraftScreen.tsx:38; C0632: mobile/src/creative/VideoDraftScreen.tsx:213 |
| U62-003 | 返回所属项目：UX-AUDIT-1031 / AUDIT-Shot-01 | Button | true | [0,153][1080,223] / [411.4, 26.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-004 | MiniMax H3 · 详情 | Button | true | [754,265][1038,359] / [108.2, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-005 | 连接 AutoDL 创作账号 | Button | true | [42,407][1038,502] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0638: mobile/src/creative/VideoDraftScreen.tsx:222 |
| U62-006 | 添加参考图 | Button | true | [857,549][1038,644] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-007 | 预览参考图 1 | Button | true | [45,668][375,931] / [125.7, 100.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-008 | 管理参考图 1 | Button | true | [287,932][376,1021] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-009 | 添加参考音频 | Button | true | [825,1073][1038,1167] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-010 | 帮我写提示词 | Button | true | [825,1315][1038,1409] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0641: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U62-011 | 视频镜头提示词 | EditText | true | [42,1425][1038,1772] / [379.4, 132.2] | 仅可见/树中声明，未证明点击执行成功 | C0642: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U62-012 | 横屏 | RadioButton | true | [47,1824][537,1908] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-013 | 竖屏 | RadioButton | true | [543,1824][1033,1908] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-014 | 480p | RadioButton | true | [47,1940][537,2024] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-015 | 768p | RadioButton | true | [543,1940][1033,2024] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-016 | 选择视频时长 | Button | true | [42,2050][192,2155] / [57.1, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0645: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U62-017 | 更多设置 | Button | true | [213,2055][362,2150] / [56.8, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0646: mobile/src/creative/VideoDraftScreen.tsx:228; C0648: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U62-018 | 拖动编辑抽屉, 已展开 | SeekBar | true | [1,246][1079,309] / [410.7, 24.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-019 | 讨论历史 | Button | true | [690,309][779,399] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-020 | 新建讨论 | Button | true | [784,309][873,399] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0592: mobile/src/creative/PromptAssistSheet.tsx:145 |
| U62-021 | 助手模型设置 | Button | true | [873,309][962,399] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0583: mobile/src/creative/PromptAssistSheet.tsx:93 |
| U62-022 | 关闭提示词协作 | Button | true | [963,309][1052,399] / [33.9, 34.3] | 仅可见/树中声明，未证明点击执行成功 | C0584: mobile/src/creative/PromptAssistSheet.tsx:93; C0599: mobile/src/creative/PromptAssistSheet.tsx:154 |
| U62-023 | 润色，保留原意 | Button | true | [33,599][278,694] / [93.3, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-024 | 补充光线与构图 | Button | true | [434,599][679,694] / [93.3, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-025 | 精简重复描述 | Button | true | [834,599][1047,694] / [81.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U62-026 | 提示词修改方向 | EditText | true | [22,2210][927,2315] / [344.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0590: mobile/src/creative/PromptAssistSheet.tsx:117 |
| U62-027 | 发送消息 | Button | false | [942,2200][1058,2316] / [44.2, 44.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 63 · 原独立视频的参考图移除菜单

状态：accepted。仅对本次新增参考引用做清理，不删除原素材。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U63-001 | 图片 | RadioButton | true | [26,73][165,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-002 | 视频 | RadioButton | true | [171,73][310,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-003 | 新建创作 | Button | true | [665,71][755,160] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0244: mobile/src/creative/CreativeHome.tsx:91 |
| U63-004 | 创作记录 | Button | true | [765,71][854,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0245: mobile/src/creative/CreativeHome.tsx:91; C0250: mobile/src/creative/CreativeHome.tsx:96 |
| U63-005 | 打开任务中心 | Button | true | [865,63][959,168] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-006 | 打开设置 | Button | true | [970,71][1059,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U63-007 | MiniMax H3 · 详情 | Button | true | [754,213][1038,307] / [108.2, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-008 | 连接 AutoDL 创作账号 | Button | true | [42,355][1038,450] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0638: mobile/src/creative/VideoDraftScreen.tsx:222 |
| U63-009 | 添加参考图 | Button | true | [857,497][1038,592] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-010 | 预览参考图 1 | Button | true | [45,616][375,879] / [125.7, 100.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-011 | 管理参考图 1 | Button | true | [287,880][376,969] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-012 | 移除引用 | Button | true | [66,972][354,1066] / [109.7, 35.8] | 有该起点操作轨迹 T053；见轨迹中的终态与组合动作说明 | C0677: mobile/src/creative/VideoReferenceCards.tsx:25 |
| U63-013 | 添加参考音频 | Button | true | [825,1137][1038,1231] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-014 | 帮我写提示词 | Button | true | [825,1379][1038,1473] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0641: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U63-015 | 视频镜头提示词 | EditText | true | [42,1489][1038,1836] / [379.4, 132.2] | 仅可见/树中声明，未证明点击执行成功 | C0642: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U63-016 | 横屏 | RadioButton | true | [47,1888][537,1966] / [186.7, 29.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-017 | 竖屏 | RadioButton | true | [543,1888][1033,1966] / [186.7, 29.7] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-018 | 480p | RadioButton | true | [47,2004][537,1966] / [186.7, -14.5] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-019 | 768p | RadioButton | true | [543,2004][1033,1966] / [186.7, -14.5] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-020 | 选择视频时长 | Button | true | [42,2114][192,1966] / [57.1, -56.4] | 仅可见/树中声明，未证明点击执行成功 | C0645: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U63-021 | 更多设置 | Button | true | [213,2119][362,1966] / [56.8, -58.3] | 仅可见/树中声明，未证明点击执行成功 | C0646: mobile/src/creative/VideoDraftScreen.tsx:228; C0648: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U63-022 | 生成视频 | Button | false | [32,1988][722,2103] / [262.9, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0652: mobile/src/creative/VideoDraftScreen.tsx:234 |
| U63-023 | 视频预估费用说明 | Button | true | [723,1988][1049,2103] / [124.2, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0630: mobile/src/creative/VideoCostHint.tsx:15 |
| U63-024 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-025 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U63-026 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U63-027 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 64 · 原独立视频参考图恢复0/9

状态：accepted。通过UI移除此引用；不声明数据库字节/更新时间完全恢复。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U64-001 | 图片 | RadioButton | true | [26,73][165,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-002 | 视频 | RadioButton | true | [171,73][310,157] / [53.0, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-003 | 新建创作 | Button | true | [665,71][755,160] / [34.3, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0244: mobile/src/creative/CreativeHome.tsx:91 |
| U64-004 | 创作记录 | Button | true | [765,71][854,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0245: mobile/src/creative/CreativeHome.tsx:91; C0250: mobile/src/creative/CreativeHome.tsx:96 |
| U64-005 | 打开任务中心 | Button | true | [865,63][959,168] / [35.8, 40.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-006 | 打开设置 | Button | true | [970,71][1059,160] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0044: mobile/app/(tabs)/_layout.tsx:21; C0246: mobile/src/creative/CreativeHome.tsx:91 |
| U64-007 | MiniMax H3 · 详情 | Button | true | [754,213][1038,307] / [108.2, 35.8] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-008 | 连接 AutoDL 创作账号 | Button | true | [42,355][1038,450] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0638: mobile/src/creative/VideoDraftScreen.tsx:222 |
| U64-009 | 添加参考图 | Button | true | [857,497][1038,592] / [69.0, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-010 | 添加参考音频 | Button | true | [825,739][1038,834] / [81.1, 36.2] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-011 | 帮我写提示词 | Button | true | [825,981][1038,1075] / [81.1, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0641: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U64-012 | 视频镜头提示词 | EditText | true | [42,1091][1038,1439] / [379.4, 132.6] | 仅可见/树中声明，未证明点击执行成功 | C0642: mobile/src/creative/VideoDraftScreen.tsx:227 |
| U64-013 | 横屏 | RadioButton | true | [47,1490][537,1574] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-014 | 竖屏 | RadioButton | true | [543,1490][1033,1574] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-015 | 480p | RadioButton | true | [47,1606][537,1690] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-016 | 768p | RadioButton | true | [543,1606][1033,1690] / [186.7, 32.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-017 | 选择视频时长 | Button | true | [42,1716][192,1821] / [57.1, 40.0] | 仅可见/树中声明，未证明点击执行成功 | C0645: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U64-018 | 更多设置 | Button | true | [213,1721][362,1815] / [56.8, 35.8] | 仅可见/树中声明，未证明点击执行成功 | C0646: mobile/src/creative/VideoDraftScreen.tsx:228; C0648: mobile/src/creative/VideoDraftScreen.tsx:228 |
| U64-019 | 生成视频 | Button | false | [32,1988][796,2103] / [291.0, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0652: mobile/src/creative/VideoDraftScreen.tsx:234 |
| U64-020 | 视频预估费用说明 | Button | true | [797,1988][1049,2103] / [96.0, 43.8] | 仅可见/树中声明，未证明点击执行成功 | C0630: mobile/src/creative/VideoCostHint.tsx:15 |
| U64-021 | 创作 | View | true | [0,2195][270,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-022 | 助手 | View | true | [270,2195][540,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U64-023 | 项目 | View | true | [540,2195][810,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | C0207: mobile/src/creative/AgentCreativePanel.tsx:41; C0255: mobile/src/creative/CreativeHome.tsx:103 |
| U64-024 | 素材 | View | true | [810,2195][1080,2327] / [102.9, 50.3] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |

## 65 · 缺失任务结果

状态：accepted。有未找到说明、返回和任务中心；成功/失败任务未测。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U65-001 | 返回 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U65-002 | 打开任务中心处理下载或异常 | Button | true | [42,194][1038,289] / [379.4, 36.2] | 仅可见/树中声明，未证明点击执行成功 | C0055: mobile/app/creative-task/[id].tsx:62 |

## 66 · 不完整成果链接

状态：accepted。首次取证URI被shell拆分导致缺参数；页面有明确说明，不作为App缺陷。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U66-001 | 返回 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |

## 67 · 旧视频不存在

状态：accepted。稳定显示作品不存在或已删除及返回；有效旧视频播放未测。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U67-001 | 返回上一页 | Button | true | [386,1202][694,1328] / [117.3, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0057: mobile/app/video/[id].tsx:67; C0058: mobile/app/video/[id].tsx:68; C0059: mobile/app/video/[id].tsx:110 |

## 68 · 从对话提炼技能初态

状态：accepted。证据选择/脱敏说明/目标/禁用发送可见；未提炼。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U68-001 | 返回 | Button | true | [42,105][1038,231] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U68-002 | 选择对话：未命名对话 | Button | true | [42,693][1038,819] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U68-003 | 更多对话 | Button | true | [42,856][1038,982] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0145: mobile/src/agent/skills/SkillExtractionScreen.tsx:84 |
| U68-004 | 整理已选证据（0 段） | Button | false | [42,1019][1038,1145] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | 需结合页面组件定位，见source-index |
| U68-005 | 提炼目标 | EditText | true | [42,1484][1038,1601] / [379.4, 44.6] | 仅可见/树中声明，未证明点击执行成功 | C0149: mobile/src/agent/skills/SkillExtractionScreen.tsx:100 |
| U68-006 | 待发送的证据 | EditText | true | [42,1637][1038,2057] / [379.4, 160.0] | 仅可见/树中声明，未证明点击执行成功 | C0150: mobile/src/agent/skills/SkillExtractionScreen.tsx:101 |
| U68-007 | 重新脱敏并检查 | Button | true | [42,2094][1038,2220] / [379.4, 48.0] | 仅可见/树中声明，未证明点击执行成功 | C0151: mobile/src/agent/skills/SkillExtractionScreen.tsx:102 |
| U68-008 | 确认发送证据并生成草稿 | Button | false | [42,2257][1038,2337] / [379.4, 30.5] | 仅可见/树中声明，未证明点击执行成功 | C0152: mobile/src/agent/skills/SkillExtractionScreen.tsx:103 |

## 69 · 参数完整但指定版本不存在

状态：accepted。修复URI引用后再次打开；明确版本不可用，没有替换其他版本。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U69-001 | 返回 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |

## 70 · 独立技能页空态

状态：accepted。全屏route可达；添加/记录/搜索可见，未安装技能。

| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |
| --- | --- | --- | --- | --- | --- | --- |
| U70-001 | 返回 | Button | true | [21,63][110,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0045: mobile/app/creative-drafts.tsx:13; C0048: mobile/app/creative-task/[id].tsx:42; C0142: mobile/src/agent/skills/SkillExtractionScreen.tsx:77; C0258: mobile/src/creative/CreativeOutputPreview.tsx:40; C0313: mobile/src/creative/CreativeWorkspace.tsx:222; C0317: mobile/src/creative/CreativeWorkspace.tsx:222 |
| U70-002 | 添加技能 | Button | true | [865,63][954,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0163: mobile/src/agent/skills/SkillLibraryScreen.tsx:56 |
| U70-003 | 技能运行记录 | Button | true | [970,63][1059,152] / [33.9, 33.9] | 仅可见/树中声明，未证明点击执行成功 | C0164: mobile/src/agent/skills/SkillLibraryScreen.tsx:57 |
| U70-004 | 搜索技能 | EditText | true | [31,186][1048,302] / [387.4, 44.2] | 仅可见/树中声明，未证明点击执行成功 | C0172: mobile/src/agent/skills/SkillLibraryScreen.tsx:80 |
