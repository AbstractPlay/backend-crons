import { UserRating, UserGameRating, GameNumber, UserNumber, GameNumList, UserNumList, TwoPlayerStats, GeoStats } from "./index.js";
export type StatSummary = {
    numGames: number;
    numPlayers: number;
    oldestRec?: string;
    newestRec?: string;
    timeoutRate: number;
    ratings: {
        highest: UserGameRating[];
        avg: UserRating[];
        weighted: UserRating[];
    };
    topPlayers: UserGameRating[];
    plays: {
        total: GameNumber[];
        width: GameNumber[];
    };
    players: {
        social: UserNumber[];
        eclectic: UserNumber[];
        allPlays: UserNumber[];
        h: UserNumber[];
        hOpp: UserNumber[];
        timeouts: UserNumber[];
    };
    histograms: {
        all: number[];
        allPlayers: number[];
        meta: GameNumList[];
        players: UserNumList[];
        playerTimeouts: UserNumList[];
        firstTimers: number[];
        timeouts: number[];
    };
    recent: GameNumber[];
    hoursPer: number[];
    metaStats: {
        [k: string]: TwoPlayerStats;
    }
    hMeta: UserNumber[];
    geoStats: GeoStats[];
};
