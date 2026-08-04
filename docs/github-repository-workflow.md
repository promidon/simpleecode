# GitHub repository workflow

This document is the binding Git policy for SimpleeCode. Read it before changing
remotes, branches, worktrees, history, pull requests, tags, releases, or any
GitHub repository setting.

## Repository roles

| Name | Role | What belongs there |
| --- | --- | --- |
| `dev` | Private development remote | Unreleased feature branches, experiments, and the archived pre-public history. Its URL is local-only and must not appear in tracked files. |
| `public` | Curated GPL source remote | Public `main`, contributor branches, reviewed promotion branches, and explicit release tags. URL: `https://github.com/promidon/simpleecode.git`. |

Local conventions:

- `${HOME}/Developer/simpleecode` is the private development checkout.
- `${HOME}/Developer/simpleecode-public-release` is the public release worktree.
- Local `main` tracks `dev/main`.
- Local `public-main` tracks `public/main` and is checked out only in the public
  release worktree.
- `dev/main` mirrors `public/main`. Unreleased work stays on private feature
  branches until it is promoted publicly.

The pre-public histories are preserved on `dev` at:

- `archive/pre-public-history-2026-08-04`
- `archive/safety-before-public-2026-08-03`

Do not delete, rewrite, merge, or publish those archive branches.

## Non-negotiable safety rules

- Never push a private development branch or private tag to `public`.
- Never run `git push --mirror` or a broad `git push --tags` against `public`.
- Never force-push or delete `public/main`.
- Never merge an archive branch into either `main`.
- Never include the private remote URL, private GitHub account name, private
  commit identifiers, secrets, internal notes, generated artifacts, or local
  absolute paths in a public commit.
- Do not use `git cherry-pick -x` when promoting private work because it exposes
  the private commit identifier.
- GitHub Actions, Dependabot update PRs, release automation, and deployment
  automation remain disabled in both repositories. All gates and deployments
  are manual.
- Stop if the worktree is dirty, a remote moved unexpectedly, an ancestry check
  fails, or a command would affect more refs than intended.

## Required preflight

Run these checks before branch, push, pull-request, tag, or release work:

```bash
git status --short --branch
git remote -v
git branch -vv --all
git worktree list
git fetch dev main
git fetch public main
git merge-base --is-ancestor public/main dev/main
```

The final command must exit successfully. Fetching does not authorize merging,
rebasing, pushing, tagging, or releasing.

## Daily private development

1. Update local `main` only by fast-forwarding it to the curated public line.
2. Create a focused private branch from `main`.
3. Commit and push ordinary work only to `dev`.
4. Keep unreleased work off `main`; use private feature or integration branches.
5. Run relevant local checks before asking for public promotion.

Public contributor pull requests target `public/main`. After one merges, fetch
`public`, fast-forward local and private `main` to that public commit, then start
dependent work.

## Promote private work publicly

All public work begins from the current public commit, never from a private
branch tip.

1. In the public worktree, update `public-main` with a fast-forward only.
2. Create `publish/<topic>` from `public/main`.
3. Apply only the reviewed private changes without committing:
   - For one atomic commit, use `git cherry-pick --no-commit <private-sha>`.
   - For several commits, list each approved SHA explicitly with
     `git cherry-pick --no-commit`; do not use an open-ended range.
4. Inspect the complete staged diff and remove unrelated or private-only material.
5. Create a fresh public commit with a public-safe message and author identity.
   Preserve original authorship only when that identity is already public. For
   private work, use the public maintainer identity; use public-safe
   `Co-authored-by` trailers for a multi-author squash. Do not mention private
   SHAs, accounts, or URLs.
6. Run every required local gate.
7. Push only `publish/<topic>` to `public` and open a pull request to public
   `main`.
8. Resolve all review conversations and merge with linear history.
9. Fetch the merged public commit, fast-forward `dev/main` to it, and verify that
   both main branches have the same tree.

Before pushing a promotion branch, inspect at least:

```bash
git status --short --branch
git log --oneline public/main..HEAD
git diff --cached --check
git diff --cached --stat
git diff --cached
git grep -n -I -F "$(git remote get-url dev)" -- .
```

The final search must return no matches. Also review for fragments of the private
owner name, local home-directory paths, internal documentation, automation files,
and generated output.

## Manual quality gates

Run all gates before a public pull request or release tag:

```bash
npm run dead-code
npm run typecheck
npm run lint
npm test
npm audit --json
npm run package
git diff --check
```

Report each result separately. A packaged VSIX proves packageability only; it
does not prove installation, live behavior, distribution, or release status.

## Public main and releases

Public `main` requires a pull request, linear history, and resolved review
conversations. Force-pushes and branch deletion are blocked. There are no
required hosted checks and no mandatory external approval because verification
is manual.

Create release tags only after the exact commit is merged and verified on public
`main`:

```bash
git tag -a vX.Y.Z <verified-public-sha> -m "SimpleeCode vX.Y.Z"
git push public refs/tags/vX.Y.Z
```

Push one explicit tag at a time. Build the downloadable VSIX from that tagged
commit. Website and Netlify deployment remain separate manual operations.

## Recovery

- **Wrong remote:** stop before pushing; confirm `git remote get-url <name>` and
  use the explicit remote name in every command.
- **Dirty worktree:** stop and classify every change. Do not stash, discard, or
  include unrelated work without its owner’s direction.
- **Non-fast-forward rejection:** fetch and inspect the remote movement. Never
  answer a rejection with a force-push to `public`.
- **Unexpected private-main movement:** stop. A one-time guarded history
  alignment is complete; future rewrites require a separately approved recovery
  plan.
- **Private material on an unmerged public branch:** close its pull request,
  delete only that public branch, rotate any exposed credential, rebuild a clean
  branch from `public/main`, and re-review the complete diff.
- **Private material merged publicly:** treat it as an incident. Preserve
  evidence, rotate secrets immediately, and agree on a public-history response
  before rewriting anything.
