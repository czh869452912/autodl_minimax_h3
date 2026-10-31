# 源码逐交互行为台账

762项是JSX交互声明与action/field/option工厂调用；有复用组件、动态模板与组合回调，不等于762个可见按钮。每项列当前事件表达式，便于逐个追踪；函数引用需到所列文件阅读函数体。静态定位不证明可用。

“同名UI”仅字符串候选，可能对应不同宿主或同名控件；运行结果以navigation-trace.md明确记录为准。条件分支、长按、失败态尚未全测。

## C0001 · mobile/app/(tabs)/gallery.tsx:105

组件：`ListAction`。声明名称：`"管理作品"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U42-004。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setSelecting(true)}"
}
```

## C0002 · mobile/app/(tabs)/gallery.tsx:107

组件：`ListAction`。声明名称：`"取消选择"`。

禁用表达式：`{removing}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { setSelected([]); setSelecting(false); }}"
}
```

## C0003 · mobile/app/(tabs)/gallery.tsx:108

组件：`ListAction`。声明名称：`"选择已加载作品"`。

禁用表达式：`{removing || !assets.length}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setSelected(assets.map(item => item.id))}"
}
```

## C0004 · mobile/app/(tabs)/gallery.tsx:108

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{removing || !selected.length}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{removeSelected}"
}
```

## C0005 · mobile/app/(tabs)/gallery.tsx:110

组件：`TextInput`。声明名称：`"搜索作品"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U42-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{changeQuery}"
}
```

## C0006 · mobile/app/(tabs)/gallery.tsx:110

组件：`Pressable`。声明名称：`"清除作品搜索"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => changeQuery('')}"
}
```

## C0007 · mobile/app/(tabs)/gallery.tsx:111

组件：`ListFilters`。声明名称：`"作品状态"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChange": "{value => { if (removing || value === filter) return; generation.current++; setSelected([]); setFilter(value); }}"
}
```

## C0008 · mobile/app/(tabs)/gallery.tsx:112

组件：`ListAction`。声明名称：`"重试读取作品列表"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void load()}"
}
```

## C0009 · mobile/app/(tabs)/gallery.tsx:114

组件：`ListAction`。声明名称：`{pageError}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void loadMore()}"
}
```

## C0010 · mobile/app/(tabs)/gallery.tsx:115

组件：`GalleryCard`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onLongPress": "{() => { setSelecting(true); toggle(item.id); }}",
  "onPress": "{() => selecting || selected.length ? toggle(item.id) : openAsset(item)}"
}
```

## C0011 · mobile/app/(tabs)/settings.tsx:84

组件：`TextAction`。声明名称：`"返回来源"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-001, U33-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0012 · mobile/app/(tabs)/settings.tsx:84

组件：`Pressable`。声明名称：`"重试读取设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setLoadAttempt(value => value + 1)}"
}
```

## C0013 · mobile/app/(tabs)/settings.tsx:85

组件：`IconAction`。声明名称：`{activeSection&&!(directEntry)?"返回设置分类":"返回来源"}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0014 · mobile/app/(tabs)/settings.tsx:86

组件：`Pressable`。声明名称：`"丢弃无法读取的草稿"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { void writeSettingsDraft().then(() => { setDraftReadError(false); setDraftError(''); }).catch(() => setDraftError('无法丢弃草稿，请重试；已保存设置不受影响')); }}"
}
```

## C0015 · mobile/app/(tabs)/settings.tsx:87

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { setValues(current => ({ ...current, ...pendingDraft })); setPendingDraft(undefined); }}"
}
```

## C0016 · mobile/app/(tabs)/settings.tsx:87

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setPendingDraft(undefined)}"
}
```

## C0017 · mobile/app/(tabs)/settings.tsx:91

组件：`TextAction`。声明名称：`"全部设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setDirectEntry(false);setActiveSection(undefined);}}"
}
```

## C0018 · mobile/app/(tabs)/settings.tsx:94

组件：`SettingRow`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setDirectEntry(false);setActiveSection(key);}}"
}
```

## C0019 · mobile/app/(tabs)/settings.tsx:96

组件：`SettingRow`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setActiveSection(key)}"
}
```

## C0020 · mobile/app/(tabs)/settings.tsx:105

组件：`Field`。声明名称：`"LLM API 地址"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U34-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{(text) => update('llmEndpoint', text)}"
}
```

## C0021 · mobile/app/(tabs)/settings.tsx:105

组件：`Field`。声明名称：`"LLM 模型"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U34-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{(text) => update('llmModel', text)}"
}
```

## C0022 · mobile/app/(tabs)/settings.tsx:105

组件：`Field`。声明名称：`"LLM API Key"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U34-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{(text) => update('llmApiKey', text)}"
}
```

## C0023 · mobile/app/(tabs)/settings.tsx:105

组件：`Pressable`。声明名称：`"切换 LLM 高级设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U34-006。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setAdvancedOpen((open) => !open)}"
}
```

## C0024 · mobile/app/(tabs)/settings.tsx:107

组件：`Field`。声明名称：`"最大输出（tokens）"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{text => update('llmMaxOutputTokens', text)}"
}
```

## C0025 · mobile/app/(tabs)/settings.tsx:109

组件：`Field`。声明名称：`"模型上下文上限（tokens）"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{text => update('llmContextWindowTokens', text)}"
}
```

## C0026 · mobile/app/(tabs)/settings.tsx:115

组件：`Pressable`。声明名称：`{`思考强度：${option.label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => update('llmReasoningEffort', option.value)}"
}
```

## C0027 · mobile/app/(tabs)/settings.tsx:119

组件：`Field`。声明名称：`"请求超时（秒）"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{text => update('llmTimeoutSeconds', text)}"
}
```

## C0028 · mobile/app/(tabs)/settings.tsx:120

组件：`Field`。声明名称：`"最大重试次数"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{text => update('llmMaxRetries', text)}"
}
```

## C0029 · mobile/app/(tabs)/settings.tsx:122

组件：`Pressable`。声明名称：`"恢复 LLM 高级设置默认值"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setValues(current => ({ ...current, ...advancedDefaults }))}"
}
```

## C0030 · mobile/app/(tabs)/settings.tsx:125

组件：`Switch`。声明名称：`"自动保存到系统相册"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onValueChange": "{(value) => update('autoExportToGallery', value)}"
}
```

## C0031 · mobile/app/(tabs)/settings.tsx:125

组件：`Switch`。声明名称：`"图片生成后自动保存"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onValueChange": "{value=>update('autoExportImagesToGallery',value)}"
}
```

## C0032 · mobile/app/(tabs)/settings.tsx:125

组件：`Switch`。声明名称：`"保留应用内副本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onValueChange": "{(value) => update('keepPrivateCopy', value)}"
}
```

## C0033 · mobile/app/(tabs)/settings.tsx:127

组件：`Pressable`。声明名称：`{`视频解码：${option.label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => update('videoDecodeMode', option.value)}"
}
```

## C0034 · mobile/app/(tabs)/settings.tsx:135

组件：`Pressable`。声明名称：`"保存设置"`。

禁用表达式：`{saving || !dirty}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-012, U34-007, U36-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void save()}"
}
```

## C0035 · mobile/app/(tabs)/settings.tsx:142

组件：`Pressable`。声明名称：`{`${visible ? '隐藏' : '显示'}${label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setVisible(value => !value)}"
}
```

## C0036 · mobile/app/(tabs)/tasks.tsx:50

组件：`factory:action`。声明名称：`item`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "false"
}
```

## C0037 · mobile/app/(tabs)/tasks.tsx:51

组件：`factory:action`。声明名称：`item`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "true"
}
```

## C0038 · mobile/app/(tabs)/tasks.tsx:77

组件：`Pressable`。声明名称：`{monitoring ? '停止持续监控' : '开启持续监控'}`。

禁用表达式：`{monitorBusy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void toggleMonitoring()}"
}
```

## C0039 · mobile/app/(tabs)/tasks.tsx:78

组件：`Pressable`。声明名称：`"刷新任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U32-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{refresh}"
}
```

## C0040 · mobile/app/(tabs)/tasks.tsx:87

组件：`ListAction`。声明名称：`"重试后台同步注册"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { void backgroundRegistration.retry(); }}"
}
```

## C0041 · mobile/app/(tabs)/tasks.tsx:89

组件：`ListFilters`。声明名称：`"任务筛选"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value => { setFilter(value); setPageError(''); }}"
}
```

## C0042 · mobile/app/(tabs)/tasks.tsx:93

组件：`ListAction`。声明名称：`"加载更多失败，点击重试"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { setPageError(''); setPageBusy(true); void session.loadMore().catch(() => setPageError('加载更多失败')).finally(() => setPageBusy(false)); }}"
}
```

## C0043 · mobile/app/(tabs)/_layout.tsx:18

组件：`Pressable`。声明名称：`"返回工作台"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U32-001, U42-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.canGoBack() ? router.back() : router.navigate('/(tabs)/create')}"
}
```

## C0044 · mobile/app/(tabs)/_layout.tsx:21

组件：`Pressable`。声明名称：`"打开设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-006, U04-006, U05-006, U32-003, U42-003, U48-006, U63-006, U64-006。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.navigate('/settings-panel')}"
}
```

## C0045 · mobile/app/creative-drafts.tsx:13

组件：`ListAction`。声明名称：`"返回"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-001, U12-001, U13-001, U14-001, U15-001, U17-001, U19-001, U20-001, U22-001, U41-001, U57-001, U60-001, U61-001, U62-001, U65-001, U66-001, U68-001, U69-001, U70-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.canGoBack() ? router.back() : router.replace('/(tabs)/create')}"
}
```

## C0046 · mobile/app/creative-drafts.tsx:14

组件：`ListAction`。声明名称：`"打开创作工作台"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U41-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.navigate('/(tabs)/create')}"
}
```

## C0047 · mobile/app/creative-drafts.tsx:17

组件：`ListAction`。声明名称：`{`${JSON.parse(d.input_json).operation==='upscale'?'图片超分':d.provider_id === 'novelai' ? '图片' : '视频'} · ${d.state === 'SUBMITTED' ? '已提交' : '编辑中'} · ${JSON.parse(d.input_json).prompt?.slice(0, 45) || (JSON.parse(d.input_json).operation==='upscale'?'2× 清晰放大':'新草稿')}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.push({ pathname: d.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: d.id } })}"
}
```

## C0048 · mobile/app/creative-task/[id].tsx:42

组件：`IconAction`。声明名称：`"返回"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-001, U12-001, U13-001, U14-001, U15-001, U17-001, U19-001, U20-001, U22-001, U41-001, U57-001, U60-001, U61-001, U62-001, U65-001, U66-001, U68-001, U69-001, U70-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.canGoBack()?router.back():router.replace('/(tabs)/tasks')}"
}
```

## C0049 · mobile/app/creative-task/[id].tsx:52

组件：`ListAction`。声明名称：`{`打开 ${provider.name} 核查`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void Linking.openURL(provider.reviewUrl!).catch(()=>setError(`无法打开 ${provider.name}，请在浏览器核查生成记录`))}"
}
```

## C0050 · mobile/app/creative-task/[id].tsx:53

组件：`ListAction`。声明名称：`"已核查，解除本次等待"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>Alert.alert('继续新的尝试？',`请确认已核查 ${provider.name} 原任务。原任务结果和消费记录会保留；继续创作可能产生新的费用。本操作只解除工作台等待，生成仍需你点击。`,[{text:'继续核查',style:'cancel'},{text:'已核查，继续创作',onPress:()=>{setBusy(true);void acknowledgeUnknownTask(getDatabase(),id).then(()=>{setReviewed(true);setNotice('已解除工作台等待，原任务记录已保留');}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}])}"
}
```

## C0051 · mobile/app/creative-task/[id].tsx:57

组件：`ListAction`。声明名称：`"同步任务状态"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void getTaskServices().taskCommandService.requestRefresh({maintenance:'force-next-slice'}).then(()=>setNotice('已请求查询，不会重新生成')).catch(e=>setError(e.message))}"
}
```

## C0052 · mobile/app/creative-task/[id].tsx:58

组件：`ListAction`。声明名称：`"管理创作账号"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/settings-panel',params:{section:'accounts'}})}"
}
```

## C0053 · mobile/app/creative-task/[id].tsx:60

组件：`ListAction`。声明名称：`"返回来源计划"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void returnToProject(router,{projectId,planId}).catch(()=>setError('来源项目读取失败'))}"
}
```

## C0054 · mobile/app/creative-task/[id].tsx:61

组件：`ListAction`。声明名称：`"打开这次创作与完整历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.push({pathname:draft.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:draft.id}})}"
}
```

## C0055 · mobile/app/creative-task/[id].tsx:62

组件：`ListAction`。声明名称：`"打开任务中心处理下载或异常"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U65-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.push('/(tabs)/tasks')}"
}
```

## C0056 · mobile/app/video/[id].tsx:67

组件：`Pressable`。声明名称：`"重试读取作品"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void reloadTaskAndAsset()}"
}
```

## C0057 · mobile/app/video/[id].tsx:67

组件：`Pressable`。声明名称：`"返回上一页"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U67-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0058 · mobile/app/video/[id].tsx:68

组件：`Pressable`。声明名称：`"返回上一页"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U67-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.back()}"
}
```

## C0059 · mobile/app/video/[id].tsx:110

组件：`Pressable`。声明名称：`"返回上一页"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U67-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.back()}"
}
```

## C0060 · mobile/app/video/[id].tsx:111

组件：`Pressable`。声明名称：`"重试读取作品"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void reloadTaskAndAsset()}"
}
```

## C0061 · mobile/app/video/[id].tsx:117

组件：`Pressable`。声明名称：`{downloadFailed ? '重试下载视频' : '下载视频'}`。

禁用表达式：`{mediaBusy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => {\n        if (mediaBusy) return;\n        setRedownloading(true);\n        void getTaskServices().taskCommandService.requestDownload(task.id).then(() => reloadTaskAndAsset()).catch(() => setActionNotice('下载未能开始，请刷新任务状态后重试')).finally(() => setRedownloading(false));\n      }}"
}
```

## C0062 · mobile/app/video/[id].tsx:122

组件：`Pressable`。声明名称：`"复制诊断详情"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void Clipboard.setStringAsync(errors.join('\\n')).then(() => setActionNotice('诊断已复制')).catch(() => setActionNotice('诊断复制失败'))}"
}
```

## C0063 · mobile/app/video/[id].tsx:125

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void shareVideo(localSource).catch(() => setActionNotice('分享失败，请重试'))}"
}
```

## C0064 · mobile/app/video/[id].tsx:125

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => void openExternalVideo(localSource).catch(() => setActionNotice('没有可用的外部播放器'))}"
}
```

## C0065 · mobile/app/video/[id].tsx:127

组件：`Pressable`。声明名称：`{task.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'}`。

禁用表达式：`{exporting || task.exportState === 'QUEUED' || task.exportState === 'EXPORTING'}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void saveToGallery()}"
}
```

## C0066 · mobile/app/video/[id].tsx:128

组件：`Pressable`。声明名称：`"复制 Prompt"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void copyPrompt()}"
}
```

## C0067 · mobile/app/_layout.tsx:93

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { setMaintenanceError(''); setMaintenanceAttempt(value => value + 1); }}"
}
```

## C0068 · mobile/app/_layout.tsx:93

组件：`Pressable`。声明名称：`"丢弃损坏的维护请求"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { void scheduleMaintenance().then(() => { setInvalidMaintenance(false); setMaintenanceError(''); setMaintenanceAttempt(value => value + 1); }).catch(() => setMaintenanceError('无法丢弃维护请求，请重试；应用数据未清除。')); }}"
}
```

## C0069 · mobile/app/_layout.tsx:93

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => BackHandler.exitApp()}"
}
```

## C0070 · mobile/src/agent/AgentScreen.tsx:292

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{createSession}"
}
```

## C0071 · mobile/src/agent/AgentScreen.tsx:293

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setActiveThreadId(thread.threadId)}"
}
```

## C0072 · mobile/src/agent/AgentScreen.tsx:297

组件：`AgentSession`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onSelect": "{(id) => setActiveThreadId(id)}"
}
```

## C0073 · mobile/src/agent/AgentScreen.tsx:400

组件：`PromptAssistantUi`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{id=>leaveSkills(()=>uiProps.onSelect(id))}"
}
```

## C0074 · mobile/src/agent/AgentScreen.tsx:406

组件：`SkillLibraryScreen`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setSkillsOpen(false)}"
}
```

## C0075 · mobile/src/agent/AgentScreen.tsx:459

组件：`ListAction`。声明名称：`"打开 LLM 设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.navigate({pathname:'/settings-panel',params:{section:'assistant'}})}"
}
```

## C0076 · mobile/src/agent/HistoryList.tsx:73

组件：`TextInput`。声明名称：`"搜索对话"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setQuery}"
}
```

## C0077 · mobile/src/agent/HistoryList.tsx:80

组件：`Pressable`。声明名称：`"清除搜索"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setQuery('')}"
}
```

## C0078 · mobile/src/agent/HistoryList.tsx:82

组件：`Pressable`。声明名称：`"历史中新建对话"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onNew}"
}
```

## C0079 · mobile/src/agent/HistoryList.tsx:90

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setSearchRetry(value => value + 1)}"
}
```

## C0080 · mobile/src/agent/HistoryList.tsx:96

组件：`Pressable`。声明名称：`"重试读取更多对话"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{loadMore}"
}
```

## C0081 · mobile/src/agent/HistoryList.tsx:101

组件：`RecordRow`。声明名称：`{sessionDisplayTitle(thread, threads)}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>onSelect(thread.threadId)}"
}
```

## C0082 · mobile/src/agent/HistoryList.tsx:102

组件：`Pressable`。声明名称：`{`管理会话 ${sessionTitle(thread)}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => Alert.alert('管理会话', sessionTitle(thread), [\r\n              { text: '取消', style: 'cancel' },\r\n              { text: '重命名', onPress: () => { setRenameError(''); setRenameTarget(thread); setRenameValue(sessionTitle(thread)); } },\r\n              { text: '删除', style: 'destructive', onPress: () => Alert.alert('删除会话', '删除后无法恢复本机会话记录；此会话正在运行的请求也会停止。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => onDelete(thread.threadId) }]) },\r\n            ])}"
}
```

## C0083 · mobile/src/agent/HistoryList.tsx:123

组件：`TextInput`。声明名称：`"输入会话名称"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setRenameValue}"
}
```

## C0084 · mobile/src/agent/HistoryList.tsx:132

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setRenameTarget(null)}"
}
```

## C0085 · mobile/src/agent/HistoryList.tsx:138

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{renaming}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{async () => {\r\n                    if (renameLock.current) return;\r\n                    if (!renameValue.trim()) { setRenameError('请输入会话名称'); return; }\r\n                    renameLock.current = true; setRenaming(true);\r\n                    try { if (renameTarget) await onRename(renameTarget.threadId, renameValue.trim()); setRenameTarget(null); }\r\n                    catch { setRenameError('重命名失败，请重试'); } finally { renameLock.current = false; setRenaming(false); }\r\n                  }}"
}
```

## C0086 · mobile/src/agent/PromptAssistantUi.tsx:305

组件：`HistoryList`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{(id) => {\r\n        onSelectThread(id);\r\n        setHistoryOpen(false);\r\n      }}"
}
```

## C0087 · mobile/src/agent/PromptAssistantUi.tsx:335

组件：`Pressable`。声明名称：`"打开对话历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-002, U08-002, U09-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { if (!wide || toolPanel) setHistoryOpen(true); }}"
}
```

## C0088 · mobile/src/agent/PromptAssistantUi.tsx:347

组件：`Pressable`。声明名称：`"新建对话"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-003, U08-003, U09-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onNewThread}"
}
```

## C0089 · mobile/src/agent/PromptAssistantUi.tsx:362

组件：`Pressable`。声明名称：`"关闭提示"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setDismissedNotice(notice)}"
}
```

## C0090 · mobile/src/agent/PromptAssistantUi.tsx:365

组件：`ConversationTimeline`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onSelectSuggestion": "{applySuggestion}"
}
```

## C0091 · mobile/src/agent/PromptAssistantUi.tsx:386

组件：`Composer`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onChangeText": "{handleDraftChange}",
  "onSubmit": "{handleSubmit}",
  "onSelectionChange": "{(event) =>\r\n                setInputSelection(event.nativeEvent.selection)\r\n              }"
}
```

## C0092 · mobile/src/agent/PromptAssistantUi.tsx:417

组件：`DraggableBottomSheet`。声明名称：`"对话历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setHistoryOpen(false)}"
}
```

## C0093 · mobile/src/agent/PromptAssistantUi.tsx:425

组件：`ImageMentionSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setMentionSheetOpen(false)}",
  "onSelect": "{handleSelectMention}"
}
```

## C0094 · mobile/src/agent/PromptAssistantUi.tsx:435

组件：`DraggableBottomSheet`。声明名称：`"Prompt 版本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setVersionsOpen(false)}"
}
```

## C0095 · mobile/src/agent/PromptAssistantUi.tsx:436

组件：`Pressable`。声明名称：`"重新加载工作流"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onReloadWorkflow}"
}
```

## C0096 · mobile/src/agent/PromptAssistantUi.tsx:437

组件：`PromptVersionPanel`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{id => onClientStateChange?.({ h3SelectedVersionId: id })}"
}
```

## C0097 · mobile/src/agent/PromptAssistantUi.tsx:442

组件：`DraggableBottomSheet`。声明名称：`"补充创作信息"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setBriefOpen(false)}"
}
```

## C0098 · mobile/src/agent/PromptAssistantUi.tsx:443

组件：`Pressable`。声明名称：`"加入创作草稿"`。

禁用表达式：`{!hasBrief}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => {\r\n            const labels = { subject: '主体与动作', camera: '镜头与运动', style: '风格与氛围', duration: '期望时长' };\r\n            const extra = (Object.keys(brief) as Array<keyof typeof brief>).filter(key => brief[key].trim()).map(key => `${labels[key]}：${brief[key].trim()}`).join('\\n');\r\n            if (!extra) return;\r\n            applySuggestion([draft.trim(), extra].filter(Boolean).join('\\n'));\r\n            setBrief({ subject: '', camera: '', style: '', duration: '' });\r\n            setBriefOpen(false);\r\n          }}"
}
```

## C0099 · mobile/src/agent/PromptAssistantUi.tsx:456

组件：`TextInput`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value => setBrief(current => ({ ...current, [key]: value }))}"
}
```

## C0100 · mobile/src/agent/PromptAssistantUi.tsx:537

组件：`Pressable`。声明名称：`"加载更早消息"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { setFollow(false); setVisibleCount(count => count + 50); }}"
}
```

## C0101 · mobile/src/agent/PromptAssistantUi.tsx:565

组件：`EmptyTimeline`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelectSuggestion": "{onSelectSuggestion}"
}
```

## C0102 · mobile/src/agent/PromptAssistantUi.tsx:590

组件：`Pressable`。声明名称：`"回到最新消息"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => {\r\n              setUnread(false); setFollow(nextFollowState(followingLatestRef.current, { type: 'back-to-latest' }));\r\n              listRef.current?.scrollToEnd({ animated: true });\r\n            }}"
}
```

## C0103 · mobile/src/agent/PromptAssistantUi.tsx:604

组件：`ReferenceImagePreview`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{() => setPreviewImage(null)}"
}
```

## C0104 · mobile/src/agent/PromptAssistantUi.tsx:622

