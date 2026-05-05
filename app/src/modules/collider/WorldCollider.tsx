import { useMemo, useEffect } from 'react'
import { RigidBody } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'
import { ObjectRenderMode, WorldRenderMode } from '../../types/world'
import { useAssetMaterials } from '../scene/useAssetMaterials'
import { DROP_TARGET_LAYER } from '../scene/dropTargets'

interface Props {
  url: string
  flipY?: boolean
  groundPlaneOffset?: number
  metricScaleFactor?: number
}

const ignoreRaycast: THREE.Object3D['raycast'] = () => {}

export function WorldCollider({ url, flipY, groundPlaneOffset, metricScaleFactor }: Props) {
  const { scene: rawScene } = useGLTF(url)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const { wireframeMaterial, shadedMaterial, wireframeOverlayMaterial } = useAssetMaterials()

  // Own shadow material instance — not shared, so shader compiles correctly per-mesh
  const shadowMat = useMemo(() => new THREE.ShadowMaterial({ opacity: 0.8, transparent: true, depthWrite: false }), [])
  useEffect(() => () => shadowMat.dispose(), [shadowMat])

  const { scene, overlayScene, dropTargetScene } = useMemo(() => {
    const dropTargetScene = cloneSkeleton(rawScene)
    dropTargetScene.traverse((child) => {
      child.layers.set(DROP_TARGET_LAYER)
    })
    return {
      scene: cloneSkeleton(rawScene),
      overlayScene: cloneSkeleton(rawScene),
      dropTargetScene,
    }
  }, [rawScene])

  const showMesh = worldRenderMode !== WorldRenderMode.ObjectOnly

  useEffect(() => {
    const isShadowCatcher = objectRenderMode === ObjectRenderMode.Lit
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.visible = showMesh
      child.raycast = ignoreRaycast
      child.receiveShadow = isShadowCatcher
      if (child.material !== wireframeMaterial && child.material !== shadedMaterial && child.material !== shadowMat) {
        const old = Array.isArray(child.material) ? child.material : [child.material]
        old.forEach((m) => m?.dispose?.())
      }
      child.material = isShadowCatcher ? shadowMat
        : objectRenderMode === ObjectRenderMode.ShadedWireframe ? shadedMaterial
        : wireframeMaterial
      child.material.needsUpdate = true
    })
  }, [scene, showMesh, objectRenderMode, wireframeMaterial, shadedMaterial, shadowMat])

  useEffect(() => {
    overlayScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = wireframeOverlayMaterial
      child.renderOrder = 1
      child.raycast = ignoreRaycast
    })
  }, [overlayScene, wireframeOverlayMaterial])

  return (
    <>
      <RigidBody type="fixed" colliders="trimesh" rotation={[flipY ? Math.PI : 0, 0, 0]} position={[0, groundPlaneOffset ? groundPlaneOffset : 0, 0]} scale={[metricScaleFactor ? metricScaleFactor : 1, metricScaleFactor ? metricScaleFactor : 1, metricScaleFactor ? metricScaleFactor : 1]}>
        <primitive object={scene} />
        {objectRenderMode === ObjectRenderMode.ShadedWireframe && showMesh && (
          <primitive object={overlayScene} />
        )}
      </RigidBody>
      <primitive
        object={dropTargetScene}
        rotation={[flipY ? Math.PI : 0, 0, 0]}
        position={[0, groundPlaneOffset ? groundPlaneOffset : 0, 0]}
        scale={[metricScaleFactor ? metricScaleFactor : 1, metricScaleFactor ? metricScaleFactor : 1, metricScaleFactor ? metricScaleFactor : 1]}
      />
    </>
  )
}
