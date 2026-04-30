---
name: image-blast-3d
description: Create 3D objects from output/<object>/object.json files or a direct image input. Use after /image-blast-uncover or when the user provides a single image to make into a 3D object.
argument-hint: [world-name] [optional object-id, image path, or instructions]
allowed-tools: Read Write Glob Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/asset-pipeline/generate-single-asset.mjs *) Task
context: fork
agent: general-purpose
---

Generate, regenerate, or directly create 3D objects for project `$0`. Additional object IDs, image paths, or instructions may appear in `$ARGUMENTS`.

## Instructions

1. Require a project/world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to process.
2. Ensure the project envelope exists and read derived state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

3. Before FAL calls, remind the user that this uses `FAL_KEY`, may incur FAL cost for image editing and Hunyuan 3D, and may take several minutes per object. If the user directly invoked this skill, proceed.
4. Scan `worlds/$0/output/*/object.json` for objects. Ignore reserved output directories such as `world/` and `sfx/`.
   - If object files exist, decide whether this is normal generation, regeneration, or object update work based on `$ARGUMENTS`.
   - If no object files exist and the user supplied an image path plus an object name or description, create a new object directory through the single-object helper.
   - If no object files exist and there is no single-image input, tell the user to run `/image-blast-uncover $0` first or provide an image path and object description.
5. Choose the generation mode:
   - **Normal mode:** generate objects with `object.status: "pending"` or `object.status: "failed"`.
   - **Regenerate mode:** generate only objects named in `$ARGUMENTS`, objects with `object.regenerate: true`, or objects the user explicitly asked to redo, even if already completed.
   - **Single-image mode:** create or update one object directory from the provided image path, object name, and description, then generate only that object.
6. Spawn one background subagent per selected object. Each subagent must run exactly one object and should write only that object's directory. For existing objects, use:

```bash
node .claude/scripts/asset-pipeline/generate-single-asset.mjs --world "$0" --object-id "<object-id>"
```

For explicit regeneration, append `--regenerate`. For direct single-image generation, use:

```bash
node .claude/scripts/asset-pipeline/generate-single-asset.mjs --world "$0" --image "<image-path>" --object-name "<object-name>" --description "<description>"
```

The single-object helper calls the internal image-edit helper to create a tight studio reference image for the object, calls Hunyuan 3D with `enable_pbr: true`, downloads returned files, and writes:

- `worlds/$0/output/<object-id>/object.json`
- image edit result files directly in `worlds/$0/output/<object-id>/` with incrementing names like `0-<object-id>.png`, `1-<object-id>.png`
- image-edit request/result/download metadata in the object directory
- Hunyuan request/result/download metadata in the object directory
- downloaded model files in the object directory

7. After subagents finish, read each object's `object.json` directly from its directory.
8. Refresh derived project state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

9. Report completed, failed, skipped, and regenerated objects with their output directories.

## Concurrency Rule

There is no shared root object file. Object subagents write their own `worlds/$0/output/<object-id>/object.json` files only. This prevents concurrent writes to shared state.
