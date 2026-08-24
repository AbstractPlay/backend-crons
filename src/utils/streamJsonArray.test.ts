import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray.js";

async function streamJsonArrayFromReadable<T>(
    readable: Readable,
    onItem: (item: T) => void,
): Promise<number> {
    const pipeline = chain([readable, parser(), streamArray()]);
    let count = 0;
    for await (const chunk of pipeline) {
        const row = chunk as unknown as { value: T };
        onItem(row.value);
        count++;
    }
    return count;
}

describe("streamJsonArray", () => {
    it("yields each array element without JSON.parse on the full buffer", async () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const readable = Readable.from([JSON.stringify(items)]);
        const seen: number[] = [];
        const count = await streamJsonArrayFromReadable<{ id: number }>(readable, (item) => {
            seen.push(item.id);
        });
        expect(count).toBe(3);
        expect(seen).toEqual([1, 2, 3]);
    });
});
