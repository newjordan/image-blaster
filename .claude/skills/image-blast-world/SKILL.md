---
name: image-blast-world
description: Generate the 3D static environment of a world.
argument-hint: [world-name] [optional image path or world prompt]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/image-edit/generate-edit.mjs *) Bash(node .claude/scripts/world/generate-world.mjs *)
context: fork
agent: image-blast-world
---

Create or resume one World Labs world for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- Use `ls -a` before reading generated state.
- Use an explicit image path or prompt from `$ARGUMENTS` when provided.
- For normal project generation, remove confirmed foreground objects before World Labs generation by creating a clean plate from the selected source image.
- Confirmed objects are `worlds/$0/output/<object>/object.json` files. Build the removal list from `object.name`, adding short details from `object.description` when needed.
- Skip cleanup when there are no confirmed objects, when hidden request JSON in `worlds/$0/source/` already has `role: "plate"` for the selected source image, or for explicit-image or prompt-only requests.
- Write clean plates into `worlds/$0/source/` with `--role plate` and `--output-slug "<source-slug>-plate"`, so the visible output is named like `1-<source-slug>-plate.png`.
- Without an explicit image, the world helper uses the highest-index visible image in `worlds/$0/source/`, which should be the generated plate after cleanup.
- The helper resumes unfinished `operation.json`, strips base64 before writing JSON, polls World Labs, and writes `world.json`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

When cleanup is required, run and wait for one synchronous image edit:

```bash
node .claude/scripts/image-edit/generate-edit.mjs \
  --image "<selected source image path>" \
  --prompt "remove the following confirmed objects from the image: <list of object names and any custom edits the user wants>" \
  --output-dir "worlds/$0/source" \
  --role plate \
  --output-slug "<source-slug>-plate"
```

Then run:

```bash
node .claude/scripts/world/generate-world.mjs --world "$0"
```

Only pass `--image` or `--prompt` when explicitly provided. For explicit regeneration, append `--regenerate`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Final response: report the plate/edit image used when cleanup ran, the world output path, and any failure/resume metadata.
