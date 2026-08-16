# Game Move layout feedback analytics (`records-layout-feedback-analytics`)

Nightly aggregation of beta Game Move layout feedback events (`LAYOUTFB#` in DynamoDB) into private ops S3 for developer review and optional ML analysis.

## Schedule

Daily **03:00 UTC** (same window as `records-rec-analytics`).

## Inputs

Live scan of `abstract-play-{stage}` for:

- `pk` begins with `LAYOUTFB#`
- `sk >= watermark` (with 5-minute overlap on incremental runs)

Event types: `session_start`, `feedback`, `feedback_note`, `switch_to_classic`, `layout_switch`.

## Outputs (private ops S3)

Prefix: `gamemove-layout/analytics/`

| Key | Description |
|-----|-------------|
| `_state.json` | Watermark and dedupe state |
| `daily/YYYY-MM-DD.json` | UTC daily rollups **including full note text** in `notes[]` |
| `summary.json` | Latest window + rolling 7d/30d + `recentNotes` (up to 500) |
| `report/YYYY-MM-DD.md` | Human-readable summary with recent notes table |

Note records include `userHash` (SHA-256 of Cognito sub from `pk`) for correlating multiple notes without raw user ids in reports. Full `pk` remains in DynamoDB until manual purge.

## Manual invoke

```bash
serverless invoke -f records-layout-feedback-analytics --stage dev
serverless invoke -f records-layout-feedback-analytics --stage prod
```

## DynamoDB cleanup

Layout feedback items have **no TTL**. When the layout experiment concludes, delete `LAYOUTFB#*` items manually (one-off admin script or console).

## Implementation

- [`src/utils/layoutFeedbackAnalytics.ts`](../src/utils/layoutFeedbackAnalytics.ts)
- [`src/functions/records-layout-feedback-analytics.ts`](../src/functions/records-layout-feedback-analytics.ts)

## Related

- [node-backend: Game Move layout feedback events](/backend/subsystems/game-move-layout-feedback/)
