import type { APGameRecord } from "@abstractplay/recranks";
import type {
    GlickoByGameRow,
    GlickoGameCounts,
    GlickoSiteCounts,
    GlickoSiteEntry,
    GlickoStats,
} from "types/stats/GlickoStats.js";
import type { PlayerTimeoutStats } from "types/stats/PlayerTimeoutStats.js";
import type { StatSummary } from "types/stats/StatSummary.js";
import type {
    PlayerSummarySlice,
    StatSummaryPlayers,
    StatSummaryRatings,
    StatSummarySite,
} from "types/stats/StatSummaryTiers.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import type { UserNumList } from "types/stats/UserNumList.js";
import type { UserNumber } from "types/stats/UserNumber.js";

export const GLICKO_PERIOD_MS = 60 * 24 * 60 * 60 * 1000;

type MoveSlot = APGameRecord["moves"][number][number];
type TurnModel = "sequential" | "simultaneous" | "sequenced" | "skip-turn";
const TURN_MODELS: TurnModel[] = ["sequential", "simultaneous", "sequenced", "skip-turn"];

const turnModelFromRecord = (rec: APGameRecord): TurnModel | undefined => {
    const raw = rec.header["turn-model"];
    if (typeof raw === "string" && (TURN_MODELS as string[]).includes(raw)) {
        return raw as TurnModel;
    }
    return undefined;
};

const slotMoveText = (slot: MoveSlot): string | undefined => {
    if (slot === null) {
        return undefined;
    }
    if (typeof slot === "string") {
        return slot;
    }
    return slot.move;
};

const isEmptyMoveSlot = (slot: MoveSlot): boolean => {
    if (slot === null) {
        return true;
    }
    const text = slotMoveText(slot);
    return text === undefined || text === "";
};

const roundHasRealMove = (round: APGameRecord["moves"][number]): boolean =>
    round.some((slot) => !isEmptyMoveSlot(slot));

/** Returns Math.max of nums, or -1 when empty (so `i <= maxBucket` loops are no-ops). */
export function maxOf(nums: number[]): number {
    return nums.length > 0 ? Math.max(...nums) : -1;
}

export function isTimeoutSlot(m: MoveSlot): boolean {
    return m !== null && (typeof m === "object" ? m.move === "timeout" : m === "timeout");
}

export function isAbandonedSlot(m: MoveSlot): boolean {
    return m !== null && (typeof m === "object" ? m.move === "abandoned" : m === "abandoned");
}

export function recordHasAbandoned(moves: APGameRecord["moves"]): boolean {
    return moves.some((round) => round.some(isAbandonedSlot));
}

export function recordHasTimeout(moves: APGameRecord["moves"]): boolean {
    return moves.some((round) => round.some(isTimeoutSlot));
}

export function findTimeoutPlayerSeat(moves: APGameRecord["moves"], numPlayers: number): number | undefined {
    const roundIdx = moves.findIndex((round) => round.some(isTimeoutSlot));
    if (roundIdx === -1) {
        return undefined;
    }
    const round = moves[roundIdx];
    const seatIdx = round.findIndex(isTimeoutSlot);
    if (seatIdx === -1) {
        return undefined;
    }
    const slot = round[seatIdx];
    if (slot === null) {
        return undefined;
    }
    if (typeof slot === "object" && slot.result !== undefined) {
        const results = Array.isArray(slot.result) ? slot.result : [slot.result];
        for (const r of results) {
            if (
                typeof r === "object" &&
                r !== null &&
                "type" in r &&
                r.type === "timeout" &&
                "player" in r &&
                typeof r.player === "number"
            ) {
                return r.player - 1;
            }
        }
    }
    if (round.length === numPlayers) {
        return seatIdx;
    }
    return seatIdx;
}

export function getGlickoPeriodIndex(
    secs: number,
    oldestMs: number,
    periodMs: number,
    numPeriods: number,
): number {
    if (numPeriods <= 1) {
        return 0;
    }
    const idx = Math.floor((secs - oldestMs) / periodMs);
    return Math.min(numPeriods - 1, Math.max(0, idx));
}

