import { useEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ObjectRenderMode, type WorldObjectAsset } from '../../types/world'
import { HOVER_DIM_FACTOR, SHADED_COLOR, useAssetMaterials } from './useAssetMaterials'

interface MeshMaterialState {
  mesh: THREE.Mesh
  litMaterials: THREE.Material | THREE.Material[]
  colorEntries: Array<{ material: THREE.Material & { color: THREE.Color }; baseColor: THREE.Color }>
}

interface SceneObjectVisualArgs {
  asset: WorldObjectAsset
  renderMode: ObjectRenderMode
  emphasized?: boolean
}

const ignoreRaycast: THREE.Object3D['raycast'] = () => {}

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((m) => m.clone())
  return material.clone()
}

function asMaterialArray(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material]
}

function hasColor(material: THREE.Material): material is THREE.Material & { color: THREE.Color } {
  return 'color' in material && material.color instanceof THREE.Color
}

export function useSceneObjectVisual({ asset, renderMode, emphasized = false }: SceneObjectVisualArgs) {
  const gltf = useLoader(GLTFLoader, asset.url)
  const { wireframeMaterial, shadedMaterial, wireframeOverlayMaterial } = useAssetMaterials()

  const { scene, wireframeOverlayScene, offset, size, bounds, materialStates } = useMemo(() => {
    const clonedScene = cloneSkeleton(gltf.scene)
    const overlayScene = cloneSkeleton(gltf.scene)
    const states: MeshMaterialState[] = []

    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = false
      child.raycast = ignoreRaycast

      const litMaterials = cloneMaterial(child.material)
      child.material = litMaterials
      const colorEntries = asMaterialArray(litMaterials)
        .filter(hasColor)
        .map((material) => ({
          material,
          baseColor: material.color.clone(),
        }))

      states.push({ mesh: child, litMaterials, colorEntries })
    })

    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    overlayScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.raycast = ignoreRaycast
    })

    return {
      scene: clonedScene,
      wireframeOverlayScene: overlayScene,
      offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
      size,
      bounds: box.clone(),
      materialStates: states,
    }
  }, [gltf.scene])

  useEffect(() => {
    wireframeOverlayScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = wireframeOverlayMaterial
      child.renderOrder = 1
      child.raycast = ignoreRaycast
    })
  }, [wireframeOverlayMaterial, wireframeOverlayScene])

  useEffect(() => {
    if (renderMode === ObjectRenderMode.ShadedWireframe) {
      shadedMaterial.color.copy(SHADED_COLOR)
      if (emphasized) shadedMaterial.color.multiplyScalar(HOVER_DIM_FACTOR)
    }

    for (const state of materialStates) {
      if (renderMode === ObjectRenderMode.Wireframe) {
        state.mesh.material = wireframeMaterial
        continue
      }

      if (renderMode === ObjectRenderMode.ShadedWireframe) {
        state.mesh.material = shadedMaterial
        continue
      }

      state.mesh.material = state.litMaterials
      for (const { material, baseColor } of state.colorEntries) {
        material.color.copy(baseColor)
        if (emphasized) material.color.multiplyScalar(HOVER_DIM_FACTOR)
      }
    }
  }, [emphasized, materialStates, renderMode, shadedMaterial, wireframeMaterial])

  useEffect(() => {
    return () => {
      for (const state of materialStates) {
        for (const material of asMaterialArray(state.litMaterials)) {
          material.dispose()
        }
      }
    }
  }, [materialStates])

  return { scene, wireframeOverlayScene, offset, size, bounds }
}
