import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

function worldsPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:worlds'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const worldsDir = path.resolve(__dirname, '../worlds')
  const RESERVED_OUTPUT_DIRS = new Set(['world', 'sfx'])
  const MODEL_EXTENSIONS = new Set(['.glb'])

  function readObjectAssets(slug: string) {
    const outputDir = path.join(worldsDir, slug, 'output')
    if (!fs.existsSync(outputDir)) return []

    return fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !RESERVED_OUTPUT_DIRS.has(entry.name))
      .flatMap((entry) => {
        const objectDir = path.join(outputDir, entry.name)
        const model = fs.readdirSync(objectDir, { withFileTypes: true })
          .filter((file) => file.isFile() && !file.name.startsWith('.') && MODEL_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name))[0]

        if (!model) return []

        const objectJsonPath = path.join(objectDir, 'object.json')
        let displayName = entry.name
        if (fs.existsSync(objectJsonPath) && fs.statSync(objectJsonPath).isFile()) {
          try {
            const json = JSON.parse(fs.readFileSync(objectJsonPath, 'utf-8'))
            displayName = json.object?.name ?? json.name ?? displayName
          } catch {
            displayName = entry.name
          }
        }

        return [{
          id: entry.name,
          name: displayName,
          url: `/worlds/${slug}/output/${entry.name}/${model.name}`,
        }]
      })
  }

  function readWorlds() {
    if (!fs.existsSync(worldsDir)) return []
    return fs.readdirSync(worldsDir)
      .filter((slug) => {
        const f = path.join(worldsDir, slug, 'output', 'world', 'world.json')
        return fs.existsSync(f) && fs.statSync(f).isFile()
      })
      .map((slug) => {
        const raw = fs.readFileSync(path.join(worldsDir, slug, 'output', 'world', 'world.json'), 'utf-8')
        return { slug, world: JSON.parse(raw), objectAssets: readObjectAssets(slug) }
      })
  }

  return {
    name: 'worlds',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export default ${JSON.stringify(readWorlds())}`
      }
    },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(worldsDir)) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
    },
    configureServer(server) {
      server.watcher.add(worldsDir)
      const MIME: Record<string, string> = {
        '.spz': 'application/octet-stream',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.json': 'application/json',
      }
      server.middlewares.use('/worlds', (req, res, next) => {
        const filePath = path.join(worldsDir, decodeURIComponent(req.url || '/'))
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase()
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), worldsPlugin()],
  server: { fs: { allow: ['..'] } },
})
