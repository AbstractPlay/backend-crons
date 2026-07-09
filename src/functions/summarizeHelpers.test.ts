import { describe, expect, it } from "vitest";
import type { APGameRecord } from "@abstractplay/recranks";
import {
    GLICKO_PERIOD_MS,
    computeGlickoNumPeriods,
    computeTimeoutHistogramRates,
    findTimeoutPlayerSeat,
    getGlickoPeriodIndex,
    maxOf,
    partitionByGlickoPeriod,
    recordHasAbandoned,
    recordHasTimeout,
} from "./summarizeHelpers.js";

type Moves = APGameRecord["moves"];

describe("maxOf", () => {
    it("returns -1 for an empty array", () => {
        expect(maxOf([])).toBe(-1);
    });

    it("returns the maximum value", () => {
        expect(maxOf([3, 1])).toBe(3);
    });
});

describe("getGlickoPeriodIndex", () => {
    const oldest = 1_000_000;

    it("assigns all records to period 0 when numPeriods is 1", () => {
        expect(getGlickoPeriodIndex(oldest, oldest, GLICKO_PERIOD_MS, 1)).toBe(0);
        expect(getGlickoPeriodIndex(oldest + GLICKO_PERIOD_MS, oldest, GLICKO_PERIOD_MS, 1)).toBe(0);
    });

    it("includes records on the final period boundary", () => {
        const newest = oldest + GLICKO_PERIOD_MS;
        expect(getGlickoPeriodIndex(newest, oldest, GLICKO_PERIOD_MS, 1)).toBe(0);
    });

    it("splits records across multiple periods", () => {
        const numPeriods = 2;
        expect(getGlickoPeriodIndex(oldest, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(0);
        expect(getGlickoPeriodIndex(oldest + GLICKO_PERIOD_MS - 1, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(0);
        expect(getGlickoPeriodIndex(oldest + GLICKO_PERIOD_MS, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(1);
        expect(getGlickoPeriodIndex(oldest + 2 * GLICKO_PERIOD_MS, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(1);
    });
});

describe("computeGlickoNumPeriods", () => {
    it("returns at least one period", () => {
        expect(computeGlickoNumPeriods(0)).toBe(1);
        expect(computeGlickoNumPeriods(GLICKO_PERIOD_MS)).toBe(1);
        expect(computeGlickoNumPeriods(GLICKO_PERIOD_MS + 1)).toBe(2);
    });
});

describe("partitionByGlickoPeriod", () => {
    it("assigns every record to exactly one bucket", () => {
        const oldestMs = 0;
        const records = [
            { dateEndMs: 0 },
            { dateEndMs: GLICKO_PERIOD_MS },
            { dateEndMs: 2 * GLICKO_PERIOD_MS },
        ];
        const numPeriods = computeGlickoNumPeriods(2 * GLICKO_PERIOD_MS);
        const buckets = partitionByGlickoPeriod(records, oldestMs, GLICKO_PERIOD_MS, numPeriods);
        const assigned = buckets.flat();
        expect(assigned).toHaveLength(records.length);
        expect(assigned.map((r) => r.dateEndMs).sort((a, b) => a - b)).toEqual(
            records.map((r) => r.dateEndMs).sort((a, b) => a - b),
        );
    });
});

describe("computeTimeoutHistogramRates", () => {
    it("returns 0 for empty week buckets instead of NaN", () => {
        expect(computeTimeoutHistogramRates([0, 0, 1], [5, 0, 10])).toEqual([0, 0, 0.1]);
    });

    it("aligns arrays of different lengths", () => {
        expect(computeTimeoutHistogramRates([1], [2, 4])).toEqual([0.5, 0]);
    });

    it("never produces NaN", () => {
        const rates = computeTimeoutHistogramRates([0, 0, 0], [0, 0, 0]);
        expect(rates.every((r) => !Number.isNaN(r))).toBe(true);
        expect(rates).toEqual([0, 0, 0]);
    });
});

describe("recordHasAbandoned", () => {
    it("detects plain-string abandoned moves", () => {
        const moves: Moves = [["e2-e4", "e7-e5"], ["abandoned"]];
        expect(recordHasAbandoned(moves)).toBe(true);
        expect(recordHasTimeout(moves)).toBe(false);
    });

    it("detects structured abandoned moves", () => {
        const moves: Moves = [[{ move: "abandoned", result: [{ type: "gameabandoned" }] }]];
        expect(recordHasAbandoned(moves)).toBe(true);
    });

    it("does not false-positive on unrelated move text", () => {
        const moves: Moves = [["mention-timeout-in-chat"]];
        expect(recordHasTimeout(moves)).toBe(false);
        expect(recordHasAbandoned(moves)).toBe(false);
    });
});

describe("recordHasTimeout", () => {
    it("detects plain-string timeout moves", () => {
        const moves: Moves = [["e2-e4", "timeout"]];
        expect(recordHasTimeout(moves)).toBe(true);
    });

    it("detects structured timeout moves", () => {
        const moves: Moves = [[{ move: "timeout", result: [{ type: "timeout", player: 2 }] }]];
        expect(recordHasTimeout(moves)).toBe(true);
    });
});

describe("findTimeoutPlayerSeat", () => {
    it("uses seat index for full rounds", () => {
        const moves: Moves = [["e2-e4", "timeout"]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBe(1);
    });

    it("uses seat index for partial sequential rounds", () => {
        const moves: Moves = [["timeout"]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBe(0);
    });

    it("prefers structured result.player over seat index", () => {
        const moves: Moves = [[
            { move: "timeout", result: [{ type: "timeout", player: 2 }] },
            null,
        ]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBe(1);
    });

    it("returns undefined when no timeout move exists", () => {
        const moves: Moves = [["e2-e4", "e7-e5"]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBeUndefined();
    });
});
