# Security Policy

## Reporting a vulnerability

**Please don't open a public issue for security or privacy problems.**

Report it privately through GitHub's
[security advisory form](https://github.com/promidon/simpleecode/security/advisories/new)
on this repository. That creates a private thread only maintainers can see.

Expect a first reply within a week. If the report is valid, you'll be credited in
the fix unless you'd rather not be.

## What counts as a security issue here

SimpleeCode reads source code and can send parts of it to an AI agent, so the
privacy boundary *is* the security boundary. Any of these is worth reporting:

- Content leaving the machine without passing through the privacy guard
- A way to get `.env` files, credentials, or secret-looking lines into a prompt
- A path that bypasses the pre-send review when it's enabled
- `simpleecode.privacy.blockedFileGlobs` failing to block a file it should
- The ACP client gaining file-system access or accepting a tool permission
- Webview content-security-policy escapes, or code execution from indexed files
- The update checker installing an artifact with an unverified checksum or origin

## What doesn't

- The locally installed ACP agent is a **trusted process, not a sandbox.** That's
  by design and documented in the README. Reports that the agent could do
  something a local process can already do aren't vulnerabilities.
- The AI's explanation being wrong is a correctness bug — a normal issue, and the
  verification layer exists to catch it.

## Supported versions

Pre-1.0. Only the latest release gets fixes.
