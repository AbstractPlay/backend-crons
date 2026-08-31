import {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { addPrefix } from "@abstractplay/renderer";
import type { IRenderOptions, APRenderRep } from "@abstractplay/renderer";
import type { SQSHandler } from "aws-lambda";
import { Buffer } from "node:buffer";
import { customAlphabet } from "nanoid";
import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { Readable } from "stream";

const genPrefix = customAlphabet(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    5,
);

const s3 = new S3Client({});
const THUMB_BUCKET = "thumbnails.abstractplay.com";

function rendererScriptUrl(): string {
    const url = process.env.RENDERER_CDN_URL;
    if (!url) {
        throw new Error("Missing RENDERER_CDN_URL environment variable");
    }
    return url;
}

async function streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
}

let browser: Browser | null = null;

export const handler: SQSHandler = async (event) => {
    console.log("Received SQS event:", JSON.stringify(event, null, 2));

    if (!browser) {
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--no-zygote",
                "--no-sandbox",
            ],
            executablePath: await chromium.executablePath(),
            headless: true,
        });
    }
    if (browser === null) {
        throw new Error("Unable to instantiate browser.");
    }
    console.log("Browser initiated.");

    for (const record of event.Records) {
        const { bucket, key } = JSON.parse(record.body) as { bucket: string; key: string };
        const [meta] = key.split(".");

        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const data = await streamToString(obj.Body as Readable);
        console.log(`Fetched the following JSON:\n${data}`);
        let aprender = JSON.parse(data) as APRenderRep | APRenderRep[];
        if (typeof aprender === "string") {
            aprender = JSON.parse(aprender) as APRenderRep | APRenderRep[];
        }

        if (Array.isArray(aprender)) {
            aprender = aprender[aprender.length - 1] as APRenderRep;
        }
        console.log(`Result after parsing:\n${JSON.stringify(aprender)}`);

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
        const contexts = new Map<string, Record<string, string>>([
            ["light", contextLight],
            ["dark", contextDark],
        ]);

        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        const prefix = genPrefix();
        const renderScriptUrl = rendererScriptUrl();
        for (const [name, context] of contexts.entries()) {
            console.log("Initializing page");
            await page.setContent(`<div id="drawing"></div>`);
            await page.addScriptTag({ url: renderScriptUrl });
            console.log("Evaluating the render itself");
            await page.evaluate((pfx, colourContext, renderRep) => {
                const opts: IRenderOptions = {
                    prefix: pfx,
                    divid: "drawing",
                    colourContext,
                    contextGlobal: true,
                    coloursGlobal: false,
                };
                (window as unknown as { APRender: { render: (rep: APRenderRep, o: IRenderOptions) => void } })
                    .APRender.render(renderRep, opts);
            }, prefix, context, aprender);
            console.log("Evaluating the SVG extraction");
            const svgString = await page.evaluate(() => {
                const svgEl = document.querySelector("svg");
                return svgEl ? svgEl.outerHTML : null;
            });
            if (svgString !== null) {
                console.log("Prefixing the SVG");
                const prefixed = addPrefix(svgString, { prefix } as IRenderOptions);
                console.log("Escaping nonbreaking spaces");
                const safeSvg = prefixed.replace(/&nbsp;/g, "&#160;");
                const cmd = new PutObjectCommand({
                    Bucket: THUMB_BUCKET,
                    Key: `${meta}-${name}.svg`,
                    Body: safeSvg,
                    ContentType: "image/svg+xml",
                    CacheControl: "public, max-age=86400",
                });
                const response = await s3.send(cmd);
                if (response["$metadata"].httpStatusCode !== 200) {
                    console.log(response);
                }
                console.log(`Rendered SVG written to ${THUMB_BUCKET}/${meta}-${name}.svg`);
            } else {
                console.log("No SVG was generated!");
            }
        }

        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        console.log(`Deleted original file ${bucket}/${key}`);

        await page.close();
    }
};
