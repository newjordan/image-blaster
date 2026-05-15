#!/usr/bin/env node
/**
 * blast — Open-source CLI for image-to-3D environments
 *
 * image → 3D Gaussian splats (Apple SHARP) + 3D models (Microsoft TRELLIS)
 * No paid APIs. Everything runs locally on your GPU.
 *
 * Usage:
 *   blast init <name>                       Create a new world project
 *   blast status <world>                    Show project state
 *   blast world <world> [--image <path>]    Generate 3D Gaussian splats (Apple SHARP)
 *   blast object <world> <object-id>        Generate 3D model (Microsoft TRELLIS)
 *   blast sfx <world> [--prompt <text>]     Generate SFX (requires FAL key, optional)
 *   blast edit <image> --prompt <text>      Edit image (requires FAL key, optional)
 *   blast wildcard --endpoint <ep> ...      Run any FAL endpoint (optional)
 *   blast view [world]                      Start the Three.js viewer
 *   blast config                            Check tool installation status
 */

import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRIPTS = path.join(ROOT, ".claude", "scripts");

// Tool paths
const MICROMAMBA = "micromamba";
const SHARP = "sharp";
const SHARP_ENV = "sharp";
const TRELLIS_ENV = "trellis";
const TRELLIS_SCRIPT = path.join(SCRIPTS, "trellis", "generate-trellis.py");

// Global error handler
process.on("unhandledRejection", (err) => {
  console.error(`\n❌ ${err.message || err}`);
  process.exit(1);
});

function script(relPath) {
  return path.join(SCRIPTS, relPath);
}

function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: ["inherit", "pipe", "pipe"],
      ...opts,
    });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => {
      if (code === 0) {
        // Try to find JSON in stdout for structured output
        const jsonMatch = stdout.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          try {
            console.log(JSON.stringify(JSON.parse(jsonMatch[1]), null, 2));
          } catch {
            console.log(stdout.trim());
          }
        } else if (stdout.trim()) {
          console.log(stdout.trim());
        }
        resolve();
      } else {
        const msg = stderr.trim().split("\n").pop() || `exit code ${code}`;
        reject(new Error(msg));
      }
    });
    child.on("error", reject);
  });
}

// ── micromamba helpers ──────────────────────────
function sharpRun(sharpArgs) {
  return run(MICROMAMBA, ["run", "-n", SHARP_ENV, SHARP, ...sharpArgs]);
}

function trellisRun(trellisArgs) {
  return run(MICROMAMBA, ["run", "-n", TRELLIS_ENV, "python", TRELLIS_SCRIPT, ...trellisArgs], {
    env: { ...process.env, HF_TOKEN: process.env.HF_TOKEN || "" }
  });
}

const program = new Command();

program
  .name("blast")
  .description("Open-source image-to-3D: Apple SHARP + Microsoft TRELLIS")
  .version("2.0.0");

// ── init ──────────────────────────────────────────
program
  .command("init <name>")
  .description("Create a new world project")
  .option("--display-name <name>", "Human-readable display name")
  .option("--stage-input", "Move images from input/ into the project")
  .action(async (name, opts) => {
    const args = ["--world", name];
    if (opts.displayName) args.push("--display-name", opts.displayName);
    if (opts.stageInput) args.push("--stage-input");
    await run("node", [script("project/project-state.mjs"), ...args]);
  });

// ── status ────────────────────────────────────────
program
  .command("status <world>")
  .description("Show project state")
  .action(async (world) => {
    await run("node", [script("project/project-state.mjs"), "--world", world]);
  });

