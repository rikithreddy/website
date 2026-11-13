# Agent Rules

## Release notes and versioning

- `RELEASE_NOTES.md` contains the high-level summary for each released version.
- `CHANGELOG.md` contains the detailed, chronological list of changes.
- Keep both in sync when preparing a release.
- `RELEASE_NOTES.md` and `VERSION` are protected by a pre-commit hook.
- Never commit changes to `RELEASE_NOTES.md` or `VERSION` without explicit approval from the user in the current conversation.
- Before requesting approval, stage the proposed `RELEASE_NOTES.md` and `VERSION` changes and show the user the exact diff.
- Wait for an explicit approval message (for example, "approved") before recording approval or committing.
- Record approval only with `scripts/approve-release-notes.sh` after the user approves. The script requires typing `APPROVE` and writes a content-hash approval marker.
- Every release-notes change must include a higher version in `VERSION` (for example, `0.1v` -> `0.2v`).
- Never commit `.release-notes-approval`; it is local and gitignored.
- Do not bypass or edit the hooks to avoid these rules.

## Git workflow

- Do development on the `staging` branch. `main` is protected and requires a pull request.
- Push to `staging` to deploy to the staging site at https://rikithreddy.github.io/website-staging/.
