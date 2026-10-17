# Releasing

[Changesets](https://github.com/changesets/changesets) automates releases. GitHub Actions publishes them to npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers), which uses GitHub Actions OIDC. No npm token exists in the repository secrets, on the machine of a maintainer, or anywhere else.

## One-time setup (not yet done)

The workflows in `.github/workflows/` are ready. Publishing needs two pieces of external configuration before the first release:

1. On npmjs.com, configure a trusted publisher for the `ok-apca` package. Point it at the `release.yml` workflow of this repository and the `release` environment.
2. In the repository settings on GitHub, create an environment named `release` with a required reviewer. Each publish then waits for explicit approval.

## Day-to-day flow

1. Merge PRs with changeset files as usual. Run `pnpm changeset` to create one.
2. On every push to `main`, the release workflow updates the "Version Packages" PR. This PR collects the pending changesets into a version bump and a changelog entry for `ok-apca`.
3. When you merge that PR, `main` has a version that is not published yet. The workflow detects this and queues the `publish` job against the `release` environment. The job waits for reviewer approval.
4. Approve the deployment. The job runs lint, build, tests, and typecheck again on the exact tree that it publishes. Then `changeset publish` publishes with provenance, pushes the `ok-apca@x.y.z` git tag, and creates the GitHub Release.

If a push to `main` leaves nothing to publish, the workflow never requests approval. This happens when the current version is already on npm, or when changesets are still pending.

## Local commands

- `pnpm changeset` creates a changeset file in `.changeset/`.
- `pnpm changeset status` lists the pending bumps.
- `pnpm changeset:version` applies the pending changesets locally. CI does this for you in the Version Packages PR, so you rarely need it.
