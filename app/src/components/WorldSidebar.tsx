import { useState } from 'react'
import { ButterflyIcon, FolderOpenIcon, ListIcon, PencilSimpleIcon, QuestionMarkIcon } from '@phosphor-icons/react'
import { useLocation } from 'wouter'
import type { WorldEntry, WorldSceneProject } from '../types/world'
import { useDebugStore } from '../store/debug'
import { AppButton } from './AppButton'
import { ChromeThumbnail, chrome } from './AppChrome'

interface Props {
  worlds: WorldEntry[]
  activeSlug: string
  activeSceneProject?: WorldSceneProject
}

export function WorldSidebar({ worlds, activeSlug, activeSceneProject }: Props) {
  const [, navigate] = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const butterfliesEnabled = useDebugStore((s) => s.butterfliesEnabled)
  const setButterfliesEnabled = useDebugStore((s) => s.setButterfliesEnabled)
  const canOpenLocalFolders = import.meta.env.DEV

  const selectWorld = (slug: string) => {
    navigate(`/${slug}`)
    setMenuOpen(false)
  }

  const openWorldFolder = (slug: string) => {
    fetch(`/__open-world-folder?slug=${encodeURIComponent(slug)}`).catch((error) => {
      console.warn(`Could not open world folder for "${slug}".`, error)
    })
  }

  return (
    <aside className={`${chrome.enter} w-full sm:w-56 max-h-[calc(100vh-2rem)] flex flex-col gap-1 whitespace-nowrap text-sm`}>
      <div className={`${chrome.bar} flex flex-shrink-0 items-center justify-between px-2 py-1 text-sm font-medium font-mono`}>
        <AppButton
          onClick={() => setMenuOpen((open) => !open)}
          className="min-w-0 flex-1 gap-2 px-1 truncate font-mono text-white opacity-100 hover:bg-transparent"
          aria-expanded={menuOpen}
        >
          <ListIcon size={16} weight="regular" className="text-white/60 sm:hidden" />
          <span>image-blaster</span>{activeSlug && <span className="text-white/40 sm:hidden md:hidden">/ {activeSlug}</span>}
        </AppButton>
        <AppButton
          onClick={() => setButterfliesEnabled(!butterfliesEnabled)}
          active={butterfliesEnabled}
          className={`h-7 w-7 justify-center p-1 text-white ${butterfliesEnabled ? 'bg-white/15' : ''}`}
          aria-label={butterfliesEnabled ? 'Hide butterflies' : 'Show butterflies'}
          aria-pressed={butterfliesEnabled}
          title={butterfliesEnabled ? 'Hide butterflies' : 'Show butterflies'}
        >
          <ButterflyIcon size={16} weight={butterfliesEnabled ? 'fill' : 'regular'} />
        </AppButton>
        <a
          href="https://github.com/neilsonnn/image-blaster"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded p-1 text-white opacity-80 transition-[background-color,opacity] hover:bg-white/10 hover:opacity-100"
          aria-label="Open image-blaster repository"
        >
          <span className="text-sm leading-none"><QuestionMarkIcon size={16} weight="regular" /></span>
        </a>
      </div>

      <div
        className={`
          ${chrome.panel} flex flex-col gap-1 overflow-y-auto p-1.5
          transition-[opacity,transform,max-height] duration-200 ease-out sm:max-h-[calc(100vh-5rem)] sm:translate-y-0 sm:opacity-100
          ${menuOpen ? 'max-h-[calc(100vh-5rem)] translate-y-0 opacity-100' : 'max-h-0 -translate-y-2 opacity-0 pointer-events-none sm:pointer-events-auto'}
        `}
      >
        {worlds.map(({ slug, world, objectAssets, sceneProject }) => {
          const isActive = slug === activeSlug
          const name = world.display_name || slug
          const projectLoaded = isActive ? activeSceneProject : sceneProject
          return (
            <div key={slug} className="rounded">
              <div
                className={`
                  flex items-center gap-1 rounded
                  ${isActive ? 'border-white/50 bg-white/20' : ''}
                `}
              >
                <AppButton
                  onClick={() => selectWorld(slug)}
                  active={isActive}
                  className={`
                    min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left
                    ${isActive ? 'hover:bg-transparent' : ''}
                  `}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-white text-sm font-medium leading-tight truncate">{name}</span>
                    {isActive && projectLoaded && (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-green-200/75">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
                        project.json
                      </span>
                    )}
                  </span>
                </AppButton>
                {isActive && (
                  <AppButton
                    onClick={() => {
                      navigate(`/${slug}/edit`)
                      setMenuOpen(false)
                    }}
                    className="h-8 w-8 flex-shrink-0 justify-center text-white"
                    aria-label={`Edit object placement for ${name}`}
                    title={`Edit object placement for ${name}`}
                  >
                    <PencilSimpleIcon size={15} weight="regular" />
                  </AppButton>
                )}
                {canOpenLocalFolders && isActive && (
                  <AppButton
                    onClick={() => openWorldFolder(slug)}
                    className="h-8 w-8 flex-shrink-0 justify-center text-white"
                    aria-label={`Open local folder for ${name}`}
                    title={`Open local folder for ${name}`}
                  >
                    <FolderOpenIcon size={15} weight="regular" />
                  </AppButton>
                )}
              </div>

              <div
                className={`
                  overflow-hidden transition-all duration-300 ease-in-out
                  ${isActive ? 'max-h-[32rem]' : 'max-h-0'}
                `}
              >
                <div className="mt-1 flex flex-col gap-1">
                  <div className="group flex items-center gap-1">
                    <div className="min-w-0 flex flex-1 items-center justify-between gap-2 rounded px-2 py-1 text-left text-white opacity-80">
                      <ChromeThumbnail thumbnailUrl={world.assets.thumbnail_url} alt={name} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/85 text-xs font-semibold leading-tight truncate">{slug}</span>
                        <span className="block text-white/40 text-[11px] leading-tight truncate">World (.spz)</span>
                      </span>
                    </div>
                  </div>
                  {objectAssets.map((obj) => (
                    <div
                      key={obj.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-left group"
                    >
                      <ChromeThumbnail thumbnailUrl={obj.thumbnailUrl} alt={obj.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/80 text-xs font-medium leading-tight truncate">
                          {obj.name}
                        </span>
                        <span className="block text-white/35 text-[10px] leading-tight truncate">
                          Object (.glb)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
