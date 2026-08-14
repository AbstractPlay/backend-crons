export type RivalryPair = {
    userA: string;
    userB: string;
    n: number;
};

export type RivalriesFull = {
    generated: string;
    minGames: number;
    pairs: RivalryPair[];
};

export type AnonymizedRivalry = {
    rank: number;
    label: string;
    n: number;
};
