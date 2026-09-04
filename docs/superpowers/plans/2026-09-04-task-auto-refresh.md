# Task Queue Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the foreground task queue polling until active or scheduled work becomes terminal, so background-persisted status and download changes appear without manual refresh.

**Architecture:** Preserve the existing adaptive `nextPollDelay` one-shot timeout and the `loadInFlight` concurrency fence. Add a monotonically increasing poll generation advanced when each timer-triggered load settles; include it in the scheduling effect dependencies so unchanged polling summaries still install the next timeout, while terminal pages still stop naturally.

**Tech Stack:** React Native, Expo Router, TypeScript, Jest, react-test-renderer, Android Gradle/ADB.

---

### Task 1: Reproduce the broken polling chain

**Files:**
- Modify: `mobile/src/route-tests/tasks.test.tsx:137-148`
- Test: `mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 1: Strengthen the active polling test to require three consecutive polls**

Replace the existing single-cycle assertion with:

```tsx
test('continues polling active provider tasks across unchanged summaries', async () => {
  jest.useFakeTimers();
  const pendingResult = {
    tasks: [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 2 }],
    summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } },
  } as never;
  jest.mocked(syncTaskRun).mockResolvedValue(pendingResult);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const calls = jest.mocked(syncTaskRun).mock.calls.length;

  for (let poll = 0; poll < 3; poll += 1) {
    await act(async () => { jest.advanceTimersByTimeAsync(10_000); });
  }

  expect(jest.mocked(syncTaskRun)).toHaveBeenCalledTimes(calls + 3);
  act(() => { renderer!.unmount(); });
});
```

- [ ] **Step 2: Add a terminal projection test**

Add:

```tsx
test('renders a terminal state reached on a later automatic poll', async () => {
  jest.useFakeTimers();
  const running = { id: 'task-1', prompt: 'x', status: 'RUNNING' as const, resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 2 };
  const succeeded = { ...running, status: 'SUCCESS' as const, downloadState: 'DOWNLOADED' as const, exportState: 'EXPORTED' as const, updatedAt: 3 };
  const result = (tasks: Array<typeof running | typeof succeeded>) => ({
    tasks,
    summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } },
  }) as never;
  jest.mocked(syncTaskRun)
    .mockResolvedValueOnce(result([running]))
    .mockResolvedValueOnce(result([running]))
    .mockResolvedValueOnce(result([succeeded]));
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });

  await act(async () => { jest.advanceTimersByTimeAsync(10_000); });
  await act(async () => { jest.advanceTimersByTimeAsync(10_000); });

  const texts = renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(texts).toContain('成功');
  expect(texts).toContain('已保存到相册');
  act(() => { renderer!.unmount(); });
});
```

- [ ] **Step 3: Run the focused route test and verify RED**

Run: `npm test -- --runInBand src/route-tests/tasks.test.tsx`

Expected: both new assertions fail because only the first automatic timeout fires; the consecutive test observes one poll instead of three and the terminal card remains running.

- [ ] **Step 4: Commit the regression tests**

```powershell
git add mobile/src/route-tests/tasks.test.tsx
git commit -m "test: reproduce stalled task auto-refresh"
```

### Task 2: Reliably reschedule adaptive foreground polling

**Files:**
- Modify: `mobile/app/(tabs)/tasks.tsx:21-29`
- Test: `mobile/src/route-tests/tasks.test.tsx`

- [ ] **Step 1: Add a poll generation state**

After `pollState`, add:

```tsx
const [pollGeneration, setPollGeneration] = useState(0);
```

- [ ] **Step 2: Reschedule after every timer-triggered load settles**

Replace the current adaptive polling effect with:

```tsx
useEffect(() => {
  const delay = nextPollDelay({
    now: Date.now(),
    hasActiveTasks,
    remainingDue: pollState.remainingDue,
    nextWakeAt: pollState.nextWakeAt,
  });
  if (delay == null) return;
  let cancelled = false;
  const timer = setTimeout(() => {
    void load('poll').finally(() => {
      if (!cancelled) setPollGeneration((generation) => generation + 1);
    });
  }, delay);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [hasActiveTasks, load, pollGeneration, pollState.nextWakeAt, pollState.remainingDue]);
```

This advances the generation even when `load` returns early because another screen load is in flight, so the automatic chain cannot terminate silently.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npm test -- --runInBand src/route-tests/tasks.test.tsx src/tasks/pollSchedule.test.ts`

Expected: both suites pass, including three unchanged automatic cycles, terminal projection refresh, exact scheduled wake, and terminal-page stop behavior.

- [ ] **Step 4: Run TypeScript checks**

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 5: Commit the production fix**

```powershell
git add "mobile/app/(tabs)/tasks.tsx"
git commit -m "fix: keep task auto-refresh polling alive"
```

### Task 3: Verify and deploy the corrected build

**Files:**
- Verify: `mobile/app/(tabs)/tasks.tsx`
- Verify: `mobile/src/route-tests/tasks.test.tsx`
- Artifact: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 1: Run release identity verification and all tests**

Run from `mobile`:

```powershell
npm run verify:workflow-releases
npm run typecheck
npm test -- --runInBand
```

Expected: workflow release hashes verify, TypeScript exits 0, and all non-skipped Jest suites pass.

- [ ] **Step 2: Build and install the emulator ABI without clearing data**

Run from `mobile/android`:

```powershell
$env:ANDROID_HOME='C:\Users\Administrator\AppData\Local\Android\Sdk'
.\gradlew.bat :app:installDebug -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=1 --console=plain
```

Expected: `BUILD SUCCESSFUL` and `Installed on 1 device`. Do not uninstall the package or clear application data.

- [ ] **Step 3: Launch and inspect the task queue**

Run:

```powershell
$adb='C:\Users\Administrator\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb -s emulator-5554 shell am force-stop com.example.autodlh3
& $adb -s emulator-5554 shell am start -W -n com.example.autodlh3/.MainActivity
```

Navigate to the task queue using coordinates derived from a fresh UI hierarchy. Confirm the app launches, existing tasks remain, the crash buffer is empty, and the installed package remains `1.4.10`/`versionCode=20`.

- [ ] **Step 4: Confirm repository state**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors and no uncommitted source changes.
