# Prompt 助手 @图片提及命名重复问题审查

> 审查时间：2026-09-03
> 审查对象：Prompt 助手页面 `@` 引用图片附件功能的命名逻辑（`mobile/src/agent/assistantImagePicker.ts`、`mobile/src/agent/imageMentions.ts`、`mobile/src/agent/PromptAssistantUi.tsx`）。
> 现象：上传图片附件后，第 1 张命名为 `图片1`，第 2 张为 `图片2`，第 3 张又是 `图片2`，出现重名。
> 审查方法：从 UI 命名入口（`assignImageDisplayNames`）反向追踪附件 ID 生成与缓存链路；核对相册/文件两条上传路径的 ID 唯一性；排查 ID 冲突对删除、渲染、提及、发送、历史展示的连带影响。

## 1. 总体结论

问题根因明确：**相册多选路径的附件 ID 生成器 `gallery-${Date.now()}` 在同一次多选批次内必然产生相同 ID，而展示名分配逻辑按 ID 缓存命名，缓存命中导致重名**。"从文件选择"路径（CopilotKit 内部用 uuid v4）不受影响，仅"从相册选择"路径有此缺陷。

## 2. 根因链条（3 处叠加）

### 2.1 ID 生成缺陷（源头）

`mobile/src/agent/assistantImagePicker.ts:37`：

```ts
createId: () => `gallery-${Date.now()}`
```

同文件第 42-45 行对多选结果批量构建附件：

```ts
return Promise.all(files.map(async (file) => ({
  id: resolved.createId(), ...        // ← 先同步执行
  source: await resolved.read(file),  // ← 后才 await
})));
```

对象字面量按属性顺序求值：每个 async 回调在**任何 `await` 挂起之前**同步执行完 `createId()`。`files.map` 逐项同步调用回调，因此 N 张图（`imagePicker.ts:8` 确认 `allowsMultipleSelection: true`，多选是常态路径）的 N 次 `Date.now()` 全部落在同一毫秒内 → **本批所有图片共享同一个 ID**（如 `gallery-1789000000000`）。

### 2.2 命名按 ID 缓存（放大点）

`PromptAssistantUi.tsx:218-223` 调用 `imageMentions.ts:27-39` 的 `assignImageDisplayNames`：

```ts
const displayName = names.get(attachment.id) ?? `图片${next++}`;
names.set(attachment.id, displayName);
```

复现用户报告的现象（`图片1 / 图片2 / 图片2`）：

1. 第 1 张单独选一批：新 ID，缓存 miss → `图片1`，写入 `attachmentNames` 缓存，计数器推进到 2。
2. 第 2、3 张一次多选一批：两张获得**相同 ID**。第 2 张缓存 miss → `图片2` 并写入缓存；第 3 张 **ID 命中缓存** → 又是 `图片2`。

三张一次多选时若恰好跨毫秒边界，同样产生 `图片1/图片2/图片2` 序列。

### 2.3 设计假设被打破（防御缺失）

`assignImageDisplayNames` 隐含假设附件 ID 全局唯一，但 `createId` 生成器无法保证这一点，且命名层没有任何"缓存命中但对应不同附件实例"的防御或校验。

## 3. 对照组：文件路径无此问题

`@copilotkit/react-native/src/hooks/use-attachments.ts:162` 对每个文件独立调用 `randomUUID()`（uuid v4，`@copilotkit/shared/src/utils/random-id.ts:7`），同批多文件 ID 互不相同。缺陷仅存在于自建的相册路径。

## 4. 同一根因暴露的其他问题

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 1 | 删除一张误删多张：按 `id !== id` 过滤，同 ID 的碰撞图片被一起移除 | `PromptAssistantUi.tsx:352` | 数据丢失 |
| 2 | React 重复 key：引用面板与附件条均以 `key={attachment.id}` 渲染，碰撞时 reconciliation 异常 | `PromptAssistantUi.tsx:641, 698` | 缩略图错乱、渲染警告 |
| 3 | @提及无法区分同 ID 图片：选提及（`find` 首个匹配）与正文 token 解析（label 首个匹配）都可能绑到另一张图 | `PromptAssistantUi.tsx:241, 872` | 引用缩略图/实际发送图与用户意图不符 |
| 4 | 发送时元数据错绑：`composerAttachments.find(id ===)` 只取同 ID 第一项的 displayName | `PromptAssistantUi.tsx:165` | 附件展示名元数据失真 |
| 5 | 同款隐患：相册文件名 fallback 也是 `image-${Date.now()}.jpg`，同批缺文件名的图重名 | `imagePicker.ts:16` | 仅显示问题 |
| 6 | 历史显示名错位：发送后按消息内序号重编 `图片1..N`（`agentPresentation.ts:73`），碰撞时正文两个 `@图片2` 在历史附件条显示为 `图片2`/`图片3`；且每条消息编号从 1 重启，跨消息的 `@图片1` 指向不同图片 | `agentPresentation.ts:73` | 设计局限，独立于本缺陷 |

补充说明：`assignImageDisplayNames` 移除附件后不回收编号（`imageMentions.test.ts:91-101` 明确锁定该行为，属有意设计）；附件全部清空时计数器重置为 1（`PromptAssistantUi.tsx:214-217`），均非缺陷。

## 5. 修复建议（未改动代码）

1. **最小修复（源头，必做）**：`assistantImagePicker.ts:37` 保证 ID 唯一，例如
   ```ts
   let seq = 0;
   createId: () => `gallery-${Date.now()}-${seq++}`
   ```
   或在 map 回调内逐个生成 `crypto.randomUUID()`。同款修复应用于 `imagePicker.ts:16` 的文件名 fallback。
2. **防御性兜底（可选）**：`assignImageDisplayNames` 在 displayName 重复时顺延编号，防止未来其他 ID 源再出问题。
3. **测试**：为 `pickAssistantImages` 补充"同批多图 ID 互不相同"的用例（注入 `pickGallery` 返回多资产即可复现现有缺陷）；`imageMentions.test.ts` 补充重名兜底用例。