export function computeGlickoNumPeriods(deltaMs: number, periodMs: number = GLICKO_PERIOD_MS): number {
    let numPeriods = Math.ceil(deltaMs / periodMs);
    if (numPeriods === 0) {
        numPeriods++;
    }
    return numPeriods;
}

export function partitionByGlickoPeriod<T extends { dateEndMs: number }>(
    records: T[],
    oldestMs: number,
    periodMs: number,
    numPeriods: number,
): T[][] {
    const buckets: T[][] = Array.from({ length: numPeriods }, () => []);
    for (const rec of records) {
        const period = getGlickoPeriodIndex(rec.dateEndMs, oldestMs, periodMs, numPeriods);
        buckets[period].push(rec);
    }
    return buckets;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const HOURS_PER_WINSORIZE_LOW = 2;
const HOURS_PER_WINSORIZE_HIGH = 98;

export function percentileOf(nums: number[], p: number): number | undefined {
    if (nums.length === 0) {
        return undefined;
    }
    const sorted = [...nums].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) {
        return sorted[lower];
    }
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function medianOf(nums: number[]): number | undefined {
    if (nums.length === 0) {
        return undefined;
    }
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted.length % 2 === 0) {
        const rightIdx = sorted.length / 2;
        const leftIdx = rightIdx - 1;
        return (sorted[leftIdx] + sorted[rightIdx]) / 2;
    }
    return sorted[Math.floor(sorted.length / 2)];
}

export type HoursPerGameInput = {
    dateStartMs: number;
    dateEndMs: number;
    moveSlots: number;
};

export type HoursPerStatsResult = {
    mean: number;
    median: number;
    n: number;
    byWeek: number[];
    winsorizedCount: number;
};

type HoursPerGameComputed = HoursPerGameInput & {
    hours: number;
    bucket: number;
};

export function computeHoursPerStats(
    games: HoursPerGameInput[],
    earliestMs: number,
): HoursPerStatsResult {
    const computed: HoursPerGameComputed[] = [];
    for (const game of games) {
        if (game.moveSlots <= 0) {
            continue;
        }
        const duration = game.dateEndMs - game.dateStartMs;
        const hours = (duration / game.moveSlots) / MS_PER_HOUR;
        const daysAgo = (game.dateEndMs - earliestMs) / MS_PER_DAY;
        const bucket = Math.floor(daysAgo / 7);
        computed.push({ ...game, hours, bucket });
    }

    const rawRates = computed.map((g) => g.hours);
    const pLow = percentileOf(rawRates, HOURS_PER_WINSORIZE_LOW);
    const pHigh = percentileOf(rawRates, HOURS_PER_WINSORIZE_HIGH);
    let winsorizedCount = 0;
    let totalMoveSlots = 0;
    let weightedHoursSum = 0;
    const winsorizedRates: number[] = [];
    const byWeekBuckets = new Map<number, number[]>();

    for (const game of computed) {
        let rate = game.hours;
        if (pLow !== undefined && rate < pLow) {
            winsorizedCount++;
            rate = pLow;
        } else if (pHigh !== undefined && rate > pHigh) {
            winsorizedCount++;
            rate = pHigh;
        }
        winsorizedRates.push(rate);
        totalMoveSlots += game.moveSlots;
        weightedHoursSum += rate * game.moveSlots;
        const lst = byWeekBuckets.get(game.bucket);
        if (lst === undefined) {
            byWeekBuckets.set(game.bucket, [rate]);
        } else {
            lst.push(rate);
        }
    }

    const mean = totalMoveSlots > 0 ? weightedHoursSum / totalMoveSlots : 0;
    const median = medianOf(winsorizedRates) ?? 0;
    const maxBucket = maxOf([...byWeekBuckets.keys()]);
    const byWeek: number[] = [];
    for (let i = 0; i <= maxBucket; i++) {
        byWeek.push(medianOf(byWeekBuckets.get(i) ?? []) ?? 0);
    }

    return {
        mean,
        median,
        n: winsorizedRates.length,
        byWeek,
        winsorizedCount,
    };
}

