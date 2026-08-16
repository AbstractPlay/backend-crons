/** Game Move beta layout feedback analytics (satisfaction, bailouts, notes). */

import { createHash } from "node:crypto";

export const LAYOUT_FB_PK_PREFIX = "LAYOUTFB#";
export const WATERMARK_OVERLAP_MS = 5 * 60 * 1000;
export const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAILY_RETENTION_DAYS = 90;
export const MAX_RECENT_NOTES = 500;

export type LayoutFbEventType =
    | "session_start"
    | "feedback"
    | "feedback_note"
    | "switch_to_classic"
    | "layout_switch";

export type RawDdbItem = {
    pk?: string;
    sk?: string;
    event?: string;
    layoutId?: string;
    toLayoutId?: string;
    rating?: string;
    comment?: string;
    gameId?: string;
    durationMs?: number;
};

export type LayoutFeedbackNote = {
    eventTimeMs: number;
    layoutId: string;
    comment: string;
    gameId?: string;
    durationMs?: number;
    userHash: string;
};

export type NormalizedLayoutFbEvent = {
    eventTimeMs: number;
    event: LayoutFbEventType;
    layoutId: string;
    userHash: string;
    toLayoutId?: string;
    rating?: "up" | "down";
    comment?: string;
    gameId?: string;
    durationMs?: number;
};

export type LayoutLayoutStats = {
    sessions: number;
    up: number;
    down: number;
    positiveRate: number;
    classicBailouts: number;
    bailoutRate: number;
    notesCount: number;
    layoutSwitchesOut: number;
};

export type LayoutFeedbackTotals = {
    sessions: number;
    ratingsUp: number;
    ratingsDown: number;
    positiveRate: number;
    classicBailouts: number;
    bailoutRate: number;
    notesSubmitted: number;
    layoutSwitches: number;
};

export type DataQuality = {
    eventsParsed: number;
    eventsSkipped: number;
    parseErrors: number;
    eventsProcessed: number;
};

export type AnalyticsSlice = {
    window?: { start: string; end: string };
    generatedAt?: string;
    totals: LayoutFeedbackTotals;
    byLayout: Record<string, LayoutLayoutStats>;
    switchMatrix: Record<string, number>;
    medianDurationMs?: number;
    notes: LayoutFeedbackNote[];
    dataQuality: DataQuality;
};

export type AnalyticsSummary = AnalyticsSlice & {
    recentNotes: LayoutFeedbackNote[];
    rolling7d: AnalyticsSlice;
    rolling30d: AnalyticsSlice;
};

export type AnalyticsState = {
    lastRunAt: string;
    lastSkWatermarkMs: number;
    processedKeys?: string[];
};

export type ParseResult =
    | { ok: true; event: NormalizedLayoutFbEvent }
    | { ok: false; reason: string };

const LAYOUT_FB_EVENT_TYPES = new Set<string>([
    "session_start",
    "feedback",
    "feedback_note",
    "switch_to_classic",
    "layout_switch",
]);

const LAYOUT_IDS = new Set<string>(["strip", "card", "narrative"]);

export function parseSkEpochMs(sk: string): number | null {
    const idx = sk.indexOf("#");
    if (idx <= 0) {
        return null;
    }
    const epoch = Number.parseInt(sk.slice(0, idx), 10);
    return Number.isFinite(epoch) ? epoch : null;
}

export function utcDateKey(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10);
}

export function hashUserIdFromPk(pk: string): string | null {
    if (!pk.startsWith(LAYOUT_FB_PK_PREFIX)) {
        return null;
    }
    const userId = pk.slice(LAYOUT_FB_PK_PREFIX.length);
    if (userId.length === 0) {
        return null;
    }
    return createHash("sha256").update(userId).digest("hex");
}

