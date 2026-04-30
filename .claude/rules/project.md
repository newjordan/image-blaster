# Project: Compendium

## First-time setup

1. Copy `.env.example` to `.env` at the project root and fill in the required keys:
   - `WORLD_LABS_API_KEY` — required for `/image-blast-world`
   - `FAL_KEY` — required for `/image-blast-3d` image/mesh generation and `/image-blast-sfx` sound generation
2. From `app/`: run `bun install`
3. `worlds/` and `input/` are gitignored — create them if missing: `mkdir -p worlds input`

## Skills

Invokable as slash commands. Full instructions in `.claude/skills/<name>/SKILL.md`.

- `/image-blast-project [world-name or description]` — creates or inspects the canonical project envelope, writes minimal `project.json`, stages input images, and reports derived state
- `/image-blast-world [world-name] [description]` — generates a world via World Labs API using `worlds/<world>/source/` as the stable source-image location
- `/threejs-edit [world-name] [instructions]` — add/modify/remove Three.js objects in a world's scene
- `/image-blast-uncover [world-name]` — analyzes `worlds/<world>/source/` images with literal agent image understanding, writes `source/<image-name>.json` beside each image, merges them into root `image.json`, and creates or updates per-object `object.json` files
- `/image-blast-3d [world-name]` — scans object directories and generates or regenerates isolated object images and PBR meshes using FAL-backed helper scripts; can also create one object directly from a supplied image path
- `/image-blast-sfx [world-name]` — generates world ambience loops, object impact sounds, or arbitrary sound effects using the FAL ElevenLabs SFX endpoint
- `/image-blast-plate [world-name]` — creates plate/source cleanup images by removing successfully generated objects and optional extra user-specified content from indexed source image families

## Working directory structure

```
worlds/
  <world-slug>/
    project.json  Minimal durable project metadata, written by /image-blast-project.
    image.json    Merged literal scene/world analysis, written by /image-blast-uncover.
    source/       User-supplied input (images, prompts). Used as the stable source location.
      0-<slug>.<ext> Original source image in an indexed source family.
      1-<slug>.png   Derived plate/edit image in the same family.
      <image>.json   Per-image literal analysis beside the source image.
    output/
      world/      World Labs API output: world.json, operation.json
      sfx/        World-level ambience and arbitrary sound effects: audio files plus sfx.json
      <object>/   Object source of truth: object.json plus generated images and meshes.
        sfx/      Object-specific impact or interaction sounds.
    scene/        project.json — Three.js editor App-format scene file

input/         Staging area for files before they're associated with a world (gitignored)
```

`<world-slug>` is lowercase and hyphenated (e.g. `snowy-mountain-cabin`).

## Indexed file convention

Image Blast generated files use one project-wide convention:

```text
N-slug.ext
.N-slug-request.json
```

- `N` is the generation index within a stable family. `0` is the original/source artifact; higher numbers are derived generations.
- `slug` is the stable family or asset slug.
- Hidden request metadata sits beside the artifact it generated and must be compact and sanitized.
- Read request semantics like `kind`, `role`, provider, and status from the JSON contents, not from the filename.
- When multiple request files belong to the same artifact index, use `__scope` only to avoid filename collisions, e.g. `jar__image` and `jar__model`.
- “Latest” means the highest `N` for a given `slug`.

Examples:

```text
worlds/<slug>/source/0-lab-room.png
worlds/<slug>/source/1-lab-room.png
worlds/<slug>/source/.1-lab-room-request.json

worlds/<slug>/output/jar/0-jar.png
worlds/<slug>/output/jar/.0-jar__image-request.json
worlds/<slug>/output/jar/0-jar.glb
worlds/<slug>/output/jar/.0-jar__model-request.json
```

Central JSON should stay minimal: identity, user-authored intent, and active resume pointers only. Derive counts, stages, and completion status by scanning folders, generated artifacts, and colocated hidden request metadata when possible.

## Key files

- `worlds/<slug>/project.json` — minimal durable project metadata written by `/image-blast-project`; derived state comes from scanning folders.
- `worlds/<slug>/output/world/world.json` — World Labs world object. Required for the React app to load the world.
- `worlds/<slug>/scene/project.json` — Three.js editor scene. Written by `/threejs-edit`, loaded by the React app.
- `worlds/<slug>/source/<image>.json` — per-image flat literal analysis written by `/image-blast-uncover`.
- `worlds/<slug>/image.json` — merged canonical literal scene/image description written by `/image-blast-uncover`.
- `worlds/<slug>/output/<object>/object.json` — per-object source of truth written by `/image-blast-uncover` and updated by `/image-blast-3d`.
- `worlds/<slug>/output/sfx/sfx.json` — world-level or arbitrary SFX manifest written by `/image-blast-sfx`.
- `worlds/<slug>/output/<object>/sfx/sfx.json` — object-specific SFX manifest written by `/image-blast-sfx`.

## `input/` staging

Drop images, audio, or other files into `input/`, then tell Claude what to do with them. `/image-blast-project` owns moving or copying staged files into a stable project location when needed. New source images should be staged as `worlds/<slug>/source/0-<source-slug>.<ext>`. After use, files belong under `worlds/<slug>/source/` or `worlds/<slug>/output/`.
