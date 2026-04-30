#!/usr/bin/env node
import path from "node:path";
import {
  callFalQueue,
  downloadRemoteFiles,
  ensureDir,
  one,
  parseArgs,
  toModelInputUrl,
  writeJson
} from "./fal-queue.mjs";
import { buildRequestSummary, requestPath } from "./request-metadata.mjs";

const ENDPOINT = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";

export async function runHunyuan3D(options) {
  const {
    image,
    outputDir,
    assetName,
    faceCount = 500000,
    enablePbr = true,
    generateType = "Normal",
    metadataPath,
    metadata = {},
    onSubmit,
    onStatus
  } = options;

  if (!image) throw new Error("Input image is required.");
  if (!outputDir) throw new Error("outputDir is required.");

  await ensureDir(outputDir);
  const inputImageUrl = await toModelInputUrl(image);

  const input = {
    input_image_url: inputImageUrl,
    generate_type: generateType,
    enable_pbr: Boolean(enablePbr),
    face_count: Number(faceCount)
  };

  const result = await callFalQueue(ENDPOINT, input, {
    metadataPath: metadataPath || requestPath(outputDir, 0, "hunyuan-3d"),
    metadata: { kind: "3d", provider: ENDPOINT, ...metadata },
    pollIntervalMs: 10000,
    onSubmit,
    onStatus
  });

  const downloaded = await downloadRemoteFiles(result.data, outputDir, "hunyuan-3d");
  const summary = buildRequestSummary({
    kind: "3d",
    provider: ENDPOINT,
    metadata,
    requestId: result.requestId,
    submittedAt: result.submittedAt,
    inputFiles: [image],
    outputFiles: downloaded.map((file) => file.path),
    downloadedFiles: downloaded,
    result: result.data,
    extra: { asset_name: assetName }
  });

  await writeJson(metadataPath || requestPath(outputDir, 0, "hunyuan-3d"), summary);
  return summary;
}

async function main() {
  const { flags } = parseArgs();
  const image = one(flags, "image") || one(flags, "input-image");
  const outputDir = one(flags, "output-dir");

  if (!image || !outputDir) {
    throw new Error(
      "Usage: node hunyuan-3d.mjs --image <path-or-url> --output-dir <dir> [--asset-name <name>]"
    );
  }

  const summary = await runHunyuan3D({
    image,
    outputDir,
    assetName: one(flags, "asset-name"),
    faceCount: one(flags, "face-count", 500000),
    enablePbr: one(flags, "enable-pbr", "true") !== "false",
    generateType: one(flags, "generate-type", "Normal")
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
