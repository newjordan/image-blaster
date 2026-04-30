# Project: Compendium

## First-time setup

1. Copy `.env.example` to `.env` at the project root and fill in the required keys:
   - `WORLD_LABS_API_KEY` — required for `/create-world`
   - `FAL_KEY` — required for `/3d-blast` FAL image and mesh generation
2. From `app/`: run `bun install`
3. `worlds/` and `input/` are gitignored — create them if missing: `mkdir -p worlds input`

## Skills

Invokable as slash commands. Full instructions in `.claude/skills/<name>/SKILL.md`.

- `/create-world [description]` — generates a world via World Labs API, checks `input/` for source images automatically
- `/threejs-edit [world-name] [instructions]` — add/modify/remove Three.js objects in a world's scene
- `/image-uncover [world-name]` — deeply analyzes `input/` and `worlds/<world>/source/` images with agent image understanding, writes `image-uncover.json`, and saves or updates the approved asset manifest
- `/3d-blast [world-name]` — reads the approved asset manifest and generates or regenerates asset images and PBR meshes using FAL-backed helper scripts; can also create one asset directly from a supplied image path

## Working directory structure

```
worlds/
  <world-slug>/
    source/    User-supplied input (images, prompts). Used by /create-world as generation source.
    world/     World Labs API output: world.json, operation.json
    output/    Skill outputs: audio, edited images, etc. Loops in background while world is active.
      image-uncover/ Rich image analysis: image-uncover.json
      assets/        Asset pipeline output: assets.json plus one folder per generated asset.
    scene/     project.json — Three.js editor App-format scene file

input/         Staging area for files before they're associated with a world (gitignored)
```

`<world-slug>` is lowercase and hyphenated (e.g. `snowy-mountain-cabin`).

## Key files

- `worlds/<slug>/world/world.json` — World Labs world object. Required for the React app to load the world.
- `worlds/<slug>/scene/project.json` — Three.js editor scene. Written by `/threejs-edit`, loaded by the React app.
- `worlds/<slug>/output/image-uncover/image-uncover.json` — rich image analysis written by `/image-uncover`.
- `worlds/<slug>/output/assets/assets.json` — approved asset manifest written by `/image-uncover`, consumed by `/3d-blast`.

## `input/` staging

Drop images, audio, or other assets into `input/`, then tell Claude what to do with them. Claude checks this folder automatically when running `/create-world`. After use, files move to `worlds/<slug>/source/` or `worlds/<slug>/output/`.
