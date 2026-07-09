# Live crons

Two functions operate on **live DynamoDB** rather than the weekly S3 dump. They run on prod schedules and mutate game/tournament/challenge state directly.

## `starttournaments`

**Schedule:** 10:00 and 22:00 UTC daily  
**Source:** [`src/functions/starttournaments.ts`](../src/functions/starttournaments.ts)

### Purpose

Automates the tournament lifecycle:

1. Find tournaments that are ready to start (enough registered players, scheduled start time reached)
2. Cancel tournaments that cannot start (insufficient players)
3. Create initial games for started tournaments via `GameFactory`
4. Send notification emails through SES

### DynamoDB access

Queries and updates `TOURNAMENT` records on `abstract-play-{stage}`. Uses retry logic for throttling (`ThrottlingException`, etc.).

### Gameslib integration

- `gameinfo` — tournament-capable meta games and variant validation
- `GameFactory` — instantiate games from tournament configuration
- `GameBase` / `GameBaseSimultaneous` — create first moves for simultaneous-start games

### Email / i18n

Uses i18next with the `apback` namespace. Locale files in [`src/locales/`](https://github.com/AbstractPlay/backend-crons/tree/develop/src/locales) (en, fr, it). Email templates reference tournament name, meta game, and player lists.

### Related backend docs

- [Tournaments subsystem](/backend/subsystems/tournaments/)
- [Database schema](/backend/database-schema/) — `TOURNAMENT` record shape

## `standingchallenges`

**Schedule:** 00:00 and 12:00 UTC daily  
**Source:** [`src/functions/standingchallenges.ts`](../src/functions/standingchallenges.ts)

### Purpose

Processes **preset standing challenge** requests stored as `REALSTANDING` records. When conditions are met (matching players online, preset rules satisfied), the cron creates challenge records in DynamoDB so the normal challenge flow in node-backend can pick them up.

### DynamoDB access

Queries `REALSTANDING` and related user/challenge records. Does not use gameslib — pure DynamoDB document operations.

### Related backend docs

- [Challenges subsystem](/backend/subsystems/challenges/)

## Dev vs prod

Both functions deploy to dev stacks but **EventBridge schedules are disabled on dev**. Test by invoking manually:

```bash
serverless invoke -f starttournaments --stage prod
serverless invoke -f standingchallenges --stage prod
```

Use prod with care — these mutate live data.

## Related

- [Functions reference](/crons/functions/)
- [Architecture](/crons/architecture/)
- [Deployment](/crons/deployment/)
