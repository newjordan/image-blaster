---
name: image-uncover
description: Deeply analyze input images into structured scene descriptions and 3D asset candidates. Use when the user wants rich image understanding, scene captions, atmosphere, object lists, or an assets.json queue for later 3D generation.
argument-hint: [world-name] [optional image paths or instructions]
allowed-tools: Read Write Glob
---

Uncover rich image information for world `$0`. Additional image paths or instructions may appear in `$ARGUMENTS`.

## Instructions

1. Require a world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to use.
2. Read `IMAGE-BLAST.md` in this skill directory and follow its JSON contract exactly.
3. Check existing outputs before analyzing:
   - `worlds/$0/output/image-uncover/image-uncover.json`
   - `worlds/$0/output/assets/assets.json`
   - `worlds/$0/output/assets/assets-draft.json`
4. If existing output exists, treat this as review/update work:
   - preserve stable image slugs and asset IDs where possible
   - preserve completed generated asset records unless the user asks to regenerate, remove, or replace them
   - propose additions, removals, field edits, or regeneration flags rather than starting from scratch
5. Gather candidate image paths from explicit paths in `$ARGUMENTS`, `input/`, and `worlds/$0/source/`.
6. Read each image directly and inspect it using agent image understanding. For each image, produce the `IMAGE-BLAST.md` per-image JSON, including:
   - `slug`
   - `scene_name`
   - `short_caption`
   - `long_description`
   - `environment`
   - `visual_style`
   - `lighting`
   - `atmosphere`
   - `objects`
7. Derive a deduplicated asset queue from all `objects` where `generate_as_3d_asset` is `true`.
8. Present the proposed image analyses and asset queue to the user. Keep the summary concise, but include enough detail to approve or revise:
   - scene name and short caption for each image
   - environment, visual style, lighting, and atmosphere
   - asset candidates with descriptions and evidence
9. Ask the user to approve or request changes. Do not write or replace `assets.json` until the user approves.
10. When approved, write:
    - `worlds/$0/output/image-uncover/image-uncover.json` with full per-image analysis
    - `worlds/$0/output/assets/assets.json` with the deduplicated 3D asset queue
11. In `assets.json`, ensure each asset has stable `id`, `name`, `description`, `evidence`, `source_images`, `status`, and `working_dir`. New assets should use `status: "pending"`. Existing completed assets should remain `completed` unless explicitly marked for regeneration.
12. Report saved paths, image count, pending asset count, completed asset count, and regeneration count.

## Output Locations

- Rich image analysis: `worlds/$0/output/image-uncover/image-uncover.json`
- 3D asset queue: `worlds/$0/output/assets/assets.json`
