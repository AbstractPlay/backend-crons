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
