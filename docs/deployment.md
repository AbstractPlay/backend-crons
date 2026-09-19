# Deployment (archived repo)

**Canonical deployment docs:** [node-backend `crons/docs/deployment.md`](https://github.com/AbstractPlay/node-backend/blob/develop/crons/docs/deployment.md) and [Backend deployment — two stacks](https://docs.abstractplay.com/backend/deployment/).

This repository no longer deploys. GitHub Actions `Deploy Dev` / `Deploy Prod` here are **retired** (`workflow_dispatch` only). All `develop` / `main` pushes and `dep_update_*` dispatches should target **AbstractPlay/node-backend**, which deploys both the API stack and `abstract-play-backend-crons`.

## Manual deploy (current)

From a **node-backend** checkout:

```bash
# After API deploy (or from CI)
bash crons/scripts/serverless-deploy.sh dev   # or prod
```

See [Getting started](https://docs.abstractplay.com/crons/getting-started/) on the docs site for layers and local commands (`npm run test:crons:layers`, etc.).
