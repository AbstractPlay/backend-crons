import { describe, expect, it } from "vitest";
import type { GlickoMeta } from "types/stats/GlickoStats.js";
import type { StatSummaryRatings } from "types/stats/StatSummaryTiers.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import { GLICKO_MIN_GAMES_PROVISIONAL } from "../functions/summarizeHelpers.js";
import {
    buildRatingChangeSnapshot,
    diffRatingChanges,
    filterCandidates,
    MIN_RATING_DELTA,
    toNotificationItems,
    type RatingNotificationSnapshot,
} from "./ratingChangeNotifications.js";

function glickoRow(
    user: string,
    game: string,
    ratingLow: number,
    n: number,
    provisional = false,
): UserGameRating {
    return {
        user,
        game,
        rating: ratingLow + 100,
        wld: [n, 0, 0],
        glicko: {
            rating: ratingLow + 100,
            rd: 60,
            volatility: 0.06,
            ratingLow,
            ratingHigh: ratingLow + 200,
            provisional,
            established: !provisional,
            n,
        },
    };
}

function minimalGlickoMeta(): GlickoMeta {
    return {
        establishedRd: 110,
        provisionalRd: 200,
        minGamesEstablished: 20,
        minGamesProvisional: GLICKO_MIN_GAMES_PROVISIONAL,
        periodMs: 86400000,
        generatedAt: "2026-08-25T06:00:00.000Z",
        counts: {
            byGame: [],
            site: { rated: 0, provisional: 0, established: 0 },
        },
    };
}

function ratingsSummary(
    highest: UserGameRating[],
    generatedAt = "2026-08-25T06:00:00.000Z",
): StatSummaryRatings {
    return {
        generated: generatedAt,
        tier: "ratings",
        ratings: {
            highest,
            avg: [],
            weighted: [],
            glickoByGame: [],
            glickoSite: [],
            glickoMeta: { ...minimalGlickoMeta(), generatedAt },
            playerCountsByUid: {},
        },
    };
}

const constants = {
    minRatingDelta: MIN_RATING_DELTA,
    minGamesProvisional: GLICKO_MIN_GAMES_PROVISIONAL,
};

describe("buildRatingChangeSnapshot", () => {
    it("indexes highest rows by user and game label", () => {
        const summary = ratingsSummary([
            glickoRow("alice", "chess (no variants)", 1200, 10),
            glickoRow("alice", "go (9x9|handicap)", 1170, 5),
        ]);
        const snapshot = buildRatingChangeSnapshot(summary, summary.ratings.glickoMeta.generatedAt);
        expect(snapshot.entries["alice|chess (no variants)"]).toEqual({ ratingLow: 1200, n: 10 });
        expect(snapshot.entries["alice|go (9x9|handicap)"]).toEqual({ ratingLow: 1170, n: 5 });
    });
});