组件：`Pressable`。声明名称：`{`查看参考图片 ${attachment.displayName ?? `图片${index + 1}`}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onPreview(attachment.uri)}"
}
```

## C0105 · mobile/src/agent/PromptAssistantUi.tsx:706

组件：`Pressable`。声明名称：`"关闭运行提示"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onDismiss}"
}
```

## C0106 · mobile/src/agent/PromptAssistantUi.tsx:708

组件：`Pressable`。声明名称：`{issue.kind === 'submit' ? '重新发送草稿' : '重试上一轮'}`。

禁用表达式：`{retrying || disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void handleRetry()}"
}
```

## C0107 · mobile/src/agent/PromptAssistantUi.tsx:746

组件：`Pressable`。声明名称：`{`使用建议 ${suggestion}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>onSelectSuggestion(suggestion)}"
}
```

## C0108 · mobile/src/agent/PromptAssistantUi.tsx:787

组件：`Pressable`。声明名称：`{`复制回答 ${text.slice(0, 20)}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void copy()}"
}
```

## C0109 · mobile/src/agent/PromptAssistantUi.tsx:832

组件：`Pressable`。声明名称：`{expanded ? '收起卡片 Prompt' : '展开卡片 Prompt'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setExpanded(value => !value)}"
}
```

## C0110 · mobile/src/agent/PromptAssistantUi.tsx:834

组件：`Pressable`。声明名称：`"复制 Prompt"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void copy()}"
}
```

## C0111 · mobile/src/agent/PromptAssistantUi.tsx:848

组件：`Pressable`。声明名称：`"导出 Prompt 到生成"`。

禁用表达式：`{!ready || exporting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void exportPrompt()}"
}
```

## C0112 · mobile/src/agent/PromptAssistantUi.tsx:878

组件：`DraggableBottomSheet`。声明名称：`"引用图片附件"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0113 · mobile/src/agent/PromptAssistantUi.tsx:885

组件：`Pressable`。声明名称：`{`引用图片附件 ${attachment.displayName || '图片'}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => onSelect(attachment)}"
}
```

## C0114 · mobile/src/agent/PromptAssistantUi.tsx:910

组件：`Pressable`。声明名称：`"上传图片附件"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onAdd}"
}
```

## C0115 · mobile/src/agent/PromptAssistantUi.tsx:944

组件：`Pressable`。声明名称：`{`查看附件 ${attachment.displayName || '图片'}`}`。

禁用表达式：`{attachment.status !== 'ready'}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() =>\r\n                attachment.status === 'ready'\r\n                  ? setPreview(attachment)\r\n                  : undefined\r\n              }"
}
```

## C0116 · mobile/src/agent/PromptAssistantUi.tsx:966

组件：`Pressable`。声明名称：`{`移除附件 ${attachment.displayName || '图片'}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => onRemoveAttachment?.(attachment.id)}"
}
```

## C0117 · mobile/src/agent/PromptAssistantUi.tsx:979

组件：`ReferenceImagePreview`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{() => setPreview(null)}"
}
```

## C0118 · mobile/src/agent/PromptAssistantUi.tsx:985

组件：`ImagePreview`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0119 · mobile/src/agent/PromptAssistantUi.tsx:1045

组件：`Pressable`。声明名称：`"收起编辑"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{closeEditor}"
}
```

## C0120 · mobile/src/agent/PromptAssistantUi.tsx:1049

组件：`Pressable`。声明名称：`"完成编辑"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{closeEditor}"
}
```

## C0121 · mobile/src/agent/PromptAssistantUi.tsx:1054

组件：`TextInput`。声明名称：`"全屏编辑创作想法"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChangeText": "{onChangeText}",
  "onSelectionChange": "{onSelectionChange}"
}
```

## C0122 · mobile/src/agent/PromptAssistantUi.tsx:1070

组件：`Pressable`。声明名称：`"添加图片附件"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-010, U08-010, U09-010。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void onOpenPicker()}"
}
```

## C0123 · mobile/src/agent/PromptAssistantUi.tsx:1072

组件：`ConversationInput`。声明名称：`"创作想法"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-011, U08-011, U09-011。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChangeText": "{onChangeText}",
  "onSelectionChange": "{onSelectionChange}"
}
```

## C0124 · mobile/src/agent/PromptAssistantUi.tsx:1074

组件：`Pressable`。声明名称：`"更多创作操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-012, U08-012, U09-012。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{Keyboard.dismiss();setToolsOpen(true);}}"
}
```

## C0125 · mobile/src/agent/PromptAssistantUi.tsx:1078

组件：`DraggableBottomSheet`。声明名称：`"创作操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setToolsOpen(false)}"
}
```

## C0126 · mobile/src/agent/PromptAssistantUi.tsx:1085

组件：`Pressable`。声明名称：`{item.label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setToolsOpen(false);item.action?.();}}"
}
```

## C0127 · mobile/src/agent/PromptAssistantUi.tsx:1121

组件：`Text`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onPreview?.(match.attachment.uri)}"
}
```

## C0128 · mobile/src/agent/PromptVersionPanel.tsx:36

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0129 · mobile/src/agent/PromptVersionPanel.tsx:140

组件：`Action`。声明名称：`"加载更早版本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { setVisibleCount(count => count + 50); versionScroll.current?.scrollTo({ x: 0, animated: true }); }}"
}
```

## C0130 · mobile/src/agent/PromptVersionPanel.tsx:141

组件：`Pressable`。声明名称：`{`选择版本 ${visibleStart + index + 1}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => { setRestoreStatus(''); onSelect(version.id); }}"
}
```

## C0131 · mobile/src/agent/PromptVersionPanel.tsx:146

组件：`Action`。声明名称：`{expanded ? '收起 Prompt' : '展开 Prompt'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { if (!expanded) onExpand?.(); setExpanded(!expanded); }}"
}
```

## C0132 · mobile/src/agent/PromptVersionPanel.tsx:146

组件：`Action`。声明名称：`{compare ? '关闭版本比较' : '比较上一版本'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { if (!compare) onExpand?.(); setCompare(!compare); }}"
}
```

## C0133 · mobile/src/agent/PromptVersionPanel.tsx:150

组件：`Action`。声明名称：`"复制版本 Prompt"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{copyPrompt}"
}
```

## C0134 · mobile/src/agent/PromptVersionPanel.tsx:150

组件：`Action`。声明名称：`"复制为最新版本"`。

禁用表达式：`{disabled || restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => {\r\n        if (disabled || restoreLock.current) return;\r\n        restoreLock.current = true; setRestoring(true);\r\n        try { onRestore(selected.id, createAgentId()); setRestoreStatus('已复制为最新版本'); }\r\n        catch { setRestoreStatus('复制版本失败，请重试'); }\r\n        restoreTimer.current = setTimeout(() => { restoreLock.current = false; setRestoring(false); }, 1000);\r\n      }}"
}
```

## C0135 · mobile/src/agent/PromptVersionPanel.tsx:157

组件：`Action`。声明名称：`"从版本列表移除"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => Alert.alert('移除此版本？', '此版本将从列表隐藏。原始对话和已经带入生成页的草稿保留。', [{ text: '取消', style: 'cancel' }, { text: '移除', style: 'destructive', onPress: () => onDelete(selected.id) }])}"
}
```

## C0136 · mobile/src/agent/PromptVersionPanel.tsx:158

组件：`Action`。声明名称：`"预览并带入创建页"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{openPreview}"
}
```

## C0137 · mobile/src/agent/PromptVersionPanel.tsx:167

组件：`WorkflowSelector`。声明名称：`(动态/子文本)`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{selectTarget}"
}
```

## C0138 · mobile/src/agent/PromptVersionPanel.tsx:173

组件：`Pressable`。声明名称：`{`绑定图片 ${image.displayName}`}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setIncluded((ids) => ids.includes(image.id) ? ids.filter((id) => id !== image.id) : [...ids, image.id])}"
}
```

## C0139 · mobile/src/agent/PromptVersionPanel.tsx:178

组件：`WorkflowParameterFields`。声明名称：`(动态/子文本)`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{(target, value) => {\r\n              if (target === 'resolution') setResolution(String(value));\r\n              if (target === 'duration') setDuration(String(value));\r\n              if (target === 'seed') setSeed(String(value));\r\n            }}"
}
```

## C0140 · mobile/src/agent/PromptVersionPanel.tsx:186

组件：`Action`。声明名称：`"取消"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U21-001, U44-003, U58-001, U59-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setPreview(null)}"
}
```

## C0141 · mobile/src/agent/PromptVersionPanel.tsx:186

组件：`Action`。声明名称：`"带入创建页"`。

禁用表达式：`{cannotExport}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{exportPreview}"
}
```

## C0142 · mobile/src/agent/skills/SkillExtractionScreen.tsx:77

组件：`ListAction`。声明名称：`"返回"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-001, U12-001, U13-001, U14-001, U15-001, U17-001, U19-001, U20-001, U22-001, U41-001, U57-001, U60-001, U61-001, U62-001, U65-001, U66-001, U68-001, U69-001, U70-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0143 · mobile/src/agent/skills/SkillExtractionScreen.tsx:82

组件：`ListAction`。声明名称：`{`选择对话：${session.customTitle || session.summary?.title || '未命名对话'}`}`。

禁用表达式：`{locked}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(() => loadMessages(session.threadId))}"
}
```

## C0144 · mobile/src/agent/skills/SkillExtractionScreen.tsx:83

组件：`ListAction`。声明名称：`"较新的对话"`。

禁用表达式：`{locked}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(async () => { const page = sessionPage - 1; setSessions(await threads.listSummaries({ limit: 20, offset: page * 20 })); setSessionPage(page); })}"
}
```

## C0145 · mobile/src/agent/skills/SkillExtractionScreen.tsx:84

组件：`ListAction`。声明名称：`"更多对话"`。

禁用表达式：`{locked}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U68-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(async () => { const page = sessionPage + 1; const rows = await threads.listSummaries({ limit: 20, offset: page * 20 }); if (rows.length) { setSessions(rows); setSessionPage(page); } else setNotice('没有更多对话'); })}"
}
```

## C0146 · mobile/src/agent/skills/SkillExtractionScreen.tsx:87

组件：`ListAction`。声明名称：`{`${chosen ? '取消选择' : '选择'}证据 ${message.id.slice(-8)}`}`。

禁用表达式：`{locked}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => {\n        if (!chosen && Object.keys(selected).length >= 12) { setNotice('每次最多选择 12 段证据'); return; }\n        setSelected(current => { const next = { ...current }; if (chosen) delete next[key]; else next[key] = message; return next; });\n      }}"
}
```

## C0147 · mobile/src/agent/skills/SkillExtractionScreen.tsx:92

组件：`ListAction`。声明名称：`"更早消息"`。

禁用表达式：`{locked}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(() => loadMessages(source, before))}"
}
```

## C0148 · mobile/src/agent/skills/SkillExtractionScreen.tsx:93

组件：`ListAction`。声明名称：`{`整理已选证据（${Object.keys(selected).length} 段）`}`。

禁用表达式：`{locked || !Object.keys(selected).length}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => {\n      const text = Object.values(selected).map((item, index) => `证据 ${index + 1}（${item.role}）\\n${item.text}`).join('\\n\\n');\n      if (text.length > EVIDENCE_LIMIT) { setNotice('所选证据超过 24000 字，请减少选择'); return; }\n      setEvidence(text); setReviewed(undefined);\n    }}"
}
```

## C0149 · mobile/src/agent/skills/SkillExtractionScreen.tsx:100

组件：`TextInput`。声明名称：`"提炼目标"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U68-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value => { setGoal(value); setReviewed(undefined); }}"
}
```

## C0150 · mobile/src/agent/skills/SkillExtractionScreen.tsx:101

组件：`TextInput`。声明名称：`"待发送的证据"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U68-006。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value => { setEvidence(value); setReviewed(undefined); }}"
}
```

## C0151 · mobile/src/agent/skills/SkillExtractionScreen.tsx:102

组件：`ListAction`。声明名称：`"重新脱敏并检查"`。

禁用表达式：`{locked}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U68-007。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { setGoal(redactSkillEvidence(goal)); setEvidence(redactSkillEvidence(evidence)); setContent(redactSkillEvidence(content)); setReviewed(undefined); }}"
}
```

## C0152 · mobile/src/agent/skills/SkillExtractionScreen.tsx:103

组件：`ListAction`。声明名称：`"确认发送证据并生成草稿"`。

禁用表达式：`{locked || !evidence.trim() || !goal.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U68-008。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{() => void generate()}"
}
```

## C0153 · mobile/src/agent/skills/SkillExtractionScreen.tsx:104

组件：`ListAction`。声明名称：`"取消提炼"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => request.current?.abort()}"
}
```

## C0154 · mobile/src/agent/skills/SkillExtractionScreen.tsx:106

组件：`TextInput`。声明名称：`"技能草稿正文"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value => { setContent(value); setReviewed(undefined); }}"
}
```

## C0155 · mobile/src/agent/skills/SkillExtractionScreen.tsx:107

组件：`ListAction`。声明名称：`"保存草稿"`。

禁用表达式：`{locked || !evidence.trim() || !goal.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(async () => { await save(); setNotice('草稿已保存，可稍后继续审阅。'); })}"
}
```

## C0156 · mobile/src/agent/skills/SkillExtractionScreen.tsx:108

组件：`ListAction`。声明名称：`"检查待发布版本"`。

禁用表达式：`{locked || !content.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(async () => { validateSkillPackage({ 'SKILL.md': content }); setReviewed(await save()); })}"
}
```

## C0157 · mobile/src/agent/skills/SkillExtractionScreen.tsx:109

组件：`ListAction`。声明名称：`"确认审阅并发布此版本"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void work(async () => { await store.publish(reviewed); const saved = (await store.list()).find(item => item.id === reviewed.id); if (saved) showDraft(saved); setNotice('已发布到本地技能库，尚未启用。请在技能库中独立启用。'); })}"
}
```

## C0158 · mobile/src/agent/skills/SkillExtractionScreen.tsx:111

组件：`ListAction`。声明名称：`"打开技能库并选择启用"`。

禁用表达式：`{busy || dirty}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.push('/agent-skills')}"
}
```

## C0159 · mobile/src/agent/skills/SkillExtractionScreen.tsx:113

组件：`ListAction`。声明名称：`"新建提炼草稿"`。

禁用表达式：`{busy || dirty}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => showDraft()}"
}
```

## C0160 · mobile/src/agent/skills/SkillExtractionScreen.tsx:114

组件：`ListAction`。声明名称：`{`${item.publishedVersion ? '查看已发布' : '继续审阅'}：${item.goal}`}`。

禁用表达式：`{busy || dirty}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => showDraft(item)}"
}
```

## C0161 · mobile/src/agent/skills/SkillExtractionScreen.tsx:115

组件：`ListAction`。声明名称：`"删除此提炼草稿"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => Alert.alert('删除提炼草稿？', '删除保存的证据和草稿，不会删除原对话或已发布的技能版本。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: () => void work(async () => { await store.remove(draft); showDraft(); }) }])}"
}
```

## C0162 · mobile/src/agent/skills/SkillLibraryScreen.tsx:54

组件：`IconAction`。声明名称：`{onClose ? '关闭技能' : '返回'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0163 · mobile/src/agent/skills/SkillLibraryScreen.tsx:56

组件：`IconAction`。声明名称：`"添加技能"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U08-015, U09-015, U70-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setImportOpen(!importOpen)}"
}
```

## C0164 · mobile/src/agent/skills/SkillLibraryScreen.tsx:57

组件：`IconAction`。声明名称：`"技能运行记录"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U08-016, U09-016, U70-003。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setHistoryOpen(!historyOpen)}"
}
```

## C0165 · mobile/src/agent/skills/SkillLibraryScreen.tsx:63

组件：`ListAction`。声明名称：`"导入 SKILL.md 或 ZIP"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U09-017。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void run(pick)}"
}
```

## C0166 · mobile/src/agent/skills/SkillLibraryScreen.tsx:64

组件：`ListAction`。声明名称：`"从对话提炼技能"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U09-018。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push('/agent-skill-extract')}"
}
```

## C0167 · mobile/src/agent/skills/SkillLibraryScreen.tsx:66

组件：`TextInput`。声明名称：`"技能文本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U09-019。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setText}"
}
```

## C0168 · mobile/src/agent/skills/SkillLibraryScreen.tsx:68

组件：`ListAction`。声明名称：`"检查粘贴的技能"`。

禁用表达式：`{busy || !text.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U09-020。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void run(async()=>{setPreview(validateSkillPackage({'SKILL.md':text}));})}"
}
```

## C0169 · mobile/src/agent/skills/SkillLibraryScreen.tsx:69

组件：`ListAction`。声明名称：`"填入技能示例"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U09-021。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setText(template)}"
}
```

## C0170 · mobile/src/agent/skills/SkillLibraryScreen.tsx:76

组件：`ListAction`。声明名称：`"安装此版本"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void run(async()=>{await store.install(preview);setPreview(undefined);setImportOpen(false);setText('');setNotice('已安装，打开开关后在新对话运行中生效。');})}"
}
```

## C0171 · mobile/src/agent/skills/SkillLibraryScreen.tsx:77

组件：`ListAction`。声明名称：`"关闭预览"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setPreview(undefined)}"
}
```

## C0172 · mobile/src/agent/skills/SkillLibraryScreen.tsx:80

组件：`TextInput`。声明名称：`"搜索技能"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U08-017, U09-022, U70-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setQuery}"
}
```

## C0173 · mobile/src/agent/skills/SkillLibraryScreen.tsx:85

组件：`Pressable`。声明名称：`{`查看 ${version.name} ${version.id.slice(0,8)}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(expanded===version.id?undefined:version.id)}"
}
```

## C0174 · mobile/src/agent/skills/SkillLibraryScreen.tsx:89

组件：`Switch`。声明名称：`{`启用 ${version.name} ${version.id.slice(0,8)}`}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onValueChange": "{enabled=>void run(async()=>{if(enabled) await store.enable(version.id);else await store.revoke(version.id);setNotice(enabled?'已启用，将用于新运行。':'已停用，相关运行已请求停止。');})}"
}
```

## C0175 · mobile/src/conversation/ActivityGroup.tsx:21

组件：`Pressable`。声明名称：`{`查看运行 ${run.id}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { if (!expanded) onInspect?.(); setExpanded(!expanded); }}"
}
```

## C0176 · mobile/src/conversation/ActivityGroup.tsx:33

组件：`Pressable`。声明名称：`{`重试运行 ${run.id}`}`。

禁用表达式：`{disabled || busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{async () => {\r\n      if (busy || disabled) return;\r\n      setBusy(true); setError('');\r\n      try { await onRetry(run.id); } catch (reason) { setError(reason instanceof Error ? reason.message : '重试失败'); } finally { setBusy(false); }\r\n    }}"
}
```

## C0177 · mobile/src/conversation/ActivityGroup.tsx:83

组件：`Pressable`。声明名称：`{`${title}${target ? `，${target}` : ''}${status ? `，${status}` : ''}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { if (!expanded) onInspect?.(); setExpanded(!expanded); }}"
}
```

## C0178 · mobile/src/conversation/ActivityGroup.tsx:117

组件：`Pressable`。声明名称：`"上一段"`。

禁用表达式：`{current === 0}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { onInspect?.(); setPage(current - 1); }}"
}
```

## C0179 · mobile/src/conversation/ActivityGroup.tsx:119

组件：`Pressable`。声明名称：`"下一段"`。

禁用表达式：`{current === pages - 1}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { onInspect?.(); setPage(current + 1); }}"
}
```

## C0180 · mobile/src/conversation/ConversationInput.tsx:16

组件：`Pressable`。声明名称：`{running?'停止本轮':busy?'发送中':'发送消息'}`。

禁用表达式：`{!running&&disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{running?onStop:onSend}"
}
```

## C0181 · mobile/src/create/AttachmentPreview.tsx:12

组件：`Pressable`。声明名称：`{status.playing ? '暂停音频' : '播放音频'}`。

禁用表达式：`{!status.isLoaded}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => status.playing ? player.pause() : player.play()}"
}
```

## C0182 · mobile/src/create/AttachmentPreview.tsx:12

组件：`Pressable`。声明名称：`"删除音频"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{onRemove}"
}
```

## C0183 · mobile/src/create/AttachmentPreview.tsx:18

组件：`Pressable`。声明名称：`{`预览参考图 ${index + 1}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setPreview(item.uri ?? item.dataUri ?? null)}"
}
```

## C0184 · mobile/src/create/AttachmentPreview.tsx:18

组件：`Pressable`。声明名称：`{`删除参考图 ${index + 1}`}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => onRemove(index)}"
}
```

## C0185 · mobile/src/create/AttachmentPreview.tsx:18

组件：`ImagePreview`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{() => setPreview(null)}"
}
```

## C0186 · mobile/src/create/CreateForm.tsx:394

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{submitting || switching}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { if (action !== '取消') { const field = definition ? inputField(definition, 'prompt') : 'prompt'; setWorkflowValues(current => ({ ...current, [field]: action === '追加' ? [String(current[field] ?? ''), incomingPrompt].filter(Boolean).join('\\n') : incomingPrompt })); editRevision.current++; } setIncomingPrompt(''); }}"
}
```

## C0187 · mobile/src/create/CreateForm.tsx:395

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.navigate({pathname:'/settings-panel',params:{section:'workflows'}})}"
}
```

## C0188 · mobile/src/create/CreateForm.tsx:400

组件：`Pressable`。声明名称：`"重试加载工作流"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setCatalogRevision(value => value + 1)}"
}
```

## C0189 · mobile/src/create/CreateForm.tsx:402

组件：`Pressable`。声明名称：`"前往设置配置生成"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.navigate({pathname:'/settings-panel',params:{section:'accounts'}})}"
}
```

## C0190 · mobile/src/create/CreateForm.tsx:403

组件：`WorkflowSelector`。声明名称：`(动态/子文本)`。

禁用表达式：`{submitting || switching || picking || loadingDraft || awaitingDraft || Boolean(appliedDraft && acknowledgedDraft !== appliedDraft)}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{id => void selectWorkflow(id)}"
}
```

## C0191 · mobile/src/create/CreateForm.tsx:409

组件：`Pressable`。声明名称：`"重新应用交接草稿"`。

禁用表达式：`{!definition || loadingDraft}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => {\r\n          draftStart.current = { id: draftId, revision: editRevision.current };\r\n          appliedIds.current.delete(draftId); consumedIds.current.delete(draftId);\r\n          setAppliedDraft(null); setAcknowledgedDraft(null); setApplyAttempt(value => value + 1);\r\n        }}"
}
```

## C0192 · mobile/src/create/CreateForm.tsx:414

组件：`Pressable`。声明名称：`"丢弃交接草稿"`。

禁用表达式：`{loadingDraft}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => Alert.alert('丢弃交接草稿？', '草稿丢弃后无法恢复。', [{ text: '保留', style: 'cancel' }, { text: '丢弃草稿', style: 'destructive', onPress: async () => {\r\n          try { await draftDependencies.discard!(draftId); setDiscardedDraft(draftId); setHandoffError(null); setAppliedDraft(null); setAcknowledgedDraft(null); }\r\n          catch (error) { setHandoffError(error instanceof Error ? error.message : '丢弃失败，请重试'); }\r\n        } }])}"
}
```

## C0193 · mobile/src/create/CreateForm.tsx:419

组件：`WorkflowForm`。声明名称：`(动态/子文本)`。

