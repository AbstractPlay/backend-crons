// lambda-s3-to-sqs.ts
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { S3Event } from "aws-lambda";

const sqs = new SQSClient({});

export const handler = async (event: S3Event): Promise<void> => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    const message = { bucket, key };

    // Use the queue URL from environment
    const queueUrl = process.env.SQS_URL;
    if (!queueUrl) {
      throw new Error("Missing SQS_URL environment variable");
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      })
    );

    console.log(
      `Queued job for ${bucket}/${key} → ${process.env.TARGET_QUEUE_ARN ?? "no ARN set"}`
    );
  }
};