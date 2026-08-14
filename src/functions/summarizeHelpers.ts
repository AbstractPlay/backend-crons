import type { APGameRecord } from "@abstractplay/recranks";

export const GLICKO_PERIOD_MS = 60 * 24 * 60 * 60 * 1000;

type MoveSlot = APGameRecord["moves"][number][number];

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
export const RIVALRY_PUBLIC_TOP_N = 25;

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
