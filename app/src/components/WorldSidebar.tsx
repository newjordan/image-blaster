import { ArrowSquareOut, Cube, GlobeSimple } from '@phosphor-icons/react'
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

  return (
    <aside className="w-56 sm:w-64 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden rounded-3xl bg-black/60 backdrop-blur-md ring-1 ring-white/10 shadow-2xl">
      <div className="px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35 border-b border-white/10 flex-shrink-0">
        image-blaster
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto p-2">
        {worlds.map(({ slug, world, objectAssets }) => {
          const isActive = slug === activeSlug
          const name = world.display_name || slug
          return (
            <div key={slug} className="rounded-2xl">
              <AppButton
                onClick={() => navigate(`/${slug}`)}
                active={isActive}
                className={`
                  w-full flex items-center gap-3 text-left
                  ${isActive ? 'bg-white/14 ring-1 ring-white/12' : ''}
                `}
              >
                <img
                  src={world.assets.thumbnail_url}
                  alt={name}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/10"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-white text-sm font-semibold leading-tight truncate">{name}</span>
                  <span className="block text-white/40 text-[11px] leading-tight truncate">{slug}</span>
                </span>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-white flex-shrink-0" />
                )}
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
                      onClick={() => navigate(`/${slug}`)}
                      className="min-w-0 flex flex-1 items-center gap-2.5 text-left"
                    >
                      <IconTile thumbnailUrl={world.assets.thumbnail_url} alt={name}>
                        <GlobeSimple size={18} weight="regular" />
                      </IconTile>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/85 text-xs font-semibold leading-tight truncate">{slug}</span>
                        <span className="block text-white/40 text-[11px] leading-tight truncate">{name}</span>
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
                      onClick={() => { pendingFocusId.current = obj.id }}
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
                          Object
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
