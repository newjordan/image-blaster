---
name: image-blast-project
description: Create, inspect, and manage an Image Blast project envelope under worlds/<slug>. Use before image-blast-uncover, image-blast-world, image-blast-3d, image-blast-sfx, or whenever the user asks about active project state.
argument-hint: [world-name or description] [optional instructions]
allowed-tools: Read Write Glob Bash(node .claude/scripts/project/project-state.mjs *)
---

Create or inspect an Image Blast project. Input: `$ARGUMENTS`.

## Instructions

1. Resolve the project slug:
   - If `$0` is an existing `worlds/<slug>` directory or a slug-like name, use it.
   - Otherwise derive a lowercase hyphenated slug from `$ARGUMENTS`.
   - If no usable input is provided, ask the user which project/world to use.
2. Run the project-state helper from the repo root. If `input/` contains images or the user asked to use staged input, include `--stage-input` so files move immediately into stable source paths:

```bash
node .claude/scripts/project/project-state.mjs --world "<slug>" --stage-input
```

3. The helper creates and validates:

```text
worlds/<slug>/
  project.json
  image.json
  source/
    <image-name>.json
  output/
    world/
    sfx/
    <object-slug>/
  scene/
```

Only minimal `project.json` and directories are created automatically. Per-image `source/<image-name>.json`, root `image.json`, and per-object `output/<object-slug>/object.json` files are written by `/image-blast-uncover`.

4. Read the printed project state or `worlds/<slug>/project.json`.
5. Report:
   - project slug and display name
   - source file count
   - per-image JSON count
   - staged files moved from `input/`, if any
   - whether World Labs output exists
   - whether `image.json` exists
   - derived object counts by status
   - whether world-level SFX exists
   - whether `scene/project.json` exists
6. If source images now exist and `image.json` is missing, continue directly with the `/image-blast-uncover` workflow for no-cost literal image analysis and object directory creation. Do not stop just to ask whether to start uncover.
7. Recommend paid or downstream actions only after no-cost setup/analysis is complete:
   - `/image-blast-world <slug> ...` for World Labs generation
   - `/image-blast-3d <slug>` for object generation from `output/<object-slug>/object.json`
   - `/image-blast-sfx <slug> ...` for ambient, object-impact, or arbitrary sound effects
   - `/threejs-edit <slug> ...` for scene edits
