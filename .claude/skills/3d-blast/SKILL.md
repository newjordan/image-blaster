---
name: 3d-blast
description: Blast pending, regenerated, or direct image inputs into 3D assets using FAL Nano Banana image isolation and Hunyuan 3D PBR mesh generation. Use after /image-uncover or when the user provides a single image to make into a 3D asset.
argument-hint: [world-name] [optional asset-id, image path, or instructions]
allowed-tools: Read Write Bash(node *) Task
context: fork
agent: general-purpose
---

Generate, regenerate, or directly create 3D assets for world `$0`. Additional asset IDs, image paths, or instructions may appear in `$ARGUMENTS`.

## Instructions

1. Require a world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to process.
2. Before FAL calls, remind the user that this uses `FAL_KEY`, may incur FAL cost for Nano Banana and Hunyuan 3D, and may take several minutes per asset. If the user directly invoked this skill, proceed.
3. Check `worlds/$0/output/assets/assets.json` first.
   - If it exists, read it and decide whether this is normal generation, regeneration, or manifest modification based on `$ARGUMENTS`.
   - If it does not exist and the user supplied an image path plus an asset name or description, create a minimal `assets.json` for that single asset.
   - If it does not exist and there is no single-image input, tell the user to run `/image-uncover $0` first or provide an image path and asset description.
4. Choose the generation mode:
   - **Normal mode:** generate assets with `status: "pending"` or `status: "failed"`.
   - **Regenerate mode:** generate only assets named in `$ARGUMENTS`, assets with `regenerate: true`, or assets the user explicitly asked to redo, even if already completed.
   - **Single-image mode:** create or update one manifest asset from the provided image path, asset name, and description, then generate only that asset.
5. Before spawning work, update only `assets.json` to ensure each selected asset has:
   - `status: "in_progress"`
   - `working_dir: "worlds/$0/output/assets/<asset-id>"`
   - `started_at` ISO timestamp if missing
   - `regenerate: true` only when this is an explicit regeneration
6. Spawn one background subagent per selected asset. Each subagent must run exactly one asset and must not modify `assets.json`. For manifest assets, give each subagent this command:

```bash
node .claude/scripts/asset-pipeline/generate-single-asset.mjs --world "$0" --asset-id "<asset-id>" --manifest "worlds/$0/output/assets/assets.json"
```

For explicit regeneration, append `--regenerate`. For direct single-image generation without a manifest asset, use:

```bash
node .claude/scripts/asset-pipeline/generate-single-asset.mjs --world "$0" --image "<image-path>" --asset-name "<asset-name>" --description "<description>"
```

The single-asset helper calls Nano Banana to create a tight studio reference image for the asset, calls Hunyuan 3D with `enable_pbr: true`, downloads all returned files, and writes:

- `worlds/$0/output/assets/<asset-id>/asset.json`
- timestamped attempt output under `worlds/$0/output/assets/<asset-id>/attempts/<timestamp>/`
- Nano Banana request/result/download metadata in the attempt directory
- Hunyuan request/result/download metadata in the attempt directory
- downloaded reference image and model files in the attempt directory

7. After subagents finish, read each asset's `asset.json`, then update `assets.json` once with final statuses:
   - `completed` when the asset file reports completion
   - `failed` with error details when the asset file reports failure
   - preserve each asset's prior attempt history
8. Report completed, failed, skipped, and regenerated assets with their output directories.

## Concurrency Rule

Only the coordinator edits `worlds/$0/output/assets/assets.json`. Asset subagents write their own `asset.json` files only. This prevents concurrent writes to the shared manifest.