export type WeekActivity = {
    user: string;
    time: number;
};

export function recordWasPied(header: APGameRecord["header"]): boolean {
    if (header.pied === true) {
        return true;
    }
    const pieInvoked = (header as { "pie-invoked"?: boolean })["pie-invoked"];
    return pieInvoked === true;
}

export function gameSupportsPie(flags: string[] | undefined): boolean {
    if (flags === undefined) {
        return false;
    }
    return flags.includes("pie") || flags.includes("pie-even");
}

export function gameSupportsMultiPlayerCount(playercounts: number[]): boolean {
    return playercounts.some((n) => n > 2);
}

export function computeReturningPlayersPerWeek(
    activities: WeekActivity[],
    earliestMs: number,
    maxBucket: number,
): number[] {
    const userFirstBucket = new Map<string, number>();
    const userPlayBuckets = new Map<string, Set<number>>();

    for (const { user, time } of activities) {
        const bucket = Math.floor((time - earliestMs) / MS_PER_DAY / 7);
        const prev = userFirstBucket.get(user);
        if (prev === undefined || bucket < prev) {
            userFirstBucket.set(user, bucket);
        }
        let set = userPlayBuckets.get(user);
        if (set === undefined) {
            set = new Set<number>();
            userPlayBuckets.set(user, set);
        }
        set.add(bucket);
    }

    const returningPlayers: number[] = [];
    for (let i = 0; i <= maxBucket; i++) {
        let count = 0;
        for (const [user, buckets] of userPlayBuckets.entries()) {
            if (buckets.has(i) && (userFirstBucket.get(user) ?? i) < i) {
                count++;
            }
        }
        returningPlayers.push(count);
    }
    return returningPlayers;
}

export const RIVALRY_MIN_GAMES = 5;
export const RIVALRY_PUBLIC_MIN_GAMES = 50;

export function pairKey(userA: string, userB: string): string {
    return userA < userB ? `${userA}|${userB}` : `${userB}|${userA}`;
}

export type RivalryPairResult = {
    userA: string;
    userB: string;
    n: number;
};

export function computeRivalryPairs(
    recs: APGameRecord[],
    minGames: number = RIVALRY_MIN_GAMES,
    topN?: number,
): RivalryPairResult[] {
    const counts = new Map<string, RivalryPairResult>();
    for (const rec of recs) {
        if (rec.header.players.length !== 2) {
            continue;
        }
        const p0 = rec.header.players[0].userid;
        const p1 = rec.header.players[1].userid;
        if (p0 === undefined || p1 === undefined) {
            continue;
        }
        const userA = p0 < p1 ? p0 : p1;
        const userB = p0 < p1 ? p1 : p0;
        const key = pairKey(userA, userB);
        const existing = counts.get(key);
        if (existing === undefined) {
            counts.set(key, { userA, userB, n: 1 });
        } else {
            existing.n++;
        }
    }
    const sorted = [...counts.values()]
        .filter((p) => p.n >= minGames)
        .sort((a, b) => b.n - a.n || a.userA.localeCompare(b.userA) || a.userB.localeCompare(b.userB));
    if (topN === undefined) {
        return sorted;
    }
    return sorted.slice(0, topN);
}

export type AnonymizedRivalryResult = {
    rank: number;
    label: string;
    n: number;
    players?: {
        id: string;
        name: string;
    }[];
};

export function anonymizeRivalries(pairs: RivalryPairResult[]): AnonymizedRivalryResult[] {
    return pairs.map((p, i) => ({
        rank: i + 1,
        label: `Pair ${i + 1}`,
        n: p.n,
    }));
}

