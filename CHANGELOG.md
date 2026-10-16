# Changelog

All notable changes to SimpleeCode are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-10-16

### Added

- Goal-driven Understand, Connections, and Investigate explanations.
- Optional communication guidance with explicit local save, update, and removal.
- Captured source ownership, immutable outbound prompts, inspectable conversation
  history, and preparation/stream cancellation.
- Browser accessibility and isolated VS Code/ACP lifecycle test harnesses.

### Changed

- Explain commands prepare the sidebar; an explicit Explain action sends.
- Optional inline inspection replaces blocking prompt-review dialogs.
- Extra review defaults off; existing explicit true settings require inline approval.
- Follow-ups retain captured evidence and guidance. Old command IDs remain aliases.
- External chat/clipboard delivery requires an explicitly labeled handoff action.
- Prompts use universal readability instructions without assigning a disability.
- Updates install into the running editor through VS Code and offer Reload window.
- "Send feedback" opens GitHub Issues until a feedback token is configured, and
  unsent feedback is kept when the dialog closes.
- Settings opens filtered to SimpleeCode; status reads "AI agent ready".
- The file index no longer stores graph edges; they are rebuilt in memory.

### Fixed

- Send, Stop, and Back stay reachable in short or zoomed sidebars.
- High-contrast themes use VS Code's own colours for every surface.
- Keyboard focus survives streaming and tour updates; the overflow menu returns
  focus; arrow keys step the tour only from inside the Tour panel.
- Screen readers hear answer and Check results from one live region outside the
  tabs, and claim badges carry real text.
- Reduced motion honours VS Code's own setting.
- Agent output split across UTF-8 chunk boundaries is no longer garbled.

## [0.1.0] — 2026-08-04

First public beta of SimpleeCode.

### Added

- Deterministic file and symbol indexes with a persisted module graph.
- Language-server facts with a self-parsing floor for unsupported targets.
- Plain-language explanations, codebase tours, and answer verification with
  click-through file and line references.
- Privacy review, blocked-file rules, secret redaction, and size limits before
  prompts leave the machine.
- A checksum-verified, user-triggered VSIX updater. Startup checks remain off
  by default.
- Public contribution, roadmap, security, conduct, release, and distribution
  documentation.

### Changed

- **Renamed from CodeLens to SimpleeCode.** The old name collides with a
  built-in VS Code feature. All setting keys (`codelens.*` → `simpleecode.*`),
  command ids, and the extension id (`promidon.simpleecode`) changed with it.
  This is a clean break — old setting keys are not read as a fallback, and the
  local index is rebuilt from scratch on first launch.
- **Relicensed from MIT to GPL-3.0-or-later.**

[Unreleased]: https://github.com/promidon/simpleecode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/promidon/simpleecode/releases/tag/v0.1.0
