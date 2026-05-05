---
name: image-blast-world
description: Generate the 3D static environment of a world.
argument-hint: [world-name] [optional image path or world prompt]
allowed-tools: Read Write Glob Bash(ls *) Bash(node .claude/scripts/project/project-state.mjs *) Bash(node .claude/scripts/world/generate-world.mjs *)
context: fork
agent: image-blast-world
---

Create or resume one World Labs world for project `$0`.

## Instructions

- If `$0` is missing, ask for the world slug.
- Use `ls -a` before reading generated state.
- Use an explicit image path or prompt from `$ARGUMENTS` when provided.
- Without an explicit image, the world helper uses the highest-index visible image in `worlds/$0/source/`.
- The helper resumes unfinished `operation.json`, strips base64 before writing JSON, polls World Labs, writes `world.json`, and downloads every referenced world asset to `worlds/$0/output/world/`.
- The frontend must only load local files from disk. World Labs URLs in `world.json` are provenance/resume data only; never leave `.spz`, collider `.glb`, panorama, or thumbnail assets to be loaded from provider URLs.
- If any referenced `.spz`, collider, or panorama URL exists in `world.json`, make sure the matching local file is present before reporting success. Rerun the helper or fix the download failure instead of telling the frontend to use the remote URL.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Run:

```bash
node .claude/scripts/world/generate-world.mjs --world "$0"
```

Only pass `--image` or `--prompt` when explicitly provided. For explicit regeneration, append `--regenerate`.

```bash
node .claude/scripts/project/project-state.mjs --world "$0"
```

Final response: report the source image used when relevant, the world output path, all downloaded `.glb`, `.spz`, panorama, and thumbnail paths if present, and any failure/resume metadata.
