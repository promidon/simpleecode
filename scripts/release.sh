#!/usr/bin/env bash
# Cut a SimpleeCode beta release: package the .vsix, write the update feed
# (latest.json), and deploy both — plus the feedback function — to Netlify.
#
# Usage:
#   SIMPLEECODE_SITE="https://your-site.netlify.app" ./scripts/release.sh "Release notes here"
#
# Prereqs (one-time): `npm i -g @vscode/vsce netlify-cli`, `netlify link` this
# folder to your site, and set the site's env vars (see netlify.toml).
set -euo pipefail
cd "$(dirname "$0")/.."

NOTES="${1:-}"
SITE="${SIMPLEECODE_SITE:-}"
if [ -z "$SITE" ]; then
  echo "✗ Set SIMPLEECODE_SITE to your Netlify site URL (e.g. https://xyz.netlify.app)"
  exit 1
fi
SITE="${SITE%/}"
if [[ "${SITE}" != https://* ]]; then
  echo "✗ SIMPLEECODE_SITE must use https://"
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
VSIX="simpleecode-${VERSION}.vsix"
# Inject the feedback secret from Netlify into THIS build only, then restore the
# source so the token never enters git history. Zero-config for testers.
FC="src/feedback/feedbackConfig.ts"
FC_BAK="$(mktemp)"
cp "${FC}" "${FC_BAK}"
restore_feedback_source() {
  if [ -n "${FC_BAK:-}" ] && [ -f "${FC_BAK}" ]; then
    cp "${FC_BAK}" "${FC}"
    rm -f "${FC_BAK}"
  fi
  FC_BAK=""
}
trap restore_feedback_source EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
FB="$(netlify env:get FEEDBACK_TOKEN 2>/dev/null || true)"
if [ -n "${FB}" ]; then
  if [[ ! "${FB}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "✗ FEEDBACK_TOKEN contains unsupported characters; refusing to edit build input."
    exit 1
  fi
  echo "→ Baking feedback token into this build (not committed)"
  perl -0pi -e "s/const DEFAULT_TOKEN = '[^']*';/const DEFAULT_TOKEN = '${FB}';/" "${FC}"
else
  echo "⚠ FEEDBACK_TOKEN not found in Netlify — testers will need to set simpleecode.feedback.token."
fi

echo "→ Packaging ${VSIX}"
npx --no-install vsce package --out "${VSIX}"
restore_feedback_source

echo "→ Preparing publish/"
rm -rf publish
mkdir -p publish
cp "${VSIX}" "publish/${VSIX}"
VSIX_SHA256="$(shasum -a 256 "${VSIX}" | awk '{print $1}')"

# Beta tester docs (source of truth: docs/beta/). Copied here so they're readable
# at ${SITE}/README.txt etc., and bundled into a one-download zip alongside them.
BUNDLE="simpleecode-${VERSION}-beta.zip"
if [ -d docs/beta ]; then
  echo "→ Adding tester docs + ${BUNDLE}"
  cp docs/beta/README.txt docs/beta/GETTING-STARTED.txt publish/ 2>/dev/null || true
  ( cd publish && zip -qj "${BUNDLE}" "${VSIX}" README.txt GETTING-STARTED.txt )
else
  echo "⚠ docs/beta not found — skipping tester docs + bundle."
fi

# The update feed the extension reads (simpleecode.updates.source → this URL).
cat > publish/latest.json <<JSON
{
  "version": "${VERSION}",
  "url": "${SITE}/${VSIX}",
  "sha256": "${VSIX_SHA256}",
  "notes": $(node -p "JSON.stringify(process.argv[1] || '')" "${NOTES}")
}
JSON

echo "→ Deploying to Netlify (site + feedback function)"
netlify deploy --prod

echo "✓ Released ${VERSION}"
echo "  Feed:   ${SITE}/latest.json"
echo "  VSIX:   ${SITE}/${VSIX}"
if [ -d docs/beta ]; then
  echo "  Read:   ${SITE}/README.txt  ·  ${SITE}/GETTING-STARTED.txt"
  echo "  Bundle: ${SITE}/${BUNDLE}"
fi
echo "  Testers with simpleecode.updates.source set to the feed will be offered it."
