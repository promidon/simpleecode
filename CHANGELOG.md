# Changelog

All notable changes to SimpleeCode are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