export function parseLayoutFeedbackEvent(item: RawDdbItem): ParseResult {
    if (typeof item.pk !== "string" || !item.pk.startsWith(LAYOUT_FB_PK_PREFIX)) {
        return { ok: false, reason: "invalid pk" };
    }
    if (typeof item.sk !== "string" || item.sk.length === 0) {
        return { ok: false, reason: "missing sk" };
    }
    const eventTimeMs = parseSkEpochMs(item.sk);
    if (eventTimeMs === null) {
        return { ok: false, reason: "invalid sk epoch" };
    }
    if (typeof item.event !== "string" || !LAYOUT_FB_EVENT_TYPES.has(item.event)) {
        return { ok: false, reason: "invalid event" };
    }
    if (typeof item.layoutId !== "string" || !LAYOUT_IDS.has(item.layoutId)) {
        return { ok: false, reason: "invalid layoutId" };
    }

    const userHash = hashUserIdFromPk(item.pk);
    if (userHash === null) {
        return { ok: false, reason: "invalid user pk" };
    }

    const event = item.event as LayoutFbEventType;
    const normalized: NormalizedLayoutFbEvent = {
        eventTimeMs,
        event,
        layoutId: item.layoutId,
        userHash,
    };

    if (typeof item.gameId === "string" && item.gameId.trim() !== "") {
        normalized.gameId = item.gameId.trim();
    }
    if (typeof item.durationMs === "number" && Number.isFinite(item.durationMs) && item.durationMs >= 0) {
        normalized.durationMs = Math.floor(item.durationMs);
    }

    if (event === "feedback") {
        if (item.rating !== "up" && item.rating !== "down") {
            return { ok: false, reason: "feedback missing rating" };
        }
        normalized.rating = item.rating;
    }

    if (event === "feedback_note" || (event === "feedback" && typeof item.comment === "string")) {
        if (typeof item.comment !== "string" || item.comment.trim() === "") {
            if (event === "feedback_note") {
                return { ok: false, reason: "feedback_note missing comment" };
            }
        } else {
            normalized.comment = item.comment.trim();
        }
    }

    if (event === "layout_switch") {
        if (typeof item.toLayoutId !== "string" || !LAYOUT_IDS.has(item.toLayoutId)) {
            return { ok: false, reason: "layout_switch missing toLayoutId" };
        }
        normalized.toLayoutId = item.toLayoutId;
    }

    return { ok: true, event: normalized };
}

function emptyDataQuality(): DataQuality {
    return {
        eventsParsed: 0,
        eventsSkipped: 0,
        parseErrors: 0,
        eventsProcessed: 0,
    };
}

function emptyLayoutStats(): LayoutLayoutStats {
    return {
        sessions: 0,
        up: 0,
        down: 0,
        positiveRate: 0,
        classicBailouts: 0,
        bailoutRate: 0,
        notesCount: 0,
        layoutSwitchesOut: 0,
    };
}

function emptyTotals(): LayoutFeedbackTotals {
    return {
        sessions: 0,
        ratingsUp: 0,
        ratingsDown: 0,
        positiveRate: 0,
        classicBailouts: 0,
        bailoutRate: 0,
        notesSubmitted: 0,
        layoutSwitches: 0,
    };
}

export function emptyAnalyticsSlice(): AnalyticsSlice {
    return {
        totals: emptyTotals(),
        byLayout: {},
        switchMatrix: {},
        notes: [],
        dataQuality: emptyDataQuality(),
    };
}

function getOrCreateLayoutStats(
    map: Record<string, LayoutLayoutStats>,
    layoutId: string,
): LayoutLayoutStats {
    const existing = map[layoutId];
    if (existing !== undefined) {
        return existing;
    }
    const created = emptyLayoutStats();
    map[layoutId] = created;
    return created;
}

function computePositiveRate(up: number, down: number): number {
    const total = up + down;
    return total > 0 ? up / total : 0;
}

function computeBailoutRate(bailouts: number, sessions: number): number {
    return sessions > 0 ? bailouts / sessions : 0;
}

function median(values: number[]): number | undefined {
    if (values.length === 0) {
        return undefined;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
    }
    return sorted[mid];
}

function finalizeLayoutStats(stats: LayoutLayoutStats): void {
    stats.positiveRate = computePositiveRate(stats.up, stats.down);
    stats.bailoutRate = computeBailoutRate(stats.classicBailouts, stats.sessions);
}

function finalizeTotals(totals: LayoutFeedbackTotals): void {
    totals.positiveRate = computePositiveRate(totals.ratingsUp, totals.ratingsDown);
    totals.bailoutRate = computeBailoutRate(totals.classicBailouts, totals.sessions);
}

export function aggregateEvents(events: NormalizedLayoutFbEvent[]): AnalyticsSlice {
    const slice = emptyAnalyticsSlice();
    const durationSamples: number[] = [];

    for (const event of events) {
        slice.dataQuality.eventsParsed += 1;
        const layoutStats = getOrCreateLayoutStats(slice.byLayout, event.layoutId);

        if (event.event === "session_start") {
            slice.totals.sessions += 1;
            layoutStats.sessions += 1;
        }

        if (event.event === "feedback" && event.rating !== undefined) {
            if (event.rating === "up") {
                slice.totals.ratingsUp += 1;
                layoutStats.up += 1;
            } else {
                slice.totals.ratingsDown += 1;
                layoutStats.down += 1;
            }
            if (event.durationMs !== undefined) {
                durationSamples.push(event.durationMs);
            }
        }

        if (event.event === "switch_to_classic") {
            slice.totals.classicBailouts += 1;
            layoutStats.classicBailouts += 1;
            if (event.durationMs !== undefined) {
                durationSamples.push(event.durationMs);
            }
        }

        if (event.event === "layout_switch" && event.toLayoutId !== undefined) {
            slice.totals.layoutSwitches += 1;
            layoutStats.layoutSwitchesOut += 1;
            const key = `${event.layoutId}→${event.toLayoutId}`;
            slice.switchMatrix[key] = (slice.switchMatrix[key] ?? 0) + 1;
        }

        if (
            (event.event === "feedback_note" && event.comment !== undefined)
            || (event.event === "feedback" && event.comment !== undefined)
        ) {
            slice.totals.notesSubmitted += 1;
            layoutStats.notesCount += 1;
            slice.notes.push({
                eventTimeMs: event.eventTimeMs,
                layoutId: event.layoutId,
                comment: event.comment!,
                gameId: event.gameId,
                durationMs: event.durationMs,
                userHash: event.userHash,
            });
        }
    }

    for (const stats of Object.values(slice.byLayout)) {
        finalizeLayoutStats(stats);
    }
    finalizeTotals(slice.totals);
    slice.medianDurationMs = median(durationSamples);
    slice.dataQuality.eventsProcessed = events.length;

    return slice;
}