禁用表达式：`{submitting || switching}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onChange": "{(next) => {\r\n          if (submitting || switching) return;\r\n          editRevision.current += 1;\r\n          setFieldErrors((current) => current.filter((error) => !error.field || Object.is(next[error.field], workflowValues[error.field])));\r\n          setWorkflowValues(next);\r\n          setPrompt(String(next.prompt ?? ''));\r\n          setResolution(String(next.resolution ?? RESOLUTION_OPTIONS[0]));\r\n          setDuration(String(next.duration ?? 5));\r\n          setSeed(String(next.seed ?? ''));\r\n        }}"
}
```

## C0194 · mobile/src/create/CreateForm.tsx:450

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{images.length >= imageRules.maximum || picking || switching || submitting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{addImage}"
}
```

## C0195 · mobile/src/create/CreateForm.tsx:462

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{audios.length >= audioRules.maximum || picking || switching || submitting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void addMedia('audio')}"
}
```

## C0196 · mobile/src/create/CreateForm.tsx:499

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{submitting || switching}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { setImages(undoMedia.images); setAudios(undoMedia.audios); setUndoMedia(undefined); editRevision.current++; }}"
}
```

## C0197 · mobile/src/create/CreateForm.tsx:509

组件：`Pressable`。声明名称：`"提交 AutoDL 任务生成"`。

禁用表达式：`{submitDisabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{() => void submit()}"
}
```

## C0198 · mobile/src/creative/AgentCreativeCards.tsx:73

组件：`Pressable`。声明名称：`{`${runId?'本轮成果':'本会话创作'}，${summary}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setOpen(true)}"
}
```

## C0199 · mobile/src/creative/AgentCreativeCards.tsx:77

组件：`ParameterSheet`。声明名称：`{runId?'本轮的创作':'本会话的创作'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setOpen(false)}"
}
```

## C0200 · mobile/src/creative/AgentCreativeCards.tsx:84

组件：`Pressable`。声明名称：`{`查看生成成果 ${output.versionNo}`}`。

禁用表达式：`{output.state!=='AVAILABLE' || !output.relativePath}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{\n            if(output.mime?.startsWith('image/'))setPreview(`${FileSystem.documentDirectory}${output.relativePath}`);\n            else {setOpen(false);router.push({pathname:'/creative-output/[id]',params:{id:output.id,assetId:output.assetId,jobId:card.jobId??card.draft!.job_id??'',draftId:card.draft!.id}});}\n          }}"
}
```

## C0201 · mobile/src/creative/AgentCreativeCards.tsx:88

组件：`ListAction`。声明名称：`{card.draft.state==='EDITING'?'编辑这份草稿':'查看成果与进度'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);router.push({pathname:card.draft!.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:card.draft!.id}});}}"
}
```

## C0202 · mobile/src/creative/AgentCreativeCards.tsx:89

组件：`ListAction`。声明名称：`"查看生成任务详情"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);router.push({pathname:'/creative-task/[id]',params:{id:card.jobId!}});}}"
}
```

## C0203 · mobile/src/creative/AgentCreativeCards.tsx:90

组件：`ListAction`。声明名称：`{allowance[card.draft.provider_id]?`本项目可用授权 ${allowance[card.draft.provider_id]} 次`:'授权本项目 1 次生成'}`。

禁用表达式：`{busy||running||Boolean(allowance[card.draft.provider_id])}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void grant(card.draft!)}"
}
```

## C0204 · mobile/src/creative/AgentCreativeCards.tsx:91

组件：`ListAction`。声明名称：`"查看并处理"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);router.push({pathname:'/creative-project/[id]',params:{id:card.projectId!,tab:card.kind==='proposal'?'activity':'plans',...(card.kind==='proposal'?{proposalId:card.id}:{planId:card.id}),requestId:String(Date.now())}});}}"
}
```

## C0205 · mobile/src/creative/AgentCreativeCards.tsx:96

组件：`ImagePreview`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setPreview(undefined)}"
}
```

## C0206 · mobile/src/creative/AgentCreativePanel.tsx:41

组件：`Pressable`。声明名称：`"切换创作项目"`。

禁用表达式：`{running || busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-001, U08-001, U09-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(true)}"
}
```

## C0207 · mobile/src/creative/AgentCreativePanel.tsx:41

组件：`TextAction`。声明名称：`"项目"`。

禁用表达式：`{running || busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-023, U04-018, U05-035, U06-016, U08-020, U09-025, U10-008, U16-012, U23-014, U32-013, U42-013, U43-009, U48-025, U49-015, U50-009, U53-013, U54-013, U63-026, U64-023。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setExpanded(true)}"
}
```

## C0208 · mobile/src/creative/AgentCreativePanel.tsx:45

组件：`ListAction`。声明名称：`"关闭"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setExpanded(false)}"
}
```

## C0209 · mobile/src/creative/AgentCreativePanel.tsx:46

组件：`TextInput`。声明名称：`"搜索创作项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setQuery}"
}
```

## C0210 · mobile/src/creative/AgentCreativePanel.tsx:47

组件：`RecordRow`。声明名称：`{p.title}`。

禁用表达式：`{running || busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => void choose(p.id)}"
}
```

## C0211 · mobile/src/creative/AgentCreativePanel.tsx:48

组件：`ListAction`。声明名称：`"管理项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => {const proceed=()=>{setExpanded(false);router.navigate('/(tabs)/projects');};if(beforeNavigate)beforeNavigate(proceed);else proceed();}}"
}
```

## C0212 · mobile/src/creative/AgentCreativePanel.tsx:50

组件：`ListAction`。声明名称：`"撤销当前项目全部生成授权"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => {\r\n        if (lock.current) return; lock.current = true; setBusy(true);\r\n        void creativeBudget().list().then(async rows => { for (const row of rows) if (row.project_id === selected && row.revoked_at == null) await creativeBudget().revoke(row.id); setNotice('当前项目授权已撤销'); }).catch(() => setNotice('撤销失败')).finally(() => { lock.current = false; setBusy(false); });\r\n      }}"
}
```

## C0213 · mobile/src/creative/AgentWorkspace.tsx:16

组件：`ListAction`。声明名称：`"重试"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setRetry(n=>n+1)}"
}
```

## C0214 · mobile/src/creative/AgentWorkspace.tsx:18

组件：`ListAction`。声明名称：`"前往项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.navigate('/(tabs)/projects')}"
}
```

## C0215 · mobile/src/creative/AssetTile.tsx:12

组件：`Pressable`。声明名称：`{`打开资产 ${asset.title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0216 · mobile/src/creative/AssistantActions.tsx:8

组件：`IconAction`。声明名称：`"助手菜单"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-005, U08-005, U09-005。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{Keyboard.dismiss();setOpen(true);}}"
}
```

## C0217 · mobile/src/creative/AssistantActions.tsx:8

组件：`ParameterSheet`。声明名称：`"助手菜单"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U06-005, U08-005, U09-005。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setOpen(false)}"
}
```

## C0218 · mobile/src/creative/AssistantActions.tsx:8

组件：`SettingRow`。声明名称：`"技能管理"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);if(onOpenSkills)onOpenSkills();else router.push('/agent-skills');}}"
}
```

## C0219 · mobile/src/creative/AssistantActions.tsx:8

组件：`SettingRow`。声明名称：`"助手设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U07-004。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);router.push({pathname:'/settings-panel',params:{section:'assistant'}});}}"
}
```

## C0220 · mobile/src/creative/AudioVersionPreview.tsx:17

组件：`ListAction`。声明名称：`{status.playing?'暂停试听':'播放音频'}`。

禁用表达式：`{!status.isLoaded}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{void(async()=>{\n      setError('');if(status.playing){player.pause();return;}\n      if(status.didJustFinish||(status.duration>0&&status.currentTime>=status.duration))await player.seekTo(0);\n      player.play();\n    })().catch(()=>setError('无法播放，请保存原件后使用其他播放器打开。'));}}"
}
```

## C0221 · mobile/src/creative/AutodlWalletPanel.tsx:29

组件：`TextAction`。声明名称：`{summary?(expanded?'收起余额':'余额详情'):(expanded?'收起余额配置':configured?'管理余额查询':'配置余额查询')}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(!expanded)}"
}
```

## C0222 · mobile/src/creative/AutodlWalletPanel.tsx:32

组件：`TextAction`。声明名称：`"刷新余额"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void read()}"
}
```

## C0223 · mobile/src/creative/AutodlWalletPanel.tsx:36

组件：`TextInput`。声明名称：`"AutoDL 余额查询开发者 Token"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setToken}"
}
```

## C0224 · mobile/src/creative/AutodlWalletPanel.tsx:37

组件：`Switch`。声明名称：`"确认余额与生成凭据属于同一账号"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onValueChange": "{setConfirmed}"
}
```

## C0225 · mobile/src/creative/AutodlWalletPanel.tsx:38

组件：`TextAction`。声明名称：`"验证并保存余额查询"`。

禁用表达式：`{busy||!generation||!confirmed||!token.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void save()}"
}
```

## C0226 · mobile/src/creative/AutodlWalletPanel.tsx:39

组件：`TextAction`。声明名称：`"获取开发者 Token"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void Linking.openURL('https://www.autodl.com/console/center/settings/token').catch(()=>setError('无法打开浏览器'))}"
}
```

## C0227 · mobile/src/creative/AutodlWalletPanel.tsx:40

组件：`TextAction`。声明名称：`"移除余额查询凭据"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{()=>{void clearWalletCredential().then(()=>{epoch.current++;setConfigured(false);setBalance(undefined);}).catch(()=>setError('移除失败，请重试'));}}"
}
```

## C0228 · mobile/src/creative/CopySubmittedDraft.tsx:10

组件：`TextAction`。声明名称：`"复制为新草稿（不立即生成）"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>Alert.alert('准备新的生成草稿','旧任务可能已经消费。新草稿保留参数与输入版本；种子留空时将重新随机。后续生成必须重新授权，可能重复消费。',[{text:'取消',style:'cancel'},{text:'复制草稿',onPress:()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');void creativeService().execute({name:'draft.copySubmitted',payload:{id}},createId()).then(r=>{if(r.status==='completed')router.push({pathname:r.value.provider==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:r.value.draftId}});}).catch(e=>setError(e.message)).finally(()=>{lock.current=false;setBusy(false);});}}])}"
}
```

## C0229 · mobile/src/creative/CreativeAccountPanel.tsx:30

组件：`TextAction`。声明名称：`{connected ? '管理账号' : `连接 ${name}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setExpanded(true)}"
}
```

## C0230 · mobile/src/creative/CreativeAccountPanel.tsx:36

组件：`ListAction`。声明名称：`"收起账号设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setExpanded(false)}"
}
```

## C0231 · mobile/src/creative/CreativeAccountPanel.tsx:39

组件：`TextInput`。声明名称：`{`${name} 令牌`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setToken}"
}
```

## C0232 · mobile/src/creative/CreativeAccountPanel.tsx:40

组件：`ListAction`。声明名称：`{provider === 'autodl' ? '绑定 AutoDL 凭据' : connected ? '验证并更换令牌' : '验证并连接 NovelAI'}`。

禁用表达式：`{busy || !token.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void connect()}"
}
```

## C0233 · mobile/src/creative/CreativeAccountPanel.tsx:41

组件：`ListAction`。声明名称：`{`断开 ${name} 并撤销授权`}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => Alert.alert(`断开 ${name}`, '这将撤销生成授权并移除保存的令牌。已发送的请求无法取消，后续查询也可能需要重新连接原账号。', [{ text: '取消', style: 'cancel' }, { text: '断开', style: 'destructive', onPress: () => {\r\n      if (lock.current) return; lock.current = true; setBusy(true);\r\n      void creativeAccounts().disconnect(provider).then(refresh).then(() => setNotice('已断开连接并撤销授权')).catch(() => setNotice('未能完成断开，请重试')).finally(() => { lock.current = false; setBusy(false); });\r\n    } }])}"
}
```

## C0234 · mobile/src/creative/CreativeAccountPanel.tsx:46

组件：`ListAction`。声明名称：`"打开 AutoDL Token 获取页面"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void Linking.openURL('https://autodl.art/large-model/tokens').catch(()=>setNotice('请在浏览器访问 autodl.art 获取 Token'))}"
}
```

## C0235 · mobile/src/creative/CreativeAssetPicker.tsx:54

组件：`TextAction`。声明名称：`"取消"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U21-001, U44-003, U58-001, U59-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0236 · mobile/src/creative/CreativeAssetPicker.tsx:56

组件：`TextInput`。声明名称：`"搜索素材"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U21-002, U58-002, U59-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setQuery}"
}
```

## C0237 · mobile/src/creative/CreativeAssetPicker.tsx:57

组件：`TextAction`。声明名称：`{all ? '仅看本项目' : '从全部素材选择'}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setAll(!all)}"
}
```

## C0238 · mobile/src/creative/CreativeAssetPicker.tsx:59

组件：`TextAction`。声明名称：`"重新读取素材"`。

禁用表达式：`{busy||waiting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setRetry(n=>n+1)}"
}
```

## C0239 · mobile/src/creative/CreativeAssetPicker.tsx:62

组件：`Pressable`。声明名称：`{`选择 ${title} · 版本 ${version.versionNo}`}`。

禁用表达式：`{busy || waiting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setSelected(version.id)}"
}
```

## C0240 · mobile/src/creative/CreativeAssetPicker.tsx:67

组件：`TextAction`。声明名称：`"加载更多素材"`。

禁用表达式：`{busy || waiting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setCursor(next)}"
}
```

## C0241 · mobile/src/creative/CreativeAssetPicker.tsx:68

组件：`ListAction`。声明名称：`{busy ? '正在添加…' : intent || (kind === 'image' ? '使用所选图片' : kind==='audio'?'使用所选音频':'使用所选视频')}`。

禁用表达式：`{busy || waiting || !chosen}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{confirm}"
}
```

## C0242 · mobile/src/creative/CreativeHome.tsx:29

组件：`RecordRow`。声明名称：`{name}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0243 · mobile/src/creative/CreativeHome.tsx:91

组件：`SegmentedChoices`。声明名称：`"创作类型"`。

禁用表达式：`{!ready || busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChange": "{chooseMode}"
}
```

## C0244 · mobile/src/creative/CreativeHome.tsx:91

组件：`IconAction`。声明名称：`"新建创作"`。

禁用表达式：`{busy || !ready}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-003, U04-003, U05-003, U48-003, U63-003, U64-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void change(async()=>{const row=await createDraft(mode);setActive(old=>({...old,[mode]:row}));})}"
}
```

## C0245 · mobile/src/creative/CreativeHome.tsx:91

组件：`IconAction`。声明名称：`"创作记录"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-004, U04-004, U05-004, U48-004, U63-004, U64-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setRecords(true);void creativeService().creationRecords().then(setRecordGroups).catch(()=>setError('创作记录读取失败'));}}"
}
```

## C0246 · mobile/src/creative/CreativeHome.tsx:91

组件：`IconAction`。声明名称：`"打开设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-006, U04-006, U05-006, U32-003, U42-003, U48-006, U63-006, U64-006。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void change(async()=>{router.push('/settings-panel');})}"
}
```

## C0247 · mobile/src/creative/CreativeHome.tsx:93

组件：`TextAction`。声明名称：`"重试打开创作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setRequestAttempt(n=>n+1)}"
}
```

## C0248 · mobile/src/creative/CreativeHome.tsx:93

组件：`TextAction`。声明名称：`"保留原画布"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setError('');onRequestConsumed?.();}}"
}
```

## C0249 · mobile/src/creative/CreativeHome.tsx:94

组件：`TextAction`。声明名称：`"重试恢复工作区"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setReady(false);void readCreativeIdea().then(value=>{setIdea(value);setError('');setReady(true);}).catch(()=>setError('工作区恢复失败'));}}"
}
```

## C0250 · mobile/src/creative/CreativeHome.tsx:96

组件：`ParameterSheet`。声明名称：`"创作记录"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-004, U04-004, U05-004, U48-004, U63-004, U64-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setRecords(false)}"
}
```

## C0251 · mobile/src/creative/CreativeHome.tsx:97

组件：`TextInput`。声明名称：`"搜索创作记录"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U43-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value=>{setRecordQuery(value);setRecordLimit(30);}}"
}
```

## C0252 · mobile/src/creative/CreativeHome.tsx:98

组件：`ListFilters`。声明名称：`"创作记录类型"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{setRecordMode(value);setRecordLimit(30);}}"
}
```

## C0253 · mobile/src/creative/CreativeHome.tsx:99

组件：`RecentCreation`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void change(async()=>{const selectedMode=group.draft.provider_id==='novelai'?'image':'video';const rows=await refresh();const selected=group.draft.target_asset_id?groupWorkbenchDrafts(rows,selectedMode).find(g=>g.draft.target_asset_id===group.draft.target_asset_id && g.draft.project_id===group.draft.project_id && g.draft.shot_id===group.draft.shot_id)?.draft:rows.find(d=>d.id===group.draft.id);const next:CreativeIdea={...idea,mode:selectedMode};await writeCreativeIdea(next);setIdea(next);setActive(old=>({...old,[selectedMode]:selected??group.draft}));setRecords(false);})}"
}
```

## C0254 · mobile/src/creative/CreativeHome.tsx:101

组件：`TextAction`。声明名称：`{`加载更多 · 还有 ${groups.length-recordLimit} 组`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setRecordLimit(count=>count+30)}"
}
```

## C0255 · mobile/src/creative/CreativeHome.tsx:103

组件：`TextAction`。声明名称：`"项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-023, U04-018, U05-035, U06-016, U08-020, U09-025, U10-008, U16-012, U23-014, U32-013, U42-013, U43-009, U48-025, U49-015, U50-009, U53-013, U54-013, U63-026, U64-023。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void change(async()=>{setRecords(false);router.push('/(tabs)/projects');})}"
}
```

## C0256 · mobile/src/creative/CreativeHome.tsx:104

组件：`TextAction`。声明名称：`"素材库"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U43-010。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void change(async()=>{setRecords(false);router.push('/(tabs)/assets');})}"
}
```

## C0257 · mobile/src/creative/CreativeHome.tsx:105

组件：`TextAction`。声明名称：`"管理工作流"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U43-011。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void change(async()=>{setRecords(false);router.push({pathname:\"/settings-panel\",params:{section:\"workflows\"}});})}"
}
```

## C0258 · mobile/src/creative/CreativeOutputPreview.tsx:40

组件：`IconAction`。声明名称：`"返回"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-001, U12-001, U13-001, U14-001, U15-001, U17-001, U19-001, U20-001, U22-001, U41-001, U57-001, U60-001, U61-001, U62-001, U65-001, U66-001, U68-001, U69-001, U70-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.canGoBack() ? router.back() : router.replace('/(tabs)/tasks')}"
}
```

## C0259 · mobile/src/creative/CreativeOutputPreview.tsx:49

组件：`TextAction`。声明名称：`"查看素材与版本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.push({ pathname: '/creative-asset/[id]', params: { id: version.assetId, versionId: version.id } })}"
}
```

## C0260 · mobile/src/creative/CreativeOutputPreview.tsx:50

组件：`TextAction`。声明名称：`"继续创作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.push({ pathname: current.draft!.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: current.draft!.id } })}"
}
```

## C0261 · mobile/src/creative/CreativeResults.tsx:176

组件：`TextAction`。声明名称：`"重试存入相册"`。

禁用表达式：`{busy || disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void work(async()=>{const generation=delivery.generation+1;await exportCreativeVersion(current.id,generation);setDelivery(undefined);setExporting({versionId:current.id,generation});})}"
}
```

## C0262 · mobile/src/creative/CreativeResults.tsx:184

组件：`Pressable`。声明名称：`{`查看版本 ${v.versionNo}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setSelected(v.id);setHistory(false);}}"
}
```

## C0263 · mobile/src/creative/CreativeResults.tsx:188

组件：`TextAction`。声明名称：`{status==='UNKNOWN'?'核查原任务':'查看本次任务'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/creative-task/[id]',params:{id:draft.job_id!,returnToWorkbench:'1'}})}"
}
```

## C0264 · mobile/src/creative/CreativeResults.tsx:191

组件：`IconAction`。声明名称：`{videoSaved?'已保存到系统相册':videoSaving?'正在保存到系统相册':delivery?.status==='FAILED'?'重试保存到系统相册':'保存视频到系统相册'}`。

禁用表达式：`{unavailable||videoSaved||videoSaving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{saveVideo}"
}
```

## C0265 · mobile/src/creative/CreativeResults.tsx:191

组件：`TextAction`。声明名称：`"用于此镜头"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{apply}"
}
```

## C0266 · mobile/src/creative/CreativeResults.tsx:192

组件：`IconAction`。声明名称：`"保存图片到系统相册"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void work(async()=>{setSaveRequested(true);await exportCreativeVersion(current.id);setExporting({versionId:current.id,generation:1});})}"
}
```

## C0267 · mobile/src/creative/CreativeResults.tsx:193

组件：`IconAction`。声明名称：`"更多成果操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setMore(true)}"
}
```

## C0268 · mobile/src/creative/CreativeResults.tsx:195

组件：`Pressable`。声明名称：`"全屏查看图片"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-004, U53-004, U54-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setFullScreen(true)}"
}
```

## C0269 · mobile/src/creative/CreativeResults.tsx:197

组件：`TextAction`。声明名称：`{`版本历史 · ${versions.length}${paged.next?'+':''}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setHistory(true)}"
}
```

## C0270 · mobile/src/creative/CreativeResults.tsx:198

组件：`TextAction`。声明名称：`"任务与草稿操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setMore(true)}"
}
```

## C0271 · mobile/src/creative/CreativeResults.tsx:200

组件：`TextAction`。声明名称：`"返回此镜头"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void work(()=>returnToProject(router,{projectId:draft.project_id!,shotId:draft.shot_id!}))}"
}
```

## C0272 · mobile/src/creative/CreativeResults.tsx:207

组件：`TextAction`。声明名称：`"调整后再生成"`。

禁用表达式：`{!onEditVideo}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onEditVideo?.()}"
}
```

## C0273 · mobile/src/creative/CreativeResults.tsx:207

组件：`IconAction`。声明名称：`{videoSaved?'已保存到系统相册':videoSaving?'正在保存到系统相册':'保存视频到系统相册'}`。

禁用表达式：`{unavailable||videoSaved||videoSaving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{saveVideo}"
}
```

## C0274 · mobile/src/creative/CreativeResults.tsx:207

组件：`IconAction`。声明名称：`{delivery?.status==='EXPORTED'?'已保存到系统相册':'保存图片到系统相册'}`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void work(async()=>{setSaveRequested(true);await exportCreativeVersion(current.id);setExporting({versionId:current.id,generation:1});})}"
}
```

## C0275 · mobile/src/creative/CreativeResults.tsx:208

组件：`IconAction`。声明名称：`"增强图片"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onEnhance(current)}"
}
```

## C0276 · mobile/src/creative/CreativeResults.tsx:209

组件：`IconAction`。声明名称：`"清晰放大 2×"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onUpscale(current)}"
}
```

## C0277 · mobile/src/creative/CreativeResults.tsx:210

组件：`IconAction`。声明名称：`"用于此镜头"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{apply}"
}
```

## C0278 · mobile/src/creative/CreativeResults.tsx:211

组件：`IconAction`。声明名称：`"更多成果操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setMore(true)}"
}
```

## C0279 · mobile/src/creative/CreativeResults.tsx:213

