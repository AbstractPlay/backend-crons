import { describe, expect, it } from "vitest";
import {
    aggregateEvents,
    buildAnalyticsSummary,
    buildMarkdownReport,
    hashUserIdFromPk,
    parseLayoutFeedbackEvent,
    type NormalizedLayoutFbEvent,
    type RawDdbItem,
} from "./layoutFeedbackAnalytics.js";

const USER_PK = "LAYOUTFB#user-abc";
const USER_HASH = hashUserIdFromPk(USER_PK)!;

function baseItem(overrides: Partial<RawDdbItem> = {}): RawDdbItem {
    return {
        pk: USER_PK,
        sk: "1_700_000_000_000#abc",
        event: "session_start",
        layoutId: "card",
        ...overrides,
    };
}

function normalized(overrides: Partial<NormalizedLayoutFbEvent>): NormalizedLayoutFbEvent {
    return {
        eventTimeMs: 1_700_000_000_000,
        event: "session_start",
        layoutId: "card",
        userHash: USER_HASH,
        ...overrides,
    };
}

describe("parseLayoutFeedbackEvent", () => {
    it("parses feedback_note with comment", () => {
        const parsed = parseLayoutFeedbackEvent(baseItem({
            event: "feedback_note",
            comment: "Submit hard to find",
        }));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.event.comment).toBe("Submit hard to find");
            expect(parsed.event.userHash).toBe(USER_HASH);
        }
    });
});

describe("aggregateEvents", () => {
    it("rolls up sessions, ratings, bailouts, switches, and notes", () => {
        const slice = aggregateEvents([
            normalized({ event: "session_start", layoutId: "card" }),
            normalized({
                event: "feedback",
                layoutId: "card",
                rating: "up",
                durationMs: 10000,
                eventTimeMs: 1_700_000_000_100,
            }),
            normalized({
                event: "feedback_note",
                layoutId: "card",
                comment: "Love the card layout",
                eventTimeMs: 1_700_000_000_200,
            }),
            normalized({
                event: "switch_to_classic",
                layoutId: "strip",
                eventTimeMs: 1_700_000_000_300,
            }),
            normalized({
                event: "layout_switch",
                layoutId: "strip",
                toLayoutId: "card",
                eventTimeMs: 1_700_000_000_400,
            }),
        ]);

        expect(slice.totals.sessions).toBe(1);
        expect(slice.totals.ratingsUp).toBe(1);
        expect(slice.totals.classicBailouts).toBe(1);
        expect(slice.totals.layoutSwitches).toBe(1);
        expect(slice.totals.notesSubmitted).toBe(1);
        expect(slice.switchMatrix["strip→card"]).toBe(1);
        expect(slice.notes[0]?.comment).toBe("Love the card layout");
        expect(slice.byLayout.card?.up).toBe(1);
        expect(slice.byLayout.strip?.classicBailouts).toBe(1);
    });
});

describe("buildMarkdownReport", () => {
    it("includes recent notes table", () => {
        const slice = aggregateEvents([
            normalized({
                event: "feedback_note",
                comment: "Test note",
                eventTimeMs: 1_700_000_000_000,
            }),
        ]);
        const summary = buildAnalyticsSummary(slice, [], "2026-08-16");
        const report = buildMarkdownReport({ runDate: "2026-08-16", summary });
        expect(report).toContain("Recent notes");
        expect(report).toContain("Test note");
    });
});
