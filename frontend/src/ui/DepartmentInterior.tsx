import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

interface DepartmentInteriorProps {
  buildingId: string
  color: string
}

function SubRover({ color, seed, index }: { color: string, seed: number, index: number }) {
  const ref = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.getElapsedTime() * 0.5
    const radius = 0.6 + Math.sin(t + seed) * 0.2
    const angle = t + (index * Math.PI * 2) / 3 
    
    ref.current.position.x = Math.cos(angle) * radius
    ref.current.position.z = Math.sin(angle) * radius
    ref.current.rotation.y = -angle + Math.PI / 2
    ref.current.position.y = 0.05 + Math.abs(Math.sin(t * 8)) * 0.02
  })

  return (
    <group ref={ref}>
      {/* Tiny Rover Body */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.25, 0.18, 0.2]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Visor */}
      <mesh position={[0, 0.12, 0.105]}>
        <boxGeometry args={[0.18, 0.08, 0.01]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* Name Label */}
      <Text position={[0, 0.35, 0]} fontSize={0.08} color="#ffffff" outlineWidth={0.005} outlineColor="#000000">
        {`agent_${index + 1}`}
      </Text>
    </group>
  )
}

function BoardLayout({ color }: { color: string }) {
  return (
    <group>
      {/* Large Meeting Table */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.15, 32]} />
        <meshStandardMaterial color="#ffffff" metalness={0.2} roughness={0.8} />
      </mesh>
      {/* Strategic Blueprint Overlay */}
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
        <gridHelper args={[1.2, 12, color, color]} rotation={[Math.PI / 2, 0, 0]} />
      </mesh>
      {/* Sub Agents */}
      <SubRover color={color} seed={1} index={0} />
      <SubRover color={color} seed={2} index={1} />
      <SubRover color={color} seed={3} index={2} />
    </group>
  )
}

function EngineeringLayout({ color }: { color: string }) {
  return (
    <group>
      {/* Circular Server Cluster */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i * Math.PI * 2) / 6
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.7, 0.4, Math.sin(angle) * 0.7]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[0.3, 0.8, 0.2]} />
            <meshStandardMaterial color="#222222" metalness={0.8} roughness={0.2} />
            {/* Server LED strips */}
            <mesh position={[0.151, 0, 0]}>
              <planeGeometry args={[0.02, 0.6]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </mesh>
        )
      })}
      {/* Sub Agents */}
      <SubRover color={color} seed={4} index={0} />
      <SubRover color={color} seed={5} index={1} />
    </group>
  )
}

function RecoveryLayout() {
  const lightRef = useRef<THREE.PointLight>(null)
  
  useFrame((state) => {
    if (lightRef.current) {
      lightRef.current.intensity = 1.5 + Math.sin(state.clock.getElapsedTime() * 10) * 1.5
    }
  })

  return (
    <group>
      {/* Central Control Hub */}
      <mesh position={[0, 0.2, 0]}>
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color="#111111" metalness={1} roughness={0} />
      </mesh>
      {/* Emergency Siren Light */}
      <pointLight ref={lightRef} position={[0, 0.6, 0]} distance={3} color="#ff0000" />
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
      {/* Sub Agents */}
      <SubRover color="#ff3333" seed={6} index={0} />
    </group>
  )
}

export function DepartmentInterior({ buildingId, color }: DepartmentInteriorProps) {
  const id = buildingId.toLowerCase()
  
  if (id.includes('board') || id.includes('ceo') || id.includes('cto')) {
    return <BoardLayout color={color} />
  }
  
  if (id.includes('dev') || id.includes('product') || id.includes('engineering')) {
    return <EngineeringLayout color={color} />
  }
  
  if (id.includes('recovery')) {
    return <RecoveryLayout />
  }
  
  // Default research/academic layout
  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.05, 32]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      <SubRover color={color} seed={10} index={0} />
    </group>
  )
}