组件：`HoldToCompare`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{held=>setHeldOriginal(held?current.id:undefined)}"
}
```

## C0280 · mobile/src/creative/CreativeResults.tsx:214

组件：`TextAction`。声明名称：`{`版本历史 · ${versions.length}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setHistory(true)}"
}
```

## C0281 · mobile/src/creative/CreativeResults.tsx:217

组件：`TextAction`。声明名称：`"复用 Seed"`。

禁用表达式：`{busy || disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onReuse({seed:currentInfo.seed})}"
}
```

## C0282 · mobile/src/creative/CreativeResults.tsx:219

组件：`IconAction`。声明名称：`"上一张结果"`。

禁用表达式：`{!older}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>older&&selectNeighbor(older)}"
}
```

## C0283 · mobile/src/creative/CreativeResults.tsx:220

组件：`IconAction`。声明名称：`"下一张结果"`。

禁用表达式：`{!newer}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>newer&&selectNeighbor(newer)}"
}
```

## C0284 · mobile/src/creative/CreativeResults.tsx:222

组件：`Pressable`。声明名称：`{`预览历史版本 ${v.versionNo}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setSelected(v.id)}"
}
```

## C0285 · mobile/src/creative/CreativeResults.tsx:224

组件：`TextAction`。声明名称：`"调整后再生成"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onEditVideo}"
}
```

## C0286 · mobile/src/creative/CreativeResults.tsx:230

组件：`TextAction`。声明名称：`"关闭保存提示"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setSaveRequested(false);setNotice('');}}"
}
```

## C0287 · mobile/src/creative/CreativeResults.tsx:231

组件：`ImageHistorySheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{version=>{setSelectedVersion(version);setSelected(version.id);}}",
  "onClose": "{()=>setHistory(false)}"
}
```

## C0288 · mobile/src/creative/CreativeResults.tsx:233

组件：`ImageProcessingSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setProcessing(false)}"
}
```

## C0289 · mobile/src/creative/CreativeResults.tsx:234

组件：`ParameterSheet`。声明名称：`"成果操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setMore(false)}"
}
```

## C0290 · mobile/src/creative/CreativeResults.tsx:236

组件：`TextAction`。声明名称：`{videoSaved?'已保存到系统相册':videoSaving?'正在保存到系统相册':'保存视频到系统相册'}`。

禁用表达式：`{!current||unavailable||videoSaved||videoSaving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setMore(false);saveVideo();}}"
}
```

## C0291 · mobile/src/creative/CreativeResults.tsx:236

组件：`TextAction`。声明名称：`"用于此镜头"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{apply}"
}
```

## C0292 · mobile/src/creative/CreativeResults.tsx:236

组件：`TextAction`。声明名称：`"查看本轮任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setMore(false);router.push({pathname:'/creative-task/[id]',params:{id:draft.job_id!,returnToWorkbench:'1'}});}}"
}
```

## C0293 · mobile/src/creative/CreativeResults.tsx:237

组件：`TextAction`。声明名称：`"比较版本与参数"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setMore(false);setComparing(true);}}"
}
```

## C0294 · mobile/src/creative/CreativeResults.tsx:238

组件：`TextAction`。声明名称：`{`版本历史 · ${versions.length}${paged.next?'+':''}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setMore(false);setHistory(true);}}"
}
```

## C0295 · mobile/src/creative/CreativeResults.tsx:239

组件：`TextAction`。声明名称：`"以此图生成"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setMore(false);if(onUseImage)onUseImage(current,'img2img');else void work(()=>continueWith(false,'img2img'));}}"
}
```

## C0296 · mobile/src/creative/CreativeResults.tsx:239

组件：`TextAction`。声明名称：`"局部重绘"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setMore(false);if(onUseImage)onUseImage(current,'infill');else void work(()=>continueWith(false,'infill'));}}"
}
```

## C0297 · mobile/src/creative/CreativeResults.tsx:239

组件：`TextAction`。声明名称：`"制作视频"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U60-009。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setMore(false);void work(()=>continueWith(true));}}"
}
```

## C0298 · mobile/src/creative/CreativeResults.tsx:240

组件：`TextAction`。声明名称：`"查看素材与版本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setMore(false);router.push({pathname:'/creative-asset/[id]',params:{id:current.assetId,versionId:current.id,...(draft.project_id?{projectId:draft.project_id}:{})}});}}"
}
```

## C0299 · mobile/src/creative/CreativeResults.tsx:241

组件：`TextAction`。声明名称：`{current?.recipe.jobId&&current.recipe.jobId!==draft.job_id?'此版本生成参数':'本次生成参数'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void work(async()=>{const selectedDraft=current?.recipe.jobId&&current.recipe.jobId!==draft.job_id?(await creativeService().drafts(draft.project_id??undefined)).find(row=>row.job_id===current.recipe.jobId):draft;if(!selectedDraft)throw new Error('该版本草稿已不可用，可在素材详情查看参数');setParameterDraft(selectedDraft);setMore(false);setParameters(true);})}"
}
```

## C0300 · mobile/src/creative/CreativeResults.tsx:244

组件：`DraftParametersSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setParameters(false)}"
}
```

## C0301 · mobile/src/creative/CreativeResults.tsx:245

组件：`ImageHistorySheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onSelect": "{version=>{setSelectedVersion(version);setSelected(version.id);}}",
  "onClose": "{()=>setHistory(false)}"
}
```

## C0302 · mobile/src/creative/CreativeResults.tsx:245

组件：`ParameterSheet`。声明名称：`"版本历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setHistory(false)}"
}
```

## C0303 · mobile/src/creative/CreativeResults.tsx:245

组件：`TextAction`。声明名称：`"加载更早结果"`。

禁用表达式：`{paged.loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{paged.loadMore}"
}
```

## C0304 · mobile/src/creative/CreativeResults.tsx:246

组件：`ParameterSheet`。声明名称：`"版本对照"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setComparing(false)}"
}
```

## C0305 · mobile/src/creative/CreativeResults.tsx:247

组件：`ImagePreview`。声明名称：`{`版本 ${current.versionNo}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setFullScreen(false)}"
}
```

## C0306 · mobile/src/creative/CreativeWorkspace.tsx:212

组件：`ListAction`。声明名称：`{label}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0307 · mobile/src/creative/CreativeWorkspace.tsx:213

组件：`factory:action`。声明名称：`'返回项目列表'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "back"
}
```

## C0308 · mobile/src/creative/CreativeWorkspace.tsx:215

组件：`RecordRow`。声明名称：`{p.title}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void run(()=>openProject(p))}"
}
```

## C0309 · mobile/src/creative/CreativeWorkspace.tsx:221

组件：`ImagePreview`。声明名称：`{activeAsset?.title}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setPreviewUri(null)}"
}
```

## C0310 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`{onClose?"关闭素材详情":"返回"}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0311 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`"编辑名称与标签"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-002, U53-002, U54-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setMetadata(true)}"
}
```

## C0312 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`"素材操作"`。

禁用表达式：`{!visibleVersion}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-003, U53-003, U54-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setManage(true)}"
}
```

## C0313 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`"返回"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-001, U12-001, U13-001, U14-001, U15-001, U17-001, U19-001, U20-001, U22-001, U41-001, U57-001, U60-001, U61-001, U62-001, U65-001, U66-001, U68-001, U69-001, U70-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0314 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`"导入素材"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-001, U49-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setImportOpen(true)}"
}
```

## C0315 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`"制作图片"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void run(async()=>{const result=await command({name:'draft.createImage',payload:{projectId:current.id}});if(result.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:result.value.draftId}});})}"
}
```

## C0316 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`IconAction`。声明名称：`"项目设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-002, U12-002, U13-002, U14-002, U15-002, U17-002, U19-002, U20-002, U57-002, U60-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setManage(!manage)}"
}
```

## C0317 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`factory:action`。声明名称：`'返回'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U11-001, U12-001, U13-001, U14-001, U15-001, U17-001, U19-001, U20-001, U22-001, U41-001, U57-001, U60-001, U61-001, U62-001, U65-001, U66-001, U68-001, U69-001, U70-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "back"
}
```

## C0318 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`ListAction`。声明名称：`"导入素材"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-001, U49-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setImportOpen(!importOpen)}"
}
```

## C0319 · mobile/src/creative/CreativeWorkspace.tsx:222

组件：`factory:action`。声明名称：`manage ? '收起管理' : activeAsset ? '版本与使用位置' : current ? '项目设置' : '历史与迁入'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => setManage(!manage)"
}
```

## C0320 · mobile/src/creative/CreativeWorkspace.tsx:224

组件：`factory:action`。声明名称：`'历史作品'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U15-003。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => router.push('/(tabs)/gallery')"
}
```

## C0321 · mobile/src/creative/CreativeWorkspace.tsx:224

组件：`factory:action`。声明名称：`'创作草稿'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U15-004。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => router.push('/creative-drafts')"
}
```

## C0322 · mobile/src/creative/CreativeWorkspace.tsx:226

组件：`ListFilters`。声明名称：`"项目页面"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>changeProjectView(value as typeof projectView)}"
}
```

## C0323 · mobile/src/creative/CreativeWorkspace.tsx:228

组件：`factory:action`。声明名称：`'新建项目'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U10-002, U16-002。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => creating ? confirmLeave(discardBrief) : setCreating(true), false"
}
```

## C0324 · mobile/src/creative/CreativeWorkspace.tsx:228

组件：`factory:action`。声明名称：`archived ? '查看进行中项目' : '查看归档项目'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => { setArchived(!archived); setSelected(undefined); }"
}
```

## C0325 · mobile/src/creative/CreativeWorkspace.tsx:228

组件：`factory:action`。声明名称：`'全部项目'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => { setSelected(undefined); setTitle(''); setBrief(''); }"
}
```

## C0326 · mobile/src/creative/CreativeWorkspace.tsx:229

组件：`TextInput`。声明名称：`"搜索项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U10-004, U16-004, U53-008, U54-008。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setProjectQuery}"
}
```

## C0327 · mobile/src/creative/CreativeWorkspace.tsx:234

组件：`TextInput`。声明名称：`"项目名称"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U16-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setTitle}"
}
```

## C0328 · mobile/src/creative/CreativeWorkspace.tsx:235

组件：`TextInput`。声明名称：`"创作简报"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U16-006。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setBrief}"
}
```

## C0329 · mobile/src/creative/CreativeWorkspace.tsx:236

组件：`factory:action`。声明名称：`selected ? '保存简报' : '创建项目'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => {\r\n          if (current) await command({ name: 'project.update', payload: { id: current.id, title, brief, expectedRevision: current.revision } });\r\n          else { const result=await command({ name: 'project.create', payload: { title, brief } }); if(result.status!=='completed')throw new Error('项目未创建');setTitle(''); setBrief(''); setCreating(false);router.push({pathname:'/creative-project/[id]',params:{id:result.value.projectId}}); }\r\n          setEditingBrief(false);\r\n        }), false"
}
```

## C0330 · mobile/src/creative/CreativeWorkspace.tsx:241

组件：`factory:action`。声明名称：`'取消编辑'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U16-008。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => confirmLeave(discardBrief)"
}
```

## C0331 · mobile/src/creative/CreativeWorkspace.tsx:243

组件：`factory:action`。声明名称：`current.archivedAt ? '恢复项目' : '归档项目'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => void run(async () => { await command({ name: 'project.archive', payload: { id: current.id, archived: !current.archivedAt, expectedRevision: current.revision } }); setEditingBrief(false); })"
}
```

## C0332 · mobile/src/creative/CreativeWorkspace.tsx:245

组件：`factory:action`。声明名称：`'移除项目封面'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>void run(()=>command({name:'project.setCover',payload:{id:current.id,expectedRevision:current.revision,versionId:null}}))"
}
```

## C0333 · mobile/src/creative/CreativeWorkspace.tsx:252

组件：`factory:action`。声明名称：`'从回收站恢复'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "()=>void run(async()=>{await command({name:'asset.restore',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});back();}), false"
}
```

## C0334 · mobile/src/creative/CreativeWorkspace.tsx:253

组件：`WorkbenchSection`。声明名称：`"编辑素材"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onClose": "{()=>confirmLeave(()=>void run(async()=>{await inspect(activeAsset);setMetadata(false);}))}"
}
```

## C0335 · mobile/src/creative/CreativeWorkspace.tsx:253

组件：`factory:action`。声明名称：`'从回收站恢复'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "()=>void run(async()=>{await command({name:'asset.restore',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});back();})"
}
```

## C0336 · mobile/src/creative/CreativeWorkspace.tsx:254

组件：`TextInput`。声明名称：`"资产名称"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setAssetTitle}"
}
```

## C0337 · mobile/src/creative/CreativeWorkspace.tsx:255

组件：`TextInput`。声明名称：`"资产说明"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setAssetDescription}"
}
```

## C0338 · mobile/src/creative/CreativeWorkspace.tsx:256

组件：`TextInput`。声明名称：`"资产标签"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setAssetTags}"
}
```

## C0339 · mobile/src/creative/CreativeWorkspace.tsx:257

组件：`factory:action`。声明名称：`'保存说明与标签'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>void run(async()=>{await command({name:'asset.describe',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision,title:assetTitle,description:assetDescription,tags:assetTags.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}});setActiveAsset({...activeAsset,title:assetTitle,revision:activeAsset.revision+1});setMetadataBaseline(JSON.stringify([assetTitle,assetDescription,assetTags]));setMetadata(false);})"
}
```

## C0340 · mobile/src/creative/CreativeWorkspace.tsx:258

组件：`factory:action`。声明名称：`'取消素材修改'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => confirmLeave(() => void run(() => inspect(activeAsset)))"
}
```

## C0341 · mobile/src/creative/CreativeWorkspace.tsx:259

组件：`factory:action`。声明名称：`'移入回收站'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "()=>Alert.alert('移入回收站','仍被项目、镜头或草稿引用的资产会阻止此操作。回收站保留文件，可恢复。',[{text:'取消',style:'cancel'},{text:'移入',onPress:()=>void run(async()=>{await command({name:'asset.trash',payload:{id:activeAsset.id,expectedRevision:activeAsset.revision}});back();})}])"
}
```

## C0342 · mobile/src/creative/CreativeWorkspace.tsx:261

组件：`factory:action`。声明名称：`'查看其他版本'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => { setVersionId(undefined); setProcessing(false); setProjectActions(false); }"
}
```

## C0343 · mobile/src/creative/CreativeWorkspace.tsx:262

组件：`TextAction`。声明名称：`{comparing?'收起比较':'比较版本'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setComparing(!comparing)}"
}
```

## C0344 · mobile/src/creative/CreativeWorkspace.tsx:262

组件：`factory:action`。声明名称：`versionsLoading?'正在加载…':'加载更早版本'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>void loadMoreVersions()"
}
```

## C0345 · mobile/src/creative/CreativeWorkspace.tsx:262

组件：`Pressable`。声明名称：`{`查看版本 ${v.versionNo}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => { setVersionId(v.id); setProjectActions(false); setComparing(false); }}"
}
```

## C0346 · mobile/src/creative/CreativeWorkspace.tsx:263

组件：`Pressable`。声明名称：`"全屏查看图片"`。

禁用表达式：`{v.state!=='AVAILABLE'||!v.relativePath}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-004, U53-004, U54-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setPreviewUri(FileSystem.documentDirectory+v.relativePath!)}"
}
```

## C0347 · mobile/src/creative/CreativeWorkspace.tsx:267

组件：`ListAction`。声明名称：`"导出"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-005, U53-005, U54-005。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void run(()=>exportCreativeVersion(v.id))}"
}
```

## C0348 · mobile/src/creative/CreativeWorkspace.tsx:267

组件：`ListAction`。声明名称：`"加入项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-006, U53-006, U54-006。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setProjectActions(!projectActions)}"
}
```

## C0349 · mobile/src/creative/CreativeWorkspace.tsx:267

组件：`WorkbenchSection`。声明名称：`"加入项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-006, U53-006, U54-006。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setProjectActions(false)}"
}
```

## C0350 · mobile/src/creative/CreativeWorkspace.tsx:267

组件：`TextInput`。声明名称：`"搜索项目"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U10-004, U16-004, U53-008, U54-008。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setProjectQuery}"
}
```

## C0351 · mobile/src/creative/CreativeWorkspace.tsx:268

组件：`factory:action`。声明名称：``加入 ${p.title}（固定此版本）``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { await command({ name: 'asset.linkToProject', payload: { assetId: activeAsset.id, projectId: p.id, versionId: v.id } }); await inspect(activeAsset); })"
}
```

## C0352 · mobile/src/creative/CreativeWorkspace.tsx:269

组件：`factory:action`。声明名称：``将 ${l.title} 固定到此版本``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { await command({ name: 'asset.pinProjectVersion', payload: { assetId: activeAsset.id, projectId: l.project_id, expectedRevision: l.revision, versionId: v.id } }); await inspect(activeAsset); })"
}
```

## C0353 · mobile/src/creative/CreativeWorkspace.tsx:270

组件：`factory:action`。声明名称：``设为 ${p.title} 封面``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>void run(async()=>{await creativeFiles().verify(v.id);await command({name:'project.setCover',payload:{id:p.id,expectedRevision:p.revision,versionId:v.id}});} )"
}
```

## C0354 · mobile/src/creative/CreativeWorkspace.tsx:271

组件：`ParameterSheet`。声明名称：`"素材操作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-003, U53-003, U54-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setManage(false)}"
}
```

## C0355 · mobile/src/creative/CreativeWorkspace.tsx:272

组件：`factory:action`。声明名称：`'增强 / 放大'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U52-004, U56-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>setProcessing(true)"
}
```

## C0356 · mobile/src/creative/CreativeWorkspace.tsx:273

组件：`ImageProcessingSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setProcessing(false)}"
}
```

## C0357 · mobile/src/creative/CreativeWorkspace.tsx:275

组件：`factory:action`。声明名称：`creativeExportTarget(v.mime??'')==='system-gallery'?'保存到系统相册':'保存到下载文件夹'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(() => exportCreativeVersion(v.id))"
}
```

## C0358 · mobile/src/creative/CreativeWorkspace.tsx:276

组件：`factory:action`。声明名称：`'重新定位原图'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => void run(async () => { const [image] = await pickImagesFromGallery(1); if (image) { await restoreCreativeImage(v.id, image); await inspect(activeAsset); } })"
}
```

## C0359 · mobile/src/creative/CreativeWorkspace.tsx:277

组件：`factory:action`。声明名称：`'从文件备份找回'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => void run(async () => { await restoreCreativeImageFromBackup(v.id); await inspect(activeAsset); })"
}
```

## C0360 · mobile/src/creative/CreativeWorkspace.tsx:279

组件：`factory:action`。声明名称：`'另存一份'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => Alert.alert('另存一份文件', '这会发起新的保存操作，目标文件夹中可能出现重复文件。', [{ text: '取消', style: 'cancel' }, { text: '继续保存', onPress: () => void run(() => exportCreativeVersion(v.id, deliveries[v.id]!.generation + 1)) }])"
}
```

## C0361 · mobile/src/creative/CreativeWorkspace.tsx:280

组件：`factory:action`。声明名称：`'设为默认版本'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U52-006, U56-006。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { await command({ name: 'asset.setDefaultVersion', payload: { id: activeAsset.id, versionId: v.id, expectedRevision: activeAsset.revision } }); const updated = await creativeService().asset(activeAsset.id); if (updated) await inspect(updated); })"
}
```

## C0362 · mobile/src/creative/CreativeWorkspace.tsx:283

组件：`factory:action`。声明名称：`'恢复参数并继续出图'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { const result=await command({name:'draft.createImage',payload:{fromVersionId:v.id,projectId:selected}}); if(result.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:result.value.draftId}}); })"
}
```

## C0363 · mobile/src/creative/CreativeWorkspace.tsx:284

组件：`factory:action`。声明名称：`'重新定位原文件'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>void run(async()=>{await locateCreativeFile(v.id);await inspect(activeAsset);})"
}
```

## C0364 · mobile/src/creative/CreativeWorkspace.tsx:284

组件：`factory:action`。声明名称：`'从备份恢复原文件'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "()=>void run(async()=>{await restoreCreativeFileFromBackup(v.id);await inspect(activeAsset);})"
}
```

## C0365 · mobile/src/creative/CreativeWorkspace.tsx:285

组件：`factory:action`。声明名称：`'从此版本创建视频草稿'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U52-007, U56-007。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { const result = await command({ name: 'draft.createVideo', payload: { versionId: v.id, ...(selected ? { projectId: selected } : {}) } }); if (result.status === 'completed') router.push({ pathname: '/creative-draft/[id]', params: { id: result.value.draftId } }); })"
}
```

## C0366 · mobile/src/creative/CreativeWorkspace.tsx:288

组件：`factory:action`。声明名称：``从 ${link.title} 移出``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { await command({ name: 'asset.unlinkFromProject', payload: { assetId: activeAsset.id, projectId: link.project_id, expectedRevision: link.revision } }); await inspect(activeAsset); })"
}
```

## C0367 · mobile/src/creative/CreativeWorkspace.tsx:290

组件：`factory:action`。声明名称：``让 ${l.title} 跟随默认版本``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { await command({ name: 'asset.pinProjectVersion', payload: { assetId: activeAsset.id, projectId: l.project_id, expectedRevision: l.revision, versionId: null } }); await inspect(activeAsset); })"
}
```

## C0368 · mobile/src/creative/CreativeWorkspace.tsx:292

组件：`ParameterSheet`。声明名称：`"导入素材"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-001, U49-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setImportOpen(false)}"
}
```

## C0369 · mobile/src/creative/CreativeWorkspace.tsx:292

组件：`factory:action`。声明名称：`'从相册导入图片'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>void addImages()"
}
```

## C0370 · mobile/src/creative/CreativeWorkspace.tsx:292

组件：`factory:action`。声明名称：`'从文件导入'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>void run(async()=>{const count=await pickCreativeFiles(mode==='projects'?selected:undefined);if(count){revealImports();setImportOpen(false);}})"
}
```

## C0371 · mobile/src/creative/CreativeWorkspace.tsx:293

组件：`TextInput`。声明名称：`"搜索资产"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-006, U49-006。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setQuery}"
}
```

## C0372 · mobile/src/creative/CreativeWorkspace.tsx:294

组件：`ListFilters`。声明名称：`"素材范围"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>setInbox(value==='inbox')}"
}
```

## C0373 · mobile/src/creative/CreativeWorkspace.tsx:297

组件：`ListFilters`。声明名称：`"素材类型"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setKind}"
}
```

## C0374 · mobile/src/creative/CreativeWorkspace.tsx:300

组件：`factory:action`。声明名称：`'迁入历史作品（可中断）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U28-006。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => void run(async () => { const result = await migrateCreativeHistory(); setMigrationNotice(`本批迁入或更新 ${result.imported} 项。${result.pending ? '还有记录，点击继续迁入。' : '已追平当前历史记录。'} 待处理变更 ${result.audit.pendingJournal}，未迁入 ${result.audit.unmapped}，待更新映射 ${result.audit.staleMappings}，原件不可用 ${result.audit.unavailableFiles}。${result.audit.missingPins||result.audit.brokenMappings||result.audit.foreignKeyViolations?'检测到一致性异常，请保留备份并停止清理文件。':''}${result.audit.writersReady?'':'旧入口仍处于兼容追平阶段，尚未切换写入源。'}`); })"
}
```

## C0375 · mobile/src/creative/CreativeWorkspace.tsx:303

组件：`ParameterSheet`。声明名称：`"素材管理"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-002, U49-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setManage(false)}"
}
```

## C0376 · mobile/src/creative/CreativeWorkspace.tsx:303

组件：`SettingRow`。声明名称：`"存储与清理"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setManage(false);router.push({pathname:'/settings-panel',params:{section:'storage'}});}}"
}
```

## C0377 · mobile/src/creative/CreativeWorkspace.tsx:303

组件：`SettingRow`。声明名称：`"历史作品"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U15-003。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setManage(false);router.push('/(tabs)/gallery');}}"
}
```

## C0378 · mobile/src/creative/CreativeWorkspace.tsx:303

组件：`SettingRow`。声明名称：`"创作草稿"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U15-004。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setManage(false);router.push('/creative-drafts');}}"
}
```

## C0379 · mobile/src/creative/CreativeWorkspace.tsx:303

组件：`factory:action`。声明名称：`'迁入历史作品（可中断）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U28-006。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>void run(async()=>{const result=await migrateCreativeHistory();setMigrationNotice(`本批迁入或更新 ${result.imported} 项。${result.pending ? '还有记录，点击继续迁入。' : '已追平当前历史记录。'} 待处理变更 ${result.audit.pendingJournal}，未迁入 ${result.audit.unmapped}，待更新映射 ${result.audit.staleMappings}，原件不可用 ${result.audit.unavailableFiles}。${result.audit.missingPins||result.audit.brokenMappings||result.audit.foreignKeyViolations?'检测到一致性异常，请保留备份并停止清理文件。':''}${result.audit.writersReady?'':'旧入口仍处于兼容追平阶段，尚未切换写入源。'}`);} )"
}
```

## C0380 · mobile/src/creative/CreativeWorkspace.tsx:305

组件：`factory:action`。声明名称：`assetLoading?'正在加载…':'加载更多素材'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>void loadMoreAssets()"
}
```

## C0381 · mobile/src/creative/CreativeWorkspace.tsx:305

组件：`AssetTile`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>leaveInspector(()=>setInspectorId(a.id))}"
}
```

