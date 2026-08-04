# Changelog

All notable changes to SimpleeCode are recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Renamed from CodeLens to SimpleeCode.** The old name collides with a
  built-in VS Code feature. All setting keys (`codelens.*` → `simpleecode.*`),
  command ids, and the extension id (`promidon.simpleecode`) changed with it.
  This is a clean break — old setting keys are not read as a fallback, and the
  local index is rebuilt from scratch on first launch.
- **Relicensed from MIT to GPL-3.0-or-later.**

### Added

- `CONTRIBUTING.md`, `ROADMAP.md`, `SECURITY.md`, and a code of conduct for the
  public repository.

## [0.1.0] — 2026-07-08

First packaged build, shared as a private beta.

### Added

- Deterministic file index, symbol index, and a persisted module graph.
- Verified facts layer: language-server facts with a self-parsing floor for
  targets the language server can't see.
- Deterministic file summaries and sparse TF-IDF search (off by default, behind
  `simpleecode.retrieval.enableSparseSearch`).
- Structured prompt packets, and answers streamed from a spawned ACP agent.
- Answer verification against the sent facts, with click-through `file:line`
  links on every grounded claim.
- Codebase tour that walks files in dependency order.
- Privacy guard with a full pre-send review, blocked-file globs, secret
  redaction, and oversized-file truncation.
- Swift and Apple documentation links, resolved deterministically.
- Dashboard rendered in Atkinson Hyperlegible, built for readability.

[Unreleased]: https://github.com/promidon/simpleecode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/promidon/simpleecode/releases/tag/v0.1.0
