# Reference Media Preview Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore immediate image and audio previews for locally selected reference media while preserving deferred Base64 encoding.

**Architecture:** Keep `TaskMediaInput` and the AutoDL submission pipeline unchanged. Resolve the preview source only inside `AttachmentPreview.tsx`, preferring the lightweight local `uri` and falling back to the legacy `dataUri`; verify both paths through component-level regression tests.

**Tech Stack:** React Native 0.86, Expo 57, TypeScript, Jest 29, `react-test-renderer`, `expo-audio`

---

### Task 1: Cover local and legacy preview sources

**Files:**
- Create: `mobile/src/create/AttachmentPreview.test.tsx`
- Modify: `mobile/src/create/AttachmentPreview.tsx:7-20`

- [ ] **Step 1: Write the failing image preview tests**

Create `mobile/src/create/AttachmentPreview.test.tsx` with mocks for the native audio hook and icon component, then render local-URI and data-URI inputs:

```tsx
import React from 'react';
import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';

const mockUseAudioPlayer = jest.fn(() => ({ pause: jest.fn(), play: jest.fn() }));

jest.mock('expo-audio', () => ({
  useAudioPlayer: (source?: string) => mockUseAudioPlayer(source),
  useAudioPlayerStatus: () => ({ duration: 0, playing: false }),
}));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import { AudioPreviewList, ImagePreviewGrid } from './AttachmentPreview';

describe('reference media previews', () => {
  beforeEach(() => mockUseAudioPlayer.mockClear());

  it('prefers local image URIs and falls back to legacy data URIs', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ImagePreviewGrid
          items={[
            { uri: 'file:///local.png', dataUri: 'data:image/png;base64,bG9jYWw=', name: 'local.png' },
            { dataUri: 'data:image/png;base64,bGVnYWN5', name: 'legacy.png' },
          ]}
          onRemove={() => undefined}
        />,
      );
    });

    expect(tree.root.findAllByType(Image).map((node) => node.props.source.uri)).toEqual([
      'file:///local.png',
      'data:image/png;base64,bGVnYWN5',
    ]);
    act(() => tree.unmount());
  });
});
```

- [ ] **Step 2: Run the image test and verify the regression is reproduced**

Run:

```powershell
Set-Location mobile
npx jest src/create/AttachmentPreview.test.tsx --runInBand
```

Expected: FAIL because the first rendered `Image` receives the data URI rather than `file:///local.png`.

- [ ] **Step 3: Add the failing audio preview test**

Append this test inside the existing `describe` block:

```tsx
it('prefers local audio URIs and falls back to legacy data URIs', () => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <AudioPreviewList
        items={[
          { uri: 'file:///local.mp3', dataUri: 'data:audio/mpeg;base64,bG9jYWw=', name: 'local.mp3' },
          { dataUri: 'data:audio/mpeg;base64,bGVnYWN5', name: 'legacy.mp3' },
        ]}
        onRemove={() => undefined}
      />,
    );
  });

  expect(mockUseAudioPlayer.mock.calls.map(([source]) => source)).toEqual([
    'file:///local.mp3',
    'data:audio/mpeg;base64,bGVnYWN5',
  ]);
  act(() => tree.unmount());
});
```

- [ ] **Step 4: Run the focused test and verify both failures have the expected cause**

Run:

```powershell
Set-Location mobile
npx jest src/create/AttachmentPreview.test.tsx --runInBand
```

Expected: FAIL for both tests because `AttachmentPreview.tsx` still passes only `item.dataUri` to `Image` and `useAudioPlayer`.

- [ ] **Step 5: Implement the minimal preview-source fix**

In `mobile/src/create/AttachmentPreview.tsx`, change the audio player source:

```tsx
const player = useAudioPlayer(item.uri ?? item.dataUri);
```

Change the image source:

```tsx
<Image source={{ uri: item.uri ?? item.dataUri }} style={styles.image} />
```

Do not read files or generate Base64 in this component.

- [ ] **Step 6: Run the focused regression tests**

Run:

```powershell
Set-Location mobile
npx jest src/create/AttachmentPreview.test.tsx --runInBand
```

Expected: PASS with 2 passing tests.

- [ ] **Step 7: Run related tests and type checking**

Run:

```powershell
Set-Location mobile
npx jest src/create/AttachmentPreview.test.tsx src/create/createForm.test.ts src/workflows/providers/autodl/prepareInputs.test.ts --runInBand
npm run typecheck
```

Expected: all selected Jest suites pass and TypeScript exits with code 0.

- [ ] **Step 8: Review the final diff and commit the fix**

Run:

```powershell
git diff --check
git diff -- mobile/src/create/AttachmentPreview.tsx mobile/src/create/AttachmentPreview.test.tsx
git add -- mobile/src/create/AttachmentPreview.tsx mobile/src/create/AttachmentPreview.test.tsx
git commit -m "fix: preview deferred reference media"
```

Expected: no whitespace errors; the commit contains only the preview source fallback and its regression tests.
