import type { PlayerSummarySlice } from "types/stats/StatSummaryTiers.js";

export type PlayerSummaryQueueMessage = {
    user: string;
    key: string;
    slice: PlayerSummarySlice;
};

export type PlayerSummaryManifest = {
    version: 1;
    generated: string;
    expectedCount: number;
    enqueuedAt: string;
};