## C0382 · mobile/src/creative/CreativeWorkspace.tsx:310

组件：`CreativeWorkspace`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>{setInspectorId(undefined);void refresh();}}"
}
```

## C0383 · mobile/src/creative/DraftHeading.tsx:20

组件：`TextAction`。声明名称：`"返回"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => router.canGoBack() ? router.back() : router.replace('/(tabs)/create')}"
}
```

## C0384 · mobile/src/creative/DraftParametersSheet.tsx:32

组件：`ParameterSheet`。声明名称：`"本次生成参数"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0385 · mobile/src/creative/DraftParametersSheet.tsx:42

组件：`TextAction`。声明名称：`{raw ? '收起完整参数' : '查看完整参数'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setRaw(!raw)}"
}
```

## C0386 · mobile/src/creative/ImageDraftScreen.tsx:193

组件：`TextAction`。声明名称：`"导入图片或生成信息"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void importImage('source')}"
}
```

## C0387 · mobile/src/creative/ImageDraftScreen.tsx:195

组件：`SegmentedChoices`。声明名称：`"生成方式"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{action=>update({action,enhance:action==='img2img' && input.enhance,enhancement:action==='img2img'?input.enhancement:null})}"
}
```

## C0388 · mobile/src/creative/ImageDraftScreen.tsx:199

组件：`TextAction`。声明名称：`"从素材选择底图"`。

禁用表达式：`{!editable || saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setPicking('source')}"
}
```

## C0389 · mobile/src/creative/ImageDraftScreen.tsx:202

组件：`TextAction`。声明名称：`"改为绘制蒙版"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({maskVersionId:null})}"
}
```

## C0390 · mobile/src/creative/ImageDraftScreen.tsx:202

组件：`NovelAiMaskEditor`。声明名称：`(动态/子文本)`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{maskStrokes=>update({maskStrokes,maskVersionId:null})}"
}
```

## C0391 · mobile/src/creative/ImageDraftScreen.tsx:203

组件：`TextAction`。声明名称：`"从素材选择蒙版"`。

禁用表达式：`{!editable || saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setPicking('mask')}"
}
```

## C0392 · mobile/src/creative/ImageDraftScreen.tsx:203

组件：`TextAction`。声明名称：`"导入黑白蒙版"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void importImage('mask')}"
}
```

## C0393 · mobile/src/creative/ImageDraftScreen.tsx:208

组件：`IconAction`。声明名称：`"返回"`。

禁用表达式：`{busy || saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{if(!closePanel())router.canGoBack()?router.back():router.replace('/(tabs)/create');}}"
}
```

## C0394 · mobile/src/creative/ImageDraftScreen.tsx:208

组件：`IconAction`。声明名称：`"创作账号"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U22-002, U61-002, U62-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/settings-panel',params:{section:'accounts'}})}"
}
```

## C0395 · mobile/src/creative/ImageDraftScreen.tsx:209

组件：`TextAction`。声明名称：`"载入最新草稿"`。

禁用表达式：`{busy || saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>Alert.alert('载入最新草稿','这会放弃本页尚未保存的修改。',[{text:'保留本页',style:'cancel'},{text:'载入最新',onPress:()=>void reload().catch(e=>setError(creativeError(e)))}])}"
}
```

## C0396 · mobile/src/creative/ImageDraftScreen.tsx:210

组件：`TextAction`。声明名称：`"重试保存草稿"`。

禁用表达式：`{busy || saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void save()}"
}
```

## C0397 · mobile/src/creative/ImageDraftScreen.tsx:215

组件：`TextInput`。声明名称：`"图片提示词"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-010, U22-007。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{prompt=>updateActive({prompt})}"
}
```

## C0398 · mobile/src/creative/ImageDraftScreen.tsx:215

组件：`IconAction`。声明名称：`"提示词助手"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-011, U22-008。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{openAssist}"
}
```

## C0399 · mobile/src/creative/ImageDraftScreen.tsx:216

组件：`PromptAssistSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setAssist(false)}"
}
```

## C0400 · mobile/src/creative/ImageDraftScreen.tsx:216

组件：`NovelAiSettings`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{closeSettings}"
}
```

## C0401 · mobile/src/creative/ImageDraftScreen.tsx:216

组件：`NovelAiPromptEditor`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>{Keyboard.dismiss();setEditor(undefined);}}"
}
```

## C0402 · mobile/src/creative/ImageDraftScreen.tsx:220

组件：`NovelAiEnhancePanel`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{closeProcessing}"
}
```

## C0403 · mobile/src/creative/ImageDraftScreen.tsx:220

组件：`IconAction`。声明名称：`"关闭放大"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{closeProcessing}"
}
```

## C0404 · mobile/src/creative/ImageDraftScreen.tsx:225

组件：`IconAction`。声明名称：`"撤销修改"`。

禁用表达式：`{busy||saving||pending}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{if(processing==='enhance')setEnhanceInput(undoInput);else setInput(undoInput);setUndoInput(undefined);setError('');}}"
}
```

## C0405 · mobile/src/creative/ImageDraftScreen.tsx:225

组件：`IconAction`。声明名称：`"生成设置"`。

禁用表达式：`{processing==='upscale'}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-012, U05-029, U22-009。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setAssist(false);setEditor(undefined);setSettings(!settings);}}"
}
```

## C0406 · mobile/src/creative/ImageDraftScreen.tsx:225

组件：`IconAction`。声明名称：`"展开画面编辑"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-013, U05-030, U22-010。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>editor?setEditor(undefined):openEditor('prompt')}"
}
```

## C0407 · mobile/src/creative/ImageDraftScreen.tsx:225

组件：`Pressable`。声明名称：`{processing==='enhance'?'增强图片':processing==='upscale'?'放大图片':`生成 ${input.samples} 张图片`}`。

禁用表达式：`{busy || saving || pending || conflict}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void submit()}"
}
```

## C0408 · mobile/src/creative/ImageDraftScreen.tsx:225

组件：`IconAction`。声明名称：`"生成历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-015, U05-032, U22-012。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setAssist(false);setSettings(false);setEditor(undefined);setHistoryOpen(!historyOpen);}}"
}
```

## C0409 · mobile/src/creative/ImageDraftScreen.tsx:228

组件：`NovelAiImageImport`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setImporting(undefined)}"
}
```

## C0410 · mobile/src/creative/ImageDraftScreen.tsx:229

组件：`CreativeAssetPicker`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setPicking(undefined)}",
  "onChoose": "{async version=>choose(version.id,picking)}"
}
```

## C0411 · mobile/src/creative/ImageEditorDrawer.tsx:26

组件：`Pressable`。声明名称：`"拖动编辑抽屉"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{expanded?onCollapse:onExpand}"
}
```

## C0412 · mobile/src/creative/ImageHistorySheet.tsx:50

组件：`IconAction`。声明名称：`{locked ? '已锁定历史滚动 · 点击恢复自动滚动' : '自动滚动到最新结果 · 点击锁定历史滚动'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onLock}"
}
```

## C0413 · mobile/src/creative/ImageHistorySheet.tsx:51

组件：`TextAction`。声明名称：`{selecting ? '退出多选' : '批量保存'}`。

禁用表达式：`{exporting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setSelecting(!selecting);setPicks([]);}}"
}
```

## C0414 · mobile/src/creative/ImageHistorySheet.tsx:52

组件：`IconAction`。声明名称：`"关闭生成历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0415 · mobile/src/creative/ImageHistorySheet.tsx:55

组件：`TextInput`。声明名称：`"搜索生成历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setQuery}"
}
```

## C0416 · mobile/src/creative/ImageHistorySheet.tsx:56

组件：`TextAction`。声明名称：`{locked ? '已锁定历史滚动 · 点击恢复自动滚动' : '自动滚动到最新结果 · 点击锁定历史滚动'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onLock}"
}
```

## C0417 · mobile/src/creative/ImageHistorySheet.tsx:57

组件：`TextAction`。声明名称：`{selecting ? '退出多选' : '批量保存'}`。

禁用表达式：`{exporting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { setSelecting(!selecting); setPicks([]); }}"
}
```

## C0418 · mobile/src/creative/ImageHistorySheet.tsx:57

组件：`TextAction`。声明名称：`{source?"选择已加载结果":"选择筛选结果"}`。

禁用表达式：`{exporting}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setPicks(rows.filter(v => v.state === 'AVAILABLE' && v.relativePath).map(v => v.id))}"
}
```

## C0419 · mobile/src/creative/ImageHistorySheet.tsx:57

组件：`TextAction`。声明名称：`{exporting ? '加入保存队列中…' : `保存所选 ${picks.length} 张`}`。

禁用表达式：`{exporting || !picks.length}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void exportPicked()}"
}
```

## C0420 · mobile/src/creative/ImageHistorySheet.tsx:58

组件：`TextAction`。声明名称：`"历史读取失败 · 重试"`。

禁用表达式：`{paged.loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{paged.loadMore}"
}
```

## C0421 · mobile/src/creative/ImageHistorySheet.tsx:61

组件：`TextAction`。声明名称：`{paged.loading?"正在加载…":"加载更早结果"}`。

禁用表达式：`{paged.loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{paged.loadMore}"
}
```

## C0422 · mobile/src/creative/ImageHistorySheet.tsx:63

组件：`Pressable`。声明名称：`{`${selecting?'选择':'查看'}版本 ${item.versionNo}`}`。

禁用表达式：`{exporting || selecting && (item.state!=='AVAILABLE' || !item.relativePath)}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { if(selecting){setPicks(old=>old.includes(item.id)?old.filter(id=>id!==item.id):[...old,item.id]);return;} onSelect(item); if(!inline)onClose(); }}"
}
```

## C0423 · mobile/src/creative/ImageMetadataPanel.tsx:52

组件：`Pressable`。声明名称：`{`复制${copyLabel}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void copy(value)}"
}
```

## C0424 · mobile/src/creative/ImageMetadataPanel.tsx:54

组件：`ParameterSheet`。声明名称：`"图片信息 · Inspect"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0425 · mobile/src/creative/ImageMetadataPanel.tsx:69

组件：`SegmentedChoices`。声明名称：`"元数据展示方式"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setTab}"
}
```

## C0426 · mobile/src/creative/ImageMetadataPanel.tsx:71

组件：`TextAction`。声明名称：`{`复制${label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void copy(field.value)}"
}
```

## C0427 · mobile/src/creative/ImageMetadataPanel.tsx:75

组件：`TextAction`。声明名称：`"复制原始参数"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void copy(rawComment)}"
}
```

## C0428 · mobile/src/creative/ImageMetadataPanel.tsx:76

组件：`TextAction`。声明名称：`{expandedRaw?'收起长参数':'展开完整参数'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpandedRaw(!expandedRaw)}"
}
```

## C0429 · mobile/src/creative/ImageMetadataPanel.tsx:78

组件：`TextAction`。声明名称：`"仅复用提示词"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>reuse({prompt})}"
}
```

## C0430 · mobile/src/creative/ImageMetadataPanel.tsx:78

组件：`TextAction`。声明名称：`"仅复用 Seed"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>reuse({seed})}"
}
```

## C0431 · mobile/src/creative/ImageMetadataPanel.tsx:78

组件：`TextAction`。声明名称：`"复用完整配置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>reuse({...parsed.data,...(parsed.data.enhancement||parsed.data.enhance?{action:'generate' as const,enhance:false,enhancement:null,sourceVersionId:null,maskVersionId:null,maskStrokes:[]}:{}),...(seed!==undefined&&Number.isInteger(seed)&&seed>=0&&seed<=4294967295?{seed}:{})})}"
}
```

## C0432 · mobile/src/creative/ImageMetadataPanel.tsx:80

组件：`TextAction`。声明名称：`{rawOpen?'收起原始元数据':'查看原始元数据与配方'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setRawOpen(!rawOpen)}"
}
```

## C0433 · mobile/src/creative/ImageMetadataPanel.tsx:81

组件：`TextAction`。声明名称：`"复制完整元数据与配方"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void copy(JSON.stringify({file:info?{width:info.width,height:info.height,mime:info.mime,bytes:info.bytes}:null,embedded:info?.metadata??null,recipe:version.recipe},null,2))}"
}
```

## C0434 · mobile/src/creative/ImageMetadataPanel.tsx:86

组件：`ListAction`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setOpen(true)}"
}
```

## C0435 · mobile/src/creative/ImageMetadataPanel.tsx:86

组件：`MetadataSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{()=>setOpen(false)}"
}
```

## C0436 · mobile/src/creative/ImageProcessingSheet.tsx:25

组件：`ParameterSheet`。声明名称：`"增强 / 放大"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U52-004, U56-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>{if(!busy)onClose();}}"
}
```

## C0437 · mobile/src/creative/ImageProcessingSheet.tsx:26

组件：`SettingRow`。声明名称：`"细节增强 · Enhance"`。

禁用表达式：`{busy || !canEnhance}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void open('enhance')}"
}
```

## C0438 · mobile/src/creative/ImageProcessingSheet.tsx:28

组件：`SettingRow`。声明名称：`"清晰放大 · 2×"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void open('upscale')}"
}
```

## C0439 · mobile/src/creative/LibraryToolbar.tsx:8

组件：`Pressable`。声明名称：`"导入素材"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-001, U49-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onImport}"
}
```

## C0440 · mobile/src/creative/LibraryToolbar.tsx:9

组件：`Pressable`。声明名称：`"素材管理"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-002, U49-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onManage}"
}
```

## C0441 · mobile/src/creative/LibraryToolbar.tsx:11

组件：`Pressable`。声明名称：`{item.label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onScope(item.id)}"
}
```

## C0442 · mobile/src/creative/LibraryToolbar.tsx:12

组件：`TextInput`。声明名称：`"搜索资产"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U23-006, U49-006。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{onQuery}"
}
```

## C0443 · mobile/src/creative/LibraryToolbar.tsx:12

组件：`Pressable`。声明名称：`"清除素材搜索"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onQuery('')}"
}
```

## C0444 · mobile/src/creative/LibraryToolbar.tsx:13

组件：`Pressable`。声明名称：`{item.label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onKind(item.id)}"
}
```

## C0445 · mobile/src/creative/NovelAiEnhancePanel.tsx:16

组件：`IconAction`。声明名称：`"关闭增强"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0446 · mobile/src/creative/NovelAiEnhancePanel.tsx:18

组件：`SegmentedChoices`。声明名称：`"Enhance 放大比例"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{scale => update(enhancementPatch({ ...e, scale }))}"
}
```

## C0447 · mobile/src/creative/NovelAiEnhancePanel.tsx:23

组件：`NovelAiRangeField`。声明名称：`"Strength"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{strength => update({ strength })}"
}
```

## C0448 · mobile/src/creative/NovelAiEnhancePanel.tsx:24

组件：`NovelAiRangeField`。声明名称：`"Noise"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{noise => update({ noise })}"
}
```

## C0449 · mobile/src/creative/NovelAiEnhancePanel.tsx:26

组件：`SegmentedChoices`。声明名称：`"Enhance 变化幅度"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value => update(ENHANCE_MAGNITUDES[Number(value) - 1])}"
}
```

## C0450 · mobile/src/creative/NovelAiEnhancePanel.tsx:30

组件：`TextAction`。声明名称：`{advanced ? '收起高级设置' : '高级设置'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setAdvanced(!advanced)}"
}
```

## C0451 · mobile/src/creative/NovelAiImageImport.tsx:18

组件：`ParameterSheet`。声明名称：`"使用导入图片"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>{if(!busy)onClose();}}"
}
```

## C0452 · mobile/src/creative/NovelAiImageImport.tsx:20

组件：`TextAction`。声明名称：`{busy?'正在导入…':'用作图生图底图'}`。

禁用表达式：`{busy||loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setBusy(true);void onUseImage().then(onClose).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}"
}
```

## C0453 · mobile/src/creative/NovelAiImageImport.tsx:23

组件：`NovelAiToggle`。声明名称：`{label}`。

禁用表达式：`{busy||key==='append'&&!selection.characters}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChange": "{value=>setSelection(old=>({...old,[key]:value}))}"
}
```

## C0454 · mobile/src/creative/NovelAiImageImport.tsx:25

组件：`TextAction`。声明名称：`"导入所选元数据"`。

禁用表达式：`{busy||!['prompt','negative','characters','settings','seed'].some(k=>selection[k as keyof typeof selection])}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{try{onApply(metadataImportPatch(input,recovered.input!,selection));onClose();}catch(e){setError(e instanceof Error?e.message:'参数无法导入');}}}"
}
```

## C0455 · mobile/src/creative/NovelAiMaskEditor.tsx:33

组件：`SegmentedChoices`。声明名称：`"蒙版画笔大小"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setRadius}"
}
```

## C0456 · mobile/src/creative/NovelAiMaskEditor.tsx:34

组件：`TextAction`。声明名称：`"撤销一笔"`。

禁用表达式：`{disabled || !input.maskStrokes.length}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onChange(input.maskStrokes.slice(0,-1))}"
}
```

## C0457 · mobile/src/creative/NovelAiMaskEditor.tsx:34

组件：`TextAction`。声明名称：`"清空蒙版"`。

禁用表达式：`{disabled || !input.maskStrokes.length}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onChange([])}"
}
```

## C0458 · mobile/src/creative/NovelAiNumberField.tsx:12

组件：`TextInput`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{next=>{setText(next);if(next === '' && placeholder){lastEdited.current=null;onChange(null);}else if(/^-?\\d+(?:\\.\\d*)?$/.test(next) && Number.isFinite(Number(next))){lastEdited.current=Number(next);onChange(Number(next));}}}"
}
```

## C0459 · mobile/src/creative/NovelAiPromptEditor.tsx:21

组件：`SegmentedChoices`。声明名称：`"画面编辑分页"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setTab}"
}
```

## C0460 · mobile/src/creative/NovelAiPromptEditor.tsx:23

组件：`WeightedPromptInput`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{onChangeText}"
}
```

## C0461 · mobile/src/creative/NovelAiPromptEditor.tsx:28

组件：`SegmentedChoices`。声明名称：`"提示词类型"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setTab}"
}
```

## C0462 · mobile/src/creative/NovelAiPromptEditor.tsx:30

组件：`factory:field`。声明名称：`'图片提示词'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-010, U22-007。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "input.prompt, prompt=>update({prompt})"
}
```

## C0463 · mobile/src/creative/NovelAiPromptEditor.tsx:31

组件：`TextAction`。声明名称：`{`质量：${presetNames[input.qualityPreset]} · ${promptOptions?'收起选项':'选项'}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setPromptOptions(!promptOptions)}"
}
```

## C0464 · mobile/src/creative/NovelAiPromptEditor.tsx:31

组件：`TextAction`。声明名称：`"帮我写"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onAssist}"
}
```

## C0465 · mobile/src/creative/NovelAiPromptEditor.tsx:33

组件：`SegmentedChoices`。声明名称：`"质量预设"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onChange": "{qualityPreset=>update({qualityPreset})}"
}
```

## C0466 · mobile/src/creative/NovelAiPromptEditor.tsx:37

组件：`NovelAiToggle`。声明名称：`"透明背景"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{transparent=>update({transparent})}"
}
```

## C0467 · mobile/src/creative/NovelAiPromptEditor.tsx:39

组件：`SegmentedChoices`。声明名称：`"负面预设"`。

禁用表达式：`{!editable || medium}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onChange": "{negativePreset=>update({negativePreset})}"
}
```

## C0468 · mobile/src/creative/NovelAiPromptEditor.tsx:39

组件：`factory:field`。声明名称：`'图片负面提示词'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "input.negative, negative=>update({negative}), medium"
}
```

## C0469 · mobile/src/creative/NovelAiPromptEditor.tsx:40

组件：`TextAction`。声明名称：`{`角色提示词 · ${input.characters.length} ${charactersOpen?'▴':'▾'}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setCharactersOpen(!charactersOpen)}"
}
```

## C0470 · mobile/src/creative/NovelAiPromptEditor.tsx:40

组件：`IconAction`。声明名称：`{`添加角色（最多 ${maxCharacters} 个）`}`。

禁用表达式：`{!editable||input.characters.length>=maxCharacters}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setCharactersOpen(true);update({characters:[...input.characters,{prompt:'',negative:'',enabled:true,x:0.5,y:0.5}]});}}"
}
```

## C0471 · mobile/src/creative/NovelAiPromptEditor.tsx:43

组件：`SegmentedChoices`。声明名称：`"角色位置"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>update({useCoordinates:value==='custom'})}"
}
```

## C0472 · mobile/src/creative/NovelAiPromptEditor.tsx:47

组件：`TextAction`。声明名称：`{`角色 ${index+1}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setCollapsedCharacters(old=>({...old,[index]:!old[index]}))}"
}
```

## C0473 · mobile/src/creative/NovelAiPromptEditor.tsx:47

组件：`IconAction`。声明名称：`{`${character.enabled?'停用':'启用'}角色 ${index+1}`}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>change({enabled:!character.enabled})}"
}
```

## C0474 · mobile/src/creative/NovelAiPromptEditor.tsx:47

组件：`IconAction`。声明名称：`{`上移角色 ${index+1}`}`。

禁用表达式：`{!editable||index===0}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{const characters=[...input.characters];[characters[index-1],characters[index]]=[characters[index],characters[index-1]];update({characters});}}"
}
```

## C0475 · mobile/src/creative/NovelAiPromptEditor.tsx:47

组件：`IconAction`。声明名称：`{`移除角色 ${index+1}`}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({characters:input.characters.filter((_,i)=>i!==index)})}"
}
```

## C0476 · mobile/src/creative/NovelAiPromptEditor.tsx:48

组件：`SegmentedChoices`。声明名称：`{`角色 ${index+1} 提示词类型`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>setCharacterTabs(old=>({...old,[index]:value}))}"
}
```

## C0477 · mobile/src/creative/NovelAiPromptEditor.tsx:49

组件：`factory:field`。声明名称：``角色 ${index+1} 负面``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "character.negative, negative=>change({negative}), medium"
}
```

## C0478 · mobile/src/creative/NovelAiPromptEditor.tsx:49

