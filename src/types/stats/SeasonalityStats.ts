/** Completion-time patterns in UTC. `gamesByDow` / `playersByDow` index 0 = Sunday. */
export type SeasonalityStats = {
    gamesByDow: number[];
    playersByDow: number[];
    gamesByHour: number[];
};
