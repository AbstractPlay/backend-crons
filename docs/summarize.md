# Summarize

The `summarize` Lambda reads `ALL.json` from the records bucket, computes site-wide statistics, and writes `_summary.json`. It also writes full rivalry pair data (with user IDs) to the private ops bucket. It runs **daily at 06:00 UTC** so analytics stay current even mid-week as new games complete.

Source: [`src/functions/summarize.ts`](../src/functions/summarize.ts). Pure helpers and unit tests: [`src/functions/summarizeHelpers.ts`](../src/functions/summarizeHelpers.ts), [`summarizeHelpers.test.ts`](../src/functions/summarizeHelpers.test.ts).

## Input

1. **`ALL.json`** — full array of [`APGameRecord`](/recranks/) from the `records` cron
2. **`mvtimes.json`** — move-time seasonality (produced by `records-move-times` at 03:00 UTC)
3. **Live DynamoDB** — `USERS` partition query for country codes (geo stats)

## Output

| Destination | Key | Content |
|-------------|-----|---------|
| Records bucket | `_summary.json` | Public `StatSummary` (see below) |
| Private ops bucket | `stats/rivalries.json` | Full rivalry pairs with user IDs |

Typed as `StatSummary` in [`src/types/stats/StatSummary.ts`](../src/types/stats/StatSummary.ts). See also [S3 outputs](/crons/s3-outputs/).

## Top-level fields (`StatSummary`)

| Field | Meaning |
|-------|---------|
| `numGames`, `numPlayers` | Totals from completed games in `ALL.json` |
| `oldestRec`, `newestRec` | ISO date range of completed games |
| `timeoutRate` | Fraction of games ending by **clock timeout or abandonment** (site-wide) |
| `abandonedRate` | Fraction ending by **abandonment only** (stale soft-clock games) |
| `playContext` | `{ casual, event }` — games without vs with tournament/org event linkage |
| `pieRates` | Per meta game: `{ game, n, pied, rate }` where pie is supported |
| `playerCountMix` | Per meta game supporting 3+ players: `{ game, byCount: { "3": n, … } }` |
| `ratings` | ELO / Glicko-2 / TrueSkill aggregates (`highest`, `avg`, `weighted`) |
| `topPlayers` | Top-rated player/game pairs |
| `plays`, `players` | Game and player activity rankings |
| `histograms` | Weekly play distributions (see below) |
| `recent` | Meta games with the most recent completions |
| `hoursPer` | Structured pacing stats (see below) |
| `metaStats` | Per-meta two-player stats including `drawRate` |
| `hMeta` | Per-meta h-index (breadth of participation) |
| `geoStats` | Registered users by country (live `USERS` table) |
| `activeGeoStats` | Players who completed a game in the past 30 days, by profile country |
| `rivalries` | Anonymized two-player pair frequencies (public pairs with ≥50 shared games) |
| `seasonality` | Move-time activity by UTC day/hour (copied from `mvtimes.json`; last 365 days) |

## Processing stages

### Segmentation

Each record is indexed by:

- Meta game name (`rec.header.game.name`)
- Player user IDs
- Date range (`oldestRec`, `newestRec`)
- Timeout vs abandoned moves (via `summarizeHelpers`)
- Play context (casual vs event)
- Pie invocation and multi-player counts where supported

### Meta statistics (`metaStats`)

For each meta game (and variant subgroup when multiple variant combinations exist), computes two-player stats:

- Game count (`n`)
- Average and median move count (`lenAvg`, `lenMedian`)
- First-player win rate (`winsFirst`)
- Draw rate (`drawRate`)

Only games with exactly two players and more than two moves are included.

### Timeout vs abandoned

| Metric | Scope | Includes |
|--------|-------|----------|
| `timeoutRate` | Site-wide | Clock timeouts **and** abandonments |
| `abandonedRate` | Site-wide | Abandonments only |
| `histograms.timeouts` | Weekly rates | Clock timeouts only |
| `histograms.abandoned` | Weekly rates | Abandonments only |
| `players.timeouts` | Per player | Clock timeouts only (not abandonment blame) |

Detection uses `recordHasTimeout` / `recordHasAbandoned` and `findTimeoutPlayerSeat` in [`summarizeHelpers.ts`](../src/functions/summarizeHelpers.ts).

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
- **`timeouts`** — clock-timeout counts with timestamps (not abandonments)

### Histograms (`histograms`)

| Key | Meaning |
|-----|---------|
| `all` | Completed games per week |
| `allPlayers` | Distinct players **completing** a game per week |
| `activeMovers` | Distinct players who made **≥1 move** per week (from move timestamps; ~1y of move data) |
| `meta`, `players` | Per-game and per-player weekly counts |
| `playerTimeouts` | Per-player timeout counts over time |
| `firstTimers` | Users completing their first game that week |
| `returningPlayers` | Users who played that week but first played in an earlier week |
| `timeouts` | Clock-timeout rate per week |
| `abandoned` | Abandonment rate per week |

Week buckets align from `oldestRec`; the right-most bucket may be partial.

