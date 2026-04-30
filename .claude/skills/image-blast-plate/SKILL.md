---
name: image-blast-plate
description: Create indexed plate/source cleanup images by removing successfully generated 3D objects and optional extra content from source images. Use when the user asks for plates, clean plates, object removal, removing generated objects from source images, or source image cleanup.
argument-hint: [world-name] [optional source image or extra removal instructions]
allowed-tools: Read Write Glob Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/plate/generate-plates.mjs *)
context: fork
agent: general-purpose
---

Create plate images for project `$0`. Additional source image names, paths, or removal instructions may appear in `$ARGUMENTS`.

## Instructions

1. Require a project/world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to process.
2. Ensure the project envelope exists and read derived state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

3. Before FAL calls, remind the user that this uses `FAL_KEY`, may incur FAL image-edit cost, and writes derived source images. If the user directly invoked this skill, proceed.
4. Use the project indexed file convention from `.claude/rules/project.md`:
   - source originals are `source/0-<slug>.<ext>`
   - plate outputs are `source/1-<slug>.png`, `source/2-<slug>.png`, etc.
   - request metadata is hidden beside the output, e.g. `source/.1-<slug>-request.json`
   - read request `kind` and `role` from the metadata JSON, not from the filename
5. Default behavior:
   - Scan successful object generations from `worlds/$0/output/*/object.json` and generated model files.
   - For each source image family, use the latest indexed source image as input.
   - Use this prompt shape: `remove the following objects from the image: <list of object names from successful 3d object generations>`.
   - Append any extra removal instruction from `$ARGUMENTS`, such as `water`, `the cables`, or `all people`.
6. If the user names a specific source image or path, process only that source family unless they explicitly ask for all.
7. Generate plates with:

```bash
node .claude/scripts/plate/generate-plates.mjs \
  --world "$0" \
  --remove "<optional extra removal instruction>" \
  --image "<optional source image path or name>"
```

Omit `--image` when processing all source families. Repeat `--remove` for multiple extra removal instructions. Optional provider override: `--image-edit-provider nano-banana|gpt-image-2`.
8. Refresh derived project state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

9. Report input image, output plate image, hidden request metadata path, and prompt used for each generated plate.
