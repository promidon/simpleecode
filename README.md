# SimpleeCode

### Your codebase, explained Simplee.

**A local VS Code dashboard that reads your codebase and explains it back to you — in plain language, grounded in your real code.**

[Download the latest VSIX](https://simpleecode.netlify.app/download) ·
[Visit the website](https://simpleecode.netlify.app) ·
[Read the changelog](CHANGELOG.md)

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Built with AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)
![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC)

Select some code, click **Explain**, and SimpleeCode tells you what it does, how it
connects to the rest of your project, and where to look to check for yourself.

---

## Why I built this

I'm more of a product person than a career engineer. I have enough of an
engineering background to navigate the tech, but the way I actually work is by
spotting a problem and building a product to solve it.

So I built SimpleeCode: **fully with AI.**

That was the point, not a shortcut. AI isn't going away — it's getting *more*
woven into how we work, not less. I wanted to prove that we can build products
that help us code *better* with AI, instead of just leaning on it blindly.

SimpleeCode is for the person who is learning, or who is unsure about AI-written
code. Maybe you have some experience in the field, maybe you're brand new. Either
way, when AI writes a big chunk of a repo, you should be able to **vet it and
understand what's actually being built** — not just trust it and hope.

Honestly, it started as a tool to help *me* do exactly that. And then it turned
into this.

## How it stays honest

The whole idea only works if you can trust the answer. So SimpleeCode figures out
**everything it can without the AI** first:

- **Linters and the language server (LSP)** for real symbols, types, and errors
- **AST / self-parsing** so it still works even on bare targets where the
  language server is blind
- **A structure + module graph** built from your actual imports, exports, and
  dependents

The AI's only job is to turn those verified facts into a readable explanation.
Then SimpleeCode **checks the answer back against your real code** and turns every
file and line it mentions into a click-through link, so you can confirm it in one
click. When the context was thin, it says so up front instead of guessing.

That's the deal: the deterministic layer finds the facts, the AI narrates them,
and you get to verify.

---

## Quickstart

Four steps to your first explanation.

1. **Install the extension.** [Download the latest VSIX](https://simpleecode.netlify.app/download),
   then in VS Code open the Extensions view → `···` menu →
   **Install from VSIX…** → pick the downloaded file.
   (Or build it yourself with `npm install && npm run package`.)
2. **Install the ACP agent** so answers stream back live:
   `npm i -g @zed-industries/claude-code-acp`.
   Without it, SimpleeCode still works but copies the prompt to your clipboard.
3. **Open your project folder** and let the sidebar's **SimpleeCode** icon load
   (it indexes locally — nothing is sent yet).
4. **Select some code**, then click **Explain Selection** in the SimpleeCode
   sidebar (or run `SimpleeCode: Explain Selection` from the Command Palette).

Two settings worth knowing (both safe by default):

- `simpleecode.privacy.showPromptBeforeSending` — **on**, so the automatic review
  shows the complete prompt, every included source, total size, privacy changes,
  and possible clipboard use before every send.
- `simpleecode.acp.transport` — **auto**, so SimpleeCode uses the ACP agent when it's
  installed and falls back to clipboard when it isn't.

## Commands

| Command | What it does |
| --- | --- |
| `SimpleeCode: Open Dashboard` | Opens the dashboard webview |
| `SimpleeCode: Explain Selection` | Captures file + selected text + line range → packet → answer |
| `SimpleeCode: Explain Current File` | Captures the whole file → packet → answer |
| `SimpleeCode: Explain System Role` | Grounds on the file and as much verified module graph as the configured maximum privacy scope permits |
| `SimpleeCode: Start Codebase Tour` | Walks the codebase file by file, in dependency order |
| `SimpleeCode: New Conversation` | Drops the session so the next question starts fresh |
| `SimpleeCode: Stop the Current Answer` | Cancels a prompt that's still streaming |
| `SimpleeCode: Reindex Workspace` | Rescans the workspace and rebuilds the local file + symbol index |

## Privacy

SimpleeCode runs locally and is careful about what leaves your machine.

- It never sends `.env`, key/credential files, or anything matching
  `simpleecode.privacy.blockedFileGlobs`.
- Secret-looking lines are redacted and oversized files are truncated.
- By default, an automatic **review shows the complete prompt** before anything
  leaves your machine. The dashboard can reopen the last reviewed prompt.
- The ACP client grants no file-system capabilities, rejects tool permissions,
  launches the agent in an isolated working directory, and passes a minimal
  environment. The locally installed ACP agent remains a trusted process, not an
  operating-system sandbox.
- Feedback includes the message, optional tester name, extension version,
  operating system, and VS Code version. Feedback requires HTTPS.

See `simpleecode.privacy.*` in **Settings → SimpleeCode**.

---

## Get involved

This is free, and I'd genuinely love for people to use it and build on it.

- ⭐ **Star it** if it's useful.
- 🍴 **Fork it** and make it your own.
- 🐛 **Report a bug** — [open an issue](https://github.com/promidon/simpleecode/issues).
- 🤝 **Contribute** — see below. PRs welcome, from typo fixes to whole features.

My hope is that SimpleeCode helps people who *want* to get into software but don't
know where to start. Instead of "just use AI," you get somewhere to actually
learn: build with AI, find the flaws in what it made, fix them, and understand
your code a little better each time. That's the vision.

## Contributing

**Other developers are welcome here.** I built the first version, but SimpleeCode
is meant to be a project people work on together, not a finished thing you only
get to watch.

You don't need permission to start. Fork it, branch, and open a PR.

**Don't know where to start?** [ROADMAP.md](ROADMAP.md) is everything I haven't
built yet, and the items marked 🟢 are self-contained — you can do them without
holding the whole codebase in your head. Pick one. Or fix a typo; that counts too.

**Two ground rules**, because they're what makes the tool worth trusting:

1. **Deterministic first.** Facts come from the code — the language server, the
   AST, the module graph. The AI only turns those facts into readable prose. If
   a feature needs the model to *invent* a fact, it needs a rethink.
2. **Privacy is not optional.** Nothing new leaves the machine without going
   through the privacy guard and the prompt review.

New to open source? That's fine — say so in your PR and I'll walk through it
with you. Small PRs get reviewed faster than big ones.

Full setup, style, and PR details: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

By contributing, you agree your work is licensed under
[GPL-3.0-or-later](LICENSE), same as the rest of the project.

## Roadmap

Deterministic file summaries and sparse search are built. Sparse search stays
behind `simpleecode.retrieval.enableSparseSearch` and is off by default. Hybrid
ranking, deeper system explanations, TS/JS parity for the deterministic floor,
fetched documentation text, and richer graph relationships are still open.

Full list of what's left: **[ROADMAP.md](ROADMAP.md)**.

## License

Copyright (C) 2026 Promidon.

SimpleeCode is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed WITHOUT ANY WARRANTY — see the
[GNU General Public License](LICENSE) for details.

Free to use, fork, and build on. The catch is the good kind: if you share a
changed version of SimpleeCode, you have to share your source under the same
license. What you explain *with* SimpleeCode is yours — your own code and projects
are not covered by this license.

---

*Built by a product person, with AI, on purpose.*
