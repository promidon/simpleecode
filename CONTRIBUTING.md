# Contributing to SimpleeCode

Thanks for being here. SimpleeCode is a small project with a clear job: read a
codebase and explain it honestly. If that's interesting to you, there's room to
work on it.

You don't need to be an expert. Say where you're at in your PR and I'll meet you
there.

One thing first: this project has a [Code of Conduct](CODE_OF_CONDUCT.md), and it
comes down to *be kind, especially to beginners.* Asking a basic question has to
feel safe here, or the whole point is lost.

---

## Get it running

```bash
git clone https://github.com/promidon/simpleecode.git
cd simpleecode
npm install
npm run compile
```

Then press **F5** in VS Code (Run SimpleeCode Extension). That opens an Extension
Development Host — a second VS Code window with your build of SimpleeCode loaded.
Open any project in it and run a `SimpleeCode:` command from the Command Palette.

Optional, but nice: `npm i -g @zed-industries/claude-code-acp` so answers stream
live instead of going to your clipboard.

## The three checks

Run these before you open a PR. All three should be green.

```bash
npm run compile   # tsc → out/
npm run lint
npm test          # compiles, then runs node:test unit tests
```

If a check fails on `main` and not because of your change, open an issue — that's
a real bug and worth knowing about.

---

## How the project thinks

Two rules shape almost every review comment.

### 1. Deterministic first

Facts come from the code, not the model:

- the language server (LSP) for symbols, types, and errors
- the AST / self-parsing for targets where the language server is blind
- the module graph built from real imports, exports, and dependents

The AI's only job is turning those verified facts into readable prose. Then the
answer is checked back against the code.

So: if a feature needs the model to *invent* a fact, it needs a rethink. Ask
"where does this fact come from?" before you write it.

### 2. Privacy is not optional

Nothing new leaves the machine without going through the privacy guard and the
prompt review. If your change adds anything to a prompt, to telemetry, or to a
network request, it has to:

- pass through the privacy guard (`src/privacy/`)
- show up in the prompt review the user sees before sending
- respect `simpleecode.privacy.*` settings, including blocked globs and scope

Adding a new outbound request? Flag it clearly in the PR description.

---

## Code style

The codebase follows a few principles fairly strictly:

- **Single responsibility** — one module, one job.
- **SLAP** — a function's statements all sit at the same level of abstraction.
- **Pure logic, separate from I/O** — parsers, builders, and guards are pure
  functions and easy to unit test. VS Code API calls live at the edges.
- **KISS and YAGNI** — build what's needed now, not what might be needed.
- **DRY**, within reason. Duplication is cheaper than the wrong abstraction.

Practical version: if your new logic can be a pure function in its own file with
a `node:test` unit test next to it, do that.

TypeScript, no `any` unless you explain why. ESLint config is in
`eslint.config.mjs` — don't fight it, and don't add blanket disables.

## Project layout

```
src/
  extension.ts              # activation, wiring, live dashboard refresh
  app/SimpleeCodeApp.ts     # shared service container
  acp/                      # ACP adapter boundary (interface + vscode-acp impl)
  context/                  # active editor, selection, ContextPacket, packet builder
  prompt/                   # structured prompt builder (pure)
  privacy/                  # privacy guard (pure) + settings reader
  dashboard/                # webview panel (media/ holds css + js)
  commands/                 # the simpleecode.* commands
  indexing/                 # FileIndex + SymbolIndex
  storage/                  # LocalStore
  rag/                      # deterministic Retriever boundary and claim checks
  test/                     # node:test unit tests for the pure modules
```

One hard boundary: **all ACP access goes through
[`AcpChatAdapter`](src/acp/AcpChatAdapter.ts).** Nothing else calls `acp.*`
commands directly. If you need something new from the agent, add it to that
interface.

---

## Pull requests

1. Branch off `main`. Name it for what it does — `fix-import-resolution`,
   `add-python-facts`.
2. Keep it small. One change per PR. Small PRs get reviewed faster.
3. Add a test if you touched pure logic.
4. Run the three checks.
5. Describe what changed and *why*, and say how you tested it by hand.

Screenshots help a lot for anything that touches the dashboard.

### Don't know where to start?

**[ROADMAP.md](ROADMAP.md) is the list.** It's everything I know I want and
haven't built — where SimpleeCode is heading, in rough order. Items marked 🟢 are
self-contained: you can do them without holding the whole codebase in your head.
Pick one and go.

A few that are good entry points regardless:

- **Language support** — adding or sharpening a language is self-contained work.
  TS/JS parity for the deterministic floor is the highest-value one right now.
- **Deterministic facts** — better structure facts, module-graph edges, import
  resolution. This is the part that makes answers trustworthy.
- **Verification** — stronger checks that an answer matches the code.
- **Dashboard and accessibility** — clearer UI, better keyboard and screen
  reader support. Target is WCAG 2.2 AA.
- **Docs, typos, examples** — genuinely useful, genuinely welcome.

Want to build something that isn't on the roadmap? Great — open an issue first
and let's talk about it. That's cheaper than building the wrong thing.

## Reporting bugs

[Open an issue](https://github.com/promidon/simpleecode/issues) with:

- what you did, what you expected, what happened
- your OS and VS Code version
- the language and rough shape of the project you were pointing SimpleeCode at
- anything from the SimpleeCode output channel

**Do not paste secrets, tokens, or private source into an issue.** If reproducing
it requires private code, describe the shape of it instead.

## Security

Found something with security or privacy impact? Don't open a public issue —
see [SECURITY.md](SECURITY.md) for how to report it privately, and for what
counts as a security issue in a tool that reads your source code.

## License

SimpleeCode is [GPL-3.0-or-later](LICENSE). By contributing, you agree your work is
licensed the same way. No CLA, no copyright assignment — you keep your copyright,
your code stays free.
