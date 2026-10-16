# Explanation experience acceptance

## Automated gates

Run types, lint, unit tests, dead-code, dependency audit, packaging and diff checks
separately. Browser tests load the real dashboard assets with the real message
parser and request coordinator, but a fake host/transport. Extension-host tests
run real VS Code with a synthetic ACP process in an isolated profile.
The `scripts/test-installed.mjs` probe separately installs, launches and checks
the packaged extension; optionally install and launch 0.1.0 first in that profile.

Neither proves AI answer quality, a real provider's behavior, VoiceOver usability,
or production distribution.

## Manual journey

Use a first-time tester without coaching. Record the version, platform, language,
window size/zoom, goal and privacy cap. Do not collect raw private prompts.

1. Select code and get an explanation without a blocking dialog.
2. Describe each goal in their own words.
3. Request ELI5; assess whether the answer is simpler without losing accuracy.
4. Ask a follow-up without re-entering code or guidance.
5. Inspect what was sent and return to the same reading position.
6. Explicitly save, update and remove a personal guidance default.
7. Stop generation, inspect partial output, and retry.
8. Explain what sources and earlier conversation were shared.

Record every blocked action, wrong expectation and assistance needed. Evaluate
grounding, goal-specific usefulness, uncertainty and guidance adaptation
separately. A tester prevented from finishing is not a complete product test.

## Accessibility and ownership

- Keyboard-only, VoiceOver, reduced motion, 200% zoom, 320px reflow.
- Light, dark, high-contrast and high-contrast-light themes.
- Long prompts, filenames, answers, multiline guidance and very short windows.
- Reachable send/stop/back actions; no hidden fixed footer or keyboard trap.
- State/stream updates preserve focus, caret, text, details and reading position.
- Both sidebar and editor panel; switching editors never changes captured code.
- Diagnostics, missing providers, unsaved files, privacy caps, blocked sources.
- Rapid edits, duplicate sends, stale approval, cancellation during startup,
  process exit, external handoff and explicit retry.

## Upgrade and distribution

Use a separate profile with a real 0.1.0 install and a same-origin HTTPS candidate
feed. Verify old settings, explicit review=true/false, update refusal, bad hashes,
bad origins, CLI failure/recovery, installation and the activated version after
reload. Do not change production feed URLs for testing.

Public merge, release tag/assets, hosting preview, production deployment, live
download/hash checks and the installed-user update path are separate evidence.
Never replace an existing version's VSIX bytes. Website source parity is a
separate deployment prerequisite. A hosting rollback does not downgrade users.

## Evidence status

2026-10-16: automated gates and browser/axe suite passed; the maintainer reported
the manual acceptance pass on the 0.2.0 candidate as passed. Distribution evidence
(GitHub Release, hosting, live hashes, installed-user update) is recorded separately
at release time. Do not infer manual or distribution success from a passing
automated suite.
