# S3 outputs

Static artifacts are published to **`records.abstractplay.com`** (S3 + CloudFront). The weekly DynamoDB export lands in **`abstractplay-db-dump`**.

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
| `timeoutRate` | Fraction of games with timeout or abandoned moves |
| `ratings` | ELO/Glicko/Trueskill aggregates (`highest`, `avg`, `weighted`) |
| `topPlayers` | Top-rated player/game pairs |
| `plays`, `players` | Game and player activity rankings |
| `histograms` | Play-count distributions |
| `metaStats` | Per-game two-player stats (length, first-player win rate) |
| `geoStats` | Player counts by country (from live USERS table) |
| `hoursPer` | Distribution of hours per move site-wide |

Full field documentation: [Summarize](/crons/summarize/).

## `mvtimes.json`

Object with keys `raw1w`, `raw1m`, `raw6m`, `raw1y`, `players1w`, … — each an array of `{ metaGame, score }` entries counting moves or unique players in that window.

## Dump bucket layout

Exports from `dumpdb` appear under:

```
AWSDynamoDB/{export-uid}/manifest-summary.json
AWSDynamoDB/{export-uid}/data/*.ion.gz
```

Batch functions locate the newest `manifest-summary.json`, extract the UID, and read all `data/*.ion.gz` files for that export.

## CloudFront

`records-manifest` invalidates distribution `EM4FVU08T5188` with path `/*` after updating `_manifest.json`. Clients should use `_manifest.json` or versioned keys rather than hard-coding cache assumptions.

## Related

- [Records pipeline](/crons/pipeline/)
- [Recranks schema reference](/recranks/schema-reference/)
- [Functions reference](/crons/functions/)
