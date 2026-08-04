# Engineering and security principles

The guiding principles for building, maintaining, and evolving SimpleeCode - for
human contributors and AI agents alike. `README.md` is the quick product and
development guide; this doc is the why behind the rules. Where a principle is
generic, the bullets say what it means in this VS Code extension specifically.

Scope note: we apply these practices because they make the code better and
safer. We map the security section to ISO/IEC 27001:2022 controls as a
framework - not as a claim of formal certification. Items marked
_(aspirational)_ are what we would add if this moved to a production/commercial
footing.

SimpleeCode is local-first. It builds deterministic context from the open
workspace, applies privacy guards, sends only the reviewed packet to the ACP
transport, renders the answer in a VS Code webview, and verifies claims back
against the local index where possible.

---

## Visual design principles

Based on the agreed VS Code extension design in `docs/design/`.

Accessibility: keep WCAG 2.2 AA contrast in the dashboard webview, give every
icon-only button an accessible name, and make the core loop operable by
keyboard so it works without a mouse. Run an accessibility review before big UI
changes, especially across both surfaces: editor-tab panel and Activity-Bar
sidebar.

---

## Core software design principles

- **Simple > complex, but not simplistic.** Reach for the smallest design that
  solves the problem; add necessary complexity deliberately, and only where it
  earns its keep. In SimpleeCode, prefer one typed extension flow over clever
  transport, dashboard, or indexing shortcuts.
- **Explicit > implicit.** Strict, explicit TypeScript types end-to-end; domain
  contracts in one place; names that mirror the underlying contract. Important
  examples are `ContextPacket`, `DashboardState`, `AcpChatAdapter`, index
  records, and privacy config.
- **Immutable > mutable.** Prefer derived snapshots and append/rebuild style
  state over hidden mutation. The extension host owns durable state and current
  packet state; the webview renders intent and posts typed messages back.
- **Errors explicit.** Fail with a clear message; the dashboard and VS Code
  notifications surface safe, useful text and never leak secrets or internal
  stack traces.
- **Rhythm > volume.** Ship in phases, not one big drop. Keep the extension
  installable, testable, and shippable after each slice.
- **Hard to explain = reconsider.** If a feature cannot be described in a
  sentence, it is not ready. For SimpleeCode, the sentence should preserve the core
  promise: real code facts first, AI prose second, user-verifiable output always.

---

## Engineering principles

1. **Single level of abstraction (SLAP)** - compose small pieces; keep pure
   logic away from VS Code UI, webview DOM, network, and process I/O.
2. **Program to interfaces** - read and write through typed clients and defined
   contracts, not raw assumptions about internals. `AcpChatAdapter`,
   `Retriever`, `LocalStore`, `ContextPacket`, and `DashboardHandlers` are the
   boundaries to protect.
3. **High cohesion** - one concern per file; one action per unit. Context
   capture, privacy guarding, prompt building, retrieval, verification, ACP
   transport, and dashboard rendering stay separate.
4. **Loose coupling** - talk to storage, ACP, retrieval, and dashboard surfaces
   through thin access layers so a provider or implementation can be swapped in
   one place.
5. **Composition over inheritance** - prefer composition and plain functions to
   class hierarchies. Classes are acceptable for VS Code lifecycle wrappers,
   stores, and adapters where stateful boundaries are useful.
6. **SOLID** - single responsibility; open for extension by adding adapters,
   retrievers, checks, or renderers rather than editing the core flow; depend on
   abstractions, not concretions.
7. **Command Query Separation (CQS)** - reads go through read paths; writes that
   touch sensitive state go through guarded operations. A function mutates or
   returns - never both ambiguously. Commands may update extension state;
   builders and verifiers should stay pure.
8. **YAGNI** - document future phases as later, do not pre-build them. Vector
   search, richer graph relationships, local LLMs, and autonomous edits belong
   behind explicit roadmap gates.
