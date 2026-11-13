#!/usr/bin/env bash
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

NOTES=RELEASE_NOTES.md
VERSION_FILE=VERSION
APPROVAL=.release-notes-approval

staged=$(git diff --cached --name-only)

if ! printf '%s\n' "$staged" | grep -qx "$NOTES"; then
  echo "error: stage $NOTES before approving." >&2
  exit 1
fi

if ! printf '%s\n' "$staged" | grep -qx "$VERSION_FILE"; then
  echo "error: stage $VERSION_FILE with $NOTES before approving." >&2
  exit 1
fi

echo "Staged release notes changes:"
echo "----------------------------------------"
git diff --cached -- "$VERSION_FILE" "$NOTES"
echo "----------------------------------------"

printf 'Type APPROVE to approve these release notes: '
read -r answer
if [ "$answer" != "APPROVE" ]; then
  echo "Not approved." >&2
  exit 1
fi

new_version=$(git show :"$VERSION_FILE" | tr -d '[:space:]')

if command -v sha256sum >/dev/null 2>&1; then
  notes_hash=$(git show :"$NOTES" | sha256sum | awk '{print $1}')
else
  notes_hash=$(git show :"$NOTES" | shasum -a 256 | awk '{print $1}')
fi

printf '%s %s\n' "$new_version" "$notes_hash" > "$APPROVAL"
echo "Approved release notes for version $new_version."
echo "Approval recorded in $APPROVAL (gitignored). Commit when ready."
