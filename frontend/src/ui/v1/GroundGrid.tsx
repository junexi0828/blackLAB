import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function GroundGrid() {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    if (!materialRef.current) return
    const t = state.clock.getElapsedTime()
    materialRef.current.emissiveIntensity = 0.04 + Math.sin(t * 0.3) * 0.015
  })

  return (
    <group>
      {/* Reflective dark ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#020208"
          emissive={new THREE.Color('#0a0a30')}
          emissiveIntensity={0.05}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>

      {/* Fine inner grid */}
      <gridHelper
        args={[24, 24, '#0d1a2e', '#0d1a2e']}
        position={[0, 0.01, 0]}
      />

      {/* Outer faint grid */}
      <gridHelper
        args={[80, 20, '#060d18', '#060d18']}
        position={[0, 0.005, 0]}
      />
    </group>
  )
}
