#!/usr/bin/env bash
# One command to finish beta setup. It securely prompts for the GitHub token:
#   ./scripts/finish-beta.sh
#
# It saves the token to Netlify, then builds and publishes the extension.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -ne 0 ]; then
  echo "✗ Do not put a token on the command line; it can leak into shell history."
  echo "  Run ./scripts/finish-beta.sh and use the hidden prompt."
  exit 1
fi
read -r -s -p "GitHub token (input hidden): " TOKEN
echo ""
if [ -z "$TOKEN" ]; then
  echo "✗ No token entered."
  exit 1
fi

echo "→ Saving your token to Netlify (stays private there)…"
netlify env:set GITHUB_TOKEN "$TOKEN" >/dev/null

echo "→ Building and publishing the extension…"
SIMPLEECODE_SITE="https://simpleecode.netlify.app" ./scripts/release.sh "First beta build"

echo ""
echo "✓ Done. Your extension is built and the site is live."
echo "  Install file: simpleecode-$(node -p "require('./package.json').version").vsix"
echo "  Send that file to your friend, and you're beta."