describe("filterCandidates gates", () => {
    const prev: RatingNotificationSnapshot = {
        generatedAt: "2026-08-24T06:20:00.000Z",
        summaryGeneratedAt: "2026-08-24T06:00:00.000Z",
        entries: {
            "alice|chess (no variants)": { ratingLow: 1190, n: 10 },
            "bob|chess (no variants)": { ratingLow: 1100, n: 8 },
            "carol|chess (no variants)": { ratingLow: 1000, n: 3 },
            "dave|chess (no variants)": { ratingLow: 900, n: 2 },
            "eve|chess (no variants)": { ratingLow: 800, n: 15 },
            "frank|chess (no variants)": { ratingLow: 700, n: 12 },
            "grace|chess (no variants)": { ratingLow: 600, n: 20 },
            "henry|chess (no variants)": { ratingLow: 500, n: 11 },
            "ivy|chess (no variants)": { ratingLow: 400, n: 16 },
            "jack|chess (no variants)": { ratingLow: 300, n: 17 },
            "kate|chess (no variants)": { ratingLow: 200, n: 18 },
            "leo|chess (no variants)": { ratingLow: 100, n: 19 },
            "mary|chess (no variants)": { ratingLow: 50, n: 20 },
        },
    };

    it("skips when n unchanged", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1250, 10),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedNoActivity).toBe(1);
    });

    it("skips when delta below threshold", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1193, 11),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedBelowThreshold).toBe(1);
    });

    it("notifies when n increased and delta meets threshold", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1200, 11),
        ]);
        const { candidates } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            userId: "alice",
            metaGameUid: "chess",
            variants: [],
            oldRating: 1190,
            newRating: 1200,
            delta: 10,
        });
    });

    it("skips provisional players below minGamesProvisional", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("carol", "chess (no variants)", 1100, 4, true),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedProvisional).toBe(1);
    });

    it("skips bot users", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1200, 11),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(["alice"]), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedBot).toBe(1);
    });

    it("emits one notification for multiple games in same pool (aggregate delta)", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1210, 15),
        ]);
        const { candidates } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.delta).toBe(20);
    });

    it("emits notifications for all qualifying different pools (no per-user cap)", () => {
        const multiPrev: RatingNotificationSnapshot = {
            generatedAt: "2026-08-24T06:20:00.000Z",
            summaryGeneratedAt: "2026-08-24T06:00:00.000Z",
            entries: {
                "alice|chess (no variants)": { ratingLow: 1000, n: 5 },
                "alice|go (9x9|handicap)": { ratingLow: 1000, n: 5 },
                "alice|go (19x19)": { ratingLow: 1000, n: 5 },
                "alice|shogi (no variants)": { ratingLow: 1000, n: 5 },
                "alice|xiangqi (no variants)": { ratingLow: 1000, n: 5 },
            },
        };
        const diffRows = diffRatingChanges(multiPrev, [
            glickoRow("alice", "chess (no variants)", 1020, 6),
            glickoRow("alice", "go (9x9|handicap)", 1020, 6),
            glickoRow("alice", "go (19x19)", 1020, 6),
            glickoRow("alice", "shogi (no variants)", 1020, 6),
            glickoRow("alice", "xiangqi (no variants)", 1020, 6),
        ]);
        const { candidates } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(5);
    });
});

describe("toNotificationItems", () => {
    it("matches node-backend ratingChange body shape", () => {
        const items = toNotificationItems([
            {
                userId: "alice",
                gameLabel: "go (9x9|handicap)",
                metaGameUid: "go",
                variants: ["9x9", "handicap"],
                oldRating: 1100,
                newRating: 1120,
                delta: 20,
            },
        ], 1_700_000_000_000);
        expect(items).toHaveLength(1);
        expect(items[0]?.pk).toBe("NOTIFICATION#alice");
        expect(items[0]?.body).toEqual({
            type: "ratingChange",
            metaGame: "go",
            variants: ["9x9", "handicap"],
            gameId: "",
            oldRating: 1100,
            newRating: 1120,
            delta: 20,
        });
        expect(items[0]?.expiresAt).toBeGreaterThan(1_700_000_000);
    });
});

describe("first run and idempotent re-run", () => {
    it("first run builds snapshot with no prior entries to diff against", () => {
        const summary = ratingsSummary([glickoRow("alice", "chess (no variants)", 1200, 1)]);
        const snapshot = buildRatingChangeSnapshot(summary, summary.ratings.glickoMeta.generatedAt);
        expect(Object.keys(snapshot.entries)).toHaveLength(1);
        expect(snapshot.summaryGeneratedAt).toBe("2026-08-25T06:00:00.000Z");
    });

    it("idempotent when summaryGeneratedAt unchanged", () => {
        const generatedAt = "2026-08-25T06:00:00.000Z";
        const prev = buildRatingChangeSnapshot(
            ratingsSummary([glickoRow("alice", "chess (no variants)", 1200, 11)], generatedAt),
            generatedAt,
        );
        const nextSummary = ratingsSummary([glickoRow("alice", "chess (no variants)", 1250, 12)], generatedAt);
        expect(nextSummary.ratings.glickoMeta.generatedAt).toBe(prev.summaryGeneratedAt);
    });
});
