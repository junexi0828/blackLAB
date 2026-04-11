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
  timeTheme?: 'day' | 'night'
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

type BuildingShape = 'box' | 'cylinder' | 'hexagon' | 'pyramid'

type WindowSlot = {
  x: number
  y: number
  z: number
  width: number
  height: number
  rotationY?: number
  baseLit: boolean
}

function getWindowNormal(window: WindowSlot) {
  if (typeof window.rotationY === 'number') {
    return new THREE.Vector3(Math.sin(window.rotationY), 0, Math.cos(window.rotationY))
  }
  return new THREE.Vector3(0, 0, window.z >= 0 ? 1 : -1)
}

type BoxFacadeProfile = {
  kind: 'box'
  rows: number
  cols: number
  xStart: number
  xSpacing: number
  yStart: number
  ySpacing: number
  frontZ: number
  backZ: number
  width: number
  height: number
  frontThreshold: number
  backThreshold: number
}

type RingFacadeProfile = {
  kind: 'ring'
  rows: number
  sides: number
  radius: number
  yStart: number
  ySpacing: number
  width: number
  height: number
  litThreshold: number
  angleOffset?: number
}

type PyramidRowProfile = {
  y: number
  cols: number
  z: number
  width: number
  height: number
}

type PyramidFacadeProfile = {
  kind: 'pyramid'
  rows: PyramidRowProfile[]
  xSpacing: number
  frontThreshold: number
  backThreshold: number
}

type FacadeProfile = BoxFacadeProfile | RingFacadeProfile | PyramidFacadeProfile

const BUILDING_FACADES: Record<string, FacadeProfile> = {
  ceo: {
    kind: 'ring',
    rows: 3,
    sides: 6,
    radius: 1.06,
    yStart: -0.26,
    ySpacing: 0.3,
    width: 0.14,
    height: 0.24,
    litThreshold: 0.22,
    angleOffset: Math.PI / 6,
  },
  research: {
    kind: 'ring',
    rows: 5,
    sides: 10,
    radius: 1.02,
    yStart: -0.48,
    ySpacing: 0.22,
    width: 0.16,
    height: 0.12,
    litThreshold: 0.24,
  },
  product: {
    kind: 'box',
    rows: 3,
    cols: 4,
    xStart: -0.54,
    xSpacing: 0.36,
    yStart: -0.34,
    ySpacing: 0.3,
    frontZ: 0.95,
    backZ: -0.95,
    width: 0.28,
    height: 0.16,
    frontThreshold: 0.16,
    backThreshold: 0.26,
  },
  design: {
    kind: 'ring',
    rows: 4,
    sides: 8,
    radius: 1.04,
    yStart: -0.38,
    ySpacing: 0.24,
    width: 0.13,
    height: 0.16,
    litThreshold: 0.2,
    angleOffset: Math.PI / 8,
  },
  growth: {
    kind: 'pyramid',
    rows: [
      { y: -0.42, cols: 4, z: 0.88, width: 0.16, height: 0.11 },
      { y: -0.16, cols: 3, z: 0.78, width: 0.14, height: 0.1 },
      { y: 0.1, cols: 2, z: 0.66, width: 0.12, height: 0.09 },
      { y: 0.34, cols: 1, z: 0.56, width: 0.1, height: 0.08 },
    ],
    xSpacing: 0.26,
    frontThreshold: 0.18,
    backThreshold: 0.28,
  },
  finance: {
    kind: 'ring',
    rows: 4,
    sides: 6,
    radius: 1.08,
    yStart: -0.4,
    ySpacing: 0.24,
    width: 0.12,
    height: 0.22,
    litThreshold: 0.26,
  },
  dev_1: {
    kind: 'pyramid',
    rows: [
      { y: -0.42, cols: 4, z: 0.9, width: 0.17, height: 0.11 },
      { y: -0.18, cols: 3, z: 0.8, width: 0.15, height: 0.1 },
      { y: 0.08, cols: 2, z: 0.68, width: 0.13, height: 0.09 },
      { y: 0.32, cols: 1, z: 0.58, width: 0.11, height: 0.08 },
    ],
    xSpacing: 0.28,
    frontThreshold: 0.2,
    backThreshold: 0.3,
  },
  dev_2: {
    kind: 'pyramid',
    rows: [
      { y: -0.4, cols: 3, z: 0.9, width: 0.2, height: 0.11 },
      { y: -0.15, cols: 3, z: 0.78, width: 0.15, height: 0.09 },
      { y: 0.1, cols: 2, z: 0.66, width: 0.13, height: 0.09 },
      { y: 0.33, cols: 1, z: 0.56, width: 0.1, height: 0.08 },
    ],
    xSpacing: 0.3,
    frontThreshold: 0.2,
    backThreshold: 0.3,
  },
  dev_3: {
    kind: 'pyramid',
    rows: [
      { y: -0.44, cols: 4, z: 0.9, width: 0.16, height: 0.1 },
      { y: -0.2, cols: 2, z: 0.78, width: 0.14, height: 0.11 },
      { y: 0.06, cols: 2, z: 0.68, width: 0.12, height: 0.09 },
      { y: 0.31, cols: 1, z: 0.58, width: 0.1, height: 0.08 },
    ],
    xSpacing: 0.26,
    frontThreshold: 0.18,
    backThreshold: 0.28,
  },
  engineering: {
    kind: 'ring',
    rows: 5,
    sides: 8,
    radius: 1.03,
    yStart: -0.5,
    ySpacing: 0.22,
    width: 0.16,
    height: 0.12,
    litThreshold: 0.24,
  },
  validation: {
    kind: 'box',
    rows: 4,
    cols: 3,
    xStart: -0.38,
    xSpacing: 0.38,
    yStart: -0.42,
    ySpacing: 0.24,
    frontZ: 0.95,
    backZ: -0.95,
    width: 0.22,
    height: 0.14,
    frontThreshold: 0.18,
    backThreshold: 0.26,
  },
  test_lab: {
    kind: 'pyramid',
    rows: [
      { y: -0.42, cols: 4, z: 0.9, width: 0.14, height: 0.1 },
      { y: -0.16, cols: 2, z: 0.8, width: 0.14, height: 0.11 },
      { y: 0.08, cols: 2, z: 0.68, width: 0.12, height: 0.09 },
      { y: 0.32, cols: 1, z: 0.58, width: 0.1, height: 0.08 },
    ],
    xSpacing: 0.32,
    frontThreshold: 0.22,
    backThreshold: 0.34,
  },
  quality_gate: {
    kind: 'ring',
    rows: 4,
    sides: 6,
    radius: 1.08,
    yStart: -0.42,
    ySpacing: 0.24,
    width: 0.13,
    height: 0.22,
    litThreshold: 0.22,
    angleOffset: Math.PI / 6,
  },
  board_review: {
    kind: 'box',
    rows: 3,
    cols: 3,
    xStart: -0.42,
    xSpacing: 0.42,
    yStart: -0.28,
    ySpacing: 0.32,
    frontZ: 0.96,
    backZ: -0.96,
    width: 0.26,
    height: 0.12,
    frontThreshold: 0.2,
    backThreshold: 0.28,
  },
}

