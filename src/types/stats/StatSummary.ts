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
    GlickoByGameRow,
    GlickoSiteEntry,
    GlickoMeta,
} from "./index.js";
import type { PlayerTimeoutStats } from "./PlayerTimeoutStats.js";
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
        glickoByGame: GlickoByGameRow[];
        glickoSite: GlickoSiteEntry[];
        glickoMeta: GlickoMeta;
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
        timeoutStats: PlayerTimeoutStats[];
    };
    histograms: {
        all: number[];
        allPlayers: number[];
        meta: GameNumList[];
        players: UserNumList[];
        playerTimeouts: UserNumList[];
        firstTimers: number[];
        returningPlayers: number[];
        activeMovers: number[];
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
