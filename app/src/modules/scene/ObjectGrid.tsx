import { Component, createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { WorldObjectAsset, WorldObjectPhysics, WorldObjectPlacement } from '../../types/world'
import { useDebugStore } from '../../store/debug'
import { SceneObject, type SceneObjectHandle } from './SceneObject'
import { useObjectGrab } from './useObjectGrab'
import { cameraFocusTarget, pendingFocusId } from '../camera/cameraFocus'
import { getInitialPlacements } from './placements'

const SPAWN_RADIUS = 0.25
const SPAWN_INTERVAL_MS = 250
const _focusPoint = new THREE.Vector3()

interface SpawnedObject {
  instanceId: string
  asset: WorldObjectAsset
  position: [number, number, number]
}

interface RenderedObject {
  instanceId: string
  asset: WorldObjectAsset
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  physics: WorldObjectPhysics
}

interface Props {
  objects: WorldObjectAsset[]
  placements?: WorldObjectPlacement[]
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

function resolveRenderedObjects(objects: WorldObjectAsset[], placements?: WorldObjectPlacement[]): RenderedObject[] {
  const assetsById = new Map(objects.flatMap((object) => [
    [object.id, object],
    [object.assetId, object],
  ]))
  return getInitialPlacements(objects, placements).flatMap((placement) => {
    const asset = assetsById.get(placement.assetId ?? placement.objectId) ?? assetsById.get(placement.objectId)
    if (!asset) return []
    return [{
      instanceId: placement.instanceId,
      asset,
      position: placement.position,
      rotation: placement.rotation,
      scale: placement.scale,
      physics: placement.physics ?? 'rigidbody',
    }]
  })
}

export function ObjectGrid({ objects, placements }: Props) {
  const { gl } = useThree()
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [spawnedObjects, setSpawnedObjects] = useState<SpawnedObject[]>([])
  const renderedObjects = useMemo(() => resolveRenderedObjects(objects, placements), [objects, placements])
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const objectResetToken = useDebugStore((s) => s.objectResetToken)
  const objectRefs = useRef(new Map<string, RefObject<SceneObjectHandle | null>>())
  const anchorRef = useRef<RapierRigidBody>(null)
  const hoveredObjectIdRef = useRef<string | null>(null)
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const allObjectsRef = useRef<{ base: RenderedObject[]; spawned: SpawnedObject[] }>({ base: renderedObjects, spawned: [] })
  const { activeObjectId, onPointerDown, resetObjects, activeGrabRef, cancelGrab } = useObjectGrab({ anchorRef, objectRefs })
  const anchorSphereRef = useRef<THREE.Mesh>(null)

  allObjectsRef.current.base = renderedObjects
  allObjectsRef.current.spawned = spawnedObjects

  useLayoutEffect(() => {
    const objectIds = new Set([
      ...renderedObjects.map((object) => object.instanceId),
      ...spawnedObjects.map((object) => object.instanceId),
    ])
    if (activeGrabRef.current && !objectIds.has(activeGrabRef.current.objectId)) {
      cancelGrab()
    }
    for (const id of objectRefs.current.keys()) {
      if (!objectIds.has(id)) objectRefs.current.delete(id)
    }
  }, [activeGrabRef, cancelGrab, renderedObjects, spawnedObjects])

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
      base.find((o) => o.instanceId === hoveredId)?.asset ??
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
    const hoveredObject = hoveredObjectId ? renderedObjects.find((object) => object.instanceId === hoveredObjectId) : undefined
    const canGrabHovered = !hoveredObject || hoveredObject.physics !== 'static'
    gl.domElement.style.cursor = activeObjectId ? 'move' : hoveredObjectId && canGrabHovered ? 'grab' : ''
    return () => {
      gl.domElement.style.cursor = ''
    }
  }, [activeObjectId, gl.domElement, hoveredObjectId, renderedObjects])

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

  if (!renderedObjects.length) return null

  return (
    <>
      <RigidBody ref={anchorRef} type="kinematicPosition" colliders={false} position={[0, -1000, 0]} />
      <mesh ref={anchorSphereRef} visible={false} renderOrder={10000}>
        <sphereGeometry args={[0.025, 10, 10]} />
        <meshBasicMaterial color={0xffffff} depthTest={false} depthWrite={false} toneMapped={false} transparent />
      </mesh>
      {renderedObjects.map((object) => (
        <ObjectLoadErrorBoundary key={`${object.instanceId}:${object.asset.assetId}:${object.asset.url}`} objectName={object.asset.name} resetKey={object.asset.url}>
          <SceneObject
            ref={getObjectRef(object.instanceId)}
            key={`${object.instanceId}:${object.asset.assetId}:${object.position.join(',')}:${object.rotation.join(',')}:${object.scale.join(',')}:${object.physics}`}
            object={{ ...object.asset, id: object.instanceId }}
            position={object.position}
            rotation={object.rotation}
            scale={object.scale}
            physics={object.physics}
            renderMode={objectRenderMode}
            isHovered={hoveredObjectId === object.instanceId}
            onHover={handleHover}
            onPointerDown={(event) => onPointerDown(object.instanceId, event)}
          />
        </ObjectLoadErrorBoundary>
      ))}
      {spawnedObjects.map((spawned) => (
        <ObjectLoadErrorBoundary key={spawned.instanceId} objectName={spawned.asset.name} resetKey={spawned.asset.url}>
          <SceneObject
            ref={getObjectRef(spawned.instanceId)}
            object={{ ...spawned.asset, id: spawned.instanceId }}
            position={spawned.position}
            rotation={[0, 0, 0]}
            scale={[1, 1, 1]}
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
