import { describe, expect, it } from "vitest";
import type { APGameRecord } from "@abstractplay/recranks";
import {
    accumulateRivalryPair,
    finalizeRivalryPairs,
} from "./summarizeHelpers.js";
import {
    buildPlayerStats,
    createSummarizeScanState,
    scanRecord,
} from "./summarizeScan.js";

function minimalRec(opts: {
    gameid: string;
    gameName: string;
    dateEnd: string;
    p1: string;
    p2: string;
}): APGameRecord {
    return {
        header: {
            game: { name: opts.gameName },
            site: { name: "Abstract Play", gameid: opts.gameid },
            "date-start": opts.dateEnd,
            "date-end": opts.dateEnd,
            "date-generated": opts.dateEnd,
            players: [
                { name: "A", userid: opts.p1, result: 1 },
                { name: "B", userid: opts.p2, result: 0 },
            ],
        },
        moves: [["e4", "e5"], ["d4", "d5"]],
    } as APGameRecord;
}

describe("summarizeScan", () => {
    it("accumulates player stats in one pass without storing full record lists", () => {
        const state = createSummarizeScanState();
        const gameInfo = new Map();
        scanRecord(state, minimalRec({ gameid: "g1", gameName: "Chess", dateEnd: "2024-01-01T00:00:00Z", p1: "alice", p2: "bob" }), gameInfo);
        scanRecord(state, minimalRec({ gameid: "g2", gameName: "Go", dateEnd: "2024-01-02T00:00:00Z", p1: "alice", p2: "carol" }), gameInfo);

        expect(state.numGames).toBe(2);
        expect(state.playerIDs).toEqual(new Set(["alice", "bob", "carol"]));

        const stats = buildPlayerStats(state);
        const alice = stats.allPlays.find((r) => r.user === "alice");
        expect(alice?.value).toBe(2);
        expect(stats.eclectic.find((r) => r.user === "alice")?.value).toBe(2);
        expect(stats.social.find((r) => r.user === "alice")?.value).toBe(2);
    });

    it("matches batch rivalry counting via incremental accumulator", () => {
        const counts = new Map();
        const recs = [
            minimalRec({ gameid: "g1", gameName: "Chess", dateEnd: "2024-01-01T00:00:00Z", p1: "alice", p2: "bob" }),
            minimalRec({ gameid: "g2", gameName: "Chess", dateEnd: "2024-01-02T00:00:00Z", p1: "alice", p2: "bob" }),
        ];
        for (const rec of recs) {
            accumulateRivalryPair(counts, rec);
        }
        const pairs = finalizeRivalryPairs(counts, 2);
        expect(pairs).toEqual([{ userA: "alice", userB: "bob", n: 2 }]);
    });
});
