# Assistant-ui 移动端线程布局设计

## 目标

修复 Prompt 助手移动端的自动滚动和 timeline 可视区域问题，并让聊天区域完全采用 assistant-ui 预制的交互组件。聊天消息、思考过程、工具调用、附件、Composer、线程列表、重命名、归档、删除和滚动行为都由 assistant-ui 提供；本项目只负责把这些组件放入应用页面，并通过已有颜色 token 进行配色。

## 选定方案：官方 ThreadListSidebar

采用 assistant-ui 官方 `ThreadListSidebar` + `SidebarProvider` + `SidebarInset` + `SidebarTrigger` 组合。

- 桌面端：左侧显示官方可折叠 Sidebar，SidebarContent 内渲染官方 `ThreadList`；右侧 `SidebarInset` 只渲染官方 `Thread`。
- 移动端：官方 Sidebar 自动切换为左侧 Sheet；默认关闭时，聊天内容占满可用宽度；用户通过官方 `SidebarTrigger` 打开 timeline。
- 线程切换、新建、搜索、重命名、归档、删除和焦点管理继续走 assistant-ui runtime，不增加应用自研事件和状态机。
- 主聊天视图只有一个可滚动的 `ThreadPrimitive.Viewport`。不再把完整 ThreadList 放进移动端 grid row，也不在 Thread 外层创建第二个聊天滚动容器。

## 页面结构与数据流

```text
AssistantRuntimeProvider
└── SidebarProvider
    ├── ThreadListSidebar (assistant-ui)
    │   └── SidebarContent -> ThreadList (assistant-ui)
    └── SidebarInset
        ├── SidebarTrigger (assistant-ui sidebar)
        └── Thread (assistant-ui)
            ├── ThreadPrimitive.Viewport (唯一聊天滚动区)
            ├── native message/attachment parts
            └── Composer + scroll-to-bottom (assistant-ui)
```

`useRemoteThreadListRuntime` 继续连接本地 assistant-ui storage adapter；`useLocalRuntime` 继续连接现有 H3 ChatModelAdapter。Android 原生媒体选择只保留桥接层，把文件交给 assistant-ui Composer attachment adapter，不处理消息展示。

## 滚动与安全区域规则

- `SidebarProvider` 和 `SidebarInset` 使用 `h-full min-h-0`，确保 Thread 可以计算出稳定的可用高度。
- 页面壳层不设置 `overflow-y-auto`；滚动责任只交给 assistant-ui Thread viewport。
- Thread 内部的官方 sticky viewport footer 负责 Composer 和自动滚动锚点，外部不再叠加 fixed/sticky 输入框。
- 页面继续避让应用底部导航与移动端 safe-area；这个避让属于 AppShell 页面壳层，不改变 Thread 内部行为。
- timeline Sheet 打开时由官方 Sheet 管理遮罩、焦点和关闭手势，避免自研 drawer 与聊天滚动状态耦合。

## 配色与文案范围

保留现有深色色板，仅让 assistant-ui 的语义 token 映射到现有背景、前景、边框和强调色。不得通过自定义消息卡片、气泡或时间线 CSS 重写 assistant-ui 的结构。assistant-ui 默认文案保留原样，除非后续另有本地化需求。

## 错误处理

模型请求错误、工具调用状态、附件加载错误、线程加载 skeleton 和运行中状态由 assistant-ui 原生 UI 呈现。应用只保留现有 API 配置和原生媒体桥接的错误日志，不新增聊天专用错误面板。

## 验证标准

1. 移动端聊天正文只有一个纵向滚动条；消息流式增长时自动滚动不被 Composer 或底部导航遮挡。
2. 移动端打开 SidebarTrigger 后，timeline 以官方 Sheet 出现；切换、新建、搜索、重命名、归档和删除均可用。
3. 桌面端 Sidebar 与 Thread 同时可见，Thread viewport 高度不溢出页面。
4. 消息、思考过程、tool call、图片/文件附件、编辑、重试、复制和分支操作继续由 assistant-ui 原生组件处理。
5. 通过现有单元测试、TypeScript 检查、生产构建，并在移动端和桌面端浏览器分别检查滚动、Sheet 和 Composer 的实际边界。
