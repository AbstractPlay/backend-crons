import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import {
    assignTournamentPlayerRatings,
    GLICKO_PRIOR_RATING_LOW,
} from "../lib/batchRatings.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../test/fixtures");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "batch-ratings.json"), "utf8")) as {
    highest: UserGameRating[];
};

describe("assignTournamentPlayerRatings", () => {
    it("orders players by glicko ratingLow descending", () => {
        const players = [
            { playerid: "bob", playername: "Bob" },
            { playerid: "alice", playername: "Alice" },
            { playerid: "unknown", playername: "Unknown" },
        ];
        assignTournamentPlayerRatings(players, fixture.highest, "Chess", []);
        players.sort((a, b) => b.rating! - a.rating!);
        expect(players.map((p) => p.playerid)).toEqual(["alice", "bob", "unknown"]);
        expect(players[0]!.rating).toBe(1200);
        expect(players[1]!.rating).toBe(1090);
        expect(players[2]!.rating).toBe(GLICKO_PRIOR_RATING_LOW);
    });

    it("uses variant-aware game labels", () => {
        const players = [
            { playerid: "carol" },
            { playerid: "alice" },
        ];
        assignTournamentPlayerRatings(players, fixture.highest, "Go", ["handicap", "9x9"]);
        players.sort((a, b) => b.rating! - a.rating!);
        expect(players[0]!.playerid).toBe("alice");
        expect(players[0]!.rating).toBe(1200);
        expect(players[1]!.rating).toBe(1170);
    });
});
