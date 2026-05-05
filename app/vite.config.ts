import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

type WorldManifest = Record<string, unknown> & {
  assets?: Record<string, unknown> & {
    imagery?: Record<string, unknown>
    mesh?: Record<string, unknown>
    splats?: Record<string, unknown> & {
      spz_urls?: Record<string, string | undefined>
    }
  }
}

function worldsPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:worlds'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const worldsDir = path.resolve(__dirname, '../worlds')
  const RESERVED_OUTPUT_DIRS = new Set(['world', 'sfx'])
  const MODEL_EXTENSIONS = new Set(['.glb'])
  const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.opus'])
  const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])
  const PROJECT_VERSION = 1
  const WORLD_SPZ_KEYS = new Set(['100k', '150k', '500k', 'full_res'])

  function visibleFiles(dir: string) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((file) => file.isFile() && !file.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function readSourceImageUrl(slug: string): string | undefined {
    const sourceDir = path.join(worldsDir, slug, 'source')
    const images = visibleFiles(sourceDir).filter(
      (f) => IMAGE_EXTENSIONS.has(path.extname(f.name).toLowerCase()),
    )
    if (!images.length) return undefined
    const latest = images[images.length - 1]
    return `/worlds/${slug}/source/${latest.name}`
  }

  function readObjectAssets(slug: string) {
    const outputDir = path.join(worldsDir, slug, 'output')
    if (!fs.existsSync(outputDir)) return []

    return fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !RESERVED_OUTPUT_DIRS.has(entry.name))
      .flatMap((entry) => {
        const objectDir = path.join(outputDir, entry.name)
        const model = visibleFiles(objectDir)
          .find((file) => MODEL_EXTENSIONS.has(path.extname(file.name).toLowerCase()))

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

        const thumbnail = visibleFiles(objectDir).find(
          (file) => IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()) && file.name.includes('thumbnail'),
        )

        return [{
          id: entry.name,
          assetId: `${slug}/${entry.name}`,
          sourceWorldSlug: slug,
          name: displayName,
          url: `/worlds/${slug}/output/${entry.name}/${model.name}`,
          thumbnailUrl: thumbnail ? `/worlds/${slug}/output/${entry.name}/${thumbnail.name}` : undefined,
          sfxUrls: visibleFiles(path.join(objectDir, 'sfx'))
            .filter((file) => AUDIO_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
            .map((file) => `/worlds/${slug}/output/${entry.name}/sfx/${file.name}`),
        }]
      })
  }

  function readWorldSfxUrls(slug: string) {
    return visibleFiles(path.join(worldsDir, slug, 'output', 'sfx'))
      .filter((file) => AUDIO_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
      .map((file) => `/worlds/${slug}/output/sfx/${file.name}`)
  }

  function worldAssetUrl(slug: string, filename?: string) {
    return filename ? `/worlds/${slug}/output/world/${filename}` : ''
  }

  function localWorldAssetFilename(files: fs.Dirent[], predicate: (name: string) => boolean) {
    return files.find((file) => predicate(file.name))?.name
  }

  function assetKeyForFilename(key: string) {
    return key.replace(/[^a-z0-9_-]/gi, '_')
  }

  function withLocalWorldAssets(slug: string, world: WorldManifest) {
    const files = visibleFiles(path.join(worldsDir, slug, 'output', 'world'))
    const existingSpzUrls = world.assets?.splats?.spz_urls ?? {}
    const spzUrls: Record<string, string> = {}

    for (const key of Object.keys(existingSpzUrls)) {
      const filename = localWorldAssetFilename(files, (name) => name === `0-world-${assetKeyForFilename(key)}.spz`)
      if (filename) spzUrls[key] = worldAssetUrl(slug, filename)
    }

    for (const file of files) {
      const match = file.name.match(/^0-world-(100k|150k|500k|full_res)\.spz$/)
      if (match && WORLD_SPZ_KEYS.has(match[1])) spzUrls[match[1]] = worldAssetUrl(slug, file.name)
    }

    const collider = localWorldAssetFilename(files, (name) => name === '0-world.glb')
    const pano = localWorldAssetFilename(files, (name) => /^0-world-pano\.(png|jpe?g|webp|avif)$/i.test(name))
    const thumbnail = localWorldAssetFilename(files, (name) => /^0-world-thumbnail\.(png|jpe?g|webp|avif)$/i.test(name))

    return {
      ...world,
      assets: {
        ...(world.assets ?? {}),
        mesh: {
          ...(world.assets?.mesh ?? {}),
          collider_mesh_url: worldAssetUrl(slug, collider),
        },
        imagery: {
          ...(world.assets?.imagery ?? {}),
          pano_url: worldAssetUrl(slug, pano),
        },
        splats: {
          ...(world.assets?.splats ?? {}),
          spz_urls: spzUrls,
        },
        thumbnail_url: worldAssetUrl(slug, thumbnail),
      },
    }
  }

  function sceneProjectPath(slug: string) {
    const worldDir = path.resolve(worldsDir, slug)
    const isInsideWorlds = worldDir !== worldsDir && worldDir.startsWith(`${worldsDir}${path.sep}`)
    if (!isInsideWorlds) return null
    return path.join(worldDir, 'scene', 'project.json')
  }

  function sanitizePlacementProject(input: unknown) {
    if (!input || typeof input !== 'object') return undefined
    const record = input as Record<string, unknown>
    if (record.version !== PROJECT_VERSION || !Array.isArray(record.instances)) return undefined

    const instances = record.instances.flatMap((instance): Array<Record<string, unknown>> => {
      if (!instance || typeof instance !== 'object') return []
      const item = instance as Record<string, unknown>
      const { instanceId, objectId, assetId, position, rotation, scale } = item
      const isVec3 = (value: unknown): value is [number, number, number] => (
        Array.isArray(value) &&
        value.length === 3 &&
        value.every((part) => typeof part === 'number' && Number.isFinite(part))
      )

      if (typeof instanceId !== 'string' || typeof objectId !== 'string') return []
      if (assetId !== undefined && typeof assetId !== 'string') return []
      if (!isVec3(position) || !isVec3(rotation) || !isVec3(scale)) return []
      return [{ instanceId, objectId, ...(assetId ? { assetId } : {}), position, rotation, scale }]
    })

    return { version: PROJECT_VERSION, instances }
  }

  function readSceneProject(slug: string) {
    const filePath = sceneProjectPath(slug)
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined
    try {
      return sanitizePlacementProject(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
    } catch {
      return undefined
    }
  }

  function isSceneProjectFile(file: string) {
    return path.basename(file) === 'project.json' && path.basename(path.dirname(file)) === 'scene'
  }

  function readWorlds() {
    if (!fs.existsSync(worldsDir)) return []
    const entries = fs.readdirSync(worldsDir)
      .filter((slug) => {
        const f = path.join(worldsDir, slug, 'output', 'world', 'world.json')
        return fs.existsSync(f) && fs.statSync(f).isFile()
      })
      .map((slug) => {
        const raw = fs.readFileSync(path.join(worldsDir, slug, 'output', 'world', 'world.json'), 'utf-8')
        return {
          slug,
          world: withLocalWorldAssets(slug, JSON.parse(raw)),
          objectAssets: readObjectAssets(slug),
          allObjectAssets: [],
          sourceImageUrl: readSourceImageUrl(slug),
          worldSfxUrls: readWorldSfxUrls(slug),
          sceneProject: readSceneProject(slug),
        }
      })
    const allObjectAssets = entries.flatMap((entry) => entry.objectAssets)
    return entries.map((entry) => ({ ...entry, allObjectAssets }))
  }

  function openFolder(folderPath: string) {
    const command = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'
    const args = process.platform === 'win32'
      ? ['/c', 'start', '', folderPath]
      : [folderPath]
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
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
      const RELOAD_EXTENSIONS = new Set(['.glb', '.spz', '.mp3', '.ogg', '.wav', '.m4a', '.opus', '.json'])
      if (file.startsWith(worldsDir) && RELOAD_EXTENSIONS.has(path.extname(file).toLowerCase()) && !isSceneProjectFile(file)) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
    },
    configureServer(server) {
      server.watcher.add(worldsDir)
      const invalidateWorldsModule = () => {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
      }
      const MIME: Record<string, string> = {
        '.spz': 'application/octet-stream',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.opus': 'audio/ogg',
        '.json': 'application/json',
      }
      server.middlewares.use('/__open-world-folder', (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const slug = requestUrl.searchParams.get('slug')
        const target = requestUrl.searchParams.get('target')
        if (!slug) {
          res.statusCode = 400
          res.end('Missing slug')
          return
        }

        const folderPath = path.resolve(worldsDir, slug, target === 'scene' ? 'scene' : '.')
        const isInsideWorlds = folderPath === worldsDir || folderPath.startsWith(`${worldsDir}${path.sep}`)
        if (!isInsideWorlds) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        fs.mkdirSync(folderPath, { recursive: true })
        openFolder(folderPath)
        res.statusCode = 204
        res.end()
      })
      server.middlewares.use('/__scene-project', (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const slug = requestUrl.searchParams.get('slug')
        if (!slug) {
          res.statusCode = 400
          res.end('Missing slug')
          return
        }

        const filePath = sceneProjectPath(slug)
        if (!filePath) {
          res.statusCode = 400
          res.end('Invalid slug')
          return
        }

        if (req.method === 'GET') {
          const project = readSceneProject(slug)
          if (!project) {
            res.statusCode = 404
            res.end('Not found')
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(project, null, 2))
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        let body = ''
        req.setEncoding('utf-8')
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            const project = sanitizePlacementProject(JSON.parse(body))
            if (!project) {
              res.statusCode = 400
              res.end('Invalid project')
              return
            }

            fs.mkdirSync(path.dirname(filePath), { recursive: true })
            fs.writeFileSync(filePath, `${JSON.stringify(project, null, 2)}\n`)
            invalidateWorldsModule()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(project))
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
          }
        })
      })
      server.middlewares.use('/worlds', (req, res, next) => {
        const requestPath = decodeURIComponent((req.url || '/').split('?')[0])
        const filePath = path.resolve(worldsDir, `.${requestPath}`)
        const isInsideWorlds = filePath === worldsDir || filePath.startsWith(`${worldsDir}${path.sep}`)

        if (!isInsideWorlds) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase()
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        } else if (path.extname(requestPath)) {
          res.statusCode = 404
          res.end('Not found')
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
