import { describe, expect, it } from "vitest";
import { computeMoveSeasonality } from "./moveSeasonality.js";

describe("computeMoveSeasonality", () => {
    it("bins moves and unique players by UTC day and hour", () => {
        const monday = Date.parse("2026-01-05T15:30:00.000Z");
        const mondayLater = Date.parse("2026-01-05T16:00:00.000Z");
        const result = computeMoveSeasonality([
            { player: "a", time: monday },
            { player: "a", time: mondayLater },
            { player: "b", time: mondayLater },
        ], 365);
        expect(result.movesByDow[1]).toBe(3);
        expect(result.playersByDow[1]).toBe(2);
        expect(result.movesByHour[15]).toBe(1);
        expect(result.movesByHour[16]).toBe(2);
        expect(result.windowDays).toBe(365);
    });
});