// ── world (SHARP replaces World Labs) ────────────
program
  .command("world <world>")
  .description("Generate 3D Gaussian splat environment via Apple SHARP (<1 sec on GPU)")
  .option("--image <path>", "Source image path (defaults to worlds/<world>/source/)")
  .option("--render", "Render a camera trajectory video after generation")
  .action(async (world, opts) => {
    const { readdir } = await import("node:fs/promises");
    let imagePath = opts.image;
    
    if (!imagePath) {
      // Auto-detect from project source dir
      const sourceDir = path.join(ROOT, "worlds", world, "source");
      try {
        const files = await readdir(sourceDir);
        const images = files.filter(f => /\.(png|jpe?g|webp|avif|heic)$/i.test(f));
        if (images.length > 0) {
          imagePath = path.join(sourceDir, images[0]);
        }
      } catch {}
    }
    
    if (!imagePath) {
      console.error("❌ No image found. Use --image <path> or add images to worlds/<world>/source/");
      process.exit(1);
    }
    
    const outputDir = path.join(ROOT, "worlds", world, "output", "world");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(outputDir, { recursive: true });
    
    console.log(`🔫 SHARP: Generating Gaussian splats from ${imagePath}...`);
    const args = ["predict", "-i", imagePath, "-o", outputDir];
    if (opts.render) args.push("--render");
    
    await sharpRun(args);
  });

// ── object (TRELLIS replaces Hunyuan 3D) ─────────
program
  .command("object <world> <objectId>")
  .description("Generate a 3D model via Microsoft TRELLIS (GLB + PLY output)")
  .option("--image <path>", "Image for the object (required)")
  .option("--seed <n>", "Random seed", "1")
  .action(async (world, objectId, opts) => {
    if (!opts.image) {
      console.error("❌ --image <path> is required for TRELLIS object generation");
      process.exit(1);
    }
    
    const outputDir = path.join(ROOT, "worlds", world, "output", objectId);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(outputDir, { recursive: true });
    
    // Write object.json intent
    const objectJson = {
      schema_version: 1,
      world,
      object: {
        id: objectId,
        name: objectId,
        source_images: [opts.image],
        generate_as_3d_object: true,
        working_dir: `worlds/${world}/output/${objectId}`
      },
      updated_at: new Date().toISOString()
    };
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(outputDir, "object.json"),
      JSON.stringify(objectJson, null, 2) + "\n"
    );
    
    console.log(`🔫 TRELLIS: Generating 3D model from ${opts.image}...`);
    await trellisRun(["--image", opts.image, "--output-dir", outputDir, "--seed", opts.seed]);
  });

// ── sfx (FAL/ElevenLabs - kept for when key is set) ──
program
  .command("sfx <world>")
  .description("Generate sound effects via ElevenLabs (FAL) — requires FAL_KEY in .env")
  .option("--prompt <text>", "SFX prompt (required)")
  .option("--kind <k>", "world-ambience, object-impact, or arbitrary", "arbitrary")
  .option("--object-id <id>", "Object ID for object-impact mode")
  .option("--count <n>", "Number of variations (1-4)", "1")
  .option("--loop", "Generate loopable audio")
  .option("--duration-seconds <n>", "Duration in seconds (0.5-22)")
  .action(async (world, opts) => {
    if (!opts.prompt) {
      console.error("Error: --prompt is required for SFX generation");
      process.exit(1);
    }
    const kind = opts.kind;
    const isAmbient = kind === "world-ambience";
    const isImpact = kind === "object-impact";
    
    const outputDir = isImpact && opts.objectId
      ? `worlds/${world}/output/${opts.objectId}/sfx`
      : `worlds/${world}/output/sfx`;
    
    const prefix = isAmbient ? "ambient-loop"
      : isImpact ? `impact-${opts.objectId}`
      : undefined;
    
    const args = [
      "--prompt", opts.prompt,
      "--output-dir", outputDir,
      "--kind", kind,
      "--count", opts.count,
    ];
    if (prefix) args.push("--prefix", prefix);
    if (opts.loop || isAmbient) args.push("--loop");
    if (opts.durationSeconds) args.push("--duration-seconds", opts.durationSeconds);
    if (isAmbient) args.push("--duration-seconds", opts.durationSeconds || "10");
    if (isImpact) args.push("--duration-seconds", opts.durationSeconds || "1");
    await run("node", [script("sfx/fal-elevenlabs-sfx.mjs"), ...args]);
  });

