export type HoursPerStats = {
    /** Move-weighted mean hours per move slot */
    mean: number;
    /** Median of per-game hours-per-move rates */
    median: number;
    /** Number of qualifying games */
    n: number;
    /** Median hours per move per week bucket (aligned with histograms.all) */
    byWeek: number[];
};
