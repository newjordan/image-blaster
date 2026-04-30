# IMAGE-BLAST

Use this prompt/spec to uncover rich image information for downstream world and asset generation.

## Goal

For each image, produce a precise, evocative, structured analysis. Capture both literal scene contents and the less tangible qualities that future agents need: mood, atmosphere, lighting, materials, and what can be separated into rigid 3D assets.

## Image Analysis Rules

- Analyze the whole image first, then identify separable objects.
- Be concrete. Prefer visible evidence over guesses.
- Include uncertain details only in descriptions when useful; do not invent hidden objects.
- Deduplicate repeated objects. If many similar jars, rocks, chairs, or tools appear, represent them as one unique object with a `count_estimate`.
- For `objects`, include only things that can be cleanly distinguished into rigid or mostly rigid assets. Avoid sky, fog, terrain, walls, floors, ceilings, whole buildings, and broad environment surfaces unless they are clearly standalone props.
- Preserve stable object IDs if updating an existing analysis or asset manifest.

## Per-Image JSON Shape

```json
{
  "image_path": "input/example.png",
  "slug": "misty-forest-path",
  "scene_name": "Misty Forest Path",
  "short_caption": "A misty forest path glowing with soft morning light.",
  "long_description": "About 100 words describing the entire subject, feeling, atmosphere, visual effects, spatial impression, and how a person would describe the image overall.",
  "environment": "About 20 words describing the physical setting and ambient world qualities.",
  "visual_style": "photorealistic, cinematic, painterly, game-like, documentary, etc.",
  "lighting": "Direction, softness, color temperature, contrast, shadow quality, and time of day.",
  "atmosphere": "Fog, dust, haze, smoke, glow, weather, particles, humidity, magical effects, or other ambient effects.",
  "objects": [
    {
      "id": "weathered-lantern",
      "name": "weathered lantern",
      "description": "Detailed rigid object description useful for later image isolation and 3D generation.",
      "count_estimate": 1,
      "materials": ["aged metal", "glass"],
      "location_in_image": "right foreground",
      "separability": "clean",
      "generate_as_3d_asset": true
    }
  ]
}
```

## Field Guidance

- `slug`: 2-3 word lowercase hyphenated scene name suitable for folders.
- `scene_name`: human-readable 2-3 word title.
- `short_caption`: about 10 words.
- `long_description`: about 100 words; describe the whole image, feeling, tone, subject, atmosphere, and visible effects.
- `environment`: about 20 words; describe where the image is physically situated and what ambient world qualities matter.
- `visual_style`: concise style labels and rendering qualities.
- `lighting`: include direction, softness, temperature, contrast, shadow quality, and time of day.
- `atmosphere`: include fog, dust, haze, smoke, glow, weather, particles, or other ambient effects.
- `objects`: unique rigid asset candidates that can be separated cleanly and generated later.

## Asset Extraction

After creating per-image analysis, derive `assets.json` from all objects where `generate_as_3d_asset` is `true`. Merge visually similar objects across images into one asset while preserving evidence from each source image.
