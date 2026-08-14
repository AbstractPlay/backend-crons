export const MOVE_SEASONALITY_WINDOW_DAYS = 365;

export type MoveActivityInput = {
    player: string;
    time: number;
};

export type MoveSeasonalityResult = {
    movesByDow: number[];
    playersByDow: number[];
    movesByHour: number[];
    windowDays: number;
};

/** Bin move timestamps by UTC day-of-week and hour (aggregated across the window). */
export function computeMoveSeasonality(
    moves: MoveActivityInput[],
    windowDays: number = MOVE_SEASONALITY_WINDOW_DAYS,
): MoveSeasonalityResult {
    const movesByDow = Array.from({ length: 7 }, () => 0);
    const movesByHour = Array.from({ length: 24 }, () => 0);
    const playersByDowSets: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());

    for (const { player, time } of moves) {
        const d = new Date(time);
        const dow = d.getUTCDay();
        const hour = d.getUTCHours();
        movesByDow[dow]++;
        movesByHour[hour]++;
        playersByDowSets[dow].add(player);
    }

    return {
        movesByDow,
        playersByDow: playersByDowSets.map((s) => s.size),
        movesByHour,
        windowDays,
    };
}
