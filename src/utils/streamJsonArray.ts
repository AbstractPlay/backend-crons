import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray.js";
import type { Readable } from "node:stream";

/**
 * Stream-parse a top-level JSON array without holding the full file string in memory.
 * Uses stream-json at runtime (esbuild external) — not bundled into the Lambda ESM artifact.
 */
export async function streamJsonArrayFromReadable<T>(
    readable: Readable,
    onItem: (item: T) => void,
): Promise<number> {
    const jsonParser = parser();
    const arrayStreamer = streamArray();
    readable.pipe(jsonParser).pipe(arrayStreamer);

    let count = 0;
    for await (const chunk of arrayStreamer) {
        const row = chunk as unknown as { value: T };
        onItem(row.value);
        count++;
    }
    return count;
}

export async function streamJsonArrayFromS3<T>(
    s3: S3Client,
    bucket: string,
    key: string,
    onItem: (item: T) => void,
): Promise<number> {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = response.Body;
    if (body === undefined) {
        throw new Error(`Unable to load s3://${bucket}/${key}`);
    }
    return streamJsonArrayFromReadable(body as Readable, onItem);
}