export function publishRivalries(
    pairs: RivalryPairResult[],
    publicUserIds: Set<string>,
    displayNames: Map<string, string>,
): AnonymizedRivalryResult[] {
    return pairs.map((p, i) => {
        const rank = i + 1;
        if (publicUserIds.has(p.userA) && publicUserIds.has(p.userB)) {
            const nameA = displayNames.get(p.userA) ?? p.userA;
            const nameB = displayNames.get(p.userB) ?? p.userB;
            return {
                rank,
                label: `${nameA} vs ${nameB}`,
                n: p.n,
                players: [
                    { id: p.userA, name: nameA },
                    { id: p.userB, name: nameB },
                ],
            };
        }
        return {
            rank,
            label: `Pair ${rank}`,
            n: p.n,
        };
    });
}

export type IdentifiedRivalryPairResult = {
    userA: string;
    nameA: string;
    userB: string;
    nameB: string;
    n: number;
};

export function enrichRivalryPairsWithDisplayNames(
    pairs: RivalryPairResult[],
    displayNames: Map<string, string>,
): IdentifiedRivalryPairResult[] {
    return pairs.map((p) => ({
        userA: p.userA,
        nameA: displayNames.get(p.userA) ?? p.userA,
        userB: p.userB,
        nameB: displayNames.get(p.userB) ?? p.userB,
        n: p.n,
    }));
}

export function computeTimeoutHistogramRates(histTimeouts: number[], histAll: number[]): number[] {
    const len = Math.max(histTimeouts.length, histAll.length);
    const rates: number[] = [];
    for (let i = 0; i < len; i++) {
        const timeouts = histTimeouts[i] ?? 0;
        const all = histAll[i] ?? 0;
        rates.push(all > 0 ? timeouts / all : 0);
    }
    return rates;
}

/** Gamerecord round count — legacy `rec.moves.length` when no `turn-model` header. */
export function recordRoundCount(rec: APGameRecord): number {
    const model = turnModelFromRecord(rec);
    if (model === undefined) {
        return rec.moves?.length ?? 0;
    }
    return rec.moves.filter((round) => roundHasRealMove(round)).length;
}

/** Total move slots for hours-per-move — legacy sum of round widths when no header. */
export function recordMoveSlotCount(rec: APGameRecord): number {
    const model = turnModelFromRecord(rec);
    if (model === undefined) {
        return rec.moves.reduce((sum, round) => sum + round.length, 0);
    }
    let total = 0;
    for (const round of rec.moves) {
        for (const slot of round) {
            if (!isEmptyMoveSlot(slot)) {
                total++;
            }
        }
    }
    return total;
}

export const GLICKO_ESTABLISHED_RD = 110;
export const GLICKO_PROVISIONAL_RD = 200;
export const GLICKO_MIN_GAMES_ESTABLISHED = 20;
export const GLICKO_MIN_GAMES_PROVISIONAL = 10;

export const isGlickoProvisional = (rd: number, n: number): boolean =>
    n < GLICKO_MIN_GAMES_PROVISIONAL || rd > GLICKO_PROVISIONAL_RD;

export const isGlickoEstablished = (rd: number, n: number): boolean =>
    n >= GLICKO_MIN_GAMES_ESTABLISHED && rd <= GLICKO_ESTABLISHED_RD;

export function toGlickoStats(rating: number, rd: number, volatility: number, n: number): GlickoStats {
    const ratingLow = rating - 2 * rd;
    const ratingHigh = rating + 2 * rd;
    return {
        rating,
        rd,
        volatility,
        ratingLow,
        ratingHigh,
        provisional: isGlickoProvisional(rd, n),
        established: isGlickoEstablished(rd, n),
        n,
    };
}

export function buildGlickoByGame(rows: { user: string; game: string; glicko: GlickoStats }[]): GlickoByGameRow[] {
    return rows.map((row) => ({ user: row.user, game: row.game, glicko: row.glicko }));
}