const DEFAULT_FACADES: Record<BuildingShape, FacadeProfile> = {
  box: {
    kind: 'box',
    rows: 4,
    cols: 4,
    xStart: -0.54,
    xSpacing: 0.36,
    yStart: -0.42,
    ySpacing: 0.26,
    frontZ: 0.95,
    backZ: -0.95,
    width: 0.24,
    height: 0.14,
    frontThreshold: 0.18,
    backThreshold: 0.28,
  },
  cylinder: {
    kind: 'ring',
    rows: 4,
    sides: 8,
    radius: 1.03,
    yStart: -0.42,
    ySpacing: 0.24,
    width: 0.18,
    height: 0.12,
    litThreshold: 0.26,
  },
  hexagon: {
    kind: 'ring',
    rows: 4,
    sides: 6,
    radius: 1.08,
    yStart: -0.44,
    ySpacing: 0.24,
    width: 0.14,
    height: 0.2,
    litThreshold: 0.24,
  },
  pyramid: {
    kind: 'pyramid',
    rows: [
      { y: -0.44, cols: 4, z: 0.9, width: 0.18, height: 0.12 },
      { y: -0.18, cols: 3, z: 0.8, width: 0.16, height: 0.11 },
      { y: 0.08, cols: 2, z: 0.68, width: 0.14, height: 0.1 },
      { y: 0.32, cols: 1, z: 0.58, width: 0.12, height: 0.09 },
    ],
    xSpacing: 0.28,
    frontThreshold: 0.2,
    backThreshold: 0.3,
  },
}

function pushWindow(
  slots: WindowSlot[],
  seedValue: number,
  window: Omit<WindowSlot, 'baseLit'>,
  litThreshold: number,
) {
  slots.push({
    ...window,
    baseLit: seeded(seedValue) > litThreshold,
  })
}

function buildBoxWindows(seed: number, profile: BoxFacadeProfile) {
  const slots: WindowSlot[] = []
  let si = seed * 1000

  for (let row = 0; row < profile.rows; row++) {
    const y = profile.yStart + row * profile.ySpacing
    for (let col = 0; col < profile.cols; col++) {
      const x = profile.xStart + col * profile.xSpacing
      pushWindow(slots, si++, { x, y, z: profile.frontZ, width: profile.width, height: profile.height }, profile.frontThreshold)
      pushWindow(slots, si++, { x, y, z: profile.backZ, width: profile.width, height: profile.height }, profile.backThreshold)
    }
  }

  return slots
}

function buildRingWindows(seed: number, profile: RingFacadeProfile) {
  const slots: WindowSlot[] = []
  let si = seed * 1000
  const angles = Array.from({ length: profile.sides }, (_, index) => ((index / profile.sides) * Math.PI * 2) + (profile.angleOffset ?? 0))

  for (let row = 0; row < profile.rows; row++) {
    const y = profile.yStart + row * profile.ySpacing
    for (const angle of angles) {
      pushWindow(
        slots,
        si++,
        {
          x: Math.sin(angle) * profile.radius,
          y,
          z: Math.cos(angle) * profile.radius,
          width: profile.width,
          height: profile.height,
          rotationY: angle,
        },
        profile.litThreshold,
      )
    }
  }

  return slots
}

