import { Component, createRef, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { WorldObjectAsset } from '../../types/world'
import { useDebugStore } from '../../store/debug'
import { SceneObject, type SceneObjectHandle } from './SceneObject'
import { useObjectGrab } from './useObjectGrab'
import { cameraFocusTarget, pendingFocusId } from '../camera/cameraFocus'

const GRID_CELL_SIZE = 1
const SPAWN_RADIUS = 0.25
const SPAWN_INTERVAL_MS = 250
const OBJECT_RESET_ORIGIN: [number, number, number] = [0, 0, -0.5]
const _focusPoint = new THREE.Vector3()

interface SpawnedObject {
  instanceId: string
  asset: WorldObjectAsset
  position: [number, number, number]
}

interface Props {
  objects: WorldObjectAsset[]
}

interface ObjectLoadErrorBoundaryProps {
  objectName: string
  resetKey: string
  children: ReactNode
}

interface ObjectLoadErrorBoundaryState {
  hasError: boolean
}

class ObjectLoadErrorBoundary extends Component<ObjectLoadErrorBoundaryProps, ObjectLoadErrorBoundaryState> {
  state: ObjectLoadErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ObjectLoadErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`Skipping object "${this.props.objectName}" because it failed to load.`, error)
  }

  componentDidUpdate(prevProps: ObjectLoadErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function gridPosition(index: number, total: number): [number, number, number] {
  const columns = Math.ceil(Math.sqrt(total))
  const rows = Math.ceil(total / columns)
  const column = index % columns
  const row = Math.floor(index / columns)

  return [
    OBJECT_RESET_ORIGIN[0] + (column - (columns - 1) / 2) * GRID_CELL_SIZE,
    OBJECT_RESET_ORIGIN[1],
    OBJECT_RESET_ORIGIN[2] + (row - (rows - 1) / 2) * GRID_CELL_SIZE,
  ]
}

function randomOnSphere(radius: number): [number, number, number] {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  ]
}

let spawnCounter = 0

export function ObjectGrid({ objects }: Props) {
  const { gl } = useThree()
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [spawnedObjects, setSpawnedObjects] = useState<SpawnedObject[]>([])
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const objectResetToken = useDebugStore((s) => s.objectResetToken)
  const objectRefs = useRef(new Map<string, RefObject<SceneObjectHandle | null>>())
  const anchorRef = useRef<RapierRigidBody>(null)
  const hoveredObjectIdRef = useRef<string | null>(null)
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const allObjectsRef = useRef<{ base: WorldObjectAsset[]; spawned: SpawnedObject[] }>({ base: objects, spawned: [] })
  const { activeObjectId, onPointerDown, resetObjects, activeGrabRef } = useObjectGrab({ anchorRef, objectRefs })
  const anchorSphereRef = useRef<THREE.Mesh>(null)

  allObjectsRef.current.base = objects
  allObjectsRef.current.spawned = spawnedObjects

  useEffect(() => {
    const objectIds = new Set(objects.map((object) => object.id))
    for (const id of objectRefs.current.keys()) {
      if (!objectIds.has(id)) objectRefs.current.delete(id)
    }
  }, [objects])

  useEffect(() => {
    if (objectResetToken > 0) {
      setSpawnedObjects([])
      resetObjects()
    }
  }, [objectResetToken, resetObjects])

  const spawnCopy = useCallback(() => {
    const hoveredId = hoveredObjectIdRef.current
    if (!hoveredId) return

    const { base, spawned } = allObjectsRef.current
    const asset =
      base.find((o) => o.id === hoveredId) ??
      spawned.find((s) => s.instanceId === hoveredId)?.asset

    if (!asset) return

    const handle = objectRefs.current.get(hoveredId)?.current
    const focusPoint = handle?.getFocusPoint(_focusPoint)
    const origin: [number, number, number] = focusPoint
      ? [focusPoint.x, focusPoint.y, focusPoint.z]
      : [0, 1, 0]

    const offset = randomOnSphere(SPAWN_RADIUS)
    const position: [number, number, number] = [
      origin[0] + offset[0],
      origin[1] + offset[1],
      origin[2] + offset[2],
    ]

    const instanceId = `spawned-${asset.id}-${++spawnCounter}`
    setSpawnedObjects((prev) => [...prev, { instanceId, asset, position }])
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || spawnIntervalRef.current) return
      if (!hoveredObjectIdRef.current) return
      e.preventDefault()
      spawnCopy()
      spawnIntervalRef.current = setInterval(spawnCopy, SPAWN_INTERVAL_MS)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current)
        spawnIntervalRef.current = null
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current)
        spawnIntervalRef.current = null
      }
    }
  }, [spawnCopy])

  const getObjectRef = (objectId: string) => {
    let objectRef = objectRefs.current.get(objectId)
    if (!objectRef) {
      objectRef = createRef<SceneObjectHandle>()
      objectRefs.current.set(objectId, objectRef)
    }
    return objectRef
  }

  const handleHover = useCallback((objectId: string, hovering: boolean) => {
    hoveredObjectIdRef.current = hovering ? objectId : (hoveredObjectIdRef.current === objectId ? null : hoveredObjectIdRef.current)
    setHoveredObjectId((current) => {
      if (hovering) return objectId
      return current === objectId ? null : current
    })
  }, [])

  useEffect(() => {
    gl.domElement.style.cursor = activeObjectId ? 'move' : hoveredObjectId ? 'grab' : ''
    return () => {
      gl.domElement.style.cursor = ''
    }
  }, [activeObjectId, gl.domElement, hoveredObjectId])

  useFrame(() => {
    const id = pendingFocusId.current
    if (id) {
      pendingFocusId.current = null
      const point = objectRefs.current.get(id)?.current?.getFocusPoint(_focusPoint)
      if (point) {
        cameraFocusTarget.current = point.clone()
      }
    }

    const sphere = anchorSphereRef.current
    if (sphere) {
      const grab = activeGrabRef.current
      if (grab) {
        sphere.position.copy(grab.target)
        sphere.visible = true
      } else {
        sphere.visible = false
      }
    }
  })

  if (!objects.length) return null

  return (
    <>
      <RigidBody ref={anchorRef} type="kinematicPosition" colliders={false} position={[0, -1000, 0]} />
      <mesh ref={anchorSphereRef} visible={false}>
        <sphereGeometry args={[0.025, 10, 10]} />
        <meshBasicMaterial color={0xffffff} depthTest={false} />
      </mesh>
      {objects.map((object, index) => (
        <ObjectLoadErrorBoundary key={object.id} objectName={object.name} resetKey={object.url}>
          <SceneObject
            ref={getObjectRef(object.id)}
            object={object}
            position={gridPosition(index, objects.length)}
            renderMode={objectRenderMode}
            isHovered={hoveredObjectId === object.id}
            onHover={handleHover}
            onPointerDown={(event) => onPointerDown(object.id, event)}
          />
        </ObjectLoadErrorBoundary>
      ))}
      {spawnedObjects.map((spawned) => (
        <ObjectLoadErrorBoundary key={spawned.instanceId} objectName={spawned.asset.name} resetKey={spawned.asset.url}>
          <SceneObject
            ref={getObjectRef(spawned.instanceId)}
            object={{ ...spawned.asset, id: spawned.instanceId }}
            position={spawned.position}
            renderMode={objectRenderMode}
            isHovered={hoveredObjectId === spawned.instanceId}
            onHover={handleHover}
            onPointerDown={(event) => onPointerDown(spawned.instanceId, event)}
          />
        </ObjectLoadErrorBoundary>
      ))}
    </>
  )
}
