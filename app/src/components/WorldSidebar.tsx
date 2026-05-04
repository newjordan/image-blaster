import { useState } from 'react'
import { ArrowSquareOut, Cube, GlobeSimple, ListIcon, QuestionMarkIcon } from '@phosphor-icons/react'
import { useLocation } from 'wouter'
import type { WorldEntry } from '../types/world'
import { pendingFocusId } from '../modules/camera/cameraFocus'
import { AppButton } from './AppButton'

interface Props {
  worlds: WorldEntry[]
  activeSlug: string
}

function IconTile({
  thumbnailUrl,
  alt,
}: {
  thumbnailUrl?: string
  alt: string
  children: React.ReactNode
}) {
  return (
    <span className="relative w-9 h-9 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 flex-shrink-0">
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <span className="absolute inset-0 bg-black/10" />
      <span className="relative z-10 w-full h-full flex items-center justify-center text-white/50 drop-shadow">
        {/* {children} */}
      </span>
    </span>
  )
}

export function WorldSidebar({ worlds, activeSlug }: Props) {
  const [, navigate] = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const selectWorld = (slug: string) => {
    navigate(`/${slug}`)
    setMenuOpen(false)
  }

  return (
    <aside className="w-full sm:w-64 max-h-[calc(100vh-2rem)] flex flex-col gap-2">
      <div className="flex items-center justify-between rounded-3xl bg-black/60 px-4 py-3 text-[13px] font-medium font-mono backdrop-blur-md ring-1 ring-white/10 shadow-2xl flex-shrink-0">
        <AppButton
          onClick={() => setMenuOpen((open) => !open)}
          className="min-w-0 flex-1 gap-2 p-0 font-mono text-white opacity-100 hover:bg-transparent"
          aria-expanded={menuOpen}
        >
          <ListIcon size={16} weight="regular" className="text-white/60 sm:hidden" />
          <span>image-blaster</span>
        </AppButton>
        <a
          href="https://github.com/neilsonnn/image-blaster"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg p-1 text-white opacity-80 transition-[background-color,opacity] hover:bg-white/10 hover:opacity-100"
          aria-label="Open image-blaster repository"
        >
          <span className="text-sm leading-none"><QuestionMarkIcon size={16} weight="regular" /></span>
        </a>
      </div>

      <div className={`${menuOpen ? 'flex' : 'hidden'} sm:flex flex-col gap-2 overflow-y-auto rounded-3xl bg-black/60 p-2 backdrop-blur-md ring-1 ring-white/10 shadow-2xl`}>
        {worlds.map(({ slug, world, objectAssets }) => {
          const isActive = slug === activeSlug
          const name = world.display_name || slug
          return (
            <div key={slug} className="rounded-2xl">
              <AppButton
                onClick={() => selectWorld(slug)}
                active={isActive}
                className={`
                  w-full flex items-center gap-3 text-left p-2
                  ${isActive ? 'border-white/50 bg-white/20 border-2' : ''}
                `}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-white text-sm font-semibold leading-tight truncate">{name}</span>
                </span>
              </AppButton>

              <div
                className={`
                  overflow-hidden transition-all duration-300 ease-in-out
                  ${isActive ? 'max-h-[32rem]' : 'max-h-0'}
                `}
              >
                <div className="mt-1.5 ml-3 pl-3 border-l border-white/10 flex flex-col gap-1">
                  <div className="group flex items-center gap-1">
                    <AppButton
                      onClick={() => selectWorld(slug)}
                      className="min-w-0 flex flex-1 items-center gap-2.5 text-left"
                    >
                      <IconTile thumbnailUrl={world.assets.thumbnail_url} alt={name}>
                        <GlobeSimple size={18} weight="regular" />
                      </IconTile>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/85 text-xs font-semibold leading-tight truncate">{slug}</span>
                        <span className="block text-white/40 text-[11px] leading-tight truncate">World (.spz)</span>
                      </span>
                    </AppButton>
                    {world.world_marble_url && (
                      <a
                        href={world.world_marble_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-1 w-8 h-8 flex items-center justify-center rounded p-1 text-white opacity-80 hover:bg-white/8 hover:opacity-100 transition-[background-color,opacity] flex-shrink-0"
                        aria-label={`Open ${name} in World Labs`}
                      >
                        <ArrowSquareOut size={16} weight="bold" />
                      </a>
                    )}
                  </div>
                  {objectAssets.map((obj) => (
                    <AppButton
                      key={obj.id}
                      onClick={() => {
                        pendingFocusId.current = obj.id
                        setMenuOpen(false)
                      }}
                      className="flex items-center gap-2.5 text-left group"
                    >
                      <IconTile thumbnailUrl={obj.thumbnailUrl} alt={obj.name}>
                        <Cube size={18} weight="regular" />
                      </IconTile>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/80 group-hover:text-white text-xs font-medium leading-tight truncate transition-colors">
                          {obj.name}
                        </span>
                        <span className="block text-white/35 text-[10px] leading-tight truncate">
                          Object (.glb)
                        </span>
                      </span>
                    </AppButton>
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
