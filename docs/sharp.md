Building and Publishing a Sharp Lambda Layer

This document outlines the process for creating a Sharp Lambda layer that works reliably in AWS Lambda with Node.js 20 runtimes.

1. Why Build Your Own Layer

Sharp requires native binaries compiled against Amazon Linux (the OS used by Lambda).

Bundling Sharp directly often causes runtime errors due to dynamic require calls.

Publishing your own layer ensures compatibility and avoids cross-account IAM issues.

2. Build Sharp in Amazon Linux via Docker

Start an Amazon Linux container

docker run -it amazonlinux:2023 bash

Install prerequisites

yum install -y tar gzip make gcc-c++ python3
curl -sL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

Create the layer directory

mkdir -p /opt/sharp-layer/nodejs
cd /opt/sharp-layer/nodejs
npm init -y
npm install sharp

Package the layer

cd /opt/sharp-layer
zip -r /layer.zip nodejs

Exit the container and copy layer.zip back to your host:

docker cp <container_id>:/layer.zip .

3. Publish the Layer to AWS

Run this from your host machine:

aws lambda publish-layer-version
  --layer-name sharp
  --description "Sharp for Node.js 20 Lambda"
  --zip-file fileb://layer.zip
  --compatible-runtimes nodejs20.x

This returns an ARN like:

arn:aws:lambda:us-east-1:<account-id>:layer:sharp:1

4. Reference the Layer in Serverless Framework

Update serverless.yml:

functions:
  thumbnails:
    handler: src/functions/thumbnails.handler
    layers:
      - arn:aws:lambda:us-east-1:<account-id>:layer:sharp:1

Mark Sharp as external so esbuild doesn’t bundle it:

custom:
  esbuild:
    external:
      - sharp

5. Maintenance Notes

Each new publish increments the version (:2, :3, etc.). Update serverless.yml accordingly.

Rebuild the layer if you upgrade Node.js runtime or Sharp version.

Keep the Docker + AWS CLI steps documented for reproducibility.

✅ Summary

By building and publishing Sharp as a Lambda layer in your own AWS account, you ensure:

Compatibility with Lambda’s runtime.

No dynamic require errors.

IAM simplicity (no cross‑account permissions needed).

This is the canonical, maintainable way to use Sharp in AWS Lambda functions.