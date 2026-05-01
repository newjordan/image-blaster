import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

export interface EnvironmentMapHandle {
  setIntensity: (amount: number) => void
}

interface Props {
  panoUrl: string
  intensity: number
}

export const EnvironmentMap = forwardRef<EnvironmentMapHandle, Props>(
  function EnvironmentMap({ panoUrl, intensity }, ref) {
    const texture = useLoader(THREE.TextureLoader, panoUrl)
    const { scene } = useThree()
    const transitionAmountRef = useRef(1)

    const applyIntensity = useCallback(() => {
      scene.environmentIntensity = transitionAmountRef.current * intensity
    }, [intensity, scene])

    useEffect(() => {
      texture.mapping = THREE.EquirectangularReflectionMapping
      texture.colorSpace = THREE.SRGBColorSpace
      scene.environment = texture
      scene.environmentRotation = new THREE.Euler(0, Math.PI / 2, 0)
      applyIntensity()
      return () => {
        if (scene.environment === texture) scene.environment = null
      }
    }, [texture, scene, applyIntensity])

    useEffect(() => {
      applyIntensity()
    }, [applyIntensity])

    useImperativeHandle(ref, () => ({
      setIntensity: (amount: number) => {
        transitionAmountRef.current = amount
        applyIntensity()
      },
    }), [applyIntensity])

    return null
  },
)
