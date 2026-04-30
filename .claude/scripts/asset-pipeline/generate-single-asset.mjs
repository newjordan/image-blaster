#!/usr/bin/env node
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import { runHunyuan3D } from "./hunyuan-3d.mjs";
import { runImageEdit } from "./image-edit.mjs";
import {
  ensureDir,
  one,
  parseArgs,
  pathExists,
  readJson,
  safeFileName,
  slugify,
  writeJson
} from "./fal-queue.mjs";

async function readJsonIfExists(filePath) {
  return (await pathExists(filePath)) ? readJson(filePath) : undefined;
}

function collectSourceImages(object, directImage) {
  const images = new Set();

  if (directImage) images.add(directImage);

  for (const image of object.source_images || []) {
    images.add(image);
  }

  for (const evidence of object.evidence || []) {
    if (evidence.image) images.add(evidence.image);
  }

  return [...images];
}

function firstGeneratedImage(imageEditSummary) {
  return imageEditSummary.downloaded_files.find((downloaded) => {
    const contentType = downloaded.source?.content_type || "";
    return contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(downloaded.path);
  });
}

function buildDirectObject({ objectId, objectName, description, image, world }) {
  const name = objectName || objectId || path.basename(image, path.extname(image));
  const id = objectId || slugify(name);
  return {
    id,
    name,
    description: description || name,
    source_images: image ? [image] : [],
    evidence: image ? [{ image, notes: "Direct single-image object input" }] : [],
    status: "pending",
    working_dir: `worlds/${world}/output/${id}`
  };
}

function buildPrompt(object) {
  return `Create a single clean product reference image for this object only:

Name: ${object.name}
Description: ${object.description}

Requirements:
- show only this object, no surrounding scene and no extra props
- white background, studio lighting, centered composition
- cropped tightly while keeping the entire object visible
- realistic material detail suitable for image-to-3D generation
- no text, labels, hands, people, floor shadows, or duplicate objects`;
}

async function resolveObject(options) {
  const { world, objectId, directImage, objectName, description } = options;
  const directObject = directImage
    ? buildDirectObject({ objectId, objectName, description, image: directImage, world })
    : undefined;
  const resolvedId = objectId || directObject?.id;

  if (!resolvedId) {
    throw new Error("objectId or directImage is required.");
  }

  const objectDir = `worlds/${world}/output/${resolvedId}`;
  const objectJsonPath = path.join(objectDir, "object.json");
  const existing = await readJsonIfExists(objectJsonPath);

  if (existing?.object) {
    return {
      object: {
        ...existing.object,
        ...(directImage
          ? {
              source_images: [...new Set([...(existing.object.source_images || []), directImage])],
              evidence: [
                ...(existing.object.evidence || []),
                { image: directImage, notes: "Direct single-image object input" }
              ]
            }
          : {})
      },
      objectDir,
      objectJsonPath,
      previous: existing
    };
  }

  if (directObject) {
    return {
      object: directObject,
      objectDir,
      objectJsonPath,
      previous: undefined
    };
  }

  throw new Error(`Object file not found: ${objectJsonPath}`);
}

async function nextNumberedImagePath(objectDir, objectId, sourcePath) {
  await ensureDir(objectDir);
  const safeSlug = safeFileName(objectId);
  const extension = path.extname(sourcePath) || ".png";
  const entries = await readdir(objectDir, { withFileTypes: true }).catch(() => []);
  const matcher = new RegExp(`^(\\d+)-${safeSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`);
  const maxIndex = entries.reduce((max, entry) => {
    if (!entry.isFile()) return max;
    const match = entry.name.match(matcher);
    return match ? Math.max(max, Number(match[1])) : max;
  }, -1);
  return path.join(objectDir, `${maxIndex + 1}-${safeSlug}${extension}`);
}

async function normalizeReferenceImage(downloadedImage, objectDir, objectId) {
  const numberedPath = await nextNumberedImagePath(objectDir, objectId, downloadedImage.path);
  if (downloadedImage.path !== numberedPath) {
    await rename(downloadedImage.path, numberedPath);
  }
  return {
    ...downloadedImage,
    path: numberedPath
  };
}

