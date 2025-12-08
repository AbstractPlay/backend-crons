// lambda-sqs-to-render.ts
import { SQSEvent } from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { render, addPrefix, IRenderOptions, type APRenderRep } from "@abstractplay/renderer";
import { Buffer } from "node:buffer";
import { customAlphabet } from "nanoid";
const genPrefix = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 5);
import { createSVGWindow } from "svgdom";
import { registerWindow, SVG, Svg } from "@svgdotjs/svg.js";

const s3 = new S3Client({});
const REC_BUCKET = "thumbnails.abstractplay.com";

// Helper to stream S3 object into a string
async function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log("Received SQS event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const { bucket, key } = JSON.parse(record.body) as { bucket: string; key: string };
    const [meta,] = key.split(".");

    // Fetch original data
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const data = await streamToString(obj.Body as Readable);
    console.log(`Fetched the following JSON:\n${data}`);
    const aprender = JSON.parse(JSON.parse(data)) as APRenderRep;
    console.log(`Result after parsing:\n${JSON.stringify(aprender)}`);

    // pre-render light/dark SVGs
    console.log("Attempting to pre-render light/dark SVGs");
    const contextLight = {
        background: "#fff",
        strokes: "#000",
        borders: "#000",
        labels: "#000",
        annotations: "#000",
        fill: "#000",
    };
    const contextDark = {
        background: "#222",
        strokes: "#6d6d6d",
        borders: "#000",
        labels: "#009fbf",
        annotations: "#99cccc",
        fill: "#e6f2f2",
    };
    const contexts = new Map<string, {[k: string]: string}>([
        ["light", contextLight],
        ["dark", contextDark],
    ]);
    const window = createSVGWindow();
    const document = window.document;

    // register window and document
    registerWindow(window, document);
    const prefix = genPrefix();
    for (const [name, context] of contexts.entries()) {
        console.log(JSON.stringify({name, context}))
        const canvas = SVG(document.documentElement) as Svg;
        const opts: IRenderOptions = {prefix, target: canvas, colourContext: context};
        console.log(`About to try rendering the following:\n${JSON.stringify(aprender)}`);
        console.log(`typeof aprender: ${typeof aprender}`);
        render(aprender, opts)
        const svgStr = addPrefix(canvas.svg(), opts);
        console.log(`svgstr:\n${svgStr}`);
        const cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `${meta}-${name}.svg`,
            Body: svgStr,
            ContentType: "image/svg+xml",
        });
        const response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
        console.log(`Rendered SVG written to ${REC_BUCKET}/${meta}-${name}.svg`);
    }

    // Delete original file
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log(`Deleted original file ${bucket}/${key}`);
  }
};
