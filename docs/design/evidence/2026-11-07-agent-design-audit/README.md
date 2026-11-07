# 2026-11-07 Agent design audit evidence

Source 2a44c522, current JS bundled from mobile/scripts/agent-roadmap-device.jsx. Existing debug native shell, synthetic offline fixture, no real model/provider execution. Build identity: build-metadata.json. This is a QA artifact, not a release build.

Read-only AVD AutoDL_Keyboard_QA_20261025, emulator-5556. 1080x2400, density 420, font scale 1.0. Device clock/locale retained in screenshots; report date follows Asia/Shanghai.

The old installed beta.44 was inspected for identity and excluded from audit evidence. Installed a separate com.example.autodlh3 QA wrapper. Its inherited QA data was backed up to build/roadmap-qa/audit-nov07-preclear.tar before clearing this QA package and rerunning its synthetic fixture. Beta data was not cleared. The project-read failure reproduced before and after clearing; cause unresolved. Do not infer a production defect from this mixed JS/native harness alone.

Accepted, individually inspected captures:

1. 01-chat.png/xml: blocked assistant entry after clean fixture startup; earlier attempt/retry also failed.
2. 02-skills.png/xml: global skill directory, accessed via application deep link.
3. 03-history.png/xml: actual global empty skill run-evidence list, opened from directory. The fixture conversation record does not itself create a skill run-evidence row.
4. 04-run-detail.png/xml: exact synthetic thread/run deep link; zero tool stages, preserved local messages. No actual model execution.
5. 05-skill-detail.png/xml: expanded built-in skill, opened by UI-tree-derived tap.

audit-contact-sheet.jpg contains these exact five screenshots, resized with numbered headings. Original PNGs are retained. Blank/loading launch captures and 04-run.png (missing runId because of shell argument parsing, corrected for accepted capture) are excluded from design conclusions.

Scope limits: no normal conversation/composer/approval UI screenshots obtained; those report recommendations are source review only. No TalkBack, enlarged fonts, rotation, keyboard, predictive-back gesture, live dispatch, cost or real media adoption tests claimed. Existing test-suite counts in older docs are not current-run validation.

Full report: ../../agent-mobile-design-audit-2026-11-07.md