9. **DRY / single source of truth** - define each rule once. Privacy scopes,
   blocked globs, command ids, dashboard message shapes, and claim-verification
   rules should not drift across package metadata, extension code, and docs.
10. **Avoid premature optimization** - the simple approach is fine until
    measured need says otherwise. JSON storage and deterministic retrieval are
    acceptable at current scale; document the path to SQLite, LanceDB, or a
    richer index before building it.

---

## Foundational architecture principles

- **KISS** - the fewest moving parts that work. No background services or extra
  servers by reflex; the extension host plus webview plus optional feedback
  endpoint is enough until proven otherwise.
- **Separation of concerns** - commands/UI, context capture, privacy, prompt
  construction, retrieval, verification, storage, and ACP transport each live in
  their own layer.
- **Modularity and reusability** - shared primitives are built once and reused;
  interchangeable parts sit behind a common boundary. The panel and sidebar
  share one dashboard shell and one state contract.
- **Maintainability** - strict types plus a `typecheck -> lint -> test` gate;
  docs kept next to the code and updated when behavior changes.
- **Scalability** - design so the natural partition is obvious: workspace,
  file, symbol, packet, claim, and transport session. Document the scale path
  rather than building it early.

---

## Information security (mapped to ISO/IEC 27001:2022)

We apply the CIA triad as the basis for security decisions, scaled to this
extension's actual risk surface.

| Principle | How it shows up here |
| --- | --- |
| **Confidentiality** | Code stays local unless the user sends a reviewed packet. Blocked file globs, secret redaction, size limits, prompt preview, webview CSP, and least-data scopes limit what can leave the machine. |
| **Integrity** | Facts come from the workspace, parser, language server, and local index. Prompt building and answer verification are deterministic and tested; generated prose is treated as inspectable, not authoritative. |
| **Availability** | The extension works locally, indexes idempotently, and degrades from ACP agent to command/clipboard transport where possible. Network features such as updates and feedback are optional and bounded. |

### Secure development lifecycle (Annex A.8.25)

- **Separate environments** - local development, Extension Development Host,
  packaged VSIX, and hosted feedback/update infrastructure must stay distinct.
  Test data and beta feedback plumbing should never be confused with production
  user data.
- **Secure coding standards with automated checks** - `typecheck`, `lint`, and
  `test` are the merge gate; `package` verifies the installable artifact path.
- **Access-controlled repo and audit trail** - git history is the audit trail
  (Annex A.8.32); review before merge.
- **Pre-release testing** - use a defined testing strategy: pure unit tests,
  command/manual extension checks, dashboard accessibility checks, and packaged
  VSIX smoke tests.
- **Third-party licensing** - prefer permissive OSS; track licenses of anything
  bundled or shipped, including fonts, VS Code APIs, ACP tooling, and packaging
  dependencies.

### Application security (Annex A.8.26)

- **Attack-vector hardening** - webview content uses a restrictive CSP; model
  output is escaped and rendered through a safe Markdown subset; links are
  mediated; no raw untrusted HTML injection. Network calls are limited to
  configured update/feedback endpoints and ACP transport.
- **Input validation** - validate user input at the edge and at the operation
  layer: prompt text, feedback payloads, file paths, line numbers, glob rules,
  transport settings, and pasted answers for verification.
- **Legal/regulatory** - minimize personal data; collect only what the feature
  needs. Feedback sends only configured tester info plus limited version/OS/VS
  Code metadata; source code should not be included unless the user knowingly
  places it there.

### Secure system architecture (Annex A.8.27)

- **Security by design** - privacy guards, prompt preview, redaction notes, and
  verification are part of the main flow, not bolt-ons after the send.
- **Least privilege (PoLP)** - the webview cannot access the filesystem
  directly; it sends typed messages to the extension host. ACP receives only the
  packet SimpleeCode builds. Feedback tokens are scoped and rotatable.
- **RBAC** - this local extension has no multi-user in-app roles today. If a
  hosted dashboard, team feedback inbox, or shared index is added, define roles
  such as owner, contributor, tester, and service, then enforce them in both
  policy and operation layers.
