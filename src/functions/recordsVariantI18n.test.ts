import { describe, expect, it } from "vitest";
import { GameFactory, addResource } from "@abstractplay/gameslib";
import enApgames from "@abstractplay/gameslib/locales/en/apgames.json" with { type: "json" };
import enApresults from "@abstractplay/gameslib/locales/en/apresults.json" with { type: "json" };

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
});