组件：`factory:field`。声明名称：``角色 ${index+1} 提示词``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "character.prompt, prompt=>change({prompt})"
}
```

## C0479 · mobile/src/creative/NovelAiPromptEditor.tsx:50

组件：`Pressable`。声明名称：`{`角色 ${index+1} 位置画布`}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{e=>{const {locationX,locationY}=e.nativeEvent; const target=e.currentTarget; target.measure((_x,_y,width,height)=>change({x:Math.max(0,Math.min(1,locationX/width)),y:Math.max(0,Math.min(1,locationY/height))}));}}"
}
```

## C0480 · mobile/src/creative/NovelAiPromptEditor.tsx:54

组件：`NovelAiNumberField`。声明名称：`{`角色 ${index+1} ${axis}（0到1）`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{v=>{if(v!==null)change({[axis]:v});}}"
}
```

## C0481 · mobile/src/creative/NovelAiPromptEditor.tsx:62

组件：`TextInput`。声明名称：`{`片段 ${index+1} 名称`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{name=>update({chunks:input.chunks.map((c,i)=>i === index ? {...c,name} : c)})}"
}
```

## C0482 · mobile/src/creative/NovelAiPromptEditor.tsx:63

组件：`factory:field`。声明名称：``片段 ${index+1} 内容``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "chunk.text, text=>update({chunks:input.chunks.map((c,i)=>i === index ? {...c,text} : c)})"
}
```

## C0483 · mobile/src/creative/NovelAiPromptEditor.tsx:64

组件：`TextAction`。声明名称：`{`插入${chunk.name}`}`。

禁用表达式：`{!editable || !chunk.text.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{update({prompt:[input.prompt,chunk.text].filter(Boolean).join(', ')}); setTab('prompt');}}"
}
```

## C0484 · mobile/src/creative/NovelAiPromptEditor.tsx:64

组件：`TextAction`。声明名称：`{`移除片段 ${index+1}`}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({chunks:input.chunks.filter((_,i)=>i !== index)})}"
}
```

## C0485 · mobile/src/creative/NovelAiPromptEditor.tsx:65

组件：`TextAction`。声明名称：`"新建片段"`。

禁用表达式：`{!editable || input.chunks.length>=50}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({chunks:[...input.chunks,{name:`片段 ${input.chunks.length+1}`,text:''}]})}"
}
```

## C0486 · mobile/src/creative/NovelAiPromptEditor.tsx:66

组件：`TextAction`。声明名称：`{expanded ? '收起最终提示词' : '查看最终提示词'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(!expanded)}"
}
```

## C0487 · mobile/src/creative/NovelAiPromptEditor.tsx:69

组件：`InlineWorkbenchPanel`。声明名称：`"画面编辑"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0488 · mobile/src/creative/NovelAiPromptEditor.tsx:69

组件：`ParameterSheet`。声明名称：`"画面编辑"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0489 · mobile/src/creative/NovelAiRangeField.tsx:14

组件：`NovelAiNumberField`。声明名称：`{horizontal?label:`${label}（${min}–${max}）`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{n => { if (n !== null) onChange(clamp(n)); }}"
}
```

## C0490 · mobile/src/creative/NovelAiSettings.tsx:14

组件：`Switch`。声明名称：`{label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onValueChange": "{onChange}"
}
```

## C0491 · mobile/src/creative/NovelAiSettings.tsx:22

组件：`NovelAiRangeField`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>update({[key]:value})}"
}
```

## C0492 · mobile/src/creative/NovelAiSettings.tsx:24

组件：`NovelAiNumberField`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{if(value!==null)update({[key]:value});}}"
}
```

## C0493 · mobile/src/creative/NovelAiSettings.tsx:26

组件：`TextAction`。声明名称：`{novelAiModelName(input.model)}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setModelOpen(!modelOpen)}"
}
```

## C0494 · mobile/src/creative/NovelAiSettings.tsx:27

组件：`SegmentedChoices`。声明名称：`"图片模型"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onChange": "{model => {if(model.startsWith('nai-diffusion-4') && input.characters.length>6){Alert.alert('V4.5 最多支持 6 个角色','请先在角色页减少角色，再切换模型。');return;}const e=input.enhancement,scales=e?enhanceScales(e.sourceWidth,e.sourceHeight,model):[];if(e && !scales.length){Alert.alert('当前底图不支持此模型的增强倍率','请保留当前模型，或重新选择其他底图。');return;}setModelOpen(false);update({model,effort:model === 'nai-diffusion-5-full' ? input.effort : 'high',noiseSchedule:'karras',transparent:model.startsWith('nai-diffusion-5') && input.transparent,enhance:model.startsWith('nai-diffusion-5') && input.enhance,...(e?enhancementPatch({...e,scale:scales.includes(e.scale)?e.scale:scales.at(-1)!}):{}),qualityPreset:!model.startsWith('nai-diffusion-5') && input.qualityPreset === 'light' ? 'standard' : input.qualityPreset});}}"
}
```

## C0495 · mobile/src/creative/NovelAiSettings.tsx:28

组件：`TextAction`。声明名称：`{{anime:'Anime',furry:'Furry',background:'背景'}[input.mode]}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setModeOpen(!modeOpen)}"
}
```

## C0496 · mobile/src/creative/NovelAiSettings.tsx:29

组件：`SegmentedChoices`。声明名称：`"画风模式"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChange": "{mode=>{update({mode});setModeOpen(false);}}"
}
```

## C0497 · mobile/src/creative/NovelAiSettings.tsx:30

组件：`SegmentedChoices`。声明名称：`"V5 Full Effort"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{effort=>update({effort})}"
}
```

## C0498 · mobile/src/creative/NovelAiSettings.tsx:33

组件：`TextAction`。声明名称：`{sizeGroup==='normal'?'标准':sizeGroup==='large'?'大尺寸':'自定义'}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setSizeOpen(!sizeOpen)}"
}
```

## C0499 · mobile/src/creative/NovelAiSettings.tsx:33

组件：`SegmentedChoices`。声明名称：`"图片比例"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{ratio=>{const [width,height]=(sizeGroup==='large'?large:normal)[['portrait','square','landscape'].indexOf(ratio)];setCustomSize(false);update({width,height});}}"
}
```

## C0500 · mobile/src/creative/NovelAiSettings.tsx:34

组件：`SegmentedChoices`。声明名称：`"尺寸预设"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChange": "{group=>{setSizeOpen(false);setCustomSize(group==='custom');if(group!=='custom'){const [width,height]=(group==='large'?large:normal)[input.width===input.height?1:input.width<input.height?0:2];update({width,height});}}}"
}
```

## C0501 · mobile/src/creative/NovelAiSettings.tsx:35

组件：`factory:field`。声明名称：`'宽度（64 的倍数）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "'width'"
}
```

## C0502 · mobile/src/creative/NovelAiSettings.tsx:35

组件：`IconAction`。声明名称：`"交换宽高"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({width:input.height,height:input.width})}"
}
```

## C0503 · mobile/src/creative/NovelAiSettings.tsx:35

组件：`factory:field`。声明名称：`'高度（64 的倍数）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "'height'"
}
```

## C0504 · mobile/src/creative/NovelAiSettings.tsx:37

组件：`SegmentedChoices`。声明名称：`"生成张数"`。

禁用表达式：`{!editable || input.enhance || Boolean(input.enhancement)}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>update({samples:Number(value)})}"
}
```

## C0505 · mobile/src/creative/NovelAiSettings.tsx:38

组件：`factory:field`。声明名称：`'变化强度（0–1）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "'strength'"
}
```

## C0506 · mobile/src/creative/NovelAiSettings.tsx:38

组件：`factory:field`。声明名称：`'额外噪声（0–1）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "'noise'"
}
```

## C0507 · mobile/src/creative/NovelAiSettings.tsx:39

组件：`TextAction`。声明名称：`"切回普通图生图"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({enhance:false})}"
}
```

## C0508 · mobile/src/creative/NovelAiSettings.tsx:43

组件：`NovelAiNumberField`。声明名称：`"图片 Seed"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U05-027。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{seed=>update({seed})}"
}
```

## C0509 · mobile/src/creative/NovelAiSettings.tsx:43

组件：`IconAction`。声明名称：`"恢复随机种子"`。

禁用表达式：`{!editable||input.seed===null}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U05-028。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update({seed:null})}"
}
```

## C0510 · mobile/src/creative/NovelAiSettings.tsx:44

组件：`TextAction`。声明名称：`{samplerNames[NOVELAI_SAMPLERS.indexOf(medium?'k_euler_ancestral':input.sampler)]}`。

禁用表达式：`{!editable || medium}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setSamplerOpen(!samplerOpen)}"
}
```

## C0511 · mobile/src/creative/NovelAiSettings.tsx:45

组件：`Pressable`。声明名称：`{samplerNames[index]}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{update({sampler});setSamplerOpen(false);}}"
}
```

## C0512 · mobile/src/creative/NovelAiSettings.tsx:46

组件：`TextAction`。声明名称：`{advanced?'收起高级设置':'高级设置'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setAdvanced(!advanced)}"
}
```

## C0513 · mobile/src/creative/NovelAiSettings.tsx:49

组件：`SegmentedChoices`。声明名称：`"图片噪声设置"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{noiseSchedule=>update({noiseSchedule})}"
}
```

## C0514 · mobile/src/creative/NovelAiSettings.tsx:51

组件：`NovelAiToggle`。声明名称：`"保留透明边缘颜色（Straight Alpha）"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{straightAlpha=>update({straightAlpha})}"
}
```

## C0515 · mobile/src/creative/NovelAiSettings.tsx:51

组件：`NovelAiToggle`。声明名称：`"自动整理引号中的画面文字"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{autoText=>update({autoText})}"
}
```

## C0516 · mobile/src/creative/NovelAiSettings.tsx:52

组件：`NovelAiNumberField`。声明名称：`"额外噪声 Seed"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{extraNoiseSeed=>update({extraNoiseSeed})}"
}
```

## C0517 · mobile/src/creative/NovelAiSettings.tsx:53

组件：`factory:field`。声明名称：`'未遮罩区域变化强度（0–1）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "'inpaintStrength'"
}
```

## C0518 · mobile/src/creative/NovelAiSettings.tsx:53

组件：`NovelAiToggle`。声明名称：`"合成回原图"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{addOriginalImage=>update({addOriginalImage})}"
}
```

## C0519 · mobile/src/creative/NovelAiSettings.tsx:56

组件：`IconAction`。声明名称：`"关闭生成设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U05-010。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0520 · mobile/src/creative/NovelAiSettings.tsx:56

组件：`ParameterSheet`。声明名称：`"生成设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-012, U05-029, U22-009。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{onClose}"
}
```

## C0521 · mobile/src/creative/NovelAiTags.tsx:24

组件：`TextInput`。声明名称：`"标签关键词"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value=>{setQuery(value);generation.current++;setTags([]);setNotice('');}}"
}
```

## C0522 · mobile/src/creative/NovelAiTags.tsx:25

组件：`TextAction`。声明名称：`{busy?'正在查找标签…':'查找官方标签'}`。

禁用表达式：`{disabled || busy || !query.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void search()}"
}
```

## C0523 · mobile/src/creative/NovelAiTags.tsx:26

组件：`TextAction`。声明名称：`{`添加标签 ${tag}`}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>onChoose(tag)}"
}
```

## C0524 · mobile/src/creative/NovelAiUsageBar.tsx:46

组件：`Pressable`。声明名称：`{summary}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>connected===false?accountSettings():setOpen(!open)}"
}
```

## C0525 · mobile/src/creative/NovelAiUsageBar.tsx:46

组件：`IconAction`。声明名称：`"刷新 NovelAI 用量"`。

禁用表达式：`{loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-008, U05-008, U22-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setRetry(value=>value+1)}"
}
```

## C0526 · mobile/src/creative/NovelAiUsageBar.tsx:52

组件：`TextAction`。声明名称：`{summary}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => connected === false ? accountSettings() : setOpen(true)}"
}
```

## C0527 · mobile/src/creative/NovelAiUsageBar.tsx:54

组件：`IconAction`。声明名称：`"刷新 NovelAI 用量"`。

禁用表达式：`{loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U04-008, U05-008, U22-005。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setRetry(value => value + 1)}"
}
```

## C0528 · mobile/src/creative/NovelAiUsageBar.tsx:56

组件：`ParameterSheet`。声明名称：`"NovelAI 用量"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setOpen(false)}"
}
```

## C0529 · mobile/src/creative/NovelAiUsageBar.tsx:67

组件：`TextAction`。声明名称：`{loading ? '正在刷新…' : '刷新用量'}`。

禁用表达式：`{loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setRetry(value => value + 1)}"
}
```

## C0530 · mobile/src/creative/NovelAiUsageBar.tsx:68

组件：`TextAction`。声明名称：`"管理 NovelAI 账号"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{accountSettings}"
}
```

## C0531 · mobile/src/creative/PdfVersionPreview.tsx:19

组件：`ListAction`。声明名称：`{open?'收起 PDF':'预览 PDF'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setOpen(!open)}"
}
```

## C0532 · mobile/src/creative/PdfVersionPreview.tsx:23

组件：`ListAction`。声明名称：`"上一页"`。

禁用表达式：`{busy||index===0}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setIndex(index-1)}"
}
```

## C0533 · mobile/src/creative/PdfVersionPreview.tsx:23

组件：`ListAction`。声明名称：`"下一页"`。

禁用表达式：`{busy||index+1>=page.pageCount}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setIndex(index+1)}"
}
```

## C0534 · mobile/src/creative/ProjectActivityPanel.tsx:26

组件：`ListAction`。声明名称：`"采用这项修改"`。

禁用表达式：`{busy||p.state!=='WAITING'}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void resolve(p.id,true)}"
}
```

## C0535 · mobile/src/creative/ProjectActivityPanel.tsx:26

组件：`ListAction`。声明名称：`"拒绝建议"`。

禁用表达式：`{busy||p.state!=='WAITING'}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void resolve(p.id,false)}"
}
```

## C0536 · mobile/src/creative/ProjectActivityPanel.tsx:32

组件：`ListAction`。声明名称：`"查看任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/creative-task/[id]',params:{id:r.jobId!}})}"
}
```

## C0537 · mobile/src/creative/ProjectActivityPanel.tsx:32

组件：`ListAction`。声明名称：`"查看草稿"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void creativeService().draft(r.draftId!).then(d=>{if(d)router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}});}).catch(()=>setError('草稿读取失败'))}"
}
```

## C0538 · mobile/src/creative/ProjectOverview.tsx:29

组件：`IconAction`。声明名称：`"编辑项目简报"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U12-008。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onEdit}"
}
```

## C0539 · mobile/src/creative/ProjectOverview.tsx:32

组件：`Pressable`。声明名称：`{project.archivedAt?'查看镜头与成果':'查看镜头与下一步'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onShots}"
}
```

## C0540 · mobile/src/creative/ProjectOverview.tsx:35

组件：`ListAction`。声明名称：`"在助手中继续"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U12-010。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/(tabs)/agent',params:{projectId:project.id}})}"
}
```

## C0541 · mobile/src/creative/ProjectOverview.tsx:38

组件：`Pressable`。声明名称：`{d.state==='EDITING'?'继续编辑':'查看进度与成果'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}})}"
}
```

## C0542 · mobile/src/creative/ProjectPlans.tsx:34

组件：`ListAction`。声明名称：`{label}`。

禁用表达式：`{busy||archived}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{fn}"
}
```

## C0543 · mobile/src/creative/ProjectPlans.tsx:57

组件：`factory:action`。声明名称：``选定 ${c.title} 并继续``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "()=>Alert.alert('选定并继续',`${planVideoSummary(card.step.input_binding_json)}。${card.plan.authorization_id?'将固定此版本为镜头图片，并在有效授权范围内提交 H3。':'将固定此版本为镜头图片。后续需授权一次 H3 生成才能继续。'}`,[{text:'取消',style:'cancel'},{text:'选定',onPress:()=>void work(async()=>{\n          await creativeFiles().verify(c.version_id);\n          await creativeService().execute({name:'plan.resolveSelection',payload:{decisionId:card.decision.id,versionId:c.version_id,expectedRevision:card.decision.revision}},`selection:${card.decision.id}:${c.version_id}`);\n        })}])"
}
```

## C0544 · mobile/src/creative/ProjectPlans.tsx:62

组件：`factory:action`。声明名称：`'授权并继续生成'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>authorize(card)"
}
```

## C0545 · mobile/src/creative/ProjectPlans.tsx:63

组件：`ListAction`。声明名称：`"查看生成任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/creative-task/[id]',params:{id:card.step.job_id!,projectId,planId:card.plan.id,stepId:card.step.id}})}"
}
```

## C0546 · mobile/src/creative/ProjectPlans.tsx:64

组件：`factory:action`。声明名称：`'取消计划'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>void work(()=>creativeService().execute({name:'plan.cancel',payload:{id:card.plan.id,expectedRevision:card.plan.revision}},createId()))"
}
```

## C0547 · mobile/src/creative/ProjectPlans.tsx:69

组件：`factory:action`。声明名称：``${shotId===s.id?'✓ ':''}${s.title}``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>{setShotId(s.id);setPrompt(s.description);}"
}
```

## C0548 · mobile/src/creative/ProjectPlans.tsx:70

组件：`TextInput`。声明名称：`"计划视频提示词"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U13-008。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setPrompt}"
}
```

## C0549 · mobile/src/creative/ProjectPlans.tsx:71

组件：`factory:action`。声明名称：`'读取项目图片候选'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U13-009。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "()=>void work(async()=>{const page=await creativeService().availableVersionPage({kind:'image',projectId});setChoices(page.items.map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`})));setChoiceNext(page.next);setSelected([]);})"
}
```

## C0550 · mobile/src/creative/ProjectPlans.tsx:72

组件：`factory:action`。声明名称：``${selected.includes(c.id)?'✓ ':''}${c.title}``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "()=>setSelected(previous=>previous.includes(c.id)?previous.filter(v=>v!==c.id):previous.length<20?[...previous,c.id]:previous)"
}
```

## C0551 · mobile/src/creative/ProjectPlans.tsx:73

组件：`factory:action`。声明名称：`'加载更多图片候选'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>void work(async()=>{const page=await creativeService().availableVersionPage({kind:'image',projectId,after:choiceNext});setChoices(old=>[...old,...page.items.filter(item=>!old.some(c=>c.id===item.version.id)).map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`}))]);setChoiceNext(page.next);})"
}
```

## C0552 · mobile/src/creative/ProjectPlans.tsx:74

组件：`factory:action`。声明名称：`'保存计划（不消费）'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U13-010。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "()=>void work(async()=>{const shot=shots.find(s=>s.id===shotId);if(!shot)throw new Error('请先选择镜头');for(const id of selected)await creativeFiles().verify(id);await creativeService().execute({name:'plan.createSelection',payload:{projectId,shotId,expectedShotRevision:shot.revision,title:`${shot.title} · 选图生成视频`,candidateVersionIds:selected,videoPrompt:prompt}},createId());setSelected([]);setChoices([]);})"
}
```

## C0553 · mobile/src/creative/ProjectShots.tsx:48

组件：`ListAction`。声明名称：`{label}`。

禁用表达式：`{busy || archived}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{callback}"
}
```

## C0554 · mobile/src/creative/ProjectShots.tsx:59

组件：`CreativeAssetPicker`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setChoosing(undefined)}",
  "onChoose": "{async v => {\r\n      await command({ name: 'shot.selectOutput', payload: { id: choosing.shot.id, expectedRevision: choosing.shot.revision, slot: choosing.slot, versionId: v.id } });\r\n      await refresh();\r\n    }}"
}
```

## C0555 · mobile/src/creative/ProjectShots.tsx:63

组件：`ListAction`。声明名称：`"全部镜头"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setFocused(undefined)}"
}
```

## C0556 · mobile/src/creative/ProjectShots.tsx:65

组件：`IconAction`。声明名称：`{expanded===shot.id?"收起镜头操作":"更多镜头操作"}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(expanded===shot.id?undefined:shot.id)}"
}
```

## C0557 · mobile/src/creative/ProjectShots.tsx:67

组件：`ListAction`。声明名称：`{shot.selected_video ? '审阅视频成果' : continuing(shot) ? continuing(shot)!.state === 'EDITING' ? '继续已有草稿' : '查看生成进度与候选' : shot.selected_image ? '制作视频' : '选择参考图'}`。

禁用表达式：`{busy || dirty || (archived && !shot.selected_video)}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => {\r\n        if (shot.selected_video) { void work(async () => { router.push({pathname:'/creative-shot/[id]',params:{id:shot.id,projectId}}); }, true); return; }\r\n        const existing = continuing(shot); if (existing) { openDraft(existing); return; }\r\n        if (!shot.selected_image) { choose(shot,'selected_image'); return; }\r\n        void work(async () => { const r=await command({name:'draft.createVideo',payload:{shotId:shot.id,projectId}});if(r.status==='completed')router.push({pathname:'/creative-draft/[id]',params:{id:r.value.draftId}}); });\r\n      }}"
}
```

## C0558 · mobile/src/creative/ProjectShots.tsx:73

组件：`ListAction`。声明名称：`"生成记录与候选"`。

禁用表达式：`{busy||dirty}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>openDraft(continuing(shot)!)}"
}
```

## C0559 · mobile/src/creative/ProjectShots.tsx:74

组件：`factory:action`。声明名称：`'制作新的参考图'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U19-010, U20-010。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => void work(async () => { const r=await command({name:'draft.createImage',payload:{projectId,shotId:shot.id}});if(r.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:r.value.draftId}}); })"
}
```

## C0560 · mobile/src/creative/ProjectShots.tsx:76

组件：`factory:action`。声明名称：`'编辑镜头'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U20-011, U60-010。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => switchEditor(() => { setError(''); setAdding(true); setEditing(shot); setTitle(shot.title); setDescription(shot.description); })"
}
```

## C0561 · mobile/src/creative/ProjectShots.tsx:77

组件：`factory:action`。声明名称：`'选定图片'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U20-012, U60-011。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => void choose(shot, 'selected_image')"
}
```

## C0562 · mobile/src/creative/ProjectShots.tsx:77

组件：`factory:action`。声明名称：`'选定视频'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U20-013, U60-012。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => void choose(shot, 'selected_video')"
}
```

## C0563 · mobile/src/creative/ProjectShots.tsx:78

组件：`factory:action`。声明名称：`'另建视频草稿'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U20-014, U60-013。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "callback": "() => void work(async () => { const result = await command({ name: 'draft.createVideo', payload: { shotId: shot.id, projectId } }); if (result.status === 'completed') router.push({ pathname: '/creative-draft/[id]', params: { id: result.value.draftId } }); })"
}
```

## C0564 · mobile/src/creative/ProjectShots.tsx:79

组件：`factory:action`。声明名称：`'上移'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => void reorder(index, -1)"
}
```

## C0565 · mobile/src/creative/ProjectShots.tsx:79

组件：`factory:action`。声明名称：`'下移'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => void reorder(index, 1)"
}
```

## C0566 · mobile/src/creative/ProjectShots.tsx:80

组件：`factory:action`。声明名称：`'移除镜头'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U20-015, U60-014。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => Alert.alert('移除镜头', '素材和版本仍保留在资产库。', [{ text: '取消', style: 'cancel' }, { text: '移除', onPress: () => void work(async () => { await command({ name: 'shot.delete', payload: { id: shot.id, expectedRevision: shot.revision } }); if (editing?.id === shot.id) { setEditing(undefined); setTitle(''); setDescription(''); } }) }])"
}
```

## C0567 · mobile/src/creative/ProjectShots.tsx:84

