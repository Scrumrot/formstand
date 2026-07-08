# Releasing

Two packages ship from this repo: **formstand** (root) and **formstand-cli**
(`cli/`). Both publish from CI with npm provenance when the matching tag is
pushed — see `.github/workflows/publish.yml`.

## Prerequisite (one-time)

Both packages use npm **trusted publishing** (OIDC) — no token or repository
secret. Configure it once per package on npmjs.com under
*Package → Settings → Trusted Publisher → GitHub Actions*:

| Field             | Value            |
| ----------------- | ---------------- |
| Organization/user | `Scrumrot`       |
| Repository        | `formstand`      |
| Workflow filename | `publish.yml`    |
| Environment       | (leave empty)    |

Do this for **both** `formstand` and `formstand-cli` (same values — both
publish from the same repo and workflow file). CI then authenticates via a
short-lived OIDC exchange (`id-token: write` in the workflow) and provenance
attestations are generated automatically.

## Checklist: formstand (root package)

1. Add a section for the new version to `CHANGELOG.md`.
2. Bump `version` in `package.json`.
3. Commit: `git commit -am "release: formstand vX.Y.Z"`.
4. Tag: `git tag vX.Y.Z`.
5. Push: `git push && git push origin vX.Y.Z` — the Publish workflow first
   verifies the tag matches `package.json`'s `version` (a mismatch fails the
   run before anything publishes), then runs the full gate (typecheck, lint,
   tests with coverage) and publishes with provenance.
6. Create the GitHub release:
   `gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag` (or paste
   the CHANGELOG section as notes).

## Checklist: formstand-cli (cli/)

1. Add a CHANGELOG entry for the CLI change (root `CHANGELOG.md`).
2. Bump `version` in `cli/package.json`.
3. Commit: `git commit -am "release: formstand-cli vX.Y.Z"`.
4. Tag: `git tag cli-vX.Y.Z`.
5. Push: `git push && git push origin cli-vX.Y.Z` — the workflow first
   verifies the tag matches `cli/package.json`'s `version` (a mismatch fails
   the run before anything publishes), then publishes from `cli/` (its
   `prepublishOnly` runs typecheck, tests, and build).
6. `gh release create cli-vX.Y.Z --title "formstand-cli vX.Y.Z"`.

## Manual fallback

If the workflow is unavailable, publish locally with a one-time password:

```bash
npm run build            # or: cd cli
npm publish --otp <code> --access public
```

(Local publishes lack provenance; prefer the workflow.)
