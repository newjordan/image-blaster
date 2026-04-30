#!/usr/bin/env node
import path from "node:path";
import {
  callFalQueue,
  downloadFile,
  ensureDir,
  one,
  parseArgs,
  pathExists,
  readJson,
  slugify,
  writeJson
} from "../asset-pipeline/fal-queue.mjs";
import {
  artifactPath,
  buildRequestSummary,
  nextIndex,
  requestPath
} from "../asset-pipeline/request-metadata.mjs";

const ENDPOINT = "fal-ai/elevenlabs/sound-effects/v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

function asBool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  if (value === false) return false;
  return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
}

function asNumber(value, fallback = undefined) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Expected a number, received "${value}".`);
  return number;
}

function clampCount(value) {
  const count = Math.trunc(asNumber(value, 1));
  if (count < 1 || count > 4) {
    throw new Error("count must be between 1 and 4.");
  }
  return count;
}

function extensionForOutputFormat(outputFormat) {
  if (outputFormat.startsWith("mp3_")) return ".mp3";
  if (outputFormat.startsWith("pcm_")) return ".pcm";
  if (outputFormat.startsWith("opus_")) return ".opus";
  if (outputFormat.startsWith("ulaw_")) return ".ulaw";
  if (outputFormat.startsWith("alaw_")) return ".alaw";
  return ".audio";
}

async function readManifest(manifestPath) {
  return (await pathExists(manifestPath)) ? readJson(manifestPath) : undefined;
}

export async function generateSfx(options) {
  const {
    prompt,
    outputDir,
    prefix = "sfx",
    count = 1,
    loop = false,
    durationSeconds,
    promptInfluence = 0.3,
    outputFormat = DEFAULT_OUTPUT_FORMAT,
    kind = "sfx",
    manifestPath = outputDir ? path.join(outputDir, "sfx.json") : undefined
  } = options;

  if (!prompt) throw new Error("prompt is required.");
  if (!outputDir) throw new Error("outputDir is required.");

  const requestedCount = clampCount(count);
  const duration = asNumber(durationSeconds, undefined);
  if (duration !== undefined && (duration < 0.5 || duration > 22)) {
    throw new Error("durationSeconds must be between 0.5 and 22 for the FAL ElevenLabs SFX endpoint.");
  }

  const influence = asNumber(promptInfluence, 0.3);
  if (influence < 0 || influence > 1) {
    throw new Error("promptInfluence must be between 0 and 1.");
  }

  await ensureDir(outputDir);
  const extension = extensionForOutputFormat(outputFormat);
  const files = [];
  const requests = [];

  for (let index = 0; index < requestedCount; index += 1) {
    const input = {
      text: prompt,
      loop: Boolean(loop),
      prompt_influence: influence,
      output_format: outputFormat
    };
    if (duration !== undefined) input.duration_seconds = duration;

    const audioPrefix = requestedCount > 1 ? `${prefix}-${index + 1}` : prefix;
    const requestIndex = await nextIndex(outputDir, audioPrefix);
    const metadataPath = requestPath(outputDir, requestIndex, audioPrefix);
    const result = await callFalQueue(ENDPOINT, input, {
      metadataPath,
      metadata: {
        kind: "sfx",
        sfx_kind: kind,
        provider: ENDPOINT,
        index: requestIndex
      },
      pollIntervalMs: 3000
    });
    const audioUrl = result.data?.audio?.url;
    if (!audioUrl) {
      throw new Error(`FAL SFX result did not include audio.url: ${JSON.stringify(result.data)}`);
    }

    const audioPath = artifactPath(outputDir, requestIndex, audioPrefix, extension);
    await downloadFile(audioUrl, audioPath);

    const file = {
      path: audioPath,
      url: audioUrl,
      output_format: outputFormat,
      loop: Boolean(loop),
      duration_seconds: duration
    };
    files.push(file);
    requests.push({
      index: requestIndex,
      kind: "sfx",
      request_id: result.requestId,
      generated_at: new Date().toISOString(),
      endpoint: ENDPOINT,
      metadata_path: metadataPath,
      file: audioPath
    });

    const metadata = (await readManifest(metadataPath)) || {};
    const summary = buildRequestSummary({
      kind: "sfx",
      provider: ENDPOINT,
      metadata: {
        index: requestIndex,
        sfx_kind: kind
      },
      requestId: result.requestId,
      submittedAt: result.submittedAt,
      prompt,
      inputFiles: [],
      outputFiles: [audioPath],
      result: result.data
    });

    await writeJson(metadataPath, {
      ...metadata,
      ...summary
    });
  }

  const previous = manifestPath ? await readManifest(manifestPath) : undefined;
  const run = {
    id: new Date().toISOString(),
    kind,
    prompt,
    loop: Boolean(loop),
    count: requestedCount,
    files,
    requests
  };

  const manifest = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    active_requests: previous?.active_requests || [],
    last_request_indexes: requests.map((request) => request.index),
    last_kind: kind,
    last_prompt: prompt
  };

  if (manifestPath) await writeJson(manifestPath, manifest);

  return {
    ...run,
    provider: ENDPOINT,
    endpoint: ENDPOINT,
    manifest_path: manifestPath
  };
}

async function main() {
  const { flags, positionals } = parseArgs();
  const prompt = one(flags, "prompt") || positionals.join(" ");
  const outputDir = one(flags, "output-dir");

  if (!prompt || !outputDir) {
    throw new Error(
      "Usage: node fal-elevenlabs-sfx.mjs --prompt <description> --output-dir <dir> [--count 1-4] [--loop] [--duration-seconds <0.5-22>]"
    );
  }

  const result = await generateSfx({
    prompt,
    outputDir,
    prefix: one(flags, "prefix", slugify(prompt).slice(0, 40) || "sfx"),
    count: one(flags, "count", 1),
    loop: asBool(one(flags, "loop"), false),
    durationSeconds: one(flags, "duration-seconds"),
    promptInfluence: one(flags, "prompt-influence", 0.3),
    outputFormat: one(flags, "output-format", DEFAULT_OUTPUT_FORMAT),
    kind: one(flags, "kind", "sfx"),
    manifestPath: one(flags, "manifest")
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