组件：`factory:action`。声明名称：`adding ? '取消编辑镜头' : '添加镜头'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => switchEditor(() => {setError('');setAdding(!adding);setEditing(undefined);setTitle('');setDescription('');})"
}
```

## C0568 · mobile/src/creative/ProjectShots.tsx:85

组件：`ListAction`。声明名称：`"关闭镜头编辑"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U18-001。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => switchEditor(closeEditor)}"
}
```

## C0569 · mobile/src/creative/ProjectShots.tsx:89

组件：`TextInput`。声明名称：`"镜头名称"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U18-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setTitle}"
}
```

## C0570 · mobile/src/creative/ProjectShots.tsx:91

组件：`TextInput`。声明名称：`"镜头描述"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U18-003。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setDescription}"
}
```

## C0571 · mobile/src/creative/ProjectShots.tsx:92

组件：`factory:action`。声明名称：`editing ? '保存镜头' : '创建镜头'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => void work(async () => {\r\n        await command(editing ? { name: 'shot.update', payload: { id: editing.id, expectedRevision: editing.revision, title, description, status: editing.editorial_status } } : { name: 'shot.create', payload: { projectId, title, description } });\r\n        setEditing(undefined); setTitle(''); setDescription(''); setAdding(false);\r\n      }), false"
}
```

## C0572 · mobile/src/creative/ProjectShots.tsx:96

组件：`factory:action`。声明名称：``${editing.editorial_status === status ? '✓ ' : ''}${label}``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => setEditing({ ...editing, editorial_status: status as CreativeShot['editorial_status'] })"
}
```

## C0573 · mobile/src/creative/PromptAssistSheet.tsx:23

组件：`TextAction`。声明名称：`{editing?`完成编辑${label}`:`编辑${label}`}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setEditing(!editing)}"
}
```

## C0574 · mobile/src/creative/PromptAssistSheet.tsx:24

组件：`TextAction`。声明名称：`{`采用${label}`}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onApply}"
}
```

## C0575 · mobile/src/creative/PromptAssistSheet.tsx:25

组件：`TextInput`。声明名称：`{`建议${label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{onChange}"
}
```

## C0576 · mobile/src/creative/PromptAssistSheet.tsx:27

组件：`TextAction`。声明名称：`{expanded?`收起${label}`:`展开完整${label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(!expanded)}"
}
```

## C0577 · mobile/src/creative/PromptAssistSheet.tsx:82

组件：`SuggestionField`。声明名称：`{label}`。

禁用表达式：`{disabled||busy||base!==contextKey}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{change}"
}
```

## C0578 · mobile/src/creative/PromptAssistSheet.tsx:84

组件：`factory:field`。声明名称：`'描述'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "proposal.prompt, prompt=>setProposal({...proposal,prompt}), {summary:proposal.summary,prompt:proposal.prompt}"
}
```

## C0579 · mobile/src/creative/PromptAssistSheet.tsx:85

组件：`factory:field`。声明名称：`'负面词'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "proposal.negative, negative=>setProposal({...proposal,negative}), {summary:proposal.summary,negative:proposal.negative}"
}
```

## C0580 · mobile/src/creative/PromptAssistSheet.tsx:86

组件：`factory:field`。声明名称：``角色 ${character.index+1}${key==='prompt'?'描述':'负面'}``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "character[key]!, value=>setProposal({...proposal,characters:proposal.characters!.map((c,i)=>i===index?{...c,[key]:value}:c)}), {summary:proposal.summary,characters:[{index:character.index,[key]:character[key]}]}"
}
```

## C0581 · mobile/src/creative/PromptAssistSheet.tsx:87

组件：`SuggestionField`。声明名称：`{`新增角色 ${index+1}${key==='prompt'?'描述':'负面'}`}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>setProposal({...proposal,addCharacters:proposal.addCharacters!.map((c,i)=>i===index?{...c,[key]:value}:c)})}"
}
```

## C0582 · mobile/src/creative/PromptAssistSheet.tsx:88

组件：`TextAction`。声明名称：`"采用全部修改"`。

禁用表达式：`{disabled||busy||base!==contextKey}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>apply(proposal)}"
}
```

## C0583 · mobile/src/creative/PromptAssistSheet.tsx:93

组件：`IconAction`。声明名称：`"助手模型设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U62-021。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{Keyboard.dismiss();router.push({pathname:'/settings-panel',params:{section:'assistant',requestId:createId(),surface:sessionId}});}}"
}
```

## C0584 · mobile/src/creative/PromptAssistSheet.tsx:93

组件：`IconAction`。声明名称：`"关闭提示词协作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U62-022。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0585 · mobile/src/creative/PromptAssistSheet.tsx:97

组件：`TextAction`。声明名称：`{value}`。

禁用表达式：`{!ready||busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void send(value)}"
}
```

## C0586 · mobile/src/creative/PromptAssistSheet.tsx:103

组件：`TextAction`。声明名称：`"查看修改建议"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setProposalId(message.id);setProposal(message.proposal);setBase(message.base??'');setBefore(current.current);follow.current=false;}}"
}
```

## C0587 · mobile/src/creative/PromptAssistSheet.tsx:111

组件：`TextAction`。声明名称：`"撤销上次采用"`。

禁用表达式：`{disabled||busy||undo.expected!==contextKey}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{applyPatch(undo.patch);setUndo(undefined);setNotice('已撤销上次采用。');persist([...history.current,{role:'user',content:'已撤销上次采用，请以当前草稿为准。'}]);}}"
}
```

## C0588 · mobile/src/creative/PromptAssistSheet.tsx:113

组件：`TextAction`。声明名称：`"重试保存讨论"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void writePromptSession(sessionId,history.current).then(()=>setStorageError('')).catch(()=>setStorageError('保存失败，请重试。'))}"
}
```

## C0589 · mobile/src/creative/PromptAssistSheet.tsx:116

组件：`TextAction`。声明名称：`{busy?'查看最新进展 ↓':'回到最新消息 ↓'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{userScrolling.current=false;follow.current=true;setAway(false);scroll.current?.scrollToEnd({animated:true});}}"
}
```

## C0590 · mobile/src/creative/PromptAssistSheet.tsx:117

组件：`ConversationInput`。声明名称：`"提示词修改方向"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U62-026。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{text=>{composer.current.text=text;setInstruction(text);}}"
}
```

## C0591 · mobile/src/creative/PromptAssistSheet.tsx:144

组件：`IconAction`。声明名称：`{list?'返回当前讨论':'讨论历史'}`。

禁用表达式：`{saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{Keyboard.dismiss();setList(!list);}}"
}
```

## C0592 · mobile/src/creative/PromptAssistSheet.tsx:145

组件：`IconAction`。声明名称：`"新建讨论"`。

禁用表达式：`{saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U62-020。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{Keyboard.dismiss();void choose(newDiscussion(latest.current!));}}"
}
```

## C0593 · mobile/src/creative/PromptAssistSheet.tsx:148

组件：`TextInput`。声明名称：`"搜索讨论"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setSearch}"
}
```

## C0594 · mobile/src/creative/PromptAssistSheet.tsx:150

组件：`RecordRow`。声明名称：`{item.title}`。

禁用表达式：`{saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void choose({...latest.current!,active:item.id})}"
}
```

## C0595 · mobile/src/creative/PromptAssistSheet.tsx:151

组件：`IconAction`。声明名称：`{`管理讨论：${item.title}`}`。

禁用表达式：`{saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{()=>Alert.alert('管理讨论',item.title,[{text:'取消',style:'cancel'},{text:'重命名',onPress:()=>{setRename(item.title);setRenaming(item.id);}},{text:'删除',style:'destructive',onPress:()=>{const value=latest.current!,items=value.items.filter(i=>i.id!==item.id);void choose(items.length?{items,active:value.active===item.id?items[0].id:value.active}:newDiscussion({items:[],active:''})).then(success=>success?deleteDiscussionFiles(item.id):undefined).catch(()=>setError('删除记录未完成，请重试'));}}])}"
}
```

## C0596 · mobile/src/creative/PromptAssistSheet.tsx:152

组件：`TextInput`。声明名称：`"讨论名称"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setRename}"
}
```

## C0597 · mobile/src/creative/PromptAssistSheet.tsx:152

组件：`TextAction`。声明名称：`"保存名称"`。

禁用表达式：`{!rename.trim()||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>void choose({...latest.current!,items:latest.current!.items.map(i=>i.id===item.id?{...i,title:rename.trim(),customTitle:true}:i)}).then(success=>{if(success)setRenaming(undefined);})}"
}
```

## C0598 · mobile/src/creative/PromptAssistSheet.tsx:152

组件：`TextAction`。声明名称：`"取消重命名"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setRenaming(undefined)}"
}
```

## C0599 · mobile/src/creative/PromptAssistSheet.tsx:154

组件：`TextAction`。声明名称：`"关闭提示词协作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U62-022。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{props.onClose}"
}
```

## C0600 · mobile/src/creative/ResultActionBar.tsx:9

组件：`TextAction`。声明名称：`"调整画面"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onEdit}"
}
```

## C0601 · mobile/src/creative/ResultActionBar.tsx:10

组件：`TextAction`。声明名称：`"增强 / 放大"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U52-004, U56-004。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onProcess}"
}
```

## C0602 · mobile/src/creative/ResultActionBar.tsx:12

组件：`ListAction`。声明名称：`{primaryLabel}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPrimary}"
}
```

## C0603 · mobile/src/creative/ShotOutputReview.tsx:49

组件：`IconAction`。声明名称：`"返回"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{back}"
}
```

## C0604 · mobile/src/creative/ShotOutputReview.tsx:54

组件：`TextAction`。声明名称：`{(v.id===review.shot.selected_video?'已采用 · ':'候选 · ')+(index+1)+' · v'+v.versionNo}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setSelected(v.id);setNotice('');}}"
}
```

## C0605 · mobile/src/creative/ShotOutputReview.tsx:55

组件：`TextAction`。声明名称：`"采用此版本"`。

禁用表达式：`{busy||review.archived||version.state!=='AVAILABLE'||version.id===review.shot.selected_video}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void apply()}"
}
```

## C0606 · mobile/src/creative/ShotOutputReview.tsx:55

组件：`TextAction`。声明名称：`"查看素材与版本"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/creative-asset/[id]',params:{id:version.assetId,versionId:version.id,projectId}})}"
}
```

## C0607 · mobile/src/creative/ShotOutputReview.tsx:56

组件：`TextAction`。声明名称：`"打开视频工作台与生成历史"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/creative-draft/[id]',params:{id:review.drafts[0].id}})}"
}
```

## C0608 · mobile/src/creative/ShotOutputReview.tsx:60

组件：`TextAction`。声明名称：`"返回此镜头"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void returnToProject(router,{projectId,shotId}).catch(()=>setError('项目读取失败'))}"
}
```

## C0609 · mobile/src/creative/TagCompletionProvider.tsx:36

组件：`Pressable`。声明名称：`"切换在线标签建议"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setOnline(!online)}"
}
```

## C0610 · mobile/src/creative/TagCompletionProvider.tsx:36

组件：`Pressable`。声明名称：`"本次关闭标签补全"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setEnabled(false);setItems([]);}}"
}
```

## C0611 · mobile/src/creative/TagCompletionProvider.tsx:37

组件：`Pressable`。声明名称：`{`补全标签 ${item.name}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{if(live.current!==request)return;rememberTag(item.name);request.apply(item.name);setRequest(undefined);}}"
}
```

## C0612 · mobile/src/creative/TagCompletionProvider.tsx:43

组件：`Pressable`。声明名称：`"标签补全"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>api.setEnabled(!api.enabled)}"
}
```

## C0613 · mobile/src/creative/TextAssetEditor.tsx:9

组件：`ListAction`。声明名称：`{open?'收起文本素材':'新建 Prompt 或设定文档'}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setOpen(!open)}"
}
```

## C0614 · mobile/src/creative/TextAssetEditor.tsx:11

组件：`ListAction`。声明名称：`{kind==='prompt'?'类型：Prompt（切换为设定文档）':'类型：设定文档（切换为 Prompt）'}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setKind(kind==='prompt'?'document':'prompt')}"
}
```

## C0615 · mobile/src/creative/TextAssetEditor.tsx:12

组件：`TextInput`。声明名称：`"文本资产名称"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setTitle}"
}
```

## C0616 · mobile/src/creative/TextAssetEditor.tsx:13

组件：`TextInput`。声明名称：`"文本资产内容"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setContent}"
}
```

## C0617 · mobile/src/creative/TextAssetEditor.tsx:14

组件：`ListAction`。声明名称：`"保存文本资产"`。

禁用表达式：`{busy||!title.trim()||!content}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');void saveCreativeText({title,kind,content,projectId}).then(async()=>{setTitle('');setContent('');await onSaved();}).catch(e=>setError(e.message)).finally(()=>{lock.current=false;setBusy(false);});}}"
}
```

## C0618 · mobile/src/creative/TextVersionEditor.tsx:13

组件：`ListAction`。声明名称：`"基于此版本编辑文本"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void work(async()=>setContent(await readCreativeText(version)))}"
}
```

## C0619 · mobile/src/creative/TextVersionEditor.tsx:15

组件：`TextInput`。声明名称：`"文本新版本内容"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{setContent}"
}
```

## C0620 · mobile/src/creative/TextVersionEditor.tsx:16

组件：`ListAction`。声明名称：`"保存为新版本"`。

禁用表达式：`{busy||!content}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void work(async()=>{\n        await saveCreativeText({assetId:asset.id,expectedRevision:asset.revision,title:asset.title,kind:asset.kind as 'prompt'|'document',content});\n        setContent(undefined);await onSaved();\n      })}"
}
```

## C0621 · mobile/src/creative/TextVersionEditor.tsx:20

组件：`ListAction`。声明名称：`"放弃本次编辑"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setContent(undefined)}"
}
```

## C0622 · mobile/src/creative/UpscaleDraftScreen.tsx:37

组件：`ListAction`。声明名称：`{busy?'处理中…':'超分此图片'}`。

禁用表达式：`{busy || !source}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void submit()}"
}
```

## C0623 · mobile/src/creative/UpscaleDraftScreen.tsx:38

组件：`TextAction`。声明名称：`"创作账号"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U22-002, U61-002, U62-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/settings-panel',params:{section:'accounts'}})}"
}
```

## C0624 · mobile/src/creative/UpscaleDraftScreen.tsx:38

组件：`TextAction`。声明名称：`"返回内容管理"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push('/(tabs)/assets')}"
}
```

## C0625 · mobile/src/creative/VersionComparison.tsx:29

组件：`TextAction`。声明名称：`"加载更早版本"`。

禁用表达式：`{loading}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onLoadMore}"
}
```

## C0626 · mobile/src/creative/VersionComparison.tsx:29

组件：`Pressable`。声明名称：`{`比较版本 ${v.versionNo}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { setSelected(previous => previous.includes(v.id) ? previous.filter(id => id !== v.id) : [...previous.slice(-1), v.id]); setSide('a'); }}"
}
```

## C0627 · mobile/src/creative/VersionComparison.tsx:34

组件：`SegmentedChoices`。声明名称：`"切换比较画面"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setSide}"
}
```

## C0628 · mobile/src/creative/VersionComparison.tsx:38

组件：`SettingRow`。声明名称：`"参数差异"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setDetails(!details)}"
}
```

## C0629 · mobile/src/creative/VersionComparison.tsx:42

组件：`SettingRow`。声明名称：`"技术详情"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setRaw(!raw)}"
}
```

## C0630 · mobile/src/creative/VideoCostHint.tsx:15

组件：`Pressable`。声明名称：`"视频预估费用说明"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-020, U48-022, U61-019, U63-023, U64-020。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>Alert.alert('视频预估费用',quote?`${quoteLabel(quote)}\\n${resolution} · ${String(duration)} 秒\\n按官网高峰与空闲单价给出区间，不代表最终扣款。排队与运行耗时不计入视频秒数。\\n价格更新：${new Date(quote.checkedAt).toLocaleTimeString()}`:'暂无法估价。未知或过期价格不会按免费处理，可稍后重试。')}"
}
```

## C0631 · mobile/src/creative/VideoDraftScreen.tsx:213

组件：`IconAction`。声明名称：`"返回"`。

禁用表达式：`{busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{if(!closePanel())router.canGoBack()?router.back():router.replace('/(tabs)/create');}}"
}
```

## C0632 · mobile/src/creative/VideoDraftScreen.tsx:213

组件：`IconAction`。声明名称：`"创作账号"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U22-002, U61-002, U62-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>openSheet('account')}"
}
```

## C0633 · mobile/src/creative/VideoDraftScreen.tsx:215

组件：`Pressable`。声明名称：`{tab==='create'?(pending?'准备下一次':'创作'):'生成记录'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setView(tab)}"
}
```

## C0634 · mobile/src/creative/VideoDraftScreen.tsx:216

组件：`TextAction`。声明名称：`"载入最新草稿"`。

禁用表达式：`{busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>Alert.alert('载入最新草稿','这会放弃本页尚未保存的修改。',[{text:'保留本页',style:'cancel'},{text:'载入最新',onPress:()=>void reload().catch(e=>setError(creativeError(e)))}])}"
}
```

## C0635 · mobile/src/creative/VideoDraftScreen.tsx:217

组件：`TextAction`。声明名称：`{dirty?'重试保存输入':'重新读取工作区'}`。

禁用表达式：`{busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void (dirty?save():reload()).catch(e=>setError(creativeError(e)))}"
}
```

## C0636 · mobile/src/creative/VideoDraftScreen.tsx:219

组件：`TextAction`。声明名称：`{definition?`${h3?'MiniMax H3':definition.metadata.title} · ${entries.filter(item=>!item.reason).length>1?'切换':'详情'}`:'选择视频工作流'}`。

禁用表达式：`{busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>openSheet('workflow')}"
}
```

## C0637 · mobile/src/creative/VideoDraftScreen.tsx:221

组件：`TextAction`。声明名称：`"对齐当前工作流版本"`。

禁用表达式：`{busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{const current=entries.find(item=>item.record.workflowId===draft?.workflow_id);if(current)void switchWorkflow(current);}}"
}
```

## C0638 · mobile/src/creative/VideoDraftScreen.tsx:222

组件：`TextAction`。声明名称：`"连接 AutoDL 创作账号"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-008, U48-008, U61-005, U62-005, U63-008, U64-008。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>openSheet('account')}"
}
```

## C0639 · mobile/src/creative/VideoDraftScreen.tsx:223

组件：`TextAction`。声明名称：`"撤销工作流切换"`。

禁用表达式：`{busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{const rowId=undoDraft;void creativeService().draft(rowId).then(row=>{const target=entries.find(item=>item.record.workflowId===row?.workflow_id);if(target)void switchWorkflow(target,rowId);});}}"
}
```

## C0640 · mobile/src/creative/VideoDraftScreen.tsx:224

组件：`TextAction`。声明名称：`"核查与继续创作"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>router.push({pathname:'/creative-task/[id]',params:{id:resultDraft.job_id!,returnToWorkbench:'1'}})}"
}
```

## C0641 · mobile/src/creative/VideoDraftScreen.tsx:227

组件：`TextAction`。声明名称：`"帮我写提示词"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-011, U48-013, U61-010, U62-010, U63-014, U64-011。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{Keyboard.dismiss();setSheet(undefined);setPicking(undefined);setAssist(true);}}"
}
```

## C0642 · mobile/src/creative/VideoDraftScreen.tsx:227

组件：`TextInput`。声明名称：`"视频镜头提示词"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-012, U48-014, U61-011, U62-011, U63-015, U64-012。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{value=>update(promptField,value)}"
}
```

## C0643 · mobile/src/creative/VideoDraftScreen.tsx:228

组件：`SegmentedChoices`。声明名称：`"视频方向"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{const next=resolution.slice(0,-1)+value;if(props[resolutionField]?.enum?.includes(next))update(resolutionField,next);}}"
}
```

## C0644 · mobile/src/creative/VideoDraftScreen.tsx:228

组件：`SegmentedChoices`。声明名称：`"视频清晰度"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{const next=value+resolution.slice(-1);if(props[resolutionField]?.enum?.includes(next))update(resolutionField,next);}}"
}
```

## C0645 · mobile/src/creative/VideoDraftScreen.tsx:228

组件：`Pressable`。声明名称：`"选择视频时长"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-017, U48-019, U61-016, U62-016, U63-020, U64-017。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setCustomDuration(![5,10,15].includes(Number(duration)));openSheet('duration');}}"
}
```

## C0646 · mobile/src/creative/VideoDraftScreen.tsx:228

组件：`TextAction`。声明名称：`"更多设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-018, U48-020, U61-017, U62-017, U63-021, U64-018。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>openSheet('settings')}"
}
```

## C0647 · mobile/src/creative/VideoDraftScreen.tsx:228

组件：`WorkflowForm`。声明名称：`(动态/子文本)`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{changeValues}"
}
```

## C0648 · mobile/src/creative/VideoDraftScreen.tsx:228

组件：`TextAction`。声明名称：`"更多设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-018, U48-020, U61-017, U62-017, U63-021, U64-018。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>openSheet('settings')}"
}
```

## C0649 · mobile/src/creative/VideoDraftScreen.tsx:229

组件：`TextAction`。声明名称：`"撤销提示词修改"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{setInput(undo);setUndo(undefined);}}"
}
```

## C0650 · mobile/src/creative/VideoDraftScreen.tsx:232

组件：`PromptAssistSheet`。声明名称：`(动态/子文本)`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>{Keyboard.dismiss();setAssist(false);}}"
}
```

## C0651 · mobile/src/creative/VideoDraftScreen.tsx:234

组件：`Pressable`。声明名称：`{pending?'准备下一次':'调整后再生成'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setView('create')}"
}
```

## C0652 · mobile/src/creative/VideoDraftScreen.tsx:234

组件：`Pressable`。声明名称：`"生成视频"`。

禁用表达式：`{!editable||busy||saving||conflict||!accountReady||requiredPrompt&&!prompt.trim()}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U03-019, U48-021, U61-018, U63-022, U64-019。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{()=>void submit()}"
}
```

## C0653 · mobile/src/creative/VideoDraftScreen.tsx:237

组件：`ParameterSheet`。声明名称：`"视频工作流"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setSheet(undefined)}"
}
```

## C0654 · mobile/src/creative/VideoDraftScreen.tsx:237

组件：`RecordRow`。声明名称：`{item.definition.metadata.title}`。

禁用表达式：`{Boolean(item.reason)||busy||saving}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{if(item.record.workflowId===draft?.workflow_id)setSheet(undefined);else void switchWorkflow(item);}}"
}
```

## C0655 · mobile/src/creative/VideoDraftScreen.tsx:237

组件：`IconAction`。声明名称：`{`工作流详情：${item.definition.metadata.title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setWorkflowDetail(workflowDetail===item.record.workflowId?undefined:item.record.workflowId)}"
}
```

## C0656 · mobile/src/creative/VideoDraftScreen.tsx:237

组件：`TextAction`。声明名称：`"管理与同步工作流"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{router.push({pathname:'/settings-panel',params:{section:'workflows',requestId:createId(),surface:'video-workflow'}});}}"
}
```

## C0657 · mobile/src/creative/VideoDraftScreen.tsx:238

组件：`ParameterSheet`。声明名称：`{sheet==='orientation'?'画面方向':'清晰度'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setSheet(undefined)}"
}
```

## C0658 · mobile/src/creative/VideoDraftScreen.tsx:238

组件：`SegmentedChoices`。声明名称：`{sheet==='orientation'?'视频方向':'视频清晰度'}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{const next=sheet==='orientation'?`${resolution.slice(0,-1)}${value}`:`${value}${resolution.slice(-1)}`;if(props[resolutionField]?.enum?.includes(next)){update(resolutionField,next);setSheet(undefined);}}}"
}
```

## C0659 · mobile/src/creative/VideoDraftScreen.tsx:239

组件：`ParameterSheet`。声明名称：`"视频时长"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setSheet(undefined)}"
}
```

## C0660 · mobile/src/creative/VideoDraftScreen.tsx:239

组件：`SegmentedChoices`。声明名称：`"常用视频时长"`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{setCustomDuration(value==='custom');if(value!=='custom'){update(durationField,Number(value));setSheet(undefined);}}}"
}
```

## C0661 · mobile/src/creative/VideoDraftScreen.tsx:239

组件：`NovelAiNumberField`。声明名称：`"视频时长"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{value=>{if(value!==null)update(durationField,value);}}"
}
```

## C0662 · mobile/src/creative/VideoDraftScreen.tsx:240

组件：`ParameterSheet`。声明名称：`"更多视频设置"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setSheet(undefined)}"
}
```

## C0663 · mobile/src/creative/VideoDraftScreen.tsx:240

组件：`WorkflowForm`。声明名称：`(动态/子文本)`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{changeValues}"
}
```

