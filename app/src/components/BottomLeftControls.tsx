import {
  ArrowCounterClockwise,
  GlobeSimple,
  Sphere,
  SpeakerHigh,
  SpeakerSlash,
  GlobeHemisphereEast,
  CameraIcon,
} from '@phosphor-icons/react'
import { Tooltip } from '@radix-ui/themes'
import { type ReactElement, useEffect } from 'react'
import { useAudioStore } from '../store/audio'
import { useDebugStore } from '../store/debug'
import { ObjectRenderMode, ViewerQuality, WorldRenderMode } from '../types/world'
import { AppButton } from './AppButton'

const OBJECT_MODES = [
  { mode: ObjectRenderMode.Wireframe, Icon: GlobeSimple, label: 'Wireframe' },
  { mode: ObjectRenderMode.ShadedWireframe, Icon: Sphere, label: 'Shaded Wireframe' },
  { mode: ObjectRenderMode.Lit, Icon: GlobeHemisphereEast, label: 'Lit' },
] as const

const QUALITY_MODES = [
  { mode: ViewerQuality.Low, label: 'Low' },
  { mode: ViewerQuality.High, label: 'High' },
] as const

const WORLD_MODES = [
  { mode: WorldRenderMode.Combined, label: 'All' },
  { mode: WorldRenderMode.SplatOnly, label: 'Scene' },
  { mode: WorldRenderMode.ObjectOnly, label: 'Objects' },
] as const

function nextMode<T>(items: readonly { mode: T }[], current: T) {
  const index = items.findIndex((item) => item.mode === current)
  return items[(index + 1) % items.length].mode
}

function ControlTooltip({ content, children }: { content: string; children: ReactElement }) {
  return (
    <Tooltip content={content} delayDuration={0} side="top">
      {children}
    </Tooltip>
  )
}

export function BottomLeftControls() {
  const muted = useAudioStore((s) => s.muted)
  const toggleMuted = useAudioStore((s) => s.toggleMuted)
  const resetObjects = useDebugStore((s) => s.resetObjects)
  const viewerQuality = useDebugStore((s) => s.viewerQuality)
  const setViewerQuality = useDebugStore((s) => s.setViewerQuality)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const setObjectRenderMode = useDebugStore((s) => s.setObjectRenderMode)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const setWorldRenderMode = useDebugStore((s) => s.setWorldRenderMode)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = e.key === '1' ? 0 : e.key === '2' ? 1 : e.key === '3' ? 2 : -1
      if (n === -1) return
      if (e.altKey && e.shiftKey) {
        const qualities = [ViewerQuality.Low, ViewerQuality.High]
        const quality = qualities[n]
        if (quality) setViewerQuality(quality)
      } else if (e.altKey) {
        const worlds = [WorldRenderMode.Combined, WorldRenderMode.SplatOnly, WorldRenderMode.ObjectOnly]
        setWorldRenderMode(worlds[n])
      } else if (e.shiftKey) {
        const objects = [ObjectRenderMode.Wireframe, ObjectRenderMode.ShadedWireframe, ObjectRenderMode.Lit]
        setObjectRenderMode(objects[n])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setObjectRenderMode, setWorldRenderMode, setViewerQuality])

  const utilBtn =
    'w-8 h-8 justify-center text-white'

  const modeBtn = (active: boolean) =>
    `w-8 h-8 justify-center ${
      active ? 'bg-white/15 text-white' : 'text-white'
    }`

  const currentQuality = QUALITY_MODES.find((item) => item.mode === viewerQuality) ?? QUALITY_MODES[0]
  const currentWorldMode = WORLD_MODES.find((item) => item.mode === worldRenderMode) ?? WORLD_MODES[0]

  return (
    <div className="flex w-full items-center justify-center gap-1 h-10 rounded-xl px-2 bg-black/55 backdrop-blur-md sm:w-auto">
      {/* utility */}
      <ControlTooltip content={muted ? 'Unmute' : 'Mute'}>
        <AppButton onClick={toggleMuted} className={utilBtn}>
          {muted ? <SpeakerSlash size={18} weight="fill" /> : <SpeakerHigh size={18} weight="fill" />}
        </AppButton>
      </ControlTooltip>
      <ControlTooltip content="Reset">
        <AppButton onClick={resetObjects} className={utilBtn}>
          <ArrowCounterClockwise size={18} weight="bold" />
        </AppButton>
      </ControlTooltip>

      <div className="w-px h-6 bg-white/15 mx-1" />

      {/* world render mode */}
      <ControlTooltip content="Cycle world render mode">
        <AppButton
          onClick={() => setWorldRenderMode(nextMode(WORLD_MODES, worldRenderMode))}
          className={'w-24'}
        >
          <GlobeSimple size={15} weight="regular" className="text-white/45 flex-shrink-0" />
          <span>{currentWorldMode.label}</span>
        </AppButton>
      </ControlTooltip>

      <div className="w-px h-6 bg-white/15 mx-1" />

      {/* object render mode */}
      <div className="flex items-center gap-1">
        {OBJECT_MODES.map(({ mode, Icon, label }) => (
          <ControlTooltip key={mode} content={label}>
            <AppButton
              onClick={() => setObjectRenderMode(mode)}
              active={objectRenderMode === mode}
              className={modeBtn(objectRenderMode === mode)}
            >
              <Icon size={17} weight={objectRenderMode === mode ? 'fill' : 'regular'} />
            </AppButton>
          </ControlTooltip>
        ))}
      </div>

      <div className="w-px h-6 bg-white/15 mx-1" />

      {/* viewer quality */}
      <ControlTooltip content="Cycle quality">
        <AppButton
          onClick={() => setViewerQuality(nextMode(QUALITY_MODES, viewerQuality))}
          className={'w-20'}
        >
          <CameraIcon size={15} weight="regular" className="text-white/45 flex-shrink-0" />
          <span>{currentQuality.label}</span>
        </AppButton>
      </ControlTooltip>
    </div>
  )
}
