#!/usr/bin/env node
import path from "node:path";
import {
  callFalQueue,
  downloadRemoteFiles,
  ensureDir,
  many,
  one,
  parseArgs,
  toModelInputUrl,
  writeJson
} from "./fal-queue.mjs";

const ENDPOINT = "fal-ai/nano-banana-2/edit";

export async function runNanoBananaEdit(options) {
  const {
    prompt,
    images,
    outputDir,
    numImages = 1,
    resolution = "1K",
    aspectRatio = "auto",
    outputFormat = "png",
    safetyTolerance = "4",
    limitGenerations = true,
    seed
  } = options;

  if (!prompt) throw new Error("Nano Banana prompt is required.");
  if (!images?.length) throw new Error("At least one input image is required.");
  if (!outputDir) throw new Error("outputDir is required.");

  await ensureDir(outputDir);

  const imageUrls = [];
  for (const image of images) {
    imageUrls.push(await toModelInputUrl(image));
  }

  const input = {
    prompt,
    image_urls: imageUrls,
    num_images: Number(numImages),
    aspect_ratio: aspectRatio,
    output_format: outputFormat,
    safety_tolerance: String(safetyTolerance),
    resolution,
    limit_generations: Boolean(limitGenerations)
  };
  if (seed !== undefined) input.seed = Number(seed);

  await writeJson(path.join(outputDir, "nano-banana-input.json"), {
    endpoint: ENDPOINT,
    prompt,
    images,
    input: {
      ...input,
      image_urls: imageUrls.map((url) => (url.startsWith("data:") ? "[inline-data-uri]" : url))
    }
  });

  const result = await callFalQueue(ENDPOINT, input, {
    outputDir,
    prefix: "nano-banana"
  });

  const downloaded = await downloadRemoteFiles(result.data, outputDir, "nano-banana");
  const summary = {
    endpoint: ENDPOINT,
    request_id: result.requestId,
    prompt,
    output_dir: outputDir,
    downloaded_files: downloaded,
    result: result.data
  };

  await writeJson(path.join(outputDir, "nano-banana-files.json"), summary);
  return summary;
}

async function main() {
  const { flags } = parseArgs();
  const images = [...many(flags, "image"), ...many(flags, "input-image")];
  const prompt = one(flags, "prompt");
  const outputDir = one(flags, "output-dir");

  if (!prompt || !outputDir || images.length === 0) {
    throw new Error(
      "Usage: node nano-banana-edit.mjs --image <path-or-url> --prompt <prompt> --output-dir <dir>"
    );
  }

  const summary = await runNanoBananaEdit({
    prompt,
    images,
    outputDir,
    numImages: one(flags, "num-images", 1),
    resolution: one(flags, "resolution", "1K"),
    aspectRatio: one(flags, "aspect-ratio", "auto"),
    outputFormat: one(flags, "format", "png"),
    safetyTolerance: one(flags, "safety-tolerance", "4"),
    limitGenerations: one(flags, "limit-generations", "true") !== "false",
    seed: one(flags, "seed")
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
