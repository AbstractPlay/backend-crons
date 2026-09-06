/** Completed GAME dump rows need serialized rules state for GameFactory / genRecord. */
export function completedGameRecHasState(rec: {
    pk?: string;
    sk?: string;
    state?: string;
}): boolean {
    return rec.pk === "GAME"
        && typeof rec.sk === "string"
        && rec.sk.includes("#1#")
        && rec.state !== undefined
        && rec.state !== "";
}

export function skipCompletedGameWithoutState(rec: {
    pk?: string;
    sk?: string;
    state?: string;
    [key: string]: unknown;
}): boolean {
    if (rec.pk !== "GAME" || typeof rec.sk !== "string" || !rec.sk.includes("#1#")) {
        return false;
    }
    if (completedGameRecHasState(rec)) {
        return false;
    }
    console.warn(
        `Skipping completed GAME without state: sk=${rec.sk} keys=${Object.keys(rec).join(",")}`,
    );
    return true;
}