## C0664 · mobile/src/creative/VideoDraftScreen.tsx:242

组件：`CreativeAssetPicker`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setPicking(undefined)}",
  "onChoose": "{version=>replaceReferences(picking,[...references.filter(ref=>(ref.slot==='audio')===(picking==='audio')).map(ref=>ref.version_id).filter(id=>id!==version.id),version.id])}"
}
```

## C0665 · mobile/src/creative/VideoDraftScreen.tsx:243

组件：`ImagePreview`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setPreview(undefined)}"
}
```

## C0666 · mobile/src/creative/VideoGenerationHistory.tsx:72

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setFilter(value)}"
}
```

## C0667 · mobile/src/creative/VideoGenerationHistory.tsx:74

组件：`TextAction`。声明名称：`{loadingMore?"正在加载…":"加载更早记录"}`。

禁用表达式：`{loadingMore}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>loadPage.current()}"
}
```

## C0668 · mobile/src/creative/VideoGenerationHistory.tsx:76

组件：`Pressable`。声明名称：`{`查看第 ${ordinal} 轮视频`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{choose(item.job.id);if(width<840)setExpanded(false);}}"
}
```

## C0669 · mobile/src/creative/VideoGenerationHistory.tsx:84

组件：`TextAction`。声明名称：`"查看最新一轮"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>choose(rounds[0].job.id)}"
}
```

## C0670 · mobile/src/creative/VideoGenerationHistory.tsx:85

组件：`TextAction`。声明名称：`{expanded?'收起记录':`全部记录 · ${rounds.length}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setExpanded(!expanded)}"
}
```

## C0671 · mobile/src/creative/VideoGenerationHistory.tsx:95

组件：`ParameterSheet`。声明名称：`"生成记录"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onClose": "{()=>setExpanded(false)}"
}
```

## C0672 · mobile/src/creative/VideoReferenceCards.tsx:18

组件：`Pressable`。声明名称：`{`预览参考图 ${index+1}`}`。

禁用表达式：`{!available}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>onPreview(`${FileSystem.documentDirectory}${row.relative_path}`)}"
}
```

## C0673 · mobile/src/creative/VideoReferenceCards.tsx:22

组件：`TextAction`。声明名称：`{listening===row.version_id?'收起试听':`试听音频 ${index+1}`}`。

禁用表达式：`{!available}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setListening(listening===row.version_id?undefined:row.version_id)}"
}
```

## C0674 · mobile/src/creative/VideoReferenceCards.tsx:23

组件：`IconAction`。声明名称：`{`管理${label} ${index+1}`}`。

禁用表达式：`{!editable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>setManaged(managed===row.version_id?undefined:row.version_id)}"
}
```

## C0675 · mobile/src/creative/VideoReferenceCards.tsx:25

组件：`TextAction`。声明名称：`"向前移动"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>move(index,-1)}"
}
```

## C0676 · mobile/src/creative/VideoReferenceCards.tsx:25

组件：`TextAction`。声明名称：`"向后移动"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>move(index,1)}"
}
```

## C0677 · mobile/src/creative/VideoReferenceCards.tsx:25

组件：`TextAction`。声明名称：`"移除引用"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U63-012。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>{if(listening===row.version_id)setListening(undefined);setManaged(undefined);onReplace(rows.filter(r=>r.version_id!==row.version_id).map(r=>r.version_id));}}"
}
```

## C0678 · mobile/src/creative/VideoReferenceCards.tsx:29

组件：`TextAction`。声明名称：`{`添加${label}`}`。

禁用表达式：`{!editable||rows.length>=maximum}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onAdd}"
}
```

## C0679 · mobile/src/creative/WeightedPromptInput.tsx:53

组件：`TextInput`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onChangeText": "{text=>{if(pending.current?.text!==text){pending.current=undefined;accepted.current=undefined;setReplacement(undefined);}props.onChangeText?.(text);}}",
  "onSelectionChange": "{event=>{\n      const next=event.nativeEvent.selection,expected=pending.current;\n      if(expected){if(next.start!==expected.caret||next.end!==expected.caret)return;pending.current=undefined;}\n      setReplacement(undefined);setSelection(next);props.onSelectionChange?.(event);\n    }}"
}
```

## C0680 · mobile/src/creative/WorkbenchScope.tsx:18

组件：`Pressable`。声明名称：`{`返回所属项目：${label}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>void returnToProject(router,{projectId:draft.project_id!,shotId:draft.shot_id??undefined}).catch(()=>Alert.alert('项目读取失败','请稍后重试'))}"
}
```

## C0681 · mobile/src/creative/WorkbenchUI.tsx:23

组件：`IconAction`。声明名称：`{`关闭${title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0682 · mobile/src/creative/WorkbenchUI.tsx:30

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0683 · mobile/src/creative/WorkbenchUI.tsx:37

组件：`Pressable`。声明名称：`{value ? `${label}，${value}` : label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0684 · mobile/src/creative/WorkbenchUI.tsx:46

组件：`Pressable`。声明名称：`{option.label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onChange(option.id)}"
}
```

## C0685 · mobile/src/creative/WorkbenchUI.tsx:55

组件：`Pressable`。声明名称：`{`关闭${title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0686 · mobile/src/creative/WorkbenchUI.tsx:57

组件：`TextAction`。声明名称：`"完成"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U07-002, U28-002, U43-002, U52-002, U55-002, U56-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0687 · mobile/src/creative/WorkbenchUI.tsx:72

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0688 · mobile/src/creative/WorkbenchUI.tsx:97

组件：`IconAction`。声明名称：`{`关闭${title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onClose}"
}
```

## C0689 · mobile/src/media/GalleryCard.tsx:12

组件：`Pressable`。声明名称：`{`打开视频 ${asset.title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}",
  "onLongPress": "{onLongPress}"
}
```

## C0690 · mobile/src/media/VideoPlayer.tsx:145

组件：`Pressable`。声明名称：`"重新下载视频"`。

禁用表达式：`{recovering}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void onInvalidSource(source)}"
}
```

## C0691 · mobile/src/media/VideoPlayer.tsx:146

组件：`Pressable`。声明名称：`"重试播放"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{retryPlayback}"
}
```

## C0692 · mobile/src/media/VideoPlayer.tsx:147

组件：`Pressable`。声明名称：`"使用外部播放器打开"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => void openExternalVideo(source).catch(() => Alert.alert('无法打开', '没有可用的外部播放器，或原件已不可访问'))}"
}
```

## C0693 · mobile/src/navigation/PrimaryNavigation.tsx:25

组件：`Pressable`。声明名称：`{item.label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{\n   if(current===item.id)return;\n   const route=state.routes.find(r=>r.name===item.id);if(!route)return;\n   const proceed=()=>{const event=navigation.emit({type:'tabPress',target:route.key,canPreventDefault:true});if(!event.defaultPrevented)navigation.navigate(item.id);};\n   if(context)context.leave(current,proceed);else proceed();\n  }}"
}
```

## C0694 · mobile/src/settings/DataManagementPanel.tsx:23

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{work}"
}
```

## C0695 · mobile/src/settings/DataManagementPanel.tsx:25

组件：`factory:action`。声明名称：`'扫描可清理空间'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-006。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "()=>{void import('../storage/resourceCleanupRuntime').then(m=>m.inspectResourceCleanup(getDatabase())).then(setCleanup).catch(()=>setNotice('扫描失败，未删除任何文件'));}"
}
```

## C0696 · mobile/src/settings/DataManagementPanel.tsx:26

组件：`factory:action`。声明名称：`'清理并重新启动'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "()=>request({kind:'resource-cleanup'})"
}
```

## C0697 · mobile/src/settings/DataManagementPanel.tsx:27

组件：`factory:action`。声明名称：`'立即备份数据库'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-007。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => { try { createUserDatabaseBackup(getDatabase()); setNames(listFullDatabaseBackups()); setNotice('数据库备份已创建'); } catch { setNotice('备份失败，原数据保留'); } }"
}
```

## C0698 · mobile/src/settings/DataManagementPanel.tsx:28

组件：`factory:action`。声明名称：`'查看可恢复备份'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-008。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => { try { const backups = listFullDatabaseBackups(); setNames(backups); setNotice(backups.length ? '选择要恢复的备份' : '暂无完整备份'); } catch { setNotice('无法读取备份列表'); } }"
}
```

## C0699 · mobile/src/settings/DataManagementPanel.tsx:29

组件：`factory:action`。声明名称：`name`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => request({ kind: 'restore', backup: name })"
}
```

## C0700 · mobile/src/settings/DataManagementPanel.tsx:30

组件：`factory:action`。声明名称：`'备份数据库与创作文件'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-009。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => request({ kind: 'creative-backup', id: createId() })"
}
```

## C0701 · mobile/src/settings/DataManagementPanel.tsx:31

组件：`factory:action`。声明名称：`'查看含文件的备份'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-010。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "callback": "() => { void import('../storage/creativeBackupRuntime').then(m => m.listCreativeFileBackups()).then(items => { setFileBackups(items); setNotice(items.length ? '仅支持当前安装目录恢复；冲突文件会阻止恢复并保留现有数据' : '暂无含文件的备份'); }).catch(() => setNotice('读取备份失败')); }"
}
```

## C0702 · mobile/src/settings/DataManagementPanel.tsx:32

组件：`factory:action`。声明名称：``${new Date(item.createdAt).toLocaleString()} · ${item.fileCount} 个文件``。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => request({ kind: 'creative-restore', id: item.id })"
}
```

## C0703 · mobile/src/settings/DataManagementPanel.tsx:33

组件：`factory:action`。声明名称：`'清除应用数据'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-011。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "callback": "() => request({ kind: 'reset' })"
}
```

## C0704 · mobile/src/settings/DataManagementPanel.tsx:34

组件：`Pressable`。声明名称：`"重试退出完成数据维护"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void exitForMaintenance()}"
}
```

## C0705 · mobile/src/settings/DisplayDiagnostics.tsx:12

组件：`Switch`。声明名称：`"显示诊断信息"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U37-002。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onValueChange": "{setEnabled}"
}
```

## C0706 · mobile/src/settings/WorkflowSyncPanel.tsx:32

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{sync}"
}
```

## C0707 · mobile/src/storage/DatabaseRecoveryScreen.tsx:58

组件：`Pressable`。声明名称：`"复制诊断"`。

禁用表达式：`{restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => Clipboard.setStringAsync(diagnostic)}"
}
```

## C0708 · mobile/src/storage/DatabaseRecoveryScreen.tsx:61

组件：`Pressable`。声明名称：`"分享诊断"`。

禁用表达式：`{restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => Share.share({ message: `AutoDL-H3 database recovery: ${diagnostic}` })}"
}
```

## C0709 · mobile/src/storage/DatabaseRecoveryScreen.tsx:66

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setSelectedBackup(name)}"
}
```

## C0710 · mobile/src/storage/DatabaseRecoveryScreen.tsx:68

组件：`Pressable`。声明名称：`"恢复选中的完整备份"`。

禁用表达式：`{restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{confirmRestore}"
}
```

## C0711 · mobile/src/storage/DatabaseRecoveryScreen.tsx:78

组件：`Pressable`。声明名称：`"清除应用数据"`。

禁用表达式：`{restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U29-011。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{confirmReset}"
}
```

## C0712 · mobile/src/storage/DatabaseRecoveryScreen.tsx:83

组件：`Pressable`。声明名称：`"退出应用"`。

禁用表达式：`{restoring}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => BackHandler.exitApp()}"
}
```

## C0713 · mobile/src/tasks/DownloadNetworkHelp.tsx:13

组件：`ListAction`。声明名称：`"下载网络排查"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setVisible(true)}"
}
```

## C0714 · mobile/src/tasks/DownloadNetworkHelp.tsx:23

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => open('https://wiki.metacubex.one/config/dns/')}"
}
```

## C0715 · mobile/src/tasks/DownloadNetworkHelp.tsx:24

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => open('https://sing-box.sagernet.org/configuration/dns/server/fakeip/')}"
}
```

## C0716 · mobile/src/tasks/DownloadNetworkHelp.tsx:26

组件：`ListAction`。声明名称：`"关闭排查说明"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setVisible(false)}"
}
```

## C0717 · mobile/src/tasks/TaskCardRow.tsx:29

组件：`Pressable`。声明名称：`{terminalSuccess?'查看创作结果':'查看任务详情'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>onOpen(item.id)}"
}
```

## C0718 · mobile/src/tasks/TaskCardRow.tsx:31

组件：`Pressable`。声明名称：`{expanded?'收起任务操作':'展开任务操作'}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{toggle}"
}
```

## C0719 · mobile/src/tasks/TaskCardRow.tsx:32

组件：`Pressable`。声明名称：`"处理失败任务"`。

禁用表达式：`{mediaBusy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>item.downloadState==='DOWNLOAD_FAILED'?onOpen(item.id):onExport(item)}"
}
```

## C0720 · mobile/src/tasks/TaskCardRow.tsx:36

组件：`Pressable`。声明名称：`"查看创作结果"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => onOpen(item.id)}"
}
```

## C0721 · mobile/src/tasks/TaskCardRow.tsx:36

组件：`Pressable`。声明名称：`{item.downloadState === 'DOWNLOAD_FAILED' ? '重试下载' : '下载视频'}`。

禁用表达式：`{mediaBusy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void onDownload(item)}"
}
```

## C0722 · mobile/src/tasks/TaskCardRow.tsx:36

组件：`Pressable`。声明名称：`{exportActionLabel}`。

禁用表达式：`{mediaBusy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => void onExport(item)}"
}
```

## C0723 · mobile/src/tasks/TaskCardRow.tsx:36

组件：`Pressable`。声明名称：`"取消本地排队"`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => Alert.alert('取消本地排队？', '仅尚未提交到服务端的任务可以取消。', [{ text: '保留' }, { text: '确认取消', onPress: () => onCancel(item.id) }])}"
}
```

## C0724 · mobile/src/tasks/TaskCardRow.tsx:38

组件：`Pressable`。声明名称：`{archived ? '恢复任务' : '归档任务'}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => archived ? onArchive(item.id, false) : Alert.alert('归档任务？', '任务将移到已归档，后台继续追踪和收取结果；可随时恢复。', [{ text: '取消' }, { text: '归档', onPress: () => onArchive(item.id, true) }])}"
}
```

## C0725 · mobile/src/tasks/TaskCardRow.tsx:39

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。

```json
{
  "onPress": "{() => onCancelMedia(item.id, item.downloadState === 'ENQUEUED' || item.downloadState === 'DOWNLOADING' ? 'ARTIFACT_DOWNLOAD' : 'EXPORT')}"
}
```

## C0726 · mobile/src/tasks/TaskCardRow.tsx:39

组件：`Pressable`。声明名称：`"查看任务详情"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => onOpen(item.id)}"
}
```

## C0727 · mobile/src/tasks/TaskCardRow.tsx:39

组件：`Pressable`。声明名称：`"移除任务记录"`。

禁用表达式：`{removeDisabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。

```json
{
  "onPress": "{() => Alert.alert('移除任务', '从任务列表移除此记录。关联的创作草稿、成果与消费记录会保留；未关联创作的任务会清理应用内副本。系统相册内容会保留。', [{ text: '取消' }, { text: '移除', style: 'destructive', onPress: () => void onRemove(item.id) }])}"
}
```

## C0728 · mobile/src/tasks/TaskInboxButton.tsx:28

组件：`Pressable`。声明名称：`{`打开任务中心${count?`，${count} 个任务进行中`:''}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{void (async()=>{if(beforeOpen&&!await beforeOpen())return;Keyboard.dismiss();setOpen(true);anchor.current?.measureInWindow((_x,y,_w,h)=>{setTop(y+h+6);setOpen(true);});})();}}"
}
```

## C0729 · mobile/src/tasks/TaskInboxButton.tsx:30

组件：`Pressable`。声明名称：`"关闭最近任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U30-001。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setOpen(false)}"
}
```

## C0730 · mobile/src/tasks/TaskInboxButton.tsx:30

组件：`IconAction`。声明名称：`"收起最近任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U30-002。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>setOpen(false)}"
}
```

## C0731 · mobile/src/tasks/TaskInboxButton.tsx:35

组件：`Pressable`。声明名称：`{`查看任务 ${row.id}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);router.push({pathname:row.creative?'/creative-task/[id]':'/video/[id]',params:{id:row.id}});}}"
}
```

## C0732 · mobile/src/tasks/TaskInboxButton.tsx:36

组件：`TextAction`。声明名称：`"全部任务"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U30-003。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{setOpen(false);router.navigate('/(tabs)/tasks');}}"
}
```

## C0733 · mobile/src/tasks/TaskRecoveryNotice.tsx:21

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`{busy}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0734 · mobile/src/tasks/TaskRecoveryNotice.tsx:25

组件：`factory:action`。声明名称：`'核查原任务'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "check"
}
```

## C0735 · mobile/src/tasks/TaskRecoveryNotice.tsx:26

组件：`factory:action`。声明名称：`'管理创作账号'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "onSettings"
}
```

## C0736 · mobile/src/tasks/TaskRecoveryNotice.tsx:27

组件：`factory:action`。声明名称：`'刷新同步'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "onRefresh, auth"
}
```

## C0737 · mobile/src/tasks/TaskRecoveryNotice.tsx:28

组件：`factory:action`。声明名称：`'核查与继续创作'`。

禁用表达式：`(由工厂/调用上下文决定)`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "callback": "() => onReplace(item.id), true"
}
```

## C0738 · mobile/src/ui/DraggableSheet.tsx:129

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{close}"
}
```

## C0739 · mobile/src/ui/DraggableSheet.tsx:137

组件：`Pressable`。声明名称：`{`关闭${title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{close}"
}
```

## C0740 · mobile/src/ui/HoldToCompare.tsx:10

组件：`Pressable`。声明名称：`"按住查看原图"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPressIn": "{()=>onChange(true)}",
  "onPressOut": "{()=>onChange(false)}"
}
```

## C0741 · mobile/src/ui/ImageOverlayAction.tsx:7

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0742 · mobile/src/ui/ImagePreview.tsx:75

组件：`ImageOverlayAction`。声明名称：`"还原图片缩放"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>update(1)}"
}
```

## C0743 · mobile/src/ui/ImagePreview.tsx:76

组件：`ImageOverlayAction`。声明名称：`"关闭图片预览"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{close}"
}
```

## C0744 · mobile/src/ui/ImagePreview.tsx:94

组件：`HoldToCompare`。声明名称：`(动态/子文本)`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChange": "{setOriginal}"
}
```

## C0745 · mobile/src/ui/ListPageUI.tsx:11

组件：`Pressable`。声明名称：`{label}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0746 · mobile/src/ui/ListPageUI.tsx:22

组件：`Pressable`。声明名称：`{option.label}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onChange(option.id)}"
}
```

## C0747 · mobile/src/ui/RecordRow.tsx:12

组件：`Pressable`。声明名称：`{title}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{onPress}"
}
```

## C0748 · mobile/src/ui/WorkbenchModeSwitcher.tsx:22

组件：`Pressable`。声明名称：`{`工作模式：${mode==='create'?'手工':'Agent'}`}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{open}"
}
```

## C0749 · mobile/src/ui/WorkbenchModeSwitcher.tsx:26

组件：`Pressable`。声明名称：`"关闭模式选择"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{close}"
}
```

## C0750 · mobile/src/ui/WorkbenchModeSwitcher.tsx:28

组件：`Pressable`。声明名称：`{`${item.title}工作模式`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{()=>{close();if(mode!==item.id)onSelect(item.id);}}"
}
```

## C0751 · mobile/src/ui/ZoomableImage.tsx:16

组件：`ImageOverlayAction`。声明名称：`"还原预览缩放"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{()=>zoom.update(1)}"
}
```

## C0752 · mobile/src/ui/ZoomableImage.tsx:17

组件：`ImageOverlayAction`。声明名称：`"全屏查看图片"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：U50-004, U53-004, U54-004。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{onOpen}"
}
```

## C0753 · mobile/src/workflows/renderer/renderers.tsx:68

组件：`Pressable`。声明名称：`{`减少${ctx.label}`}`。

禁用表达式：`{ctx.disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setValue(current - 1)}"
}
```

## C0754 · mobile/src/workflows/renderer/renderers.tsx:70

组件：`Pressable`。声明名称：`{`增加${ctx.label}`}`。

禁用表达式：`{ctx.disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => setValue(current + 1)}"
}
```

## C0755 · mobile/src/workflows/renderer/renderers.tsx:83

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{ctx.disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => ctx.onChange(value)}"
}
```

## C0756 · mobile/src/workflows/renderer/renderers.tsx:93

组件：`Pressable`。声明名称：`(动态/子文本)`。

禁用表达式：`{ctx.disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => ctx.onChange(!enabled)}"
}
```

## C0757 · mobile/src/workflows/renderer/WorkflowParameterFields.tsx:17

组件：`TextInput`。声明名称：`{String(schema.title ?? labels[target])}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onChangeText": "{text => onChange(target, text)}"
}
```

## C0758 · mobile/src/workflows/renderer/WorkflowParameterFields.tsx:24

组件：`Pressable`。声明名称：`{String(value)}`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onChange(target, value)}"
}
```

## C0759 · mobile/src/workflows/renderer/WorkflowParameterFields.tsx:29

组件：`Pressable`。声明名称：`"使用随机种子"`。

禁用表达式：`{disabled}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。

```json
{
  "onPress": "{() => onChange(target, '')}"
}
```

## C0760 · mobile/src/workflows/renderer/WorkflowSelector.tsx:19

组件：`Pressable`。声明名称：`"选择生成工作流"`。

禁用表达式：`{unavailable}`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => setOpen(value => !value)}"
}
```

## C0761 · mobile/src/workflows/renderer/WorkflowSelector.tsx:27

组件：`DraggableBottomSheet`。声明名称：`"选择生成工作流"`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onClose": "{() => setOpen(false)}"
}
```

## C0762 · mobile/src/workflows/renderer/WorkflowSelector.tsx:31

组件：`Pressable`。声明名称：`{`选择工作流 ${definition.metadata.title}`}`。

禁用表达式：`未在此声明；可能由宿主决定`。

证据状态：**源码已定位；未作该声明实机通过断言**。

同名UI候选：未匹配；可能未进入此条件分支或名称动态。

跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。

```json
{
  "onPress": "{() => { setOpen(false); if (!checked) onSelect(definition.id); }}"
}
```