export function computeGlickoSiteRatings(rows: GlickoByGameRow[]): GlickoSiteEntry[] {
    const byUser = new Map<string, GlickoByGameRow[]>();
    for (const row of rows) {
        const list = byUser.get(row.user);
        if (list === undefined) {
            byUser.set(row.user, [row]);
        } else {
            list.push(row);
        }
    }
    const site: GlickoSiteEntry[] = [];
    for (const [user, userRows] of byUser.entries()) {
        let totalN = 0;
        let weightedRating = 0;
        let weightedRd = 0;
        let weightedRatingLow = 0;
        let weightedRatingHigh = 0;
        let provisional = false;
        let established = false;
        for (const row of userRows) {
            const { glicko } = row;
            totalN += glicko.n;
            weightedRating += glicko.rating * glicko.n;
            weightedRd += glicko.rd * glicko.n;
            weightedRatingLow += glicko.ratingLow * glicko.n;
            weightedRatingHigh += glicko.ratingHigh * glicko.n;
            provisional = provisional || glicko.provisional;
            established = established || glicko.established;
        }
        if (totalN <= 0) {
            continue;
        }
        site.push({
            user,
            rating: weightedRating / totalN,
            rd: weightedRd / totalN,
            ratingLow: weightedRatingLow / totalN,
            ratingHigh: weightedRatingHigh / totalN,
            n: totalN,
            provisional,
            established,
        });
    }
    site.sort((a, b) => a.user.localeCompare(b.user));
    return site;
}

export function computeGlickoGameCounts(rows: GlickoByGameRow[]): GlickoGameCounts[] {
    const byGame = new Map<string, GlickoGameCounts>();
    for (const row of rows) {
        let counts = byGame.get(row.game);
        if (counts === undefined) {
            counts = { game: row.game, rated: 0, provisional: 0, established: 0 };
            byGame.set(row.game, counts);
        }
        counts.rated++;
        if (row.glicko.provisional) {
            counts.provisional++;
        }
        if (row.glicko.established) {
            counts.established++;
        }
    }
    return [...byGame.values()].sort((a, b) => a.game.localeCompare(b.game));
}

export function computeGlickoSiteCounts(site: GlickoSiteEntry[]): GlickoSiteCounts {
    let provisional = 0;
    let established = 0;
    for (const entry of site) {
        if (entry.provisional) {
            provisional++;
        }
        if (entry.established) {
            established++;
        }
    }
    return {
        rated: site.length,
        provisional,
        established,
    };
}

export type PlayerTimeoutAccumulator = {
    count: number;
    latestTimeoutMs: number;
    times: number[];
};

export function recordPlayerTimeout(
    acc: Map<string, PlayerTimeoutAccumulator>,
    user: string,
    dateMs: number,
): void {
    let entry = acc.get(user);
    if (entry === undefined) {
        entry = { count: 0, latestTimeoutMs: 0, times: [] };
        acc.set(user, entry);
    }
    entry.count++;
    entry.latestTimeoutMs = Math.max(entry.latestTimeoutMs, dateMs);
    entry.times.push(dateMs);
}

export function timeoutStatsFromAccumulator(
    acc: Map<string, PlayerTimeoutAccumulator>,
): PlayerTimeoutStats[] {
    return [...acc.entries()]
        .map(([user, entry]) => ({
            user,
            count: entry.count,
            latestTimeoutMs: entry.latestTimeoutMs,
        }))
        .sort((a, b) => a.user.localeCompare(b.user));
}

export function buildPlayerTimeoutHistograms(
    timeoutAcc: Map<string, PlayerTimeoutAccumulator>,
    allUserIds: Iterable<string>,
    earliestMs: number,
): UserNumList[] {
    const histPlayerTimeouts: UserNumList[] = [];
    for (const userid of allUserIds) {
        const entry = timeoutAcc.get(userid);
        const buckets: { bucket: number }[] = [];
        if (entry !== undefined) {
            for (const value of entry.times) {
                const daysAgo = (value - earliestMs) / (24 * 60 * 60 * 1000);
                const bucket = Math.floor(daysAgo / 7);
                buckets.push({ bucket });
            }
        }
        const maxBucket = maxOf(buckets.map((x) => x.bucket));
        const lst: number[] = [];
        for (let i = 0; i <= maxBucket; i++) {
            lst.push(buckets.filter((x) => x.bucket === i).length);
        }
        histPlayerTimeouts.push({ user: userid, value: [...lst] });
    }
    return histPlayerTimeouts;
}

