import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useCameraDollyGestures } from '../camera/useCameraDollyGestures'

export interface CharacterControllerHandle {
  reset: () => void
}

const SPEED = 4
const JUMP_FORCE = 6
const SMOOTH = 0.12 // mouse smoothing factor (lower = smoother)
const DOLLY_UNITS_PER_PIXEL = 0.01
const CHARACTER_SPAWN = { x: 0, y: 1, z: -0.5 }
const CHARACTER_SPAWN_POSITION: [number, number, number] = [CHARACTER_SPAWN.x, CHARACTER_SPAWN.y, CHARACTER_SPAWN.z]
const DEFAULT_YAW = Math.PI

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _dollyForward = new THREE.Vector3()
const _move = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export const CharacterController = forwardRef<CharacterControllerHandle>(
  function CharacterController(_, ref) {
  const bodyRef = useRef<React.ComponentRef<typeof RigidBody>>(null)
  const { camera, gl } = useThree()
  useRapier()

  const keys = useRef(new Set<string>())
  const rawYaw = useRef(DEFAULT_YAW)
  const rawPitch = useRef(0)
  const smoothYaw = useRef(DEFAULT_YAW)
  const smoothPitch = useRef(0)
  const touchLook = useRef<{ id: number; x: number; y: number } | null>(null)
  const touchMove = useRef<{ id: number; x: number; y: number } | null>(null)
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 })

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (!bodyRef.current) return
      bodyRef.current.setTranslation(CHARACTER_SPAWN, true)
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
      rawYaw.current = DEFAULT_YAW
      rawPitch.current = 0
      smoothYaw.current = DEFAULT_YAW
      smoothPitch.current = 0
      camera.quaternion.setFromEuler(_euler.set(0, DEFAULT_YAW, 0))
    },
  }))

  const applyDolly = useCallback((deltaY: number) => {
    const body = bodyRef.current
    if (!body) return

    _dollyForward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0)
    if (_dollyForward.lengthSq() < 0.0001) return
    _dollyForward.normalize()

    const amount = -deltaY * DOLLY_UNITS_PER_PIXEL
    const position = body.translation()
    body.setTranslation(
      {
        x: position.x + _dollyForward.x * amount,
        y: position.y,
        z: position.z + _dollyForward.z * amount,
      },
      true,
    )
    body.wakeUp()
  }, [camera])

  useCameraDollyGestures({ domElement: gl.domElement, onDollyPixels: applyDolly })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys.current.add(e.code)
      else keys.current.delete(e.code)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    // Touch handlers
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) return
      for (const touch of Array.from(e.changedTouches)) {
        const isLeft = touch.clientX < window.innerWidth / 2
        if (isLeft && !touchMove.current) {
          touchMove.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
          setJoystickPos({ x: touch.clientX, y: touch.clientY })
        } else if (!isLeft && !touchLook.current) {
          touchLook.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
        }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) return
      for (const touch of Array.from(e.changedTouches)) {
        if (touchLook.current?.id === touch.identifier) {
          const dx = touch.clientX - touchLook.current.x
          const dy = touch.clientY - touchLook.current.y
          rawYaw.current -= dx * 0.004
          rawPitch.current -= dy * 0.004
          rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
          touchLook.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
        }
        if (touchMove.current?.id === touch.identifier) {
          touchMove.current = { ...touchMove.current, x: touch.clientX, y: touch.clientY }
        }
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touchLook.current?.id === touch.identifier) touchLook.current = null
        if (touchMove.current?.id === touch.identifier) {
          touchMove.current = null
          setJoystickPos({ x: 0, y: 0 })
        }
      }
    }
    gl.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
    gl.domElement.addEventListener('touchmove', onTouchMove, { passive: true })
    gl.domElement.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      gl.domElement.removeEventListener('touchstart', onTouchStart)
      gl.domElement.removeEventListener('touchmove', onTouchMove)
      gl.domElement.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl])

  useFrame(() => {
    if (!bodyRef.current) return

    // Smooth yaw/pitch
    smoothYaw.current += (rawYaw.current - smoothYaw.current) * (1 - Math.pow(1 - SMOOTH, 1))
    smoothPitch.current += (rawPitch.current - smoothPitch.current) * (1 - Math.pow(1 - SMOOTH, 1))

    _euler.set(smoothPitch.current, smoothYaw.current, 0)
    camera.quaternion.setFromEuler(_euler)

    // Compute move direction from keys + touch joystick
    let fwd = 0, strafe = 0
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) fwd += 1
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) fwd -= 1
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) strafe -= 1
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) strafe += 1

    if (touchMove.current) {
      const origin = joystickPos
      const dx = (touchMove.current.x - origin.x) / 50
      const dy = (touchMove.current.y - origin.y) / 50
      strafe += Math.max(-1, Math.min(1, dx))
      fwd -= Math.max(-1, Math.min(1, dy))
    }

    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
    _move.set(0, 0, 0).addScaledVector(_forward, fwd).addScaledVector(_right, strafe)
    if (_move.lengthSq() > 1) _move.normalize()

    const vel = bodyRef.current.linvel()
    bodyRef.current.setLinvel(
      { x: _move.x * SPEED, y: vel.y, z: _move.z * SPEED },
      true,
    )

    // Jump
    if ((keys.current.has('Space') || keys.current.has('KeyE')) && Math.abs(vel.y) < 0.1) {
      bodyRef.current.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true)
    }

    // Sync camera position to body
    const pos = bodyRef.current.translation()
    camera.position.set(pos.x, pos.y + 0.8, pos.z)
  })

  return (
    <RigidBody
      ref={bodyRef}
      position={CHARACTER_SPAWN_POSITION}
      enabledRotations={[false, false, false]}
      linearDamping={8}
    >
      <CapsuleCollider args={[0.4, 0.4]} />
    </RigidBody>
  )
})
