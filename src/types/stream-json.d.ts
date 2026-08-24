declare module "stream-json" {
    import type { Transform } from "node:stream";
    export function parser(): Transform;
}

declare module "stream-json/streamers/StreamArray.js" {
    import type { Transform } from "node:stream";
    export function streamArray(): Transform;
}
