import { gunzipSync } from "node:zlib";

const COMPRESSED_PREFIX = "gz:";

function isGzipBuffer(buf: Buffer): boolean {
    return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

export function isCompressedGameState(state: string): boolean {
    if (!state || state.startsWith("{") || state.startsWith("[")) {
        return false;
    }
    if (state.startsWith(COMPRESSED_PREFIX)) {
        return true;
    }
    try {
        const buf = Buffer.from(state, "base64");
        return isGzipBuffer(buf);
    } catch {
        return false;
    }
}

function gunzipBase64(base64: string): string {
    return gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
}

export function decompressGameState(state: string): string {
    if (!state || state.startsWith("{") || state.startsWith("[")) {
        return state;
    }
    if (state.startsWith(COMPRESSED_PREFIX)) {
        return gunzipBase64(state.slice(COMPRESSED_PREFIX.length));
    }
    try {
        const buf = Buffer.from(state, "base64");
        if (isGzipBuffer(buf)) {
            return gunzipSync(buf).toString("utf8");
        }
    } catch {
        // fall through
    }
    return state;
}
