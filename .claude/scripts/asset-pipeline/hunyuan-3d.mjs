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

const ENDPOINT = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";

export async function runHunyuan3D(options) {
  const {
    image,
    outputDir,
    assetName,
    faceCount = 500000,
    enablePbr = true,
    generateType = "Normal"
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

  await writeJson(path.join(outputDir, "hunyuan-3d-input.json"), {
    endpoint: ENDPOINT,
    asset_name: assetName,
    image,
    input: {
      ...input,
      input_image_url: inputImageUrl.startsWith("data:") ? "[inline-data-uri]" : inputImageUrl
    }
  });

  const result = await callFalQueue(ENDPOINT, input, {
    outputDir,
    prefix: "hunyuan-3d",
    pollIntervalMs: 10000
  });

  const downloaded = await downloadRemoteFiles(result.data, outputDir, "hunyuan-3d");
  const summary = {
    endpoint: ENDPOINT,
    request_id: result.requestId,
    asset_name: assetName,
    output_dir: outputDir,
    downloaded_files: downloaded,
    result: result.data
  };

  await writeJson(path.join(outputDir, "hunyuan-3d-files.json"), summary);
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
