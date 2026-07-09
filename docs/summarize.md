# Summarize

The `summarize` Lambda reads `ALL.json` from the records bucket, computes site-wide statistics, and writes `_summary.json`. It runs **daily at 06:00 UTC** so analytics stay current even mid-week as new games complete.

Source: [`src/functions/summarize.ts`](../src/functions/summarize.ts). Pure helpers and unit tests: [`src/functions/summarizeHelpers.ts`](../src/functions/summarizeHelpers.ts), [`summarizeHelpers.test.ts`](../src/functions/summarizeHelpers.test.ts).

## Input

1. **`ALL.json`** — full array of [`APGameRecord`](/recranks/) from the `records` cron
2. **Live DynamoDB** — `USERS` partition query for country codes (geo stats only)

## Output

**`_summary.json`** — matches the `StatSummary` type in [`src/types/stats/StatSummary.ts`](../src/types/stats/StatSummary.ts). See also [S3 outputs](/crons/s3-outputs/).

## Processing stages

### Segmentation

Each record is indexed by:

- Meta game name (`rec.header.game.name`)
- Player user IDs
- Date range (`oldestRec`, `newestRec`)
- Timeout/abandoned moves (via `summarizeHelpers`)

### Meta statistics (`metaStats`)

For each meta game (and variant subgroup when multiple variant combinations exist), computes two-player stats:

- Game count (`n`)
- Average and median move count (`lenAvg`, `lenMedian`)
- First-player win rate (`winsFirst`)

Only games with exactly two players and more than two moves are included.

### H-index metrics

- **`hMeta`** — per-meta-game h-index (breadth of player participation)
- **`players.h`, `players.hOpp`** — player h-index and opponent h-index site-wide

Uses `gameinfo` from gameslib to map display names to meta UIDs.

### Ratings (`ratings`)

For each meta game (and variant subgroup), runs three rating engines from `@abstractplay/recranks`:

| Engine | Class | Notes |
|--------|-------|-------|
| ELO | `ELOBasic` | Default batch rating |
| Glicko-2 | `Glicko2` | Period-based; 60-day periods via `GLICKO_PERIOD_MS` |
| TrueSkill | `Trueskill` | `betaStart: 25/9` |

Outputs:

- `ratings.highest` — top raw ratings per user/game
- `ratings.avg` — simple averages
- `ratings.weighted` — weighted by games played

### Player rankings (`players`, `topPlayers`)

- **`social`** — players with the most distinct opponents
- **`eclectic`** — players who played the widest variety of meta games
- **`allPlays`** — total games played
- **`timeouts`** — timeout counts with timestamps

### Histograms (`histograms`)

Play-count distributions at site, meta, and player granularity; timeout histograms; first-timer counts.

### Recent activity (`recent`)

Games with the most recent `date-end` values.

### Hours per move (`hoursPer`)

For non-timeout games, computes `(date-end - date-start) / numMoves` in hours. Outliers above 200 hours are logged but included.

### Geographic stats (`geoStats`)

Queries `pk=USERS` from `ABSTRACT_PLAY_TABLE`, normalizes country codes via `isoToCountryCode`, and counts players per ISO alpha-2 code.

## Helper module

[`summarizeHelpers.ts`](../src/functions/summarizeHelpers.ts) exports:

| Function | Purpose |
|----------|---------|
| `recordHasTimeout` / `recordHasAbandoned` | Detect end-of-game timeout states |
| `findTimeoutPlayerSeat` | Identify which player timed out |
| `computeTimeoutHistogramRates` | Bucket timeout counts over time |
| `partitionByGlickoPeriod` | Split records into Glicko rating periods |
| `computeGlickoNumPeriods` | Derive period count from date range |
| `GLICKO_PERIOD_MS` | 60-day period constant |

## Custom JSON serialization

Uses `replacer` from gameslib serialization when stringifying nested maps in rating output.

## Related

- [S3 outputs](/crons/s3-outputs/)
- [Recranks](/recranks/) — rating engines and record schema
- [Records pipeline](/crons/pipeline/)
