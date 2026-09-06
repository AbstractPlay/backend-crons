import { describe, expect, it, vi } from "vitest";
import { completedGameRecHasState, skipCompletedGameWithoutState } from "./completedGameRec.js";

describe("completedGameRec", () => {
    it("accepts completed games with state", () => {
        expect(completedGameRecHasState({
            pk: "GAME",
            sk: "go#1#uuid",
            state: "{}",
        })).toBe(true);
    });

    it("rejects completed games missing state", () => {
        expect(completedGameRecHasState({
            pk: "GAME",
            sk: "tablero#1#377080453",
            tournament: "tablero#uuid",
        })).toBe(false);
    });

    it("logs and returns true for orphan completed games", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const rec = {
            pk: "GAME",
            sk: "tablero#1#377080453",
            tournament: "tablero#aec5b5fc-3ec4-4da9-b153-0316566660bb",
        };
        expect(skipCompletedGameWithoutState(rec)).toBe(true);
        expect(warn).toHaveBeenCalledWith(
            "Skipping completed GAME without state: sk=tablero#1#377080453 keys=pk,sk,tournament",
        );
        warn.mockRestore();
    });
});