export function splitStatSummary(
    summary: StatSummary,
    generated: string,
): { site: StatSummarySite; players: StatSummaryPlayers; ratings: StatSummaryRatings } {
    return {
        site: {
            generated,
            tier: "site",
            numGames: summary.numGames,
            numPlayers: summary.numPlayers,
            oldestRec: summary.oldestRec,
            newestRec: summary.newestRec,
            timeoutRate: summary.timeoutRate,
            abandonedRate: summary.abandonedRate,
            playContext: summary.playContext,
            pieRates: summary.pieRates,
            playerCountMix: summary.playerCountMix,
            geoStats: summary.geoStats,
            activeGeoStats: summary.activeGeoStats,
            seasonality: summary.seasonality,
            rivalries: summary.rivalries,
            hoursPer: summary.hoursPer,
            recent: summary.recent,
            histograms: {
                all: summary.histograms.all,
                allPlayers: summary.histograms.allPlayers,
                activeMovers: summary.histograms.activeMovers,
                returningPlayers: summary.histograms.returningPlayers,
                firstTimers: summary.histograms.firstTimers,
                timeouts: summary.histograms.timeouts,
                abandoned: summary.histograms.abandoned,
                meta: summary.histograms.meta,
            },
            hMeta: summary.hMeta,
            metaStats: summary.metaStats,
            plays: summary.plays,
            topPlayers: summary.topPlayers,
        },
        players: {
            generated,
            tier: "players",
            players: summary.players,
            histograms: {
                players: summary.histograms.players,
                playerTimeouts: summary.histograms.playerTimeouts,
            },
        },
        ratings: {
            generated,
            tier: "ratings",
            ratings: summary.ratings,
        },
    };
}

const userNumberMap = (list: UserNumber[]): Map<string, number> =>
    new Map(list.map((row) => [row.user, row.value]));

export type PlayerSummaryIndexes = {
    allPlays: Map<string, number>;
    eclectic: Map<string, number>;
    social: Map<string, number>;
    h: Map<string, number>;
    hOpp: Map<string, number>;
    timeoutStats: Map<string, PlayerTimeoutStats>;
    histPlayers: Map<string, number[]>;
    histPlayerTimeouts: Map<string, number[]>;
    highest: Map<string, UserGameRating[]>;
    glickoByGame: Map<string, GlickoByGameRow[]>;
    glickoSite: Map<string, GlickoSiteEntry>;
    avg: Map<string, number>;
    weighted: Map<string, number>;
};

export function buildPlayerSummaryIndexes(summary: StatSummary): PlayerSummaryIndexes {
    const highest = new Map<string, UserGameRating[]>();
    for (const row of summary.ratings.highest) {
        const list = highest.get(row.user);
        if (list === undefined) {
            highest.set(row.user, [row]);
        } else {
            list.push(row);
        }
    }
    const glickoByGame = new Map<string, GlickoByGameRow[]>();
    for (const row of summary.ratings.glickoByGame) {
        const list = glickoByGame.get(row.user);
        if (list === undefined) {
            glickoByGame.set(row.user, [row]);
        } else {
            list.push(row);
        }
    }
    return {
        allPlays: userNumberMap(summary.players.allPlays),
        eclectic: userNumberMap(summary.players.eclectic),
        social: userNumberMap(summary.players.social),
        h: userNumberMap(summary.players.h),
        hOpp: userNumberMap(summary.players.hOpp),
        timeoutStats: new Map(summary.players.timeoutStats.map((row) => [row.user, row])),
        histPlayers: new Map(summary.histograms.players.map((row) => [row.user, row.value])),
        histPlayerTimeouts: new Map(summary.histograms.playerTimeouts.map((row) => [row.user, row.value])),
        highest,
        glickoByGame,
        glickoSite: new Map(summary.ratings.glickoSite.map((row) => [row.user, row])),
        avg: userNumberMap(summary.ratings.avg),
        weighted: userNumberMap(summary.ratings.weighted),
    };
}

