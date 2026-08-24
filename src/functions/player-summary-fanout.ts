import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import type { Handler } from "aws-lambda";
import {
    REC_BUCKET,
    PLAYER_SUMMARY_MANIFEST_KEY,
    SUMMARY_MONOLITH_KEY,
    SUMMARY_SITE_KEY,
} from "../constants/recordsBucket.js";
import {
    buildPlayerSummaryIndexes,
    collectPlayerSummaryUserIds,
    toPlayerSummarySlice,
} from "./summarizeHelpers.js";
import { enqueuePlayerSummaryWrites } from "./playerSummaryQueue.js";
import type { StatSummary } from "types/stats/StatSummary.js";
import type { StatSummarySite } from "types/stats/StatSummaryTiers.js";
import type { PlayerSummaryManifest } from "types/playerSummaryQueue.js";
import { putRecordsJson } from "../utils/recordsJson.js";

const REGION = "us-east-1";
const s3 = new S3Client({ region: REGION });
const sqs = new SQSClient({ region: REGION });

export const handler: Handler = async () => {
    const queueUrl = process.env.PLAYER_SUMMARY_QUEUE_URL;
    if (queueUrl === undefined || queueUrl === "") {
        throw new Error("PLAYER_SUMMARY_QUEUE_URL is not configured");
    }

    console.log(`Loading ${SUMMARY_SITE_KEY} for run timestamp`);
    const siteResponse = await s3.send(new GetObjectCommand({
        Bucket: REC_BUCKET,
        Key: SUMMARY_SITE_KEY,
    }));
    const siteBody = await siteResponse.Body?.transformToString();
    if (siteBody === undefined) {
        throw new Error(`Unable to load ${SUMMARY_SITE_KEY}`);
    }
    const siteTier = JSON.parse(siteBody) as StatSummarySite;
    const generated = siteTier.generated;

    console.log(`Loading ${SUMMARY_MONOLITH_KEY}`);
    const response = await s3.send(new GetObjectCommand({
        Bucket: REC_BUCKET,
        Key: SUMMARY_MONOLITH_KEY,
    }));
    const body = await response.Body?.transformToString();
    if (body === undefined) {
        throw new Error(`Unable to load ${SUMMARY_MONOLITH_KEY}`);
    }
    const summary = JSON.parse(body) as StatSummary;

    const indexes = buildPlayerSummaryIndexes(summary);
    const users = collectPlayerSummaryUserIds(summary);
    const messages = users.map((user) => {
        const slice = toPlayerSummarySlice(user, generated, indexes);
        return {
            user,
            key: `player/${user}-summary.json`,
            slice,
        };
    });

    console.log(`Enqueueing ${messages.length} player summary writes`);
    await enqueuePlayerSummaryWrites(sqs, queueUrl, messages);

    const manifest: PlayerSummaryManifest = {
        version: 1,
        generated,
        expectedCount: messages.length,
        enqueuedAt: new Date().toISOString(),
    };
    const manifestBytes = await putRecordsJson(s3, PLAYER_SUMMARY_MANIFEST_KEY, manifest);
    console.log(`Wrote ${PLAYER_SUMMARY_MANIFEST_KEY} (${manifestBytes} bytes, expectedCount=${messages.length})`);
};
