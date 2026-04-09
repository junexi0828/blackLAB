import { useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { EventEntry } from '../types'
import { DepartmentInterior } from './DepartmentInterior'

interface CityBuildingProps {
  buildingId: string
  position: [number, number, number]
  color: string
  isActive: boolean
  status: string
  label: string
  summary?: string | null
  shape?: string
  event?: EventEntry | null
  onDismissEvent?: (eventId: string) => void
  isSelected?: boolean
  isDimmed?: boolean
  onClick?: () => void
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
      const xOff = (c - 1) * 0.3
      const yOff = -0.4 + (r / WINDOW_ROWS) * 0.8
      // Fit firmly inside the slim pyramid top geometry
      arr.push({ x: xOff,   y: yOff, z:  0.35, baseLit: seeded(si++) > 0.25 })
      arr.push({ x: xOff,   y: yOff, z: -0.35, baseLit: seeded(si++) > 0.35 })
    }
  }
  return arr
}

function truncateMessage(value: string, limit = 140): string {
  if (value.length <= limit) {
    return value
  }
  return value.slice(0, limit - 1).trimEnd() + '…'
}

export function CityBuilding({
  buildingId,
  position,
  color,
  isActive,
  status,
  label,
  summary,
  shape = 'box',
  event = null,
  onDismissEvent,
  isSelected = false,
  isDimmed = false,
  onClick,
}: CityBuildingProps) {
  const bodyRef  = useRef<THREE.Mesh>(null)
  const windowsGroupRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const antRef   = useRef<THREE.Mesh>(null)
  const heightRef = useRef(1.4)
  const target = STATUS_HEIGHT[status] ?? 1.4

  const col = useMemo(() => new THREE.Color(color), [color])

  // Individual material instances for selection/dimming effects
  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#e2edf3',
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.95,
    thickness: 1.5,
    transparent: true,
    opacity: 1,
  }), [])

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.1,
    roughness: 0.9,
    transparent: true,
    opacity: 1,
  }), [])

  // Use position hash as seed so each building is deterministic
  const seed = Math.abs(Math.floor(position[0] * 17 + position[2] * 31))
  const windows = useMemo(() => buildWindows(seed), [seed])

  useFrame((state, delta) => {
    if (!bodyRef.current) return
    heightRef.current = THREE.MathUtils.lerp(heightRef.current, target, delta * 1.8)
    const h = heightRef.current
    bodyRef.current.scale.y = h
    bodyRef.current.position.y = h / 2

    // Selection/Dimming animations
    const targetOpacity = isSelected ? 0.08 : (isDimmed ? 0.25 : 1.0)
    glassMat.opacity = THREE.MathUtils.lerp(glassMat.opacity, targetOpacity, delta * 3)
    frameMat.opacity = THREE.MathUtils.lerp(frameMat.opacity, isDimmed ? 0.2 : 1.0, delta * 3)
    
    // Antennas and labels follow building height
    if (windowsGroupRef.current) {
      windowsGroupRef.current.scale.y = h
      windowsGroupRef.current.position.y = h / 2
      windowsGroupRef.current.visible = !isSelected // Hide interal racks when selected to show interior
    }

    if (lightRef.current) {
      const t = state.clock.getElapsedTime()
      lightRef.current.intensity = isActive && !isDimmed ? 2.5 + Math.sin(t * 1.8) * 0.8 : 0.25
      lightRef.current.position.y = h + 1.5
    }
    if (antRef.current) {
      const t = state.clock.getElapsedTime()
      const mat = antRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isActive && !isDimmed ? (Math.sin(t * 3) > 0.5 ? 3 : 0.5) : 0.1
      antRef.current.position.y = h + 0.55
      mat.opacity = isDimmed ? 0.2 : 1.0
      mat.transparent = true
    }
  })

  const renderGeometry = (type: 'base' | 'glass') => {
    switch (shape) {
      case 'cylinder':
        return type === 'base' ? <cylinderGeometry args={[1.2, 1.2, 0.4, 32]} /> : <cylinderGeometry args={[1.1, 1.1, 1, 32]} />
      case 'hexagon':
        return type === 'base' ? <cylinderGeometry args={[1.3, 1.3, 0.4, 6]} /> : <cylinderGeometry args={[1.2, 1.2, 1, 6]} />
      case 'pyramid':
        return type === 'base' ? <cylinderGeometry args={[1.5, 1.5, 0.4, 4]} /> : <cylinderGeometry args={[0.7, 1.4, 1, 4]} />
      case 'box':
      default:
        return type === 'base' ? <boxGeometry args={[2.2, 0.4, 2.2]} /> : <boxGeometry args={[2, 1, 2]} />
    }
  }

  const popupMessage = truncateMessage(event?.message ?? summary ?? '')
  const showBubble = Boolean(event && popupMessage && !isSelected && !isDimmed)

  return (
    <group
      position={position}
      userData={{ buildingId }}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      {/* Frame (White Silicone Base) */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow material={frameMat}>
        {renderGeometry('base')}
      </mesh>

      {/* Main body (Bright Glass) */}
      <mesh ref={bodyRef} position={[0, target / 2, 0]} castShadow receiveShadow material={glassMat}>
        {renderGeometry('glass')}
      </mesh>
      
      {/* Internal Server Racks - sibling so transmission pass renders them properly */}
      <group ref={windowsGroupRef} position={[0, target / 2, 0]}>
        {windows.map((w, i) => (
          <mesh key={i} position={[w.x, w.y, w.z]}>
            <planeGeometry args={[0.2, 0.1]} />
            <meshStandardMaterial
              color={color}
              emissive={col}
              emissiveIntensity={isActive && w.baseLit && !isDimmed ? 1.8 : 0.1}
              transparent={true}
              opacity={isDimmed ? 0.2 : (isSelected ? 0 : 1)}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      {/* Interior Drill-down Content */}
      {isSelected && (
        <group position={[0, 0, 0]}>
          <DepartmentInterior buildingId={buildingId} color={color} />
        </group>
      )}
      
      {/* Internal core light for glass illumination */}
      {isActive && !isDimmed && (
        <pointLight position={[0, target / 2, 0]} distance={4} intensity={isSelected ? 0.5 : 2} color={color} />
      )}

      {/* Antenna */}
      <mesh ref={antRef} position={[0, target + 0.55, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
        <meshStandardMaterial color={color} emissive={col} emissiveIntensity={isActive && !isDimmed ? 2.5 : 0.1} />
      </mesh>

      {/* Antenna tip */}
      {isActive && !isDimmed && (
        <mesh position={[0, target + 1.15, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color={color} emissive={col} emissiveIntensity={4} />
        </mesh>
      )}

      {/* Glow light */}
      {!isDimmed && (
        <pointLight
          ref={lightRef}
          color={color}
          intensity={isActive && !isSelected ? 2.5 : 0.25}
          distance={9}
          position={[0, target + 1.5, 0]}
        />
      )}

      {/* Ground halo */}
      {isActive && !isDimmed && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[1.2, 2.2, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.FrontSide} />
        </mesh>
      )}

      {/* Label */}
      {!isDimmed && (
        <Text
          position={[0, target + 2.1, 0]}
          fontSize={0.26}
          color={isActive ? color : '#667788'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#ffffff"
          visible={!isSelected} // Label might get in the way when zoomed in
        >
          {label.toUpperCase()}
        </Text>
      )}

      {/* HTML speech bubble for active or recently updated building */}
      {showBubble && (
        <Html position={[0, target + 3.2, 0]} center distanceFactor={18} zIndexRange={[100, 0]}>
          <div
            className={`city-html-popup ${event?.is_live ? 'is-live' : ''}`}
            style={{ '--bubble-accent': color } as CSSProperties}
            onClick={(e) => { e.stopPropagation(); event && onDismissEvent?.(event.event_id); }}
            role="button"
            tabIndex={0}
            onKeyDown={(keyboardEvent) => {
              if (!event || !onDismissEvent) {
                return
              }
              if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                keyboardEvent.preventDefault()
                onDismissEvent(event.event_id)
              }
            }}
          >
            <div className="city-html-popup__eyebrow">
              {event?.is_live ? 'LIVE UPDATE' : event?.department_label ?? 'EVENT'}
            </div>
            <div className="city-html-popup__body">{popupMessage}</div>
          </div>
        </Html>
      )}
    </group>
  )
}
