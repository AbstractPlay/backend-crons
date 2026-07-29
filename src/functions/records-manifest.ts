'use strict';

import { S3Client, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const REC_BUCKET = "records.abstractplay.com";

export const handler: Handler = async (event: any, context?: any) => {
    // generate file listing
    const recListCmd = new ListObjectsV2Command({
        Bucket: REC_BUCKET,
    });

    const recList: _Object[] = [];
    try {
        let isTruncatedOuter = true;

        while (isTruncatedOuter) {
            const { Contents, IsTruncated: IsTruncatedInner, NextContinuationToken } =
            await s3.send(recListCmd);
            if (Contents === undefined) {
                throw new Error(`Could not list the bucket contents`);
            }
            recList.push(...Contents);
            isTruncatedOuter = IsTruncatedInner || false;
            recListCmd.input.ContinuationToken = NextContinuationToken;
        }
    } catch (err) {
        console.error(err);
    }
    const cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `_manifest.json`,
        Body: JSON.stringify(recList),
        CacheControl: "no-cache",
    });
    const response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Manifest generated");

    console.log("ALL DONE");
};
