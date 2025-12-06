import type { UserRating } from "./UserRating.js";;
export interface UserGameRating extends UserRating {
    game: string;
    wld: [number,number,number];
    glicko?: {rating: number; rd: number};
    trueskill?: {mu: number; sigma: number};
}
