import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    BatchWriteCommand,
    DynamoDBDocumentClient,
    QueryCommand,
    type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import type { Handler } from "aws-lambda";
import {
    RATINGS_NOTIFICATION_SNAPSHOT_KEY,
    SUMMARY_RATINGS_KEY,
} from "../constants/recordsBucket.js";
import {
    buildRatingChangeSnapshot,
    diffRatingChanges,
    filterCandidates,
    ratingChangeConstantsFromEnv,
    toNotificationItems,
    type RatingChangeNotificationItem,
    type RatingChangeFilterStats,
    type RatingNotificationSnapshot,
} from "../lib/ratingChangeNotifications.js";
import type { StatSummaryRatings } from "types/stats/StatSummaryTiers.js";
import { getRecordsJson, putRecordsJson, tryGetRecordsJson } from "../utils/recordsJson.js";

const REGION = "us-east-1";
const BATCH_WRITE_CHUNK = 25;
const LEGACY_BOT_ID = "SkQfHAjeDxs8eeEnScuYA";

const s3 = new S3Client({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
    },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendBatchWriteWithRetry(
    tableName: string,
    items: RatingChangeNotificationItem[],
    maxRetries = 8,
    initialDelay = 100,
    maxDelay = 5000,
): Promise<void> {
    for (let offset = 0; offset < items.length; offset += BATCH_WRITE_CHUNK) {
        const chunk = items.slice(offset, offset + BATCH_WRITE_CHUNK);
        let requestItems = {
            [tableName]: chunk.map((item) => ({ PutRequest: { Item: item } })),
        };
        let retries = 0;
        while (Object.keys(requestItems).length > 0) {
            try {
                const result = await ddbDocClient.send(new BatchWriteCommand({
                    RequestItems: requestItems,
                }));
                const unprocessed = result.UnprocessedItems;
                if (unprocessed === undefined || Object.keys(unprocessed).length === 0) {
                    break;
                }
                requestItems = unprocessed;
            } catch (err: unknown) {
                const name = err instanceof Error ? err.name : "";
                if (
                    ["ThrottlingException", "ProvisionedThroughputExceededException",
                        "InternalServerError", "ServiceUnavailable"].includes(name)
                ) {
                    retries += 1;
                    if (retries >= maxRetries) {
                        throw err;
                    }
                    const delay = Math.min(initialDelay * Math.pow(2, retries - 1), maxDelay);
                    const jitter = delay * 0.1 * Math.random();
                    await sleep(delay + jitter);
                } else {
                    throw err;
                }
            }
        }
    }
}

async function loadBotIds(tableName: string): Promise<Set<string>> {
    const botIds = new Set<string>([LEGACY_BOT_ID]);
    const queryInput: QueryCommandInput = {
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: { ":pk": "BOT" },
    };
    let lastKey: Record<string, unknown> | undefined;
    do {
        const result = await ddbDocClient.send(new QueryCommand({
            ...queryInput,
            ExclusiveStartKey: lastKey,
        }));
        for (const item of result.Items ?? []) {
            const sk = item.sk;
            if (typeof sk === "string") {
                botIds.add(sk);
            }
        }
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    return botIds;
}

export type RatingChangeNotificationsMetrics = {
    summaryGeneratedAt: string;
    notificationsWritten: number;
    seededSnapshot: boolean;
    skippedAlreadyProcessed: boolean;
    filterStats: RatingChangeFilterStats;
};

export const handler: Handler = async (): Promise<RatingChangeNotificationsMetrics> => {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (tableName === undefined || tableName === "") {
        throw new Error("ABSTRACT_PLAY_TABLE is not configured");
    }

    const ratingsResult = await getRecordsJson<StatSummaryRatings>(s3, SUMMARY_RATINGS_KEY);
    const summary = ratingsResult.data;
    const glickoMeta = summary.ratings.glickoMeta;
    const summaryGeneratedAt = glickoMeta.generatedAt;
    const constants = ratingChangeConstantsFromEnv(glickoMeta);

    const emptyStats: RatingChangeFilterStats = {
        skippedNoActivity: 0,
        skippedBelowThreshold: 0,
        skippedProvisional: 0,
        skippedBot: 0,
    };

    const priorSnapshotResult = await tryGetRecordsJson<RatingNotificationSnapshot>(
        s3,
        RATINGS_NOTIFICATION_SNAPSHOT_KEY,
    );

    if (priorSnapshotResult === undefined) {
        const snapshot = buildRatingChangeSnapshot(summary, summaryGeneratedAt);
        const bytes = await putRecordsJson(s3, RATINGS_NOTIFICATION_SNAPSHOT_KEY, snapshot);
        console.log(
            `rating-change-notifications: seeded snapshot (${bytes} bytes), 0 notifications`,
        );
        return {
            summaryGeneratedAt,
            notificationsWritten: 0,
            seededSnapshot: true,
            skippedAlreadyProcessed: false,
            filterStats: emptyStats,
        };
    }

    const priorSnapshot = priorSnapshotResult.data;
    if (priorSnapshot.summaryGeneratedAt === summaryGeneratedAt) {
        console.log("rating-change-notifications: summary unchanged, skipping");
        return {
            summaryGeneratedAt,
            notificationsWritten: 0,
            seededSnapshot: false,
            skippedAlreadyProcessed: true,
            filterStats: emptyStats,
        };
    }

    const diffRows = diffRatingChanges(priorSnapshot, summary.ratings.highest);
    const botIds = await loadBotIds(tableName);
    const { candidates, stats } = filterCandidates(diffRows, botIds, constants);
    const notificationItems = toNotificationItems(candidates);

    if (notificationItems.length > 0) {
        await sendBatchWriteWithRetry(tableName, notificationItems);
    }

    const newSnapshot = buildRatingChangeSnapshot(summary, summaryGeneratedAt);
    const snapshotBytes = await putRecordsJson(s3, RATINGS_NOTIFICATION_SNAPSHOT_KEY, newSnapshot);

    console.log(
        `rating-change-notifications: wrote ${notificationItems.length} notifications, `
        + `snapshot ${snapshotBytes} bytes; skipped noActivity=${stats.skippedNoActivity} `
        + `belowThreshold=${stats.skippedBelowThreshold} provisional=${stats.skippedProvisional} `
        + `bot=${stats.skippedBot}`,
    );

    return {
        summaryGeneratedAt,
        notificationsWritten: notificationItems.length,
        seededSnapshot: false,
        skippedAlreadyProcessed: false,
        filterStats: stats,
    };
};
