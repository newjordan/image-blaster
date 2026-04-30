---
name: image-blast-uncover
description: Deeply analyze source images into literal scene and object descriptions. Use when the user wants image understanding, scene captions, atmosphere, source image JSON files, object directories, or 3D object candidates.
argument-hint: [world-name] [optional image paths or instructions]
allowed-tools: Read Write Glob Bash(node .claude/scripts/project/project-state.mjs *)
---

Uncover literal image information for project `$0`. Additional image paths or instructions may appear in `$ARGUMENTS`.

## Instructions

1. Require a project/world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to use.
2. Ensure the project envelope exists, stage any input images when appropriate, and read derived state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0" --stage-input
```

3. Read `IMAGE-BLAST.md` in this skill directory and follow its JSON contract exactly.
4. Gather source images from explicit paths in `$ARGUMENTS` and `worlds/$0/source/`. Use `input/` only through the project-state staging step so source paths are stable. Source images use indexed families (`0-<slug>.<ext>`, `1-<slug>.png`, etc.); by default, analyze the latest image in each family and do not treat every historical plate/edit as separate evidence unless requested.
5. Analyze one source image at a time:
   - Read the image directly using agent image understanding.
   - Use literal, observational language only.
   - Write a sibling JSON file at `worlds/$0/source/<image-name>.json`.
   - Per-image JSON must use the same flat schema as root `image.json`.
   - Per-image JSON must not contain `images[]`.
6. Treat existing `worlds/$0/source/<image-name>.json` files as reusable analysis:
   - If the source image or user instruction changed, update the sibling JSON.
   - If the user deleted a source image or source JSON, do not recreate it unless the image still exists and should be analyzed.
7. After all per-image JSON files exist, derive `worlds/$0/image.json` by reading and merging all valid `worlds/$0/source/*.json` image analyses:
   - combine `source_images`
   - synthesize one shared `scene_name`, `short_caption`, and `literal_description`
   - merge `environment`, `visual_style`, `lighting`, `atmosphere`, and `ambient_sound`
   - deduplicate `objects` while preserving source-image evidence
   - use the same flat schema as each per-image JSON
   - do not write `images[]`
8. Present the root image analysis and merged object candidates to the user for approval or revision. Keep it concise:
   - scene name and short caption
   - literal environment, visual style, lighting, atmosphere, and ambient sound
   - object candidates with material and source-image evidence
9. When approved, create or update one object file per approved object:

```text
worlds/$0/output/<object-slug>/object.json
```

10. Each `object.json` should use this shape:

```json
{
  "schema_version": 1,
  "world": "$0",
  "object": {
    "id": "<object-slug>",
    "name": "<object name>",
    "description": "<literal object description>",
    "materials": [],
    "source_images": [],
    "evidence": [],
    "status": "pending",
    "working_dir": "worlds/$0/output/<object-slug>"
  },
  "jobs": {},
  "files": {},
  "updated_at": "..."
}
```

New objects should use `status: "pending"`. Existing completed objects should remain `completed` unless explicitly marked for regeneration. Object candidates remain in per-image JSON and root `image.json` as descriptive fallback data; object generation state lives in `object.json`.

11. Refresh derived project state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

12. Report saved paths, source image count, per-image JSON count, created/updated object directory count, pending object count, completed object count, and regeneration count.

## Output Locations

- Per-image analysis: `worlds/$0/source/<image-name>.json`
- Merged image and scene analysis: `worlds/$0/image.json`
- Object state: `worlds/$0/output/<object-slug>/object.json`
