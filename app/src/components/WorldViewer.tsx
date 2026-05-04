import { Suspense, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { SplatRenderer } from '../modules/splat/SplatRenderer'
import { EnvironmentMap } from '../modules/environment/EnvironmentMap'
import { WorldCollider } from '../modules/collider/WorldCollider'
import { GroundPlane } from '../modules/collider/GroundPlane'
import { CharacterController, type CharacterControllerHandle } from '../modules/character/CharacterController'
import { FlyController, type FlyControllerHandle } from '../modules/character/FlyController'
import { ButterflyController, type ButterflyControllerHandle } from '../modules/butterfly/ButterflyController'
import { ObjectGrid } from '../modules/scene/ObjectGrid'
import { OriginHelper } from '../modules/scene/OriginHelper'
import { AudioManager } from '../modules/audio/AudioManager'
import { PostProcessing } from '../modules/postprocessing/PostProcessing'
import { getSplatUrl } from '../utils/worldLoader'
import { useDebugStore } from '../store/debug'
import { WorldRenderMode, ObjectRenderMode, ViewerQuality, type World, type WorldObjectAsset } from '../types/world'

type CharHandle = CharacterControllerHandle | ButterflyControllerHandle | FlyControllerHandle

interface Props {
  world: World
  slug: string
  objectAssets: WorldObjectAsset[]
}

export function WorldViewer({ world: desiredWorld, slug: desiredSlug, objectAssets: desiredObjectAssets }: Props) {
  const charRef = useRef<CharHandle>(null)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const viewerQuality = useDebugStore((s) => s.viewerQuality)
  const controllerMode = useDebugStore((s) => s.controllerMode)
  const controllerResetToken = useDebugStore((s) => s.controllerResetToken)
  const environmentIntensity = useDebugStore((s) => s.environmentIntensity)
  const sunIntensity = useDebugStore((s) => s.sunIntensity)
  const sunColor = useDebugStore((s) => s.sunColor)

  useEffect(() => {
    charRef.current?.reset()
  }, [desiredSlug])

  useEffect(() => {
    if (controllerResetToken > 0) charRef.current?.reset()
  }, [controllerResetToken])

  const lowSplatUrl = getSplatUrl(desiredWorld, ViewerQuality.Low)
  const highSplatUrl = getSplatUrl(desiredWorld, ViewerQuality.High)
  const hasSeparateQualitySplats = Boolean(lowSplatUrl && highSplatUrl && lowSplatUrl !== highSplatUrl)
  const { ground_plane_offset, flip_y, metric_scale_factor } = desiredWorld.assets.splats.semantics_metadata
  const flipY = flip_y ?? true
  const isHighQuality = viewerQuality === ViewerQuality.High
  const showScene = worldRenderMode !== WorldRenderMode.ObjectOnly
  const showSplat = showScene && objectRenderMode === ObjectRenderMode.Lit
  const showObjects = worldRenderMode !== WorldRenderMode.SplatOnly
  return (
    <>
      <AudioManager slug={desiredSlug} active />
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        className="w-full h-full"
        gl={{ antialias: false }}
        shadows={isHighQuality}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]}>
            {controllerMode === 'butterfly' ? (
              <ButterflyController ref={charRef as React.RefObject<ButterflyControllerHandle>} />
            ) : controllerMode === 'fly' ? (
              <FlyController ref={charRef as React.RefObject<FlyControllerHandle>} />
            ) : (
              <CharacterController ref={charRef as React.RefObject<CharacterControllerHandle>} />
            )}
            {showScene && (
              <Suspense fallback={null}>
                <WorldCollider url={desiredWorld.assets.mesh.collider_mesh_url} flipY={flipY} groundPlaneOffset={ground_plane_offset} metricScaleFactor={metric_scale_factor} />
              </Suspense>
            )}
            {showObjects && (
              <Suspense fallback={null}>
                <ObjectGrid objects={desiredObjectAssets} />
              </Suspense>
            )}
            <GroundPlane />
          </Physics>
          {lowSplatUrl && (
            <SplatRenderer
              url={lowSplatUrl}
              visible={showSplat && (viewerQuality === ViewerQuality.Low || !hasSeparateQualitySplats)}
              groundPlaneOffset={ground_plane_offset}
              flipY={flipY}
              metricScaleFactor={metric_scale_factor}
            />
          )}
          {hasSeparateQualitySplats && highSplatUrl && (
            <SplatRenderer
              url={highSplatUrl}
              visible={showSplat && viewerQuality === ViewerQuality.High}
              groundPlaneOffset={ground_plane_offset}
              flipY={flipY}
              metricScaleFactor={metric_scale_factor}
            />
          )}
          <directionalLight
            castShadow={isHighQuality}
            color={sunColor}
            intensity={sunIntensity}
            position={[0, 10, 0]}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={60}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          <Suspense fallback={null}>
            <EnvironmentMap panoUrl={desiredWorld.assets.imagery.pano_url} intensity={environmentIntensity} />
          </Suspense>
          <OriginHelper />
          {isHighQuality && <PostProcessing />}
        </Suspense>
      </Canvas>
    </>
  )
}
