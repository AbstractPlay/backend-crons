import { describe, expect, it } from "vitest";
import { GameFactory, addResource } from "@abstractplay/gameslib";
import { enApgames, enApresults } from "../gameslibLocales.js";
import { encodeRecordGameId } from "../utils/recordGameId.js";

const INSTANCE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("records variant i18n", () => {
    it("resolves variant labels when generating records (same path as records.ts)", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const g = GameFactory("archimedes", undefined, ["8x10"]);
        expect(g).toBeDefined();
        g!.gameover = true;

        const variants = g!.getVariants();
        for (const label of variants) {
            expect(label).not.toMatch(/^variants\./);
        }
        expect(variants).toContain("8x10 board");
    });

    it("encodes variant UIDs in gameid when generating records (same path as records.ts)", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const g = GameFactory("archimedes", undefined, ["8x10"]);
        expect(g).toBeDefined();
        g!.gameover = true;

        const variantUids = g!.variants ?? [];
        expect(variantUids).toContain("8x10");

        const rec = g!.genRecord({
            uid: encodeRecordGameId(INSTANCE_ID, "archimedes", variantUids),
            players: [
                { uid: "alice", name: "Alice" },
                { uid: "bob", name: "Bob" },
            ],
        });
        expect(rec).toBeDefined();
        expect(rec!.header.site.gameid).toBe(`${INSTANCE_ID}#archimedes:8x10`);
    });
});
