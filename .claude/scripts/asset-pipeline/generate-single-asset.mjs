#!/usr/bin/env node
import path from "node:path";
import { runHunyuan3D } from "./hunyuan-3d.mjs";
import { runNanoBananaEdit } from "./nano-banana-edit.mjs";
import {
  ensureDir,
  one,
  parseArgs,
  pathExists,
  readJson,
  slugify,
  writeJson
} from "./fal-queue.mjs";

async function readJsonIfExists(filePath) {
  return (await pathExists(filePath)) ? readJson(filePath) : undefined;
}

function collectSourceImages(asset, manifest, directImage) {
  const images = new Set();

  if (directImage) images.add(directImage);

  for (const image of asset.source_images || []) {
    images.add(image);
  }

  for (const evidence of asset.evidence || []) {
    if (evidence.image) images.add(evidence.image);
  }

  if (images.size === 0) {
    for (const image of manifest?.source_images || []) {
      images.add(image);
      if (images.size >= 3) break;
    }
  }

  return [...images];
}

function firstGeneratedImage(nanoSummary) {
  return nanoSummary.downloaded_files.find((downloaded) => {
    const contentType = downloaded.source?.content_type || "";
    return contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(downloaded.path);
  });
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function buildDirectAsset({ assetId, assetName, description, image, world }) {
  const name = assetName || assetId || path.basename(image, path.extname(image));
  const id = assetId || slugify(name);
  return {
    id,
    name,
    description: description || name,
    source_images: image ? [image] : [],
    evidence: image ? [{ image, notes: "Direct single-image asset input" }] : [],
    status: "pending",
    working_dir: `worlds/${world}/output/assets/${id}`
  };
}

function buildPrompt(asset) {
  return `Create a single clean product reference image for this object only:

Name: ${asset.name}
Description: ${asset.description}

Requirements:
- show only this object, no surrounding scene and no extra props
- white background, studio lighting, centered composition
- cropped tightly while keeping the entire object visible
- realistic material detail suitable for image-to-3D generation
- no text, labels, hands, people, floor shadows, or duplicate objects`;
}

async function resolveAsset(options) {
  const {
    world,
    assetId,
    manifestPath = `worlds/${world}/output/assets/assets.json`,
    directImage,
    assetName,
    description
  } = options;

  const manifest = await readJsonIfExists(manifestPath);
  const manifestAsset = assetId
    ? manifest?.assets?.find((candidate) => candidate.id === assetId)
    : undefined;

  if (manifestAsset) {
    return { manifest, asset: manifestAsset, manifestPath };
  }

  if (directImage) {
    return {
      manifest,
      asset: buildDirectAsset({
        assetId,
        assetName,
        description,
        image: directImage,
        world
      }),
      manifestPath
    };
  }

  if (!manifest) {
    throw new Error(
      `No manifest found at ${manifestPath}. Provide --image and --asset-name for direct single-image generation.`
    );
  }

  throw new Error(`Asset ${assetId} was not found in ${manifestPath}.`);
}

export async function generateSingleAsset(options) {
  const {
    world,
    assetId,
    manifestPath = `worlds/${world}/output/assets/assets.json`,
    directImage,
    assetName,
    description,
    regenerate = false
  } = options;

  if (!world) throw new Error("world is required.");
  if (!assetId && !directImage) throw new Error("assetId or directImage is required.");

  const resolved = await resolveAsset({
    world,
    assetId,
    manifestPath,
    directImage,
    assetName,
    description
  });

  const asset = {
    ...resolved.asset,
    status: "in_progress"
  };
  const outputDir = asset.working_dir || `worlds/${world}/output/assets/${asset.id}`;
  await ensureDir(outputDir);

  const assetJsonPath = path.join(outputDir, "asset.json");
  const previous = await readJsonIfExists(assetJsonPath);
  const attemptId = timestampId();
  const attemptDir = path.join(outputDir, "attempts", attemptId);
  await ensureDir(attemptDir);

  const sourceImages = collectSourceImages(asset, resolved.manifest, directImage);
  if (sourceImages.length === 0) {
    throw new Error(`Asset ${asset.id} does not have source images for Nano Banana.`);
  }

  const started = {
    schema_version: 1,
    world,
    manifest_path: resolved.manifest ? manifestPath : undefined,
    asset: {
      ...asset,
      working_dir: outputDir
    },
    latest_attempt: attemptId,
    attempts: [
      ...(previous?.attempts || []),
      {
        id: attemptId,
        status: "in_progress",
        regenerate: Boolean(regenerate || previous),
        started_at: new Date().toISOString(),
        output_dir: attemptDir
      }
    ],
    previous_completed_at: previous?.completed_at,
    updated_at: new Date().toISOString(),
    files: previous?.files || {}
  };
  await writeJson(assetJsonPath, started);

  try {
    const nano = await runNanoBananaEdit({
      prompt: buildPrompt(asset),
      images: sourceImages,
      outputDir: attemptDir,
      numImages: 1,
      resolution: "1K",
      aspectRatio: "1:1",
      outputFormat: "png",
      limitGenerations: true
    });

    const generatedImage = firstGeneratedImage(nano);
    if (!generatedImage) {
      throw new Error(`Nano Banana did not return a downloadable image for ${asset.id}.`);
    }

    await writeJson(assetJsonPath, {
      ...started,
      asset: {
        ...started.asset,
        status: "image_generated"
      },
      updated_at: new Date().toISOString(),
      files: {
        ...started.files,
        source_images: sourceImages,
        reference_image: generatedImage.path,
        latest_attempt_dir: attemptDir,
        nano_banana: path.join(attemptDir, "nano-banana-files.json")
      }
    });

    const hunyuan = await runHunyuan3D({
      image: generatedImage.path,
      outputDir: attemptDir,
      assetName: asset.name,
      enablePbr: true,
      generateType: "Normal",
      faceCount: 500000
    });

    const attempts = started.attempts.map((attempt) =>
      attempt.id === attemptId
        ? {
            ...attempt,
            status: "completed",
            completed_at: new Date().toISOString(),
            reference_image: generatedImage.path,
            downloaded_model_files: hunyuan.downloaded_files.map((file) => file.path)
          }
        : attempt
    );

    const completed = {
      ...started,
      asset: {
        ...started.asset,
        status: "completed"
      },
      attempts,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      files: {
        source_images: sourceImages,
        reference_image: generatedImage.path,
        latest_attempt_dir: attemptDir,
        nano_banana: path.join(attemptDir, "nano-banana-files.json"),
        hunyuan_3d: path.join(attemptDir, "hunyuan-3d-files.json"),
        downloaded_model_files: hunyuan.downloaded_files.map((file) => file.path)
      },
      results: {
        nano_banana_request_id: nano.request_id,
        hunyuan_3d_request_id: hunyuan.request_id
      }
    };

    await writeJson(assetJsonPath, completed);
    return completed;
  } catch (error) {
    const attempts = started.attempts.map((attempt) =>
      attempt.id === attemptId
        ? {
            ...attempt,
            status: "failed",
            failed_at: new Date().toISOString(),
            error: error.message
          }
        : attempt
    );

    const failed = {
      ...started,
      asset: {
        ...started.asset,
        status: "failed"
      },
      attempts,
      updated_at: new Date().toISOString(),
      failed_at: new Date().toISOString(),
      error: error.message
    };
    await writeJson(assetJsonPath, failed);
    throw error;
  }
}

async function main() {
  const { flags } = parseArgs();
  const world = one(flags, "world");
  const assetId = one(flags, "asset-id");
  const directImage = one(flags, "image");

  if (!world || (!assetId && !directImage)) {
    throw new Error(
      "Usage: node generate-single-asset.mjs --world <world-name> (--asset-id <asset-id> | --image <path>) [--asset-name <name>] [--description <text>] [--regenerate]"
    );
  }

  const result = await generateSingleAsset({
    world,
    assetId,
    directImage,
    assetName: one(flags, "asset-name"),
    description: one(flags, "description"),
    regenerate: Boolean(flags.regenerate),
    manifestPath: one(flags, "manifest", `worlds/${world}/output/assets/assets.json`)
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
