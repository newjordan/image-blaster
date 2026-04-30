---
name: image-blast-world
description: Generate a World Labs world for an Image Blast project. Use after /image-blast-project or /image-blast-uncover when the user wants the navigable 3D world output.
argument-hint: [world-name] [optional world prompt or instructions]
allowed-tools: Read Write Glob Bash(node .claude/scripts/project/project-state.mjs *) Bash(curl *) Bash(base64 *) Bash(sleep *)
context: fork
agent: general-purpose
---

Create or resume a World Labs world for project `$0`. Additional prompt text or instructions may appear in `$ARGUMENTS`.

## Instructions

### 1. Resolve project

Require a project/world slug in `$0`. If it is missing, ask which `worlds/<world-name>/` directory to use.

Ensure the project envelope exists and read derived state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Use:

- Project root: `worlds/$0/`
- Source images: `worlds/$0/source/`
- World output directory: `worlds/$0/output/world/`

### 2. Check for resumable or existing world

**Resume in-progress generation:** If `worlds/$0/output/world/operation.json` exists and contains `"done": false`, skip to step 5 (Poll until complete) using the `operation_id` from that file. Do not POST a new request.

**Regenerate existing world:** If `worlds/$0/output/world/world.json` already exists (generation previously completed), confirm with the user before proceeding. If they confirm, continue from step 4. The `source/` directory is left intact and `world.json` / `operation.json` will be overwritten.

### 3. Identify source image

Prefer stable source images in `worlds/$0/source/`. Source images use indexed families (`0-<slug>.<ext>`, `1-<slug>.png`, etc.); use the latest image in the relevant family by default. If the user explicitly provided an image path in `$ARGUMENTS`, use it.

If no source image is found in `worlds/$0/source/`, run project staging once:

```bash
node .claude/scripts/project/project-state.mjs --world "$0" --stage-input
```

Then check `worlds/$0/source/` again.

If no image is found anywhere, use text prompt mode. Prefer the flat literal scene/world fields in `worlds/$0/image.json` for the text prompt, supplemented by `$ARGUMENTS`. If `image.json` is missing, use the world prompt from `$ARGUMENTS`.

### 4. Create the world

**Endpoint:** `POST https://api.worldlabs.ai/marble/v1/worlds:generate`

**Auth header:** `WLT-Api-Key: $WORLD_LABS_API_KEY`

**Text prompt body:**
```json
{
  "display_name": "$0",
  "world_prompt": {
    "type": "text",
    "text_prompt": "<world prompt from $ARGUMENTS>"
  }
}
```

**Image prompt body** (base64-encode the image file):
```json
{
  "display_name": "$0",
  "world_prompt": {
    "type": "image",
    "image_prompt": {
      "data_base64": "<base64-encoded image>"
    },
    "text_prompt": "<optional world prompt from $ARGUMENTS>"
  }
}
```

Save the full response to `worlds/$0/output/world/operation.json`. The response contains an `operation_id` field.

### 5. Poll until complete

**Endpoint:** `GET https://api.worldlabs.ai/marble/v1/operations/<operation_id>`

**Auth header:** `WLT-Api-Key: $WORLD_LABS_API_KEY`

Poll every **15 seconds**. Generation typically takes ~5 minutes.

- `done: false` means still generating; continue polling
- `done: true` plus `response` means success
- `done: true` plus `error` means failed; report error and stop

Update `worlds/$0/output/world/operation.json` each poll.

### 6. Write world.json

When complete, write `response` from the operation to `worlds/$0/output/world/world.json`.

### 7. Refresh state

Refresh project state:

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

### 8. Report result

Tell the user:

- Slug and display name
- Caption or generated description if present
- Thumbnail URL if present
- World output path: `worlds/$0/output/world/world.json`
- App route: `/$0`