**`activeMovers` vs `allPlayers`:** finishers vs players who moved in any game that week (including in-progress async games). Sourced from `mvtimes.json`; only ~365 days of move timestamps are available, so early buckets may be zero.

### Recent activity (`recent`)

Games with the most recent `date-end` values.

### Hours per move (`hoursPer`)

Structured object (`HoursPerStats`):

| Field | Meaning |
|-------|---------|
| `mean` | Move-weighted mean of winsorized per-game rates |
| `median` | Median of winsorized per-game rates |
| `n` | Number of qualifying games |
| `byWeek` | Median winsorized hours per move per week bucket |

Excludes games ending by clock timeout or abandonment and games with fewer than two move rounds. Per-game rates are **winsorized at the 2nd and 98th percentiles** so extreme outliers (very slow correspondence games, bad timestamps) do not dominate the summary.

### Geographic stats

- **`geoStats`** — all registered users with a recognized country on their profile (`pk=USERS` query, `isoToCountryCode`)
- **`activeGeoStats`** — players who completed at least one game in the **past 30 days** (from `ALL.json` completion timestamps), grouped by the same country mapping

### Play context (`playContext`)

Counts games with no event/tournament linkage (`casual`) vs those tied to an org or tournament event (`event`).

### Pie rates (`pieRates`)

For meta games whose gameslib flags include `pie` or `pie-even`: total games, count where pie was invoked (`header.pied` or `header["pie-invoked"]`), and rate.

### Player count mix (`playerCountMix`)

For meta games that support more than two players: histogram of completed games by player count.

### Rivalries

Two-player completed games only. Pairs are canonicalized (`userA < userB`). Only pairs with at least **5** shared games (`RIVALRY_MIN_GAMES`) are included.

**Private ops** (`stats/rivalries.json`): every qualifying pair with `{ userA, nameA, userB, nameB, n }` — user IDs and display names (not anonymized).

**Public** (`_summary.json` → `rivalries`): every pair with at least **50** shared games (`RIVALRY_PUBLIC_MIN_GAMES`), ordered by `n`. Pairs are anonymized as `{ rank, label: "Pair N", n }` unless **both** players have `publicRivalries: true` on their `USERS` record. Opted-in pairs include `players: [{ id, name }, { id, name }]` and `label` as `"NameA vs NameB"`.

```json
{ "rank": 1, "label": "Pair 1", "n": 42 }
```

```json
{
  "rank": 1,
  "label": "Alice vs Bob",
  "n": 42,
  "players": [
    { "id": "…", "name": "Alice" },
    { "id": "…", "name": "Bob" }
  ]
}
```

```json
{
  "generated": "2026-08-14T12:00:00.000Z",
  "minGames": 5,
  "pairs": [{ "userA": "…", "nameA": "Alice", "userB": "…", "nameB": "Bob", "n": 42 }]
}
```

### Seasonality (`seasonality`)

**Not computed in this Lambda.** Copied from `mvtimes.json` → `seasonality`, which is built by [`records-move-times`](../src/functions/records-move-times.ts) from per-move `_timestamp` values on the game stack (last **365** days). This reflects when players actually move, not when async games finish.

| Field | Length | Meaning |
|-------|--------|---------|
| `movesByDow` | 7 | Move count by UTC day-of-week (`0` = Sunday … `6` = Saturday), aggregated across the window |
| `playersByDow` | 7 | Distinct players who made at least one move on that weekday (across the window) |
| `movesByHour` | 24 | Move count by UTC hour (`0`–`23`) |
| `windowDays` | — | Rolling window length (365) |

See [`moveSeasonality.ts`](../src/utils/moveSeasonality.ts).

## Helper module

[`summarizeHelpers.ts`](../src/functions/summarizeHelpers.ts) exports:

| Function / constant | Purpose |
|---------------------|---------|
| `recordHasTimeout` / `recordHasAbandoned` | Detect end-of-game timeout states |
| `findTimeoutPlayerSeat` | Identify which player timed out (clock only) |
| `computeTimeoutHistogramRates` | Weekly clock-timeout rates |
| `computeHoursPerStats` | Winsorized mean, median, and weekly trend for hours per move |
| `computeReturningPlayersPerWeek` | Returning-player histogram |
| `recordWasPied` / `gameSupportsPie` | Pie rule stats |
| `gameSupportsMultiPlayerCount` | Multi-player-capable metas |
| `computeRivalryPairs` / `anonymizeRivalries` / `publishRivalries` / `enrichRivalryPairsWithDisplayNames` | Rivalry aggregation |
| `partitionByGlickoPeriod` / `computeGlickoNumPeriods` | Glicko rating periods |
| `GLICKO_PERIOD_MS` | 60-day period constant |
| `RIVALRY_MIN_GAMES`, `RIVALRY_PUBLIC_MIN_GAMES` | Rivalry thresholds (ops vs public) |

## Custom JSON serialization

Uses `replacer` from gameslib serialization when stringifying nested maps in rating output.

## Related

- [S3 outputs](/crons/s3-outputs/)
- [Recranks](/recranks/) — rating engines and record schema
- [Records pipeline](/crons/pipeline/)
