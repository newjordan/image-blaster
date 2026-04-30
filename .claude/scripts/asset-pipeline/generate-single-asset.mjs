#!/usr/bin/env node
import { rename } from "node:fs/promises";
import path from "node:path";
import { runHunyuan3D } from "./hunyuan-3d.mjs";
import { runImageEdit } from "./image-edit.mjs";
import {
  downloadRemoteFiles,
  ensureDir,
  getFalQueueResult,
  one,
  parseArgs,
  pathExists,
  pollFalQueue,
  readJson,
  safeFileName,
  sanitizeForMetadata,
  slugify,
  writeJson
} from "./fal-queue.mjs";
import {
  artifactPath,
  buildRequestSummary,
  nextIndex,
  parseIndexedName,
  requestPath
} from "./request-metadata.mjs";

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
  return (imageEditSummary.downloaded_files || []).find((downloaded) => {
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

function nowIso() {
  return new Date().toISOString();
}

function requestIndexFromState(previous) {
  const jobIndexes = [
    previous?.jobs?.image_edit?.index,
    previous?.jobs?.hunyuan_3d?.index,
    parseIndexedName(previous?.jobs?.image_edit?.metadata_path)?.index,
    parseIndexedName(previous?.jobs?.hunyuan_3d?.metadata_path)?.index,
    parseIndexedName(previous?.files?.reference_image)?.index
  ].filter((index) => Number.isInteger(index));

  return jobIndexes.at(0);
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

async function normalizeReferenceImage(downloadedImage, objectDir, objectId, requestIndex) {
  const extension = path.extname(downloadedImage.path) || ".png";
  const numberedPath = artifactPath(objectDir, requestIndex, objectId, extension);
  if (downloadedImage.path !== numberedPath) {
    await rename(downloadedImage.path, numberedPath);
  }
  return {
    ...downloadedImage,
    path: numberedPath
  };
}

async function normalizeModelFiles(downloadedFiles, objectDir, objectId, requestIndex) {
  const safeSlug = safeFileName(objectId);
  const seen = new Set();
  const primaryModelExtensions = new Set([".glb", ".obj", ".fbx", ".usdz"]);
  let primaryModelUsed = false;

  const normalized = [];
  for (let index = 0; index < downloadedFiles.length; index += 1) {
    const downloaded = downloadedFiles[index];
    const extension = path.extname(downloaded.path) || ".bin";
    const label = safeFileName(downloaded.label || `file-${index + 1}`);
    const usePrimaryName = primaryModelExtensions.has(extension.toLowerCase()) && !primaryModelUsed;
    if (usePrimaryName) primaryModelUsed = true;
    const baseName =
      usePrimaryName
        ? `${requestIndex}-${safeSlug}${extension}`
        : `${requestIndex}-${safeSlug}-${label}${extension}`;
    const dedupedName = seen.has(baseName)
      ? `${requestIndex}-${safeSlug}-${label}-${index + 1}${extension}`
      : baseName;
    seen.add(dedupedName);

    const outputPath = path.join(objectDir, dedupedName);
    if (downloaded.path !== outputPath) {
      await rename(downloaded.path, outputPath);
    }
    normalized.push({
      ...downloaded,
      path: outputPath
    });
  }

  return normalized;
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

  if (resolved.previous?.object?.status === "completed" && !regenerate) {
    return {
      ...resolved.previous,
      skipped: true,
      skip_reason: "Object already completed. Pass --regenerate to run it again."
    };
  }

  const baseObject = {
    ...resolved.object,
    working_dir: resolved.object.working_dir || resolved.objectDir,
    status: "in_progress"
  };
  await ensureDir(resolved.objectDir);

  const sourceImages = collectSourceImages(baseObject, directImage);
  if (sourceImages.length === 0) {
    throw new Error(`Object ${baseObject.id} does not have source images for image editing.`);
  }

  const existingRequestIndex = !regenerate ? requestIndexFromState(resolved.previous) : undefined;
  const requestIndex =
    existingRequestIndex !== undefined
      ? existingRequestIndex
      : await nextIndex(resolved.objectDir, baseObject.id);
  const files = regenerate
    ? { source_images: sourceImages }
    : { ...(resolved.previous?.files || {}), source_images: sourceImages };

  let state = {
    schema_version: 1,
    world,
    object: baseObject,
    jobs: regenerate ? {} : resolved.previous?.jobs || {},
    updated_at: nowIso(),
    files
  };

  async function saveState(patch = {}) {
    state = {
      ...state,
      ...patch,
      updated_at: nowIso()
    };
    await writeJson(resolved.objectJsonPath, state);
    return state;
  }

  async function saveJob(stage, patch = {}) {
    const job = {
      ...(state.jobs?.[stage] || {}),
      ...patch,
      updated_at: nowIso()
    };

    await saveState({
      jobs: {
        ...(state.jobs || {}),
        [stage]: job
      }
    });
    return job;
  }

  async function resumeFalStage(stage, prefix, outputDir, pollIntervalMs = 5000) {
    const job = state.jobs?.[stage];
    if (!job?.endpoint || !job?.request_id) {
      throw new Error(`Cannot resume ${stage}; missing endpoint or request_id in object.json.`);
    }

    await saveJob(stage, { status: "polling" });
    const status = await pollFalQueue(job.endpoint, job.request_id, {
      statusUrl: job.status_url,
      metadataPath: job.metadata_path,
      pollIntervalMs,
      onStatus: async (statusPatch) => {
        await saveJob(stage, {
          status: statusPatch.status,
          checked_at: statusPatch.checked_at
        });
      }
    });
    const result = await getFalQueueResult(job.endpoint, job.request_id, {
      responseUrl: job.response_url,
      metadataPath: job.metadata_path
    });
    const downloaded = await downloadRemoteFiles(result.data, outputDir, prefix);
    const completedAt = nowIso();
    const summary = buildRequestSummary({
      kind: job.kind,
      provider: job.endpoint,
      metadata: { index: job.index },
      requestId: job.request_id,
      submittedAt: job.submitted_at,
      completedAt,
      outputFiles: downloaded.map((file) => file.path),
      downloadedFiles: downloaded,
      result: result.data
    });

    if (job.metadata_path) await writeJson(job.metadata_path, summary);
    await saveJob(stage, {
      status: "completed",
      completed_at: completedAt,
      output_files: summary.output_files,
      metadata_path: job.metadata_path,
      index: job.index,
      kind: job.kind,
      queue_status: status.status
    });

    return summary;
  }

  await saveState();

  try {
    let generatedImagePath = state.files?.reference_image;
    if (!generatedImagePath || !(await pathExists(generatedImagePath))) {
      await saveState({
        object: {
          ...state.object,
          status: "in_progress"
        }
      });

      const imageEditMetadataPath = requestPath(resolved.objectDir, requestIndex, state.object.id, "image");
      const imageEditJob = state.jobs?.image_edit;
      const imageEdit = imageEditJob?.request_id
        ? await resumeFalStage("image_edit", "image-edit", resolved.objectDir)
        : await runImageEdit({
            provider: imageEditProvider || state.object.image_edit_provider,
            prompt: buildPrompt(state.object),
            images: sourceImages,
            outputDir: resolved.objectDir,
            metadataPath: imageEditMetadataPath,
            metadata: { index: requestIndex },
            numImages: 1,
            resolution: "1K",
            aspectRatio: "1:1",
            outputFormat: "png",
            limitGenerations: true,
            onSubmit: async (submitted) => {
              await saveJob("image_edit", {
                endpoint: submitted.endpoint,
                kind: "2d",
                index: requestIndex,
                request_id: submitted.request_id,
                status: submitted.status,
                submitted_at: submitted.submitted_at,
                status_url: submitted.status_url,
                response_url: submitted.response_url,
                metadata_path: imageEditMetadataPath
              });
            },
            onStatus: async (statusPatch) => {
              await saveJob("image_edit", {
                status: statusPatch.status,
                checked_at: statusPatch.checked_at
              });
            }
          });

      const rawGeneratedImage = firstGeneratedImage(imageEdit);
      if (!rawGeneratedImage) {
        throw new Error(`Image edit did not return a downloadable image for ${state.object.id}.`);
      }

      const generatedImage = await normalizeReferenceImage(
        rawGeneratedImage,
        resolved.objectDir,
        state.object.id,
        requestIndex
      );
      generatedImagePath = generatedImage.path;
      const imageEditMetadata = (await readJsonIfExists(imageEditMetadataPath)) || imageEdit;
      await writeJson(imageEditMetadataPath, {
        ...imageEditMetadata,
        kind: "2d",
        index: requestIndex,
        output_files: [generatedImage.path],
        downloaded_files: (imageEdit.downloaded_files || []).map((file) =>
          file.path === rawGeneratedImage.path ? { ...file, path: generatedImage.path } : file
        ),
        updated_at: nowIso()
      });

      await saveJob("image_edit", {
        status: "completed",
        completed_at: imageEdit.completed_at || nowIso(),
        output_files: [generatedImage.path],
        index: requestIndex,
        kind: "2d",
        metadata_path: imageEditMetadataPath
      });
      await saveState({
        object: {
          ...state.object,
          status: "image_generated"
        },
        files: {
          ...state.files,
          source_images: sourceImages,
          reference_image: generatedImage.path,
          image_edit: imageEditMetadataPath,
          image_edit_provider: imageEdit.provider_alias || imageEdit.provider
        }
      });
    }

    const modelFiles = state.files?.downloaded_model_files || [];
    const hasModelFiles =
      modelFiles.length > 0 && (await Promise.all(modelFiles.map((file) => pathExists(file)))).every(Boolean);
    if (!hasModelFiles) {
      await saveState({
        object: {
          ...state.object,
          status: "in_progress"
        }
      });

      const hunyuanMetadataPath = requestPath(resolved.objectDir, requestIndex, state.object.id, "model");
      const hunyuanJob = state.jobs?.hunyuan_3d;
      const hunyuan = hunyuanJob?.request_id
        ? await resumeFalStage("hunyuan_3d", "hunyuan-3d", resolved.objectDir, 10000)
        : await runHunyuan3D({
            image: generatedImagePath,
            outputDir: resolved.objectDir,
            metadataPath: hunyuanMetadataPath,
            metadata: { index: requestIndex },
            assetName: state.object.name,
            enablePbr: true,
            generateType: "Normal",
            faceCount: 500000,
            onSubmit: async (submitted) => {
              await saveJob("hunyuan_3d", {
                endpoint: submitted.endpoint,
                kind: "3d",
                index: requestIndex,
                request_id: submitted.request_id,
                status: submitted.status,
                submitted_at: submitted.submitted_at,
                status_url: submitted.status_url,
                response_url: submitted.response_url,
                metadata_path: hunyuanMetadataPath
              });
            },
            onStatus: async (statusPatch) => {
              await saveJob("hunyuan_3d", {
                status: statusPatch.status,
                checked_at: statusPatch.checked_at
              });
            }
          });

      const modelFiles = await normalizeModelFiles(
        hunyuan.downloaded_files || [],
        resolved.objectDir,
        state.object.id,
        requestIndex
      );
      const hunyuanMetadata = (await readJsonIfExists(hunyuanMetadataPath)) || hunyuan;
      await writeJson(hunyuanMetadataPath, {
        ...hunyuanMetadata,
        kind: "3d",
        index: requestIndex,
        output_files: modelFiles.map((file) => file.path),
        downloaded_files: sanitizeForMetadata(modelFiles),
        updated_at: nowIso()
      });

      await saveJob("hunyuan_3d", {
        status: "completed",
        completed_at: hunyuan.completed_at || nowIso(),
        output_files: modelFiles.map((file) => file.path),
        index: requestIndex,
        kind: "3d",
        metadata_path: hunyuanMetadataPath
      });
      await saveState({
        files: {
          ...state.files,
          hunyuan_3d: hunyuanMetadataPath,
          downloaded_model_files: modelFiles.map((file) => file.path)
        }
      });
    }

    const completed = await saveState({
      object: {
        ...state.object,
        status: "completed"
      },
      completed_at: nowIso(),
      files: {
        ...state.files,
        source_images: sourceImages
      }
    });

    return completed;
  } catch (error) {
    const failed = await saveState({
      object: {
        ...state.object,
        status: "failed"
      },
      failed_at: nowIso(),
      error: error.message
    });
    throw Object.assign(error, { objectState: failed });
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
