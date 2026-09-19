# Backend Crons (archived)

**This repository is archived.** Scheduled Lambda jobs now live in the [node-backend](https://github.com/AbstractPlay/node-backend) monorepo under [`crons/`](https://github.com/AbstractPlay/node-backend/tree/develop/crons).

| Concern | Where |
|---------|--------|
| Source & tests | `node-backend/crons/` |
| Deploy | node-backend **Deploy Dev** / **Deploy Prod** (API stack, then `crons/scripts/serverless-deploy.sh`) |
| Developer docs | [docs.abstractplay.com/crons/](https://docs.abstractplay.com/crons/) (from `node-backend/crons/docs/`) |
| AWS stack name | Unchanged: `abstract-play-backend-crons` |

Clone and work from **node-backend** only. This tree is kept for history and redirects; do not open PRs here.
