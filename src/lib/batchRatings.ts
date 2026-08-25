import type { GlickoStats } from "types/stats/GlickoStats.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import {
    GLICKO_RATING_START,
    GLICKO_RD_START,
    GLICKO_VOLATILITY_START,
    toGlickoStats,
} from "../functions/summarizeHelpers.js";

export const GLICKO_PRIOR_RATING_LOW = GLICKO_RATING_START - 2 * GLICKO_RD_START;

export function glickoConservativeSortKey(row: UserGameRating): number {
    return row.glicko?.ratingLow ?? GLICKO_PRIOR_RATING_LOW;
}

export type TournamentSeedPlayer = {
    playerid: string;
    rating?: number;
    score?: number;
};

/** Assign batch Glicko conservative sort keys for tournament division seeding. */
export function assignTournamentPlayerRatings(
    players: TournamentSeedPlayer[],
    highest: UserGameRating[],
    displayName: string,
    variants: string[],
): void {
    for (const player of players) {
        const row = lookupBatchRating(highest, displayName, variants, player.playerid);
        player.rating = glickoConservativeSortKey(row);
        player.score = 0;
    }
}

/** Display name + variant UIDs → summarize `highest[].game` key. */
export function batchRatingGameLabel(displayName: string, variants: string[]): string {
    if (variants.length === 0) {
        return `${displayName} (no variants)`;
    }
    const sorted = [...variants].sort();
    return `${displayName} (${sorted.join("|")})`;
}

export function defaultGlickoPrior(): GlickoStats {
    return toGlickoStats(GLICKO_RATING_START, GLICKO_RD_START, GLICKO_VOLATILITY_START, 0);
}

export function lookupBatchRating(
    highest: UserGameRating[],
    displayName: string,
    variants: string[],
    userId: string,
): UserGameRating {
    const game = batchRatingGameLabel(displayName, variants);
    const row = highest.find((r) => r.user === userId && r.game === game);
    if (row !== undefined) {
        return row;
    }
    return {
        user: userId,
        game,
        rating: GLICKO_RATING_START,
        wld: [0, 0, 0],
        glicko: defaultGlickoPrior(),
    };
}

/** Sort key: `ratingLow` desc → lower `rd` → higher raw `glicko.rating`. */
export function compareBatchRatings(a: UserGameRating, b: UserGameRating): number {
    const priorLow = GLICKO_RATING_START - 2 * GLICKO_RD_START;
    const lowA = a.glicko?.ratingLow ?? priorLow;
    const lowB = b.glicko?.ratingLow ?? priorLow;
    if (lowB !== lowA) {
        return lowB - lowA;
    }
    const rdA = a.glicko?.rd ?? GLICKO_RD_START;
    const rdB = b.glicko?.rd ?? GLICKO_RD_START;
    if (rdA !== rdB) {
        return rdA - rdB;
    }
    const ratingA = a.glicko?.rating ?? GLICKO_RATING_START;
    const ratingB = b.glicko?.rating ?? GLICKO_RATING_START;
    return ratingB - ratingA;
}

/** Distinct rated users per meta UID from `highest[]` game labels. */
export function buildPlayerCountsByUid(
    highest: UserGameRating[],
    resolveUid: (displayName: string) => string | undefined,
): Record<string, number> {
    const usersByUid = new Map<string, Set<string>>();
    for (const row of highest) {
        const paren = row.game.indexOf(" (");
        const displayName = paren === -1 ? row.game : row.game.slice(0, paren);
        const uid = resolveUid(displayName);
        if (uid === undefined) {
            continue;
        }
        let users = usersByUid.get(uid);
        if (users === undefined) {
            users = new Set();
            usersByUid.set(uid, users);
        }
        users.add(row.user);
    }
    const counts: Record<string, number> = {};
    for (const [uid, users] of usersByUid) {
        counts[uid] = users.size;
    }
    return counts;
}
