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

function DesignLayout({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[1.55, 0.12, 0.92]} />
        <meshStandardMaterial color="#ffffff" metalness={0.08} roughness={0.82} />
      </mesh>
      <mesh position={[-0.28, 0.28, -0.08]} rotation={[-0.08, 0.18, 0]}>
        <boxGeometry args={[0.42, 0.28, 0.04]} />
        <meshStandardMaterial color="#1f2937" metalness={0.2} roughness={0.24} />
      </mesh>
      <mesh position={[0.25, 0.28, 0.12]} rotation={[-0.05, -0.14, 0]}>
        <boxGeometry args={[0.5, 0.32, 0.04]} />
        <meshStandardMaterial color="#111827" metalness={0.18} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.58, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
      <SubRover color={color} seed={6} index={0} />
      <SubRover color={color} seed={7} index={1} />
    </group>
  )
}

function FinanceLayout({ color }: { color: string }) {
  return (
    <group>
      {[-0.42, -0.12, 0.18, 0.48].map((x, index) => (
        <mesh key={x} position={[x, 0.2 + index * 0.08, 0]}>
          <boxGeometry args={[0.18, 0.35 + index * 0.18, 0.18]} />
          <meshStandardMaterial color={index % 2 === 0 ? color : '#dff6ee'} metalness={0.16} roughness={0.58} />
        </mesh>
      ))}
      <mesh position={[0, 0.14, -0.42]}>
        <boxGeometry args={[1.2, 0.08, 0.18]} />
        <meshStandardMaterial color="#ffffff" roughness={0.74} />
      </mesh>
      <SubRover color={color} seed={8} index={0} />
    </group>
  )
}

function LabLayout({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.08, 32]} />
        <meshStandardMaterial color="#f8fbff" roughness={0.8} />
      </mesh>
      {[-0.45, 0, 0.45].map((x, index) => (
        <group key={x} position={[x, 0.16, 0]}>
          <mesh>
            <cylinderGeometry args={[0.12, 0.12, 0.28, 16]} />
            <meshStandardMaterial color="#ffffff" metalness={0.04} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <sphereGeometry args={[0.11, 16, 16]} />
            <meshStandardMaterial color={index === 1 ? '#ff6b6b' : color} emissive={index === 1 ? '#ff6b6b' : color} emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
      <SubRover color={color} seed={9} index={0} />
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

  if (id.includes('design')) {
    return <DesignLayout color={color} />
  }

  if (id.includes('finance')) {
    return <FinanceLayout color={color} />
  }

  if (id.includes('validation') || id.includes('test') || id.includes('quality')) {
    return <LabLayout color={color} />
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
