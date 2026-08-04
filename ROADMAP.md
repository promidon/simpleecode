# SimpleeCode Roadmap

Where SimpleeCode is going, and what's actually left to build.

If you're looking for somewhere to start, **pick something from here**. Anything
marked 🟢 is self-contained — you can do it without holding the whole codebase in
your head. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the ground rules.

**One rule shapes everything below:** facts come from the code, the AI only
narrates. If an item here seems to need the model to invent a fact, it needs a
rethink first. Open an issue and let's talk about it.

---

## Already working

So you know what you're building on:

Deterministic file index • symbol index • module graph with persisted edges •
deterministic file summaries • sparse TF-IDF search (off by default) • verified
facts layer (LSP + self-parsing floor) • structured prompt packets • privacy
guard and full pre-send review • streamed ACP answers • answer checked back
against the facts • click-through file:line links • codebase tour •
Swift/Apple doc links.

---

## Next up

The two things that most need doing.

### Hybrid retrieval — rank and dedupe across stages

**Status: not started. This is the biggest open piece.**

All five retrieval stages exist and each has its own cap. What's missing is one
layer that merges them, drops duplicates, and ranks the result as a whole.

Ranking should prefer, roughly in order:

- current file
- current symbol
- exact name matches
- imported local files
- recently edited files
- files with a direct graph relationship
- high semantic similarity

Matters more as indexes grow. Per-stage caps are fine at small scale, which is
why this hasn't bitten yet.

### "What's missing" warnings 🟢

**Status: the one open item in the quality-checks work.**

When the context is thin, say so *before* the answer — a symbol that wouldn't
resolve, a file that got truncated, a dependency outside the privacy scope. A
thin answer should be labeled thin, up front, rather than reading as confident.

Everything else in the guardrail set is done: the "Inferred:" rule, required
file:line citations, invented-claim flagging, retrieved-source display, the
context-packet debug view, and failed-retrieval logging.

---

## Deeper system explanations

`explain_system_role` currently feeds a verified module-graph block — imports,
exports, local dependencies, dependents. That's the deterministic slice. The
richer flows below mostly wait on hybrid retrieval and symbol-level graph edges:

- Explain how the selected code fits the whole app
- Explain data flow
- Explain route flow
- Explain component relationships
- Explain state-management relationships
- Explain API / client / server boundaries
- **Explain what could break if this changes** — arguably the most useful one,
  and reachable today from the dependents edges

---

## Language coverage

🟢 **TS/JS parity for the deterministic floor.** The outline and anatomy layer is
Swift-deep and TS-shallow. The language server covers the facts for TS, but the
no-LLM draft is noticeably thinner. Since most people pointing SimpleeCode at
"someone else's codebase" are pointing it at TypeScript, this is high value.

**Tree-sitter parsing.** The current floor is hand-written parsing plus the
language server. Tree-sitter would give better multi-language coverage and, more
importantly, unlock symbol-level graph edges (below). Real lift — worth scoping
in an issue before building.

🟢 **More languages.** Python, Go, Rust, Java. Each is fairly self-contained
work: structure facts, declaration parsing, import resolution.

---

## Graph layer

File-to-file edges are built and persisted (imports, references, tests). Missing:

- **calls** and **renders** edges — symbol-level, needs Tree-sitter
- **routes_to** — no routing framework in scope yet
- "which route or page uses this symbol"

---

## Retrieval and indexing

- 🟢 **Index route handlers.** Not extracted by the symbol index today, so they
  don't become search chunks either. Framework-specific but shallow work.
- 🟢 **Index config blocks** as their own chunks. Config files currently just
  ride along as grounding.
- **Surrounding-code context level.** The context detector pulls the selection
  and the parent symbol, but not a plain window of surrounding lines. That's a
  missing context level in the packet.
- **Dense embeddings.** Sparse TF-IDF sits behind an interface specifically so a
  dense backend (LanceDB + a local model) can swap in. Only worth doing if sparse
  ranking proves too thin — and it must stay local, no hosted embedding API.

---

## Documentation grounding

Symbol → official doc link is done and deterministic (search URLs, so no dead
links, and the model never generates a URL). What's left is the last trust gap —
using the doc *text* as ground truth instead of just linking it:

- Fetch the one resolved DocC page as structured JSON
- Feed that exact text into the packet as ground truth
- Key the lookup by exact symbol, never by vector similarity
- Download DocC archives once; store a local symbol → doc lookup
- Version-pin docs to the target Swift / SDK version
- Keep it local, and respect Apple's documentation terms

Deliberately **not** doing: a vector RAG over documentation. When you have an
exact key, exact lookup beats semantic search every time.

🟢 Smaller cleanup: reimplement the doc lookup as a `SwiftDocRetriever` behind
the existing `Retriever` interface. It's a pure helper today; making it a proper
retriever lets hybrid retrieval compose repo results and doc results together.

---

## Storage

JsonStore was chosen over SQLite on purpose — native modules break on every
VS Code Electron update and need per-platform binaries in the `.vsix`.

- 🟢 `settings` table
- 🟢 `explanation_history` table, if it turns out to be useful
- **SQLite upgrade path:** implement `SqliteStore` against the existing
  `LocalStore` interface using `node:sqlite` (built into newer Node — no native
  packaging at all). One-line swap. Only do this when flush latency, memory
  pressure, or a dense vector backend actually forces it.

---

## Later — nice, not next

Real ideas, none of them blocking:

- Diagram generation
- Call-graph visualization
- Architecture map
- Test-aware explanations
- Git diff explanations — "what changed since last save?"
- "Explain the AI's last edit" mode
- Local embedding model option
- Local LLM option — fully offline explanations

---

## Not doing

Saying these out loud so nobody builds them by accident:

- **Fuzzy RAG in charge of lookup.** Retrieval is deterministic code, not a
  guess. If retrieval grabs the wrong chunk, you get a confident wrong answer
  wearing an official-looking citation — harder to catch than a plain guess.
- **Vector RAG over reference docs.** Exact key, exact lookup.
- **Auto-calling the model on every cursor move.**
- **Summaries without a raw-code reference.** A summary never replaces the code.
- **One giant context prompt for every question.**
- **Sending secrets or environment files.** Ever.

---

## Accessibility is not a section

It applies to everything above. Plain words, short sentences, one idea per
sentence, answer first then detail. Atkinson Hyperlegible, ~1.6 line height,
limited line length, generous spacing, theme-token contrast. Target is
WCAG 2.2 AA.

If a feature makes the output denser, it isn't done.
