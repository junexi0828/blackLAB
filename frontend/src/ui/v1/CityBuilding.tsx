import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'

interface CityBuildingProps {
  position: [number, number, number]
  color: string
  isActive: boolean
  status: string
  label: string
  summary?: string | null
}

const STATUS_HEIGHT: Record<string, number> = {
  running:   5.5,
  completed: 3.0,
  failed:    1.8,
  stale:     1.2,
  queued:    1.4,
}

// Seeded deterministic — no Math.random in render
function seeded(s: number): number {
  const x = Math.sin(s + 1) * 43758.5453123
  return x - Math.floor(x)
}

const WINDOW_ROWS = 5
const WINDOW_COLS = 3

// Pre-bake window lit state per slot using seed (not random per render)
function buildWindows(seed: number) {
  const arr: { x: number; y: number; z: number; baseLit: boolean }[] = []
  let si = seed * 1000
  for (let r = 0; r < WINDOW_ROWS; r++) {
    for (let c = 0; c < WINDOW_COLS; c++) {
      const xOff = (c - 1) * 0.52
      const yOff = 0.35 + r * 0.85
      arr.push({ x: xOff,   y: yOff, z:  1.01, baseLit: seeded(si++) > 0.25 })
      arr.push({ x: xOff,   y: yOff, z: -1.01, baseLit: seeded(si++) > 0.35 })
    }
  }
  return arr
}

export function CityBuilding({ position, color, isActive, status, label, summary }: CityBuildingProps) {
  const bodyRef  = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const antRef   = useRef<THREE.Mesh>(null)
  const heightRef = useRef(1.4)
  const target = STATUS_HEIGHT[status] ?? 1.4

  const col = useMemo(() => new THREE.Color(color), [color])

  // Use position hash as seed so each building is deterministic
  const seed = Math.abs(Math.floor(position[0] * 17 + position[2] * 31))
  const windows = useMemo(() => buildWindows(seed), [seed])

  useFrame((state, delta) => {
    if (!bodyRef.current) return
    heightRef.current = THREE.MathUtils.lerp(heightRef.current, target, delta * 1.8)
    const h = heightRef.current
    bodyRef.current.scale.y = h
    bodyRef.current.position.y = h / 2

    if (lightRef.current) {
      const t = state.clock.getElapsedTime()
      lightRef.current.intensity = isActive ? 2.5 + Math.sin(t * 1.8) * 0.8 : 0.25
      lightRef.current.position.y = h + 1.5
    }
    if (antRef.current) {
      const t = state.clock.getElapsedTime()
      const mat = antRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isActive ? (Math.sin(t * 3) > 0.5 ? 3 : 0.5) : 0.1
      antRef.current.position.y = h + 0.55
    }
  })

  return (
    <group position={position}>
      {/* Main body */}
      <mesh ref={bodyRef} position={[0, target / 2, 0]} castShadow>
        <boxGeometry args={[2, 1, 2]} />
        <meshPhysicalMaterial
          color={isActive ? color : '#020205'}
          emissive={col}
          emissiveIntensity={isActive ? 0.2 : 0.01}
          metalness={0.2}
          roughness={0.1}
          transmission={0.9}
          thickness={0.5}
          transparent={true}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>
      
      {/* Internal core light for glass illumination */}
      {isActive && (
        <pointLight position={[0, target / 2, 0]} distance={4} intensity={2} color={color} />
      )}

      {/* Windows — lit state baked at init, not random per render */}
      {windows.map((w, i) => (
        <mesh key={i} position={[w.x, w.y, w.z]}>
          <planeGeometry args={[0.28, 0.4]} />
          <meshStandardMaterial
            color={color}
            emissive={col}
            emissiveIntensity={isActive && w.baseLit ? 1.8 : 0.1}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Antenna */}
      <mesh ref={antRef} position={[0, target + 0.55, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
        <meshStandardMaterial color={color} emissive={col} emissiveIntensity={isActive ? 2.5 : 0.1} />
      </mesh>

      {/* Antenna tip */}
      {isActive && (
        <mesh position={[0, target + 1.15, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color={color} emissive={col} emissiveIntensity={4} />
        </mesh>
      )}

      {/* Glow light */}
      <pointLight
        ref={lightRef}
        color={color}
        intensity={isActive ? 2.5 : 0.25}
        distance={9}
        position={[0, target + 1.5, 0]}
      />

      {/* Ground halo */}
      {isActive && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[1.2, 2.2, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.FrontSide} />
        </mesh>
      )}

      {/* Label */}
      <Text
        position={[0, target + 2.1, 0]}
        fontSize={0.26}
        color={isActive ? color : '#334455'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.015}
        outlineColor="#000000"
      >
        {label.toUpperCase()}
      </Text>

      {/* HTML Popup for active building with data */}
      {isActive && summary && (
        <Html position={[0, target + 3.2, 0]} center distanceFactor={18} zIndexRange={[100, 0]}>
          <div className="city-html-popup" style={{
            background: 'rgba(5, 10, 15, 0.85)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${color}44`,
            borderTop: `2px solid ${color}`,
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '11px',
            pointerEvents: 'none',
            minWidth: '200px',
            maxWidth: '320px',
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 15px ${color}33`
          }}>
            <div style={{ color, marginBottom: '4px', fontWeight: 'bold', fontSize: '10px', letterSpacing: '0.1em' }}>
              ● ACTIVE AGENT
            </div>
            <div style={{ opacity: 0.9, lineHeight: '1.4' }}>
              {summary}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