function buildPyramidWindows(seed: number, profile: PyramidFacadeProfile) {
  const slots: WindowSlot[] = []
  let si = seed * 1000

  for (const row of profile.rows) {
    for (let col = 0; col < row.cols; col++) {
      const x = row.cols === 1 ? 0 : (col - (row.cols - 1) / 2) * profile.xSpacing
      pushWindow(slots, si++, { x, y: row.y, z: row.z, width: row.width, height: row.height }, profile.frontThreshold)
      pushWindow(slots, si++, { x, y: row.y, z: -row.z, width: row.width, height: row.height }, profile.backThreshold)
    }
  }

  return slots
}

function buildWindows(shape: string, buildingId: string, seed: number) {
  const normalizedShape = (shape as BuildingShape) in DEFAULT_FACADES ? (shape as BuildingShape) : 'box'
  const facade = BUILDING_FACADES[buildingId] ?? DEFAULT_FACADES[normalizedShape]

  switch (facade.kind) {
    case 'ring':
      return buildRingWindows(seed, facade)
    case 'pyramid':
      return buildPyramidWindows(seed, facade)
    case 'box':
    default:
      return buildBoxWindows(seed, facade)
  }
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
  timeTheme = 'day',
}: CityBuildingProps) {
  const isNight = timeTheme === 'night'
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
  const windows = useMemo(() => buildWindows(shape, buildingId, seed), [shape, buildingId, seed])
  const windowGlowColor = useMemo(
    () => col.clone().lerp(new THREE.Color('#f8fafc'), isNight ? 0.32 : 0.46),
    [col, isNight],
  )
  const windowHaloColor = useMemo(
    () => col.clone().lerp(new THREE.Color('#ffffff'), isNight ? 0.54 : 0.68),
    [col, isNight],
  )

  const idleCoreLightIntensity = isNight ? 0.18 : 0.06

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
      lightRef.current.intensity = isActive && !isDimmed ? (isNight ? 3.4 : 2.5) + Math.sin(t * 1.8) * 0.8 : idleCoreLightIntensity
      lightRef.current.position.y = h + 1.5
    }
    if (antRef.current) {
      const t = state.clock.getElapsedTime()
      const mat = antRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = isActive && !isDimmed ? (Math.sin(t * 3) > 0.5 ? (isNight ? 4.2 : 3) : (isNight ? 0.9 : 0.5)) : (isNight ? 0.35 : 0.16)
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
        {windows.map((w, i) => {
          const normal = getWindowNormal(w)
          const panePosition: [number, number, number] = [
            w.x + normal.x * 0.05,
            w.y,
            w.z + normal.z * 0.05,
          ]
          const haloPosition: [number, number, number] = [
            w.x + normal.x * 0.09,
            w.y,
            w.z + normal.z * 0.09,
          ]
          const paneOpacity = isSelected
            ? 0
            : isDimmed
              ? 0.16
              : isActive && w.baseLit
                ? (isNight ? 1 : 0.94)
                : w.baseLit
                  ? (isNight ? 0.62 : 0.5)
                  : (isNight ? 0.14 : 0.09)
          const haloOpacity = isSelected
            ? 0
            : isDimmed
              ? 0.04
              : isActive && w.baseLit
                ? (isNight ? 0.34 : 0.24)
                : w.baseLit
                  ? (isNight ? 0.14 : 0.08)
                  : 0

          return (
            <group key={i} rotation={[0, w.rotationY ?? 0, 0]}>
              <mesh position={haloPosition} renderOrder={1}>
                <planeGeometry args={[w.width * 1.5, w.height * 1.5]} />
                <meshBasicMaterial
                  color={windowHaloColor}
                  transparent={true}
                  opacity={haloOpacity}
                  depthWrite={false}
                  toneMapped={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh position={panePosition} renderOrder={2}>
                <planeGeometry args={[w.width * 1.08, w.height * 1.08]} />
                <meshBasicMaterial
                  color={windowGlowColor}
                  transparent={true}
                  opacity={paneOpacity}
                  depthWrite={false}
                  toneMapped={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          )
        })}
      </group>

      {/* Interior Drill-down Content */}
      {isSelected && (
        <group position={[0, 0, 0]}>
          <DepartmentInterior buildingId={buildingId} color={color} />
        </group>
      )}
      
      {/* Internal core light for glass illumination */}
      {!isDimmed && (
        <pointLight
          position={[0, target / 2, 0]}
          distance={4}
          intensity={isSelected ? 0.5 : isActive ? (isNight ? 2.6 : 2) : idleCoreLightIntensity}
          color={color}
        />
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
          intensity={isActive && !isSelected ? 2.5 : idleCoreLightIntensity}
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
          color={isActive ? color : isNight ? '#d5dde8' : '#667788'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor={isNight ? '#06111d' : '#ffffff'}
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