- **Defense in depth** - multiple layers must agree: blocked path -> redaction
  -> truncation -> preview -> transport boundary -> claim verification.
- **Minimize attack surface** - expose the fewest commands, webview messages,
  endpoints, and settings necessary. Guard privileged or hosted endpoints with a
  secret and tight validation.
- **Fail-secure defaults** - deny or stop on bad state. A blocked file is not
  sent; a malformed feedback request is rejected; a failed ACP send produces a
  safe message instead of silently pretending success.

### Secure coding (Annex A.8.28)

1. **Input validation** - treat editor text, workspace paths, webview messages,
   settings, pasted answers, and network payloads as untrusted.
2. **Output encoding** - escape model output and code before rendering in the
   webview; use only the safe Markdown subset and mediated links.
3. **Least privilege** - clients and webviews use the lowest-privilege channel;
   never put high-trust keys into the webview bundle or prompt packet.
4. **Secure failure** - errors return safe messages; never leak secrets,
   another user's data, or local internals beyond what the user needs to fix the
   problem.
5. **Cryptographic agility / no hardcoded secrets** - keys live in VS Code
   settings, environment variables, or git-ignored local files as appropriate;
   examples hold placeholders only; privileged keys never reach the client
   bundle or model prompt.
6. **Supply chain** - keep dependencies updated; run dependency audits; enable
   Dependabot + CodeQL _(aspirational for CI)_.
7. **No unapproved code** - review external snippets, generated code, and
   copied examples before integrating.
8. **Explicit error handling** - handle each error case with context; no
   catch-all that swallows distinct failures.

### Vulnerability and risk management (A.8.28, A.5.7)

- Track known issues as a live risk register; revisit each phase.
- Integrate SAST/DAST in CI and review controls periodically _(aspirational)_.

### Access control and identity (A.8.25, A.5.15)

- Use managed identity and MFA for any hosted dashboards, Netlify/GitHub
  accounts, marketplace publishing, and release automation _(aspirational)_.
  Revoke access promptly when collaborators change.
- Enforce roles in any future hosted/shared surface via access policies; audit
  via provider logs.

### Data protection (A.8.23, A.8.24)

- Encrypt data in transit with TLS for update/feedback endpoints and ACP/cloud
  model calls when used.
- No secrets, tokens, or PII in logs, prompts, feedback files, or version
  control.
- Minimize PII; define retention/deletion if feedback collection or public beta
  grows _(aspirational)_.

### Compliance and audit

- This file + `README.md` + `docs/` form a lightweight Statement of
  Applicability: principle -> where it is implemented.
- Treat production or beta incidents as process improvements (blameless), never
  individual blame.

---

## Development guidelines

- Readable, self-documenting code; explicit types and contracts.
- Consistent naming; accessibility built in, not retrofitted.
- Validate assumptions with tests and real extension use.
- Small, focused functions; data accessed through thin access layers.
- Meaningful logs; never noisy, never secret-leaking.
- **Never commit secrets or env-specific values.** Use git-ignored env files,
  VS Code settings, or deployment environment variables.

## Error handling philosophy

- Handle errors at the right abstraction level; actionable for developers, safe
  and generic for users.
- No silent failures; no single catch-all across distinct error types.
- Production and beta issues are system failures to learn from, not personal
  mistakes.

## Delivery and workflow

- Ship small and often, in phases, prioritized by user value.
- Refactor continuously to keep tech debt low; measure before optimizing.
- Keep a tight loop between design, code, and testing.
- Automate the `typecheck -> lint -> test` gate in CI _(aspirational: add SAST
  + dependency scanning)_.
- Verify packageability with `npm run package` before release-facing work.

---

## Final principle

If a solution - or a security control - cannot be explained simply, reconsider
it. Clarity is the truest signal of good design, and a control nobody
understands is a control nobody enforces.
