import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CampusMonumentLayout } from '../types'

export function CampusMonument({
  timeTheme = 'day',
  monument,
}: {
  timeTheme?: 'day' | 'night'
  monument: CampusMonumentLayout
}) {
  const ringRef = useRef<THREE.Mesh>(null)
  const orbRef = useRef<THREE.Mesh>(null)
  const isNight = timeTheme === 'night'

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.35
    }
    if (orbRef.current) {
      orbRef.current.position.y = monument.orbHeight + Math.sin(t * 1.6) * 0.05
    }
  })

  return (
    <group position={monument.position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[monument.baseInnerRadius, monument.baseOuterRadius, 0.06, 48]} />
        <meshStandardMaterial color={isNight ? '#0f2235' : '#f4f6f8'} roughness={0.82} metalness={0.06} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <ringGeometry args={[monument.ringInnerRadius, monument.ringOuterRadius, 48]} />
        <meshBasicMaterial color={isNight ? '#8fd3ff' : '#9fb4c7'} transparent opacity={0.42} />
      </mesh>

      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} position={[0, monument.torusHeight, 0]}>
        <torusGeometry args={[monument.torusRadius, monument.torusTube, 18, 48]} />
        <meshStandardMaterial color={isNight ? '#9dd6ff' : '#dbe4eb'} emissive={isNight ? '#9dd6ff' : '#000000'} emissiveIntensity={isNight ? 0.4 : 0} metalness={0.28} roughness={0.24} />
      </mesh>

      <mesh ref={orbRef} position={[0, monument.orbHeight, 0]}>
        <sphereGeometry args={[monument.orbRadius, 20, 20]} />
        <meshStandardMaterial color={isNight ? '#edf6ff' : '#ffffff'} emissive={isNight ? '#dbeafe' : '#ffffff'} emissiveIntensity={isNight ? 0.45 : 0.08} metalness={0.18} roughness={0.12} />
      </mesh>
    </group>
  )
}