function mergeLayoutStats(
    target: Record<string, LayoutLayoutStats>,
    source: Record<string, LayoutLayoutStats>,
): void {
    for (const [layoutId, stats] of Object.entries(source)) {
        const dim = getOrCreateLayoutStats(target, layoutId);
        dim.sessions += stats.sessions;
        dim.up += stats.up;
        dim.down += stats.down;
        dim.classicBailouts += stats.classicBailouts;
        dim.notesCount += stats.notesCount;
        dim.layoutSwitchesOut += stats.layoutSwitchesOut;
    }
}

function mergeSwitchMatrix(
    target: Record<string, number>,
    source: Record<string, number>,
): void {
    for (const [key, count] of Object.entries(source)) {
        target[key] = (target[key] ?? 0) + count;
    }
}

function mergeNotes(target: LayoutFeedbackNote[], source: LayoutFeedbackNote[]): LayoutFeedbackNote[] {
    return [...target, ...source].sort((a, b) => a.eventTimeMs - b.eventTimeMs);
}

export function mergeSlices(slices: AnalyticsSlice[]): AnalyticsSlice {
    if (slices.length === 0) {
        return emptyAnalyticsSlice();
    }

    const merged = emptyAnalyticsSlice();
    const durationSamples: number[] = [];

    for (const slice of slices) {
        merged.totals.sessions += slice.totals.sessions;
        merged.totals.ratingsUp += slice.totals.ratingsUp;
        merged.totals.ratingsDown += slice.totals.ratingsDown;
        merged.totals.classicBailouts += slice.totals.classicBailouts;
        merged.totals.notesSubmitted += slice.totals.notesSubmitted;
        merged.totals.layoutSwitches += slice.totals.layoutSwitches;
        mergeLayoutStats(merged.byLayout, slice.byLayout);
        mergeSwitchMatrix(merged.switchMatrix, slice.switchMatrix);
        merged.notes = mergeNotes(merged.notes, slice.notes);
        merged.dataQuality.eventsParsed += slice.dataQuality.eventsParsed;
        merged.dataQuality.eventsSkipped += slice.dataQuality.eventsSkipped;
        merged.dataQuality.parseErrors += slice.dataQuality.parseErrors;
        merged.dataQuality.eventsProcessed += slice.dataQuality.eventsProcessed;
        if (slice.medianDurationMs !== undefined) {
            durationSamples.push(slice.medianDurationMs);
        }
    }

    for (const stats of Object.values(merged.byLayout)) {
        finalizeLayoutStats(stats);
    }
    finalizeTotals(merged.totals);
    merged.medianDurationMs = median(durationSamples);

    return merged;
}

export function buildRollingSlice(
    dailySlices: Array<{ date: string; slice: AnalyticsSlice }>,
    asOfDate: string,
    windowDays: number,
): AnalyticsSlice {
    const startMs = Date.parse(`${asOfDate}T00:00:00.000Z`) - (windowDays - 1) * 86_400_000;
    const startDate = utcDateKey(startMs);
    const selected = dailySlices
        .filter(({ date }) => date >= startDate && date <= asOfDate)
        .map(({ slice }) => slice);
    return mergeSlices(selected);
}

export function buildAnalyticsSummary(
    windowSlice: AnalyticsSlice,
    dailySlices: Array<{ date: string; slice: AnalyticsSlice }>,
    asOfDate: string,
): AnalyticsSummary {
    const allNotes = [...windowSlice.notes].sort((a, b) => b.eventTimeMs - a.eventTimeMs);
    return {
        ...windowSlice,
        recentNotes: allNotes.slice(0, MAX_RECENT_NOTES),
        rolling7d: buildRollingSlice(dailySlices, asOfDate, 7),
        rolling30d: buildRollingSlice(dailySlices, asOfDate, 30),
    };
}

