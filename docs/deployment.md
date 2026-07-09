# Deployment

## Automatic deploys

GitHub Actions deploy via Serverless Framework:

| Branch / trigger | Workflow | Stage |
|------------------|----------|-------|
| `develop` push | [`.github/workflows/deploy-dev.js.yml`](../.github/workflows/deploy-dev.js.yml) | `dev` |
| `main` push | [`.github/workflows/deploy-prod.js.yml`](../.github/workflows/deploy-prod.js.yml) | `prod` |
| `repository_dispatch` `dep_update_dev` | deploy-dev | `dev` |
| `repository_dispatch` `dep_update_prod` | deploy-prod | `prod` |

Upstream repos (notably [gameslib](https://github.com/AbstractPlay/gameslib)) dispatch `dep_update_dev` / `dep_update_prod` after package publishes, which redeploys backend-crons with updated dependencies.

## Dev vs prod CI

**Dev** (`develop`):

- Pins `@abstractplay/gameslib@development` and `@abstractplay/renderer@development`
- Deletes `package-lock.json` and runs fresh `npm i`
- Bumps version to `ci-{run_id}` prerelease

**Prod** (`main`):

- Uses `latest` from `package.json`
- Same lockfile refresh pattern

Both run `npm run build` (ESLint) then `serverless deploy`. The `build:layers` hook runs automatically via `serverless-scriptable-plugin` before packaging.

## Manual deploy

With AWS profiles configured:

```bash
npm run build:layers
npm run build
serverless deploy              # dev (default stage)
serverless --stage prod deploy # prod
```

Or: `npm run deploy-dev`, `npm run deploy-prod`, `npm run full-dev`, `npm run full-prod`.

## Schedules

EventBridge cron rules are **enabled only on prod** (`custom.scheduleEnabled.prod: true`). Dev stacks contain the Lambdas but scheduled invocations are off — invoke manually if needed.

## Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `AWS_KEY`, `AWS_SECRET` | Deploy credentials |
| `PAT_READ_PACKAGES` | npm install from GitHub Packages |
| `PAT_WORKFLOWS` | Trigger docs rebuild (see below) |

## Documentation deploys

On every successful **push** deploy, the workflow dispatches `dep_update_dev` or `dep_update_prod` to the [docs](https://github.com/AbstractPlay/docs) repository so the site rebuilds with updated crons documentation (gameslib/renderer pattern — unconditional, not limited to `docs/` changes).

## Related

- [Getting started](/crons/getting-started/)
- [Architecture](/crons/architecture/)