// ── edit (FAL image edit - kept optional) ─────────
program
  .command("edit <image>")
  .description("Edit an image via FAL — requires FAL_KEY in .env")
  .requiredOption("--prompt <text>", "Edit prompt")
  .option("--output-dir <dir>", "Output directory", "./output/edited")
  .option("--provider <p>", "nano-banana (default) or gpt-image-2")
  .option("--resolution <r>", "Resolution", "1K")
  .action(async (image, opts) => {
    const args = ["--image", image, "--prompt", opts.prompt, "--output-dir", opts.outputDir];
    if (opts.provider) args.push("--provider", opts.provider);
    if (opts.resolution) args.push("--resolution", opts.resolution);
    await run("node", [script("image-edit/generate-edit.mjs"), ...args]);
  });

// ── wildcard ───────────────────────────────────────
program
  .command("wildcard")
  .description("Run any FAL endpoint — requires FAL_KEY in .env")
  .requiredOption("--endpoint <ep>", "FAL endpoint")
  .requiredOption("--input-json <json>", "Input JSON")
  .requiredOption("--output-dir <dir>", "Output directory")
  .option("--mode <m>", "queue or run", "queue")
  .action(async (opts) => {
    const args = ["--endpoint", opts.endpoint, "--input-json", opts.inputJson, "--output-dir", opts.outputDir, "--mode", opts.mode];
    await run("node", [script("fal/run-fal.mjs"), ...args]);
  });

// ── config ────────────────────────────────────────
program
  .command("config")
  .description("Check tool installation status")
  .action(async () => {
    const { execSync } = await import("node:child_process");
    
    console.log("🔧 Open-Source Pipeline Status:\n");
    
    // SHARP
    try {
      const v = execSync(`${MICROMAMBA} run -n ${SHARP_ENV} ${SHARP} --help 2>&1 | head -1`, { cwd: ROOT }).toString().trim();
      console.log(`  Apple SHARP:     ✅ ${v || 'installed'}`);
    } catch {
      console.log("  Apple SHARP:     ❌ not installed (run: micromamba create -n sharp python=3.13 && cd ~/SHARP && micromamba run -n sharp pip install -e .)");
    }
    
    // TRELLIS
    try {
      const v = execSync(`${MICROMAMBA} run -n ${TRELLIS_ENV} python -c "import sys; sys.path.insert(0, '${process.env.HOME}/TRELLIS'); from trellis.pipelines import TrellisImageTo3DPipeline; print('OK')" 2>&1`, { cwd: ROOT }).toString().trim();
      console.log(`  TRELLIS:         ${v.includes('OK') ? '✅' : '⚠️'} ${v}`);
    } catch {
      console.log("  TRELLIS:         ❌ not installed");
    }
    
    // GPU
    try {
      const gpu = execSync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null").toString().trim();
      console.log(`  GPU:             ✅ ${gpu}`);
    } catch {
      console.log("  GPU:             ❌ not detected");
    }
    
    // FAL key (optional)
    try {
      const { readFile } = await import("node:fs/promises");
      const env = await readFile(path.join(ROOT, ".env"), "utf8");
      const hasFal = /^FAL_KEY=\S/m.test(env);
      console.log(`  FAL_KEY (SFX):   ${hasFal ? '✅ set' : '⚠️  not set (SFX/edit unavailable)'}`);
    } catch {
      console.log("  FAL_KEY (SFX):   ⚠️  not set (.env missing)");
    }
    
    console.log("\n💡 Tip: Core pipeline (world + object) runs 100% locally — no API keys needed!");
  });

// ── view ─────────────────────────────────────────
program
  .command("view [world]")
  .description("Start the Three.js viewer")
  .action(async (world) => {
    if (world) {
      console.log(`🌍 Starting viewer for world: ${world}`);
      console.log(`   Open http://localhost:5173/${world}`);
    } else {
      console.log("🌍 Starting viewer...");
      console.log("   Open http://localhost:5173/");
    }
    const bun = path.join(process.env.HOME || "/home/frosty", ".bun", "bin", "bun");
    await run(bun, ["--cwd=app", "run", "dev"], { cwd: path.join(ROOT, "app") });
  });

program.parse();
