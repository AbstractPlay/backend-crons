import {
    UserRating,
    UserGameRating,
    GameNumber,
    UserNumber,
    GameNumList,
    UserNumList,
    TwoPlayerStats,
    GeoStats,
    HoursPerStats,
    PlayContextStats,
    MetaPieStats,
    MetaPlayerCountMix,
    AnonymizedRivalry,
    SeasonalityStats,
} from "./index.js";
export type StatSummary = {
    numGames: number;
    numPlayers: number;
    oldestRec?: string;
    newestRec?: string;
    timeoutRate: number;
    abandonedRate: number;
    playContext: PlayContextStats;
    pieRates: MetaPieStats[];
    playerCountMix: MetaPlayerCountMix[];
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
        returningPlayers: number[];
        timeouts: number[];
        abandoned: number[];
    };
    recent: GameNumber[];
    hoursPer: HoursPerStats;
    metaStats: {
        [k: string]: TwoPlayerStats;
    }
    hMeta: UserNumber[];
    geoStats: GeoStats[];
    activeGeoStats: GeoStats[];
    rivalries: AnonymizedRivalry[];
    seasonality: SeasonalityStats;
};