export function collectPlayerSummaryUserIds(summary: StatSummary): string[] {
    const users = new Set<string>();
    for (const row of summary.players.allPlays) {
        users.add(row.user);
    }
    for (const row of summary.players.eclectic) {
        users.add(row.user);
    }
    for (const row of summary.players.social) {
        users.add(row.user);
    }
    for (const row of summary.players.h) {
        users.add(row.user);
    }
    for (const row of summary.players.hOpp) {
        users.add(row.user);
    }
    for (const row of summary.players.timeoutStats) {
        users.add(row.user);
    }
    for (const row of summary.ratings.highest) {
        users.add(row.user);
    }
    return [...users].sort((a, b) => a.localeCompare(b));
}

export function toPlayerSummarySlice(
    user: string,
    generated: string,
    indexes: PlayerSummaryIndexes,
): PlayerSummarySlice {
    const players: PlayerSummarySlice["players"] = {};
    const allPlays = indexes.allPlays.get(user);
    if (allPlays !== undefined) {
        players.allPlays = allPlays;
    }
    const eclectic = indexes.eclectic.get(user);
    if (eclectic !== undefined) {
        players.eclectic = eclectic;
    }
    const social = indexes.social.get(user);
    if (social !== undefined) {
        players.social = social;
    }
    const h = indexes.h.get(user);
    if (h !== undefined) {
        players.h = h;
    }
    const hOpp = indexes.hOpp.get(user);
    if (hOpp !== undefined) {
        players.hOpp = hOpp;
    }
    const timeout = indexes.timeoutStats.get(user);
    if (timeout !== undefined) {
        players.timeoutCount = timeout.count;
        players.latestTimeoutMs = timeout.latestTimeoutMs;
    }

    const histograms: PlayerSummarySlice["histograms"] = {};
    const playerHist = indexes.histPlayers.get(user);
    if (playerHist !== undefined) {
        histograms.players = playerHist;
    }
    const timeoutHist = indexes.histPlayerTimeouts.get(user);
    if (timeoutHist !== undefined) {
        histograms.playerTimeouts = timeoutHist;
    }

    const ratings: PlayerSummarySlice["ratings"] = {
        highest: indexes.highest.get(user) ?? [],
    };
    const glickoRows = indexes.glickoByGame.get(user);
    if (glickoRows !== undefined && glickoRows.length > 0) {
        ratings.glickoByGame = glickoRows;
    }
    const glickoSite = indexes.glickoSite.get(user);
    if (glickoSite !== undefined) {
        ratings.glickoSite = glickoSite;
    }
    const avg = indexes.avg.get(user);
    if (avg !== undefined) {
        ratings.avg = avg;
    }
    const weighted = indexes.weighted.get(user);
    if (weighted !== undefined) {
        ratings.weighted = weighted;
    }

    return { generated, user, players, histograms, ratings };
}

/** Keys present on the monolith that are partitioned across tier files. */
export const STAT_SUMMARY_PARTITIONED_KEYS = [
    "numGames",
    "numPlayers",
    "oldestRec",
    "newestRec",
    "timeoutRate",
    "abandonedRate",
    "playContext",
    "pieRates",
    "playerCountMix",
    "geoStats",
    "activeGeoStats",
    "seasonality",
    "rivalries",
    "hoursPer",
    "recent",
    "hMeta",
    "metaStats",
    "plays",
    "topPlayers",
    "players",
    "ratings",
    "histograms",
] as const;

export function statSummaryTierKeys(site: StatSummarySite, players: StatSummaryPlayers, ratings: StatSummaryRatings): Set<string> {
    const keys = new Set<string>();
    for (const key of Object.keys(site)) {
        if (key !== "generated" && key !== "tier") {
            keys.add(key);
        }
    }
    for (const key of Object.keys(players)) {
        if (key !== "generated" && key !== "tier") {
            keys.add(key);
        }
    }
    for (const key of Object.keys(ratings)) {
        if (key !== "generated" && key !== "tier") {
            keys.add(key);
        }
    }
    return keys;
}