export function ingestRawItems(items: RawDdbItem[]): {
    events: NormalizedLayoutFbEvent[];
    dataQuality: Pick<DataQuality, "eventsSkipped" | "parseErrors">;
} {
    const events: NormalizedLayoutFbEvent[] = [];
    let eventsSkipped = 0;
    let parseErrors = 0;

    for (const item of items) {
        const parsed = parseLayoutFeedbackEvent(item);
        if (!parsed.ok) {
            parseErrors += 1;
            continue;
        }
        events.push(parsed.event);
    }

    eventsSkipped = items.length - events.length - parseErrors;

    return { events, dataQuality: { eventsSkipped, parseErrors } };
}

export function itemDedupeKey(item: RawDdbItem): string | null {
    if (typeof item.pk !== "string" || typeof item.sk !== "string") {
        return null;
    }
    return `${item.pk}::${item.sk}`;
}

export function skFromDedupeKey(key: string): string | null {
    const idx = key.indexOf("::");
    if (idx < 0) {
        return null;
    }
    return key.slice(idx + 2);
}

export function pruneProcessedKeys(
    keys: string[],
    minSkEpochMs: number,
): string[] {
    return keys.filter((key) => {
        const sk = skFromDedupeKey(key);
        if (sk === null) {
            return false;
        }
        const epoch = parseSkEpochMs(sk);
        return epoch !== null && epoch >= minSkEpochMs;
    });
}

function formatRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
}

function truncateComment(comment: string, maxLen = 120): string {
    if (comment.length <= maxLen) {
        return comment.replace(/\|/g, "\\|").replace(/\n/g, " ");
    }
    return `${comment.slice(0, maxLen - 1)}…`.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function markdownTable(headers: string[], rows: string[][]): string {
    const headerRow = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    return [headerRow, separator, body].filter((line) => line.length > 0).join("\n");
}

export type MarkdownReportInput = {
    runDate: string;
    summary: AnalyticsSummary;
};

export function buildMarkdownReport({ runDate, summary }: MarkdownReportInput): string {
    const lines: string[] = [
        `# Game Move layout feedback — ${runDate}`,
        "",
        `Generated: ${summary.generatedAt ?? "unknown"}`,
        "",
    ];

    if (summary.window !== undefined) {
        lines.push(
            `Window: ${summary.window.start} → ${summary.window.end}`,
            "",
        );
    }

    lines.push(
        "## Totals (window)",
        "",
        markdownTable(
            ["Metric", "Value"],
            [
                ["Sessions", String(summary.totals.sessions)],
                ["Ratings up", String(summary.totals.ratingsUp)],
                ["Ratings down", String(summary.totals.ratingsDown)],
                ["Positive rate", formatRate(summary.totals.positiveRate)],
                ["Classic bailouts", String(summary.totals.classicBailouts)],
                ["Bailout rate", formatRate(summary.totals.bailoutRate)],
                ["Notes submitted", String(summary.totals.notesSubmitted)],
                ["Layout switches", String(summary.totals.layoutSwitches)],
            ],
        ),
        "",
    );

    const layoutRows = Object.entries(summary.byLayout)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([layoutId, stats]) => [
            layoutId,
            String(stats.sessions),
            String(stats.up),
            String(stats.down),
            formatRate(stats.positiveRate),
            String(stats.notesCount),
        ]);
    if (layoutRows.length > 0) {
        lines.push(
            "## By layout",
            "",
            markdownTable(
                ["Layout", "Sessions", "Up", "Down", "Positive rate", "Notes"],
                layoutRows,
            ),
            "",
        );
    }

    const switchRows = Object.entries(summary.switchMatrix)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => [key, String(count)]);
    if (switchRows.length > 0) {
        lines.push(
            "## Layout switches",
            "",
            markdownTable(["From → To", "Count"], switchRows),
            "",
        );
    }

    const noteRows = summary.recentNotes
        .slice(0, 50)
        .map((note) => [
            new Date(note.eventTimeMs).toISOString().slice(0, 16).replace("T", " "),
            note.layoutId,
            truncateComment(note.comment),
            note.userHash.slice(0, 8),
        ]);
    if (noteRows.length > 0) {
        lines.push(
            "## Recent notes (latest 50; full text in summary.json)",
            "",
            markdownTable(["Time (UTC)", "Layout", "Comment", "User hash"], noteRows),
            "",
        );
    }

    lines.push(
        "## Data quality",
        "",
        markdownTable(
            ["Metric", "Value"],
            [
                ["Events processed", String(summary.dataQuality.eventsProcessed)],
                ["Parse errors", String(summary.dataQuality.parseErrors)],
            ],
        ),
        "",
        "Full note text for ML review is in `summary.json` (`recentNotes`) and daily JSON (`notes`).",
        "",
    );

    return lines.join("\n");
}
