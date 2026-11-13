#!/usr/bin/env bash
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/post-commit scripts/approve-release-notes.sh scripts/install-hooks.sh

echo "Installed git hooks from .githooks."
