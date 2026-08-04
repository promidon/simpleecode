#!/usr/bin/env bash
# Manual SimpleeCode release workflow. Hosted automation stays disabled.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
VSIX="simpleecode-${VERSION}.vsix"
DEFAULT_NOTES="docs/releases/${VERSION}.md"

usage() {
  echo "Usage:"
  echo "  ./scripts/release.sh prepare [notes-file]"
  echo "  ./scripts/release.sh verify"
  echo "  ./scripts/release.sh deploy-preview"
  echo "  ./scripts/release.sh deploy-production"
  echo "  ./scripts/release.sh github-release [notes-file]"
}

require_stable_version() {
  if ! [[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "✗ package.json version must be a stable semantic version such as 1.2.3."
    exit 1
  fi
}

prepare() {
  local notes_file="${1:-${DEFAULT_NOTES}}"
  require_stable_version
  if [ ! -f "${notes_file}" ]; then
    echo "✗ Release notes not found: ${notes_file}"
    exit 1
  fi

  echo "→ Packaging ${VSIX}"
  npx --no-install vsce package --out "${VSIX}"
  node scripts/build-release.mjs "${notes_file}"
  node scripts/verify-release.mjs
}

run_gates() {
  npm run dead-code
  npm run typecheck
  npm run lint
  npm test
  npm audit --json
  git diff --check
}

deploy() {
  local mode="$1"
  local -a deploy_args=(
    --dir publish
    --functions netlify/functions
    --no-build
    --message "SimpleeCode ${VERSION} ${mode}"
  )
  node scripts/verify-release.mjs
  netlify status >/dev/null

  if [ "${mode}" = "production" ]; then
    deploy_args+=(--prod)
  fi

  echo "→ Deploying SimpleeCode ${VERSION} to Netlify (${mode})"
  netlify deploy "${deploy_args[@]}"
}

github_release() {
  local notes_file="${1:-${DEFAULT_NOTES}}"
  require_stable_version

  if [ "$(git branch --show-current)" != "public-main" ]; then
    echo "✗ GitHub releases must be created from public-main after the release PR merges."
    exit 1
  fi
  if [ -n "$(git status --short)" ]; then
    echo "✗ The public-main worktree must be clean before release."
    exit 1
  fi

  git fetch public main
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse public/main)" ]; then
    echo "✗ public-main is not at the fetched public/main commit."
    exit 1
  fi
  if git rev-parse "refs/tags/${TAG}" >/dev/null 2>&1; then
    echo "✗ Tag ${TAG} already exists."
    exit 1
  fi

  gh auth status >/dev/null
  run_gates
  prepare "${notes_file}"

  git tag -a "${TAG}" HEAD -m "SimpleeCode ${TAG}"
  git push public "refs/tags/${TAG}"
  gh release create "${TAG}" \
    "${VSIX}#SimpleeCode ${VERSION} VSIX" \
    "publish/SHA256SUMS.txt#SHA-256 checksums" \
    --repo promidon/simpleecode \
    --title "SimpleeCode ${VERSION}" \
    --notes-file "${notes_file}" \
    --verify-tag

  echo "✓ Published GitHub Release ${TAG}"
}

case "${1:-}" in
  prepare)
    prepare "${2:-}"
    ;;
  verify)
    node scripts/verify-release.mjs
    ;;
  deploy-preview)
    deploy "preview"
    ;;
  deploy-production)
    deploy "production"
    ;;
  github-release)
    github_release "${2:-}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
