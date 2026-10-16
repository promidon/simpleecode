# SimpleeCode

### Your codebase, explained Simplee.

**A local VS Code dashboard that reads your codebase and explains it back to you — in plain language, grounded in your real code.**

[Download the latest VSIX](https://simpleecode.netlify.app/download) ·
[Visit the website](https://simpleecode.netlify.app) ·
[Read the changelog](CHANGELOG.md)

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Built with AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)
![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC)

Select code and run **Explain Selection** to prepare the sidebar. Choose a goal,
optionally add guidance such as “ELI5”, then press **Explain** to send.

This checkout documents the **0.2.0 release candidate**. Published downloads may
still be an earlier version until the release and update feed are published.

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

AI turns the collected evidence into a readable explanation. SimpleeCode then
runs a **limited grounding check** on recognized file, symbol, line, and fact
claims, with links where locations can be resolved. Unrecognized prose remains
unchecked; a grounded badge is not proof that an explanation is correct.
Missing context is shown before sending.

That's the deal: the deterministic layer finds the facts, the AI narrates them,
and you get to verify.

---

## Quickstart

1. **Install the extension.** Download the VSIX and use VS Code's Extensions
   menu → **Install from VSIX…**, or build this checkout with `npm ci && npm run package`.
2. **Set up an ACP agent** for streamed answers:
   `npm i -g @zed-industries/claude-code-acp`. Without an agent, an explicit
   **Copy prompt and open chat** action is available. No clipboard fallback is silent.
3. **Open your project and select code.** Right-click **SimpleeCode: Explain Selection**.
4. **Choose a goal and press Explain.** Preparing code or changing a goal does not send it.

### Goals and guidance

| Goal | What changes |
| --- | --- |
| Understand this code | Purpose, main steps, inputs, and result for the captured code. |
| See how it connects | Permitted related sources and file-level project relationships. |
| Investigate a problem | Available diagnostics, relevant context, hypotheses, and checks you can try. Nothing is executed. |

“How would you like it explained?” is optional. Try “ELI5”, “Use an example”, or
“I know JavaScript but I’m new to Swift”. Guidance changes communication, not
privacy permissions. It stays with the explanation and follow-ups.

**Save as my default** stores guidance on this device only. It does not change
workspace settings or enroll it in Settings Sync. Update or remove it explicitly.
Possible secrets must be reviewed in sanitized form before saving.

**View what will be sent** and each answer's **What was sent** open an inspector
inside the sidebar, not a blocking dialog. The inspector shows the frozen prompt,
destination, sources, omissions, and prior turns retained in this explanation.

Changing editors does not change captured code. Use **Use current selection**,
**Use current file**, or **Refresh source** deliberately. Follow-ups reuse the
captured evidence. Changing source, goal, or guidance starts a fresh conversation
on the next send. Old answers retain their own source and prompt records.
**Ask follow-up** sends from the answer area. **Review follow-up first** prepares
an inline review instead. After cancellation or failure the agent conversation
is reset; retries retain captured evidence but not the earlier agent responses.

## Commands

| Command | What it does |
| --- | --- |
| Open Dashboard | Opens the optional editor-tab surface; the sidebar is the default explanation entry. |
| Explain Selection / Enclosing Function / Current File | Captures that code and prepares Understand. Does not send or change the editor selection. |
| Explain System Role | Prepares Connections, capped by privacy settings. |
| Start Codebase Tour | Walks indexed files; Explain this step prepares Connections and keeps the Tour position. |
| New Conversation | Clears answer history and starts a new explanation with the saved guidance default. |
| Stop the Current Answer | Stops preparation or generation; partial output remains marked incomplete. |
| Reindex Workspace | Rebuilds the local file and symbol index. |

The old Beginner, Detailed, and Debug command identifiers remain compatible
aliases. They prepare Understand with temporary guidance, or Investigate,
instead of sending immediately. They are no longer displayed as depth modes.

## Privacy

SimpleeCode runs locally and is careful about what leaves your machine.

- It never sends `.env`, key/credential files, or anything matching
  `simpleecode.privacy.blockedFileGlobs`.
- Secret-looking lines are redacted and oversized files are truncated.
- Preparation is local. Sending or copying requires an explicit action.
- The complete prompt is always inspectable. Extra review is **off by default**;
  an explicitly enabled `simpleecode.privacy.showPromptBeforeSending` requires
  inline approval before sending, never a blocking modal.
- `simpleecode.privacy.defaultScope` remains the maximum allowed context. Goals
  request appropriate evidence within that limit; guidance cannot raise it.
- Prompts, code and answers stay in memory in the extension by default. Agent
  software or external chat may have its own storage policy. Only explicitly
  saved guidance is persisted by the explanation feature.
- External handoff cannot confirm delivery, answers, or the external chat's
  previous context. Paste into a new chat for a fresh explanation.
- The ACP client grants no file-system capabilities, rejects tool permissions,
  launches the agent in an isolated working directory, and passes a minimal
  environment. The locally installed ACP agent remains a trusted process, not an
  operating-system sandbox.
- Feedback includes the message, optional tester name, extension version,
  operating system, and VS Code version. Feedback requires HTTPS.

See `simpleecode.privacy.*` in **Settings → SimpleeCode**.

### Website analytics

The extension sends no analytics. The website
([simpleecode.netlify.app](https://simpleecode.netlify.app)) uses Google
Analytics only if you choose **Allow analytics**. Nothing loads from Google
before then. When allowed, it records a fixed set of page, demo, scroll, and
download events. It never sends source code, extension activity, filenames,
form content, free text, query strings, or URL fragments. Your choice and the
visitor cookie expire after six months; event data is kept for two months.
Change your choice any time from
[Analytics settings](https://simpleecode.netlify.app/#analytics-settings).

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
   through privacy guards, inspectable context, and an explicit send or copy action.

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
