# Agent roadmap device evidence

2026-11-05. Emulator-5556, Android 17/API 37, 1080×2400, density 420, font 1.0. Isolated com.example.autodlh3 debug shell, fresh Hermes bundle; APK/bundle identities in metadata. Not a release candidate. Read-only AVD; beta package untouched.

Source baseline 61b014e0. Fixture: mobile/scripts/agent-roadmap-device.jsx. Model endpoint loopback; image/video preparation explicitly substituted offline. No model/provider dispatch and no spend confirmation. Fixture reference has a DB record without a media file; these samples do not validate media or provider preflight.

M3b2: open fixture project → plans → three-shot batch → request review. Exactly one request included; paused and unselected shots excluded with reasons. Scroll shows workflow inputs, fixed version, separate unchecked permissions. Tick outbound only → cancel → same batch. Reopened review resets consent. Combined baseline/candidate reviewed in batch-comparison.jpg: preserves existing typography and theme, replaces long Alert with scrollable sections, no first-screen clipping. XML captures include offscreen bounds; they are not touch measurements.

50 automated tests cover scoped batch reads, equal-time pagination, immutable draft bindings, opt-in consent and duplicate guard; typecheck passed. No TalkBack, larger font, live cost, live model or live provider verification is claimed. Later slice results append here.

M3c: offline standalone UNKNOWN workflow job inserted into stopped isolated QA DB; no generation operation or credentials. Task before/after composite inspected: next action is provider review, status remains unknown, no regeneration. Generation receipt absent so query button correctly unavailable. Never opened provider website. Candidate identity/polling/adoption and stop scope covered by regression tests, not by this device fixture.

M4a: plans-after/plan-detail-after/plan-checks-after/plan-dependencies-after/plan-create-range-after/plan-candidates-auto-after. No plan mutation or dispatch. Combined plans-comparison.jpg inspected; retained theme and readable fields, details moved out of rows. Batch header still occupies space and is addressed next.

M4b: plans-batch-after, batch-range-after, batch-range-applied and batch-dependency-review-after. Range confirmation then one included request/two excluded. Composite inspected, three plan summaries now visible without checks crowding list. Project-change/reset-title follow-up is automated-only in this slice, included in next bundle.

M5a: extraction-home/evidence/selected/send/saved/drafts/resumed-after capture local staged flow. Selected one persisted user message, entered synthetic goal, saved locally, backtracked and reopened it; did not send evidence. extraction-comparison.jpg inspected: preserves typography/theme, first screen no longer presents later-step forms. Model change, checked content publication and exact version routing are automated-only. Native startup/deeplink race produced a Fabric crash once; warm navigation worked. Storage workaround retained data (-k) and took a task-only tar backup; beta untouched.
