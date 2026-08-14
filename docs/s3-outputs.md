# S3 outputs

Static artifacts are published to **`records.abstractplay.com`** (S3 + CloudFront). DynamoDB exports land in **`abstractplay-db-dump`** daily (`dumpdb`); batch jobs read the latest completed export.

## Records bucket layout

| Key pattern | Producer | Description |
|-------------|----------|-------------|
| `ALL.json` | `records` | Array of all [`APGameRecord`](/recranks/) objects |
| `_summary.json` | `summarize` | Site-wide analytics — see [Summarize](/crons/summarize/) |
| `_manifest.json` | `records-manifest` | S3 object listing (CloudFront cache buster metadata) |
| `meta/{metaGame}.json` | `records` | Game records filtered by meta game name |
| `player/{playerId}.json` | `records` | Game records for one player |
| `event/{eventId}.json` | `records` | Game records for a tournament or org event |
| `ttm/{playerId}.json` | `records-ttm` | Array of inter-move durations (milliseconds) |
| `mvtimes.json` | `records-move-times` | Move activity counts by meta game and time window |
| `recommendations/cooccur.json` | `records-cooccur` | PMI co-occurrence matrix for game recommendations |
| `tournament-summary.json` | `tournament-data` | Per-player tournament aggregate stats |
| `player/tournaments/{playerId}.json` | `tournament-data` | Individual tournament results for one player |

## Game record format

Each record in `ALL.json`, `meta/`, `player/`, and `event/` files conforms to the **APGameRecord** schema documented in [Recranks](/recranks/). Records are produced by calling `GameFactory(metaGame, state).genRecord(...)` in [`records.ts`](../src/functions/records.ts).

Key header fields used downstream:

- `header.game.name` — meta game display name (used as map key in summarize)
- `header.players[].userid` — player ID
- `header["date-start"]`, `header["date-end"]` — ISO timestamps
- `moves` — move history (timeout/abandoned detection in summarize)

## `_summary.json`

Typed as `StatSummary` in [`src/types/stats/StatSummary.ts`](../src/types/stats/StatSummary.ts). Top-level fields:

| Field | Meaning |
|-------|---------|
| `numGames`, `numPlayers` | Totals from `ALL.json` |
| `oldestRec`, `newestRec` | Date range of completed games |
| `timeoutRate` | Fraction of games with clock timeout **or** abandonment |
| `abandonedRate` | Fraction of games closed by abandonment only |
| `playContext` | Casual vs tournament/org-event game counts |
| `pieRates` | Pie invocation rates for supported meta games |
| `playerCountMix` | Player-count distribution for multi-player metas |
| `ratings` | ELO/Glicko/Trueskill aggregates (`highest`, `avg`, `weighted`) |
| `topPlayers` | Top-rated player/game pairs |
| `plays`, `players` | Game and player activity rankings |
| `histograms` | Play-count distributions, first-timers, returning players, weekly active movers, timeout/abandonment rates |
| `metaStats` | Per-game two-player stats (length, first-player win rate, draw rate) |
| `geoStats` | Registered user counts by country (from live USERS table) |
| `activeGeoStats` | Players who completed a game in the past 30 days, by profile country |
| `rivalries` | Top anonymized two-player pair frequencies (no user IDs) |
| `seasonality` | Move-time activity by UTC day/hour (from `mvtimes.json`; last 365 days) |
| `hoursPer` | `{ mean, median, n, byWeek }` — winsorized (p2–p98) hours per move site-wide |

Full field documentation: [Summarize](/crons/summarize/).

## `mvtimes.json`

Produced by `records-move-times`. Object with:

| Key | Meaning |
|-----|---------|
| `raw1w`, `raw1m`, `raw6m`, `raw1y` | Move counts by meta game in each rolling window |
| `players1w`, … | Distinct active players by meta game per window |
| `playersSum1w`, … | Cumulative unique-player scores by meta game |
| `seasonality` | Site-wide move activity bins (last 365 days): `{ movesByDow, playersByDow, movesByHour, windowDays }` |
| `weeklyActiveMovers` | `{ originMs, byWeek }` — distinct players with ≥1 move per seven-day bucket (same origin as completion histograms; move data ~1y) |

`summarize` copies `seasonality` and aligns `weeklyActiveMovers` into `_summary.json` (`histograms.activeMovers`).

## `recommendations/cooccur.json`

PMI-normalized co-occurrence neighbors per meta-game for the hybrid recommender. Includes optional stars boost (`includeStarredBoost`). Full schema and algorithm: [Recommendation co-occurrence](/crons/recommendations-cooccur/).

## Private ops bucket (`private-ops-153672715141-us-east-1-an`)

Not served via CloudFront. IAM-restricted.

| Key pattern | Producer | Description |
|-------------|----------|-------------|
| `recommendations/analytics/_state.json` | `records-rec-analytics` | Watermark and dedupe state |
| `recommendations/analytics/daily/YYYY-MM-DD.json` | `records-rec-analytics` | UTC daily impression rollups |
| `recommendations/analytics/summary.json` | `records-rec-analytics` | Latest window + rolling 7d/30d |
| `recommendations/analytics/report/YYYY-MM-DD.md` | `records-rec-analytics` | Human/agent-readable report |
| `stats/rivalries.json` | `summarize` | All qualifying rivalry pairs with user IDs and display names (not anonymized; min 5 shared games) |

See [Recommendation analytics](/crons/recommendations-analytics/) and [Summarize](/crons/summarize/).

## Dump bucket layout

Exports from `dumpdb` appear under:

```
AWSDynamoDB/{export-uid}/manifest-summary.json
AWSDynamoDB/{export-uid}/data/*.ion.gz
```

Batch functions locate the newest `manifest-summary.json`, extract the UID, and read all `data/*.gz` files for that export.

## CloudFront

`records-manifest` invalidates distribution `EM4FVU08T5188` with path `/*` after updating `_manifest.json`. Clients should use `_manifest.json` or versioned keys rather than hard-coding cache assumptions.

## Related

- [Records pipeline](/crons/pipeline/)
- [Recommendation co-occurrence](/crons/recommendations-cooccur/)
- [Recommendation analytics](/crons/recommendations-analytics/)
- [Recranks schema reference](/recranks/schema-reference/)
- [Functions reference](/crons/functions/)
