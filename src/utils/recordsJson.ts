import { PutObjectCommand, type PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { REC_BUCKET } from "../constants/recordsBucket.js";

/** Daily batch JSON — revalidate with S3 after each cron overwrite (no blanket invalidation). */
export const RECORDS_JSON_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** Manifest index — always revalidate before use. */
export const RECORDS_MANIFEST_CACHE_CONTROL = "no-cache";

export type PutRecordsJsonOptions = {
    cacheControl?: string;
};

export function buildRecordsJsonPutInput(
    key: string,
    body: unknown,
    options?: PutRecordsJsonOptions,
): PutObjectCommandInput {
    return {
        Bucket: REC_BUCKET,
        Key: key,
        Body: JSON.stringify(body),
        ContentType: "application/json",
        CacheControl: options?.cacheControl ?? RECORDS_JSON_CACHE_CONTROL,
    };
}

export async function putRecordsJson(
    s3: S3Client,
    key: string,
    body: unknown,
    options?: PutRecordsJsonOptions,
): Promise<number> {
    const json = JSON.stringify(body);
    const response = await s3.send(new PutObjectCommand({
        ...buildRecordsJsonPutInput(key, body, options),
        Body: json,
    }));
    const status = response.$metadata.httpStatusCode;
    if (status !== 200) {
        throw new Error(`PutObject failed for ${key}: HTTP ${status}`);
    }
    return Buffer.byteLength(json, "utf8");
}