export async function generateSingleObject(options) {
  const {
    world,
    objectId,
    directImage,
    objectName,
    description,
    regenerate = false,
    imageEditProvider
  } = options;

  if (!world) throw new Error("world is required.");
  if (!objectId && !directImage) throw new Error("objectId or directImage is required.");

  const resolved = await resolveObject({
    world,
    objectId,
    directImage,
    objectName,
    description
  });

  const object = {
    ...resolved.object,
    working_dir: resolved.object.working_dir || resolved.objectDir,
    status: "in_progress"
  };
  await ensureDir(resolved.objectDir);

  const sourceImages = collectSourceImages(object, directImage);
  if (sourceImages.length === 0) {
    throw new Error(`Object ${object.id} does not have source images for image editing.`);
  }

  const runId = new Date().toISOString();
  const started = {
    schema_version: 1,
    world,
    object,
    runs: [
      ...(resolved.previous?.runs || []),
      {
        id: runId,
        status: "in_progress",
        regenerate: Boolean(regenerate || resolved.previous),
        started_at: runId,
        output_dir: resolved.objectDir
      }
    ],
    previous_completed_at: resolved.previous?.completed_at,
    updated_at: new Date().toISOString(),
    files: resolved.previous?.files || {}
  };
  await writeJson(resolved.objectJsonPath, started);

  try {
    const imageEdit = await runImageEdit({
      provider: imageEditProvider || object.image_edit_provider,
      prompt: buildPrompt(object),
      images: sourceImages,
      outputDir: resolved.objectDir,
      numImages: 1,
      resolution: "1K",
      aspectRatio: "1:1",
      outputFormat: "png",
      limitGenerations: true
    });

    const rawGeneratedImage = firstGeneratedImage(imageEdit);
    if (!rawGeneratedImage) {
      throw new Error(`Image edit did not return a downloadable image for ${object.id}.`);
    }
    const generatedImage = await normalizeReferenceImage(rawGeneratedImage, resolved.objectDir, object.id);

    await writeJson(resolved.objectJsonPath, {
      ...started,
      object: {
        ...started.object,
        status: "image_generated"
      },
      updated_at: new Date().toISOString(),
      files: {
        ...started.files,
        source_images: sourceImages,
        reference_image: generatedImage.path,
        image_edit: path.join(resolved.objectDir, "image-edit-files.json"),
        image_edit_provider: imageEdit.provider
      }
    });

    const hunyuan = await runHunyuan3D({
      image: generatedImage.path,
      outputDir: resolved.objectDir,
      assetName: object.name,
      enablePbr: true,
      generateType: "Normal",
      faceCount: 500000
    });

    const runs = started.runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            status: "completed",
            completed_at: new Date().toISOString(),
            reference_image: generatedImage.path,
            downloaded_model_files: hunyuan.downloaded_files.map((file) => file.path)
          }
        : run
    );

    const completed = {
      ...started,
      object: {
        ...started.object,
        status: "completed"
      },
      runs,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      files: {
        source_images: sourceImages,
        reference_image: generatedImage.path,
        image_edit: path.join(resolved.objectDir, "image-edit-files.json"),
        image_edit_provider: imageEdit.provider,
        hunyuan_3d: path.join(resolved.objectDir, "hunyuan-3d-files.json"),
        downloaded_model_files: hunyuan.downloaded_files.map((file) => file.path)
      },
      results: {
        image_edit_request_id: imageEdit.request_id,
        image_edit_provider: imageEdit.provider,
        hunyuan_3d_request_id: hunyuan.request_id
      }
    };

    await writeJson(resolved.objectJsonPath, completed);
    return completed;
  } catch (error) {
    const runs = started.runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            status: "failed",
            failed_at: new Date().toISOString(),
            error: error.message
          }
        : run
    );

    const failed = {
      ...started,
      object: {
        ...started.object,
        status: "failed"
      },
      runs,
      updated_at: new Date().toISOString(),
      failed_at: new Date().toISOString(),
      error: error.message
    };
    await writeJson(resolved.objectJsonPath, failed);
    throw error;
  }
}

export const generateSingleAsset = generateSingleObject;

async function main() {
  const { flags } = parseArgs();
  const world = one(flags, "world");
  const objectId = one(flags, "object-id") || one(flags, "asset-id");
  const directImage = one(flags, "image");

  if (!world || (!objectId && !directImage)) {
    throw new Error(
      "Usage: node generate-single-asset.mjs --world <world-name> (--object-id <object-id> | --image <path>) [--object-name <name>] [--description <text>] [--regenerate]"
    );
  }

  const result = await generateSingleObject({
    world,
    objectId,
    directImage,
    objectName: one(flags, "object-name") || one(flags, "asset-name"),
    description: one(flags, "description"),
    regenerate: Boolean(flags.regenerate),
    imageEditProvider: one(flags, "image-edit-provider")
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
