import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { WorldObjectAsset } from '../../types/world'

const GRID_CELL_SIZE = 1
const OBJECT_SCALE = 0.5
const ROTATION_SPEED = 0.25

interface Props {
  objects: WorldObjectAsset[]
}

interface GridObjectProps {
  object: WorldObjectAsset
  index: number
  total: number
}

function gridPosition(index: number, total: number): [number, number, number] {
  const columns = Math.ceil(Math.sqrt(total))
  const rows = Math.ceil(total / columns)
  const column = index % columns
  const row = Math.floor(index / columns)

  return [
    (column - (columns - 1) / 2) * GRID_CELL_SIZE,
    0,
    (row - (rows - 1) / 2) * GRID_CELL_SIZE,
  ]
}

function GridObject({ object, index, total }: GridObjectProps) {
  const groupRef = useRef<THREE.Group>(null)
  const gltf = useLoader(GLTFLoader, object.url)
  const { scene, offset } = useMemo(() => {
    const clonedScene = cloneSkeleton(gltf.scene)
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material) material.needsUpdate = true
      }
    })

    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = new THREE.Vector3()
    box.getCenter(center)

    return {
      scene: clonedScene,
      offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
    }
  }, [gltf.scene])

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * ROTATION_SPEED
  })

  return (
    <group ref={groupRef} position={gridPosition(index, total)} scale={OBJECT_SCALE}>
      <primitive object={scene} position={offset} dispose={null} />
    </group>
  )
}

export function ObjectGrid({ objects }: Props) {
  if (!objects.length) return null

  return (
    <>
      {objects.map((object, index) => (
        <GridObject key={object.id} object={object} index={index} total={objects.length} />
      ))}
    </>
  )
}
