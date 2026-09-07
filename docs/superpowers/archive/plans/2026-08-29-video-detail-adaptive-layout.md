# Video Detail Adaptive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the video detail player expand through the upper available screen while keeping the Prompt scroll area at 240 pixels and the Prompt card aligned to the bottom.

**Architecture:** Keep one page-level fallback `ScrollView`, but give its content container `flexGrow: 1`. Place a flexible media region between the fixed header and fixed lower metadata/Prompt content; remove the player's fixed 16:9 container ratio while preserving `VideoView contentFit="contain"` inside `VideoPlayer`.

**Tech Stack:** React Native 0.86, Expo Router 57, Jest + `react-test-renderer`, TypeScript.

---

### Task 1: Adapt the detail page height distribution

**Files:**
- Modify: `mobile/app/video/[id].tsx`
- Test: `mobile/app/video/videoDetail.test.tsx`

- [ ] **Step 1: Write the failing layout test**

Add a component test that flattens the relevant styles:

```tsx
it('expands media through available height and pins the bounded prompt section below it', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoDetailScreen />); });
  expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'detail-content' }).props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
  expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'adaptive-media-region' }).props.style)).toMatchObject({ flex: 1 });
  expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'video-frame' }).props.style)).not.toHaveProperty('aspectRatio');
  expect(StyleSheet.flatten(tree!.root.findByProps({ accessibilityLabel: '滚动 Prompt' }).props.style)).toMatchObject({ maxHeight: 240 });
  expect(tree!.root.findByProps({ testID: 'bottom-prompt-card' })).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
cd mobile
npm test -- --runInBand --runTestsByPath "app/video/videoDetail.test.tsx"
```

Expected: FAIL because the current page lacks the test IDs/flexible media region, its content container lacks `flexGrow`, and the player frame still has `aspectRatio: 16 / 9`.

- [ ] **Step 3: Implement the minimal adaptive layout**

In `app/video/[id].tsx`:

- Add `testID="detail-content"` to the page `ScrollView`.
- Set `styles.content.flexGrow = 1`.
- Wrap the player frame in `<View testID="adaptive-media-region" style={styles.mediaRegion}>`.
- Add `testID="video-frame"` to the player frame.
- Remove `aspectRatio` from `styles.player`; use `flex: 1`, `minHeight: 220`, and `width: '100%'`.
- Set `styles.mediaRegion` to `{ flex: 1, minHeight: 240 }` so normal screens allocate spare height to video while short screens can scroll.
- Add `testID="bottom-prompt-card"` to the Prompt card and leave `styles.promptScroll.maxHeight` at exactly 240.

- [ ] **Step 4: Run focused tests and static checks**

```powershell
npm test -- --runInBand --runTestsByPath "app/video/videoDetail.test.tsx"
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run full regression and Android build**

```powershell
npm test -- --runInBand
cd android
.\gradlew.bat assembleDebug --console=plain --quiet
```

Expected: all Jest tests PASS and Android build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add "mobile/app/video/[id].tsx" "mobile/app/video/videoDetail.test.tsx"
git commit -m "fix: adapt video detail height distribution"
```
