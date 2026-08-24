declare module "stream-chain" {
    export function chain(streams: unknown[]): NodeJS.ReadableStream;
}

declare module "stream-json" {
    export function parser(): NodeJS.ReadWriteStream;
}

declare module "stream-json/streamers/StreamArray.js" {
    export function streamArray(): NodeJS.ReadWriteStream;
}
