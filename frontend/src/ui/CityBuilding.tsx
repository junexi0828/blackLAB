import { memo, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { EventEntry } from '../types'
import type { ProjectMaturityTier } from './projectMaturity'
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
  heightMultiplier?: number
  growthRateMultiplier?: number
  unlockTier?: ProjectMaturityTier
  clusterMaturity?: number
  departmentMaturity?: number
  onClick?: () => void
  timeTheme?: 'day' | 'night'
  lowPower?: boolean
}

const STATUS_HEIGHT: Record<string, number> = {
  running:   5.5,
  completed: 3.0,
  failed:    1.8,
  stale:     1.2,
  queued:    1.4,
}

const WINDOW_REVEAL_BY_TIER: Record<ProjectMaturityTier, number> = {
  0: 0.58,
  1: 0.7,
  2: 0.82,
  3: 0.94,
  4: 1,
}

const WINDOW_REVEAL_MATURITY_WEIGHTS = {
  department: 0.16,
  cluster: 0.04,
} as const

const GLOW_INTENSITY_BY_TIER: Record<ProjectMaturityTier, number> = {
  0: 0.82,
  1: 0.9,
  2: 0.98,
  3: 1.04,
  4: 1.1,
}

const GLOW_INTENSITY_DEPARTMENT_WEIGHT = {
  base: 0.94,
  maturity: 0.12,
} as const

const IDLE_CORE_LIGHT_INTENSITY = {
  day: 0.06,
  night: 0.18,
} as const

const INACTIVE_ANTENNA_INTENSITY = {
  day: 0.16,
  night: 0.35,
} as const

const TWEEN_SPEEDS = {
  height: 1.8,
  opacity: 3,
} as const

const LOW_POWER_BUILDING_TUNING = {
  windowRevealScale: 0.88,
  heightTweenScale: 0.58,
  opacityTweenScale: 0.62,
  pulseSpeedScale: 0.52,
  pulseAmplitudeScale: 0.4,
  glowLightScale: 0.62,
  idleLightScale: 0.7,
  antennaPulseScale: 0.58,
  haloOpacityScale: 0.72,
} as const

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

type WindowInstances = {
  allHaloMatrices: THREE.Matrix4[]
  litHaloMatrices: THREE.Matrix4[]
  litPaneMatrices: THREE.Matrix4[]
  darkPaneMatrices: THREE.Matrix4[]
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
      { y: -0.42, cols: 4, z: 0.9, width: 0.18, height: 0.125 },
      { y: -0.16, cols: 3, z: 0.8, width: 0.16, height: 0.11 },
      { y: 0.1, cols: 2, z: 0.68, width: 0.14, height: 0.1 },
      { y: 0.34, cols: 1, z: 0.58, width: 0.12, height: 0.09 },
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
      { y: -0.42, cols: 4, z: 0.92, width: 0.19, height: 0.125 },
      { y: -0.18, cols: 3, z: 0.82, width: 0.17, height: 0.11 },
      { y: 0.08, cols: 2, z: 0.7, width: 0.145, height: 0.1 },
      { y: 0.32, cols: 1, z: 0.6, width: 0.12, height: 0.09 },
    ],
    xSpacing: 0.28,
    frontThreshold: 0.2,
    backThreshold: 0.3,
  },
  dev_2: {
    kind: 'pyramid',
    rows: [
      { y: -0.4, cols: 3, z: 0.92, width: 0.22, height: 0.125 },
      { y: -0.15, cols: 3, z: 0.8, width: 0.17, height: 0.105 },
      { y: 0.1, cols: 2, z: 0.68, width: 0.145, height: 0.1 },
      { y: 0.33, cols: 1, z: 0.58, width: 0.12, height: 0.09 },
    ],
    xSpacing: 0.3,
    frontThreshold: 0.2,
    backThreshold: 0.3,
  },
  dev_3: {
    kind: 'pyramid',
    rows: [
      { y: -0.44, cols: 4, z: 0.92, width: 0.18, height: 0.115 },
      { y: -0.2, cols: 2, z: 0.8, width: 0.16, height: 0.12 },
      { y: 0.06, cols: 2, z: 0.7, width: 0.14, height: 0.1 },
      { y: 0.31, cols: 1, z: 0.6, width: 0.12, height: 0.09 },
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
      { y: -0.42, cols: 4, z: 0.92, width: 0.17, height: 0.115 },
      { y: -0.16, cols: 2, z: 0.82, width: 0.16, height: 0.12 },
      { y: 0.08, cols: 2, z: 0.7, width: 0.14, height: 0.1 },
      { y: 0.32, cols: 1, z: 0.6, width: 0.12, height: 0.09 },
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
      { y: -0.44, cols: 4, z: 0.92, width: 0.2, height: 0.13 },
      { y: -0.18, cols: 3, z: 0.82, width: 0.18, height: 0.12 },
      { y: 0.08, cols: 2, z: 0.7, width: 0.15, height: 0.105 },
      { y: 0.32, cols: 1, z: 0.6, width: 0.13, height: 0.095 },
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

function selectVisibleWindows(windows: WindowSlot[], revealRatio: number, seed: number) {
  if (revealRatio >= 0.999 || windows.length <= 1) {
    return windows
  }

  const visibleCount = Math.max(1, Math.round(windows.length * revealRatio))
  if (visibleCount >= windows.length) {
    return windows
  }

  const offset = Math.floor(seeded(seed * 17) * windows.length)
  const stride = windows.length / visibleCount
  const selectedIndices = new Set<number>()

  for (let slot = 0; slot < visibleCount; slot += 1) {
    let index = (Math.floor(offset + stride * slot + stride * 0.5) % windows.length + windows.length) % windows.length
    while (selectedIndices.has(index)) {
      index = (index + 1) % windows.length
    }
    selectedIndices.add(index)
  }

  return windows.filter((_, index) => selectedIndices.has(index))
}

function buildPlaneMatrix(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  rotationY = 0,
) {
  const position = new THREE.Vector3(x, y, z)
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0))
  const scale = new THREE.Vector3(width, height, 1)
  return new THREE.Matrix4().compose(position, rotation, scale)
}

function buildWindowInstances(windows: WindowSlot[]): WindowInstances {
  const allHaloMatrices: THREE.Matrix4[] = []
  const litHaloMatrices: THREE.Matrix4[] = []
  const litPaneMatrices: THREE.Matrix4[] = []
  const darkPaneMatrices: THREE.Matrix4[] = []

  for (const window of windows) {
    const normal = getWindowNormal(window)
    const paneX = window.x + normal.x * 0.05
    const paneZ = window.z + normal.z * 0.05
    const haloX = window.x + normal.x * 0.09
    const haloZ = window.z + normal.z * 0.09
    const rotationY = window.rotationY ?? 0

    const paneMatrix = buildPlaneMatrix(
      paneX,
      window.y,
      paneZ,
      window.width * 1.08,
      window.height * 1.08,
      rotationY,
    )
    const haloMatrix = buildPlaneMatrix(
      haloX,
      window.y,
      haloZ,
      window.width * 1.5,
      window.height * 1.5,
      rotationY,
    )

    allHaloMatrices.push(haloMatrix)
    if (window.baseLit) {
      litPaneMatrices.push(paneMatrix)
      litHaloMatrices.push(haloMatrix)
    } else {
      darkPaneMatrices.push(paneMatrix)
    }
  }

  return {
    allHaloMatrices,
    litHaloMatrices,
    litPaneMatrices,
    darkPaneMatrices,
  }
}

function applyInstanceMatrices(mesh: THREE.InstancedMesh | null, matrices: THREE.Matrix4[]) {
  if (!mesh) {
    return
  }
  for (let index = 0; index < matrices.length; index += 1) {
    mesh.setMatrixAt(index, matrices[index])
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

function truncateMessage(value: string, limit = 140): string {
  if (value.length <= limit) {
    return value
  }
  return value.slice(0, limit - 1).trimEnd() + '…'
}

function CityBuildingComponent({
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
  heightMultiplier = 0.88,
  growthRateMultiplier = 0.92,
  unlockTier = 0,
  clusterMaturity = 0,
  departmentMaturity = 0,
  onClick,
  timeTheme = 'day',
  lowPower = false,
}: CityBuildingProps) {
  const isNight = timeTheme === 'night'
  const bodyRef  = useRef<THREE.Mesh>(null)
  const windowsGroupRef = useRef<THREE.Group>(null)
  const litPaneRef = useRef<THREE.InstancedMesh>(null)
  const darkPaneRef = useRef<THREE.InstancedMesh>(null)
  const litHaloRef = useRef<THREE.InstancedMesh>(null)
  const allHaloRef = useRef<THREE.InstancedMesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const antRef   = useRef<THREE.Mesh>(null)
  const effectiveHeightMultiplier =
    status === 'running' || status === 'completed'
      ? heightMultiplier
      : THREE.MathUtils.lerp(0.96, heightMultiplier, 0.35)
  const target = (STATUS_HEIGHT[status] ?? 1.4) * effectiveHeightMultiplier
  const heightRef = useRef(target)

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
  const windowRevealRatio = useMemo(() => {
    const tierRatio = WINDOW_REVEAL_BY_TIER[unlockTier]
    const revealed = Math.min(
      1,
      tierRatio +
        departmentMaturity * WINDOW_REVEAL_MATURITY_WEIGHTS.department +
        clusterMaturity * WINDOW_REVEAL_MATURITY_WEIGHTS.cluster,
    )
    return lowPower ? Math.max(0.44, revealed * LOW_POWER_BUILDING_TUNING.windowRevealScale) : revealed
  }, [clusterMaturity, departmentMaturity, lowPower, unlockTier])
  const visibleWindows = useMemo(() => {
    return selectVisibleWindows(windows, windowRevealRatio, seed)
  }, [seed, windowRevealRatio, windows])
  const windowGlowColor = useMemo(
    () => col.clone().lerp(new THREE.Color('#f8fafc'), isNight ? 0.32 : 0.46),
    [col, isNight],
  )
  const windowHaloColor = useMemo(
    () => col.clone().lerp(new THREE.Color('#ffffff'), isNight ? 0.54 : 0.68),
    [col, isNight],
  )
  const litPaneMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: windowGlowColor,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [windowGlowColor])
  const darkPaneMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: windowGlowColor,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [windowGlowColor])
  const litHaloMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: windowHaloColor,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [windowHaloColor])
  const allHaloMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: windowHaloColor,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [windowHaloColor])
  const windowInstances = useMemo(() => buildWindowInstances(visibleWindows), [visibleWindows])
  const glowIntensityFactor =
    GLOW_INTENSITY_BY_TIER[unlockTier] *
    (GLOW_INTENSITY_DEPARTMENT_WEIGHT.base + departmentMaturity * GLOW_INTENSITY_DEPARTMENT_WEIGHT.maturity)

  const idleCoreLightIntensity =
    (isNight ? IDLE_CORE_LIGHT_INTENSITY.night : IDLE_CORE_LIGHT_INTENSITY.day) *
    (lowPower ? LOW_POWER_BUILDING_TUNING.idleLightScale : 1)
  const inactiveAntennaIntensity = isNight ? INACTIVE_ANTENNA_INTENSITY.night : INACTIVE_ANTENNA_INTENSITY.day
  const showCoreLight = !isDimmed && (isActive || isSelected || (!lowPower && isNight))
  const showGlowLight = !isDimmed && (isSelected || (unlockTier >= 1 && isActive))

  const syncHeightTransforms = (height: number) => {
    if (bodyRef.current) {
      bodyRef.current.scale.y = height
      bodyRef.current.position.y = height / 2
    }
    if (windowsGroupRef.current) {
      windowsGroupRef.current.scale.y = height
      windowsGroupRef.current.position.y = height / 2
    }
    if (lightRef.current) {
      lightRef.current.position.y = height + 1.5
    }
    if (antRef.current) {
      antRef.current.position.y = height + 0.55
    }
  }

  useLayoutEffect(() => {
    syncHeightTransforms(heightRef.current)
  }, [])

  useEffect(() => {
    if (windowsGroupRef.current) {
      windowsGroupRef.current.visible = !isSelected
    }
  }, [isSelected])

  useEffect(() => {
    litPaneMat.opacity = isSelected
      ? 0
      : isDimmed
        ? 0.16
        : isActive
          ? (isNight ? 1 : 0.94)
          : (isNight ? 0.62 : 0.5)
    darkPaneMat.opacity = isSelected
      ? 0
      : isDimmed
        ? 0.16
        : (isNight ? 0.14 : 0.09)
    litHaloMat.opacity = isSelected
      ? 0
      : isDimmed
        ? 0
        : isActive
          ? (isNight ? 0.34 : 0.24) * (lowPower ? LOW_POWER_BUILDING_TUNING.haloOpacityScale : 1)
          : (isNight ? 0.14 : 0.08) * (lowPower ? LOW_POWER_BUILDING_TUNING.haloOpacityScale : 1)
    allHaloMat.opacity = (isSelected ? 0 : isDimmed ? 0.04 : 0) * (lowPower ? LOW_POWER_BUILDING_TUNING.haloOpacityScale : 1)
  }, [allHaloMat, darkPaneMat, isActive, isDimmed, isNight, isSelected, litHaloMat, litPaneMat, lowPower])

  useEffect(() => {
    applyInstanceMatrices(litPaneRef.current, windowInstances.litPaneMatrices)
    applyInstanceMatrices(darkPaneRef.current, windowInstances.darkPaneMatrices)
    applyInstanceMatrices(litHaloRef.current, windowInstances.litHaloMatrices)
    applyInstanceMatrices(allHaloRef.current, windowInstances.allHaloMatrices)
  }, [windowInstances])

  useFrame((state, delta) => {
    if (!bodyRef.current) return
    const targetGlassOpacity = isSelected ? 0.08 : (isDimmed ? 0.25 : 1.0)
    const targetFrameOpacity = isDimmed ? 0.2 : 1.0
    const needsHeightTween = Math.abs(heightRef.current - target) > 0.01
    const needsOpacityTween =
      Math.abs(glassMat.opacity - targetGlassOpacity) > 0.01 ||
      Math.abs(frameMat.opacity - targetFrameOpacity) > 0.01
    const needsPulse = isActive && !isDimmed

    if (!needsHeightTween && !needsOpacityTween && !needsPulse) {
      return
    }

    if (needsHeightTween) {
      heightRef.current = THREE.MathUtils.lerp(
        heightRef.current,
        target,
        delta *
          (TWEEN_SPEEDS.height *
            growthRateMultiplier *
            (lowPower ? LOW_POWER_BUILDING_TUNING.heightTweenScale : 1)),
      )
      syncHeightTransforms(heightRef.current)
    }

    if (needsOpacityTween) {
      glassMat.opacity = THREE.MathUtils.lerp(
        glassMat.opacity,
        targetGlassOpacity,
        delta * TWEEN_SPEEDS.opacity * (lowPower ? LOW_POWER_BUILDING_TUNING.opacityTweenScale : 1),
      )
      frameMat.opacity = THREE.MathUtils.lerp(
        frameMat.opacity,
        targetFrameOpacity,
        delta * TWEEN_SPEEDS.opacity * (lowPower ? LOW_POWER_BUILDING_TUNING.opacityTweenScale : 1),
      )
    }

    if (needsPulse) {
      const t = state.clock.getElapsedTime()
      const pulseSpeed = lowPower ? LOW_POWER_BUILDING_TUNING.pulseSpeedScale : 1
      const pulseAmplitude = lowPower ? LOW_POWER_BUILDING_TUNING.pulseAmplitudeScale : 1
      if (lightRef.current) {
        const baseIntensity = (isNight ? 3.4 : 2.5) * (lowPower ? LOW_POWER_BUILDING_TUNING.glowLightScale : 1)
        lightRef.current.intensity = baseIntensity + Math.sin(t * 1.8 * pulseSpeed) * 0.8 * pulseAmplitude
      }
      if (antRef.current) {
        const mat = antRef.current.material as THREE.MeshStandardMaterial
        const antennaFloor = isNight ? 0.9 : 0.5
        const antennaCeiling = isNight ? 4.2 : 3
        if (lowPower) {
          const easedPulse = (Math.sin(t * 1.5) + 1) / 2
          mat.emissiveIntensity =
            antennaFloor +
            (antennaCeiling - antennaFloor) * easedPulse * LOW_POWER_BUILDING_TUNING.antennaPulseScale
        } else {
          mat.emissiveIntensity = Math.sin(t * 3) > 0.5 ? antennaCeiling : antennaFloor
        }
        mat.opacity = 1.0
        mat.transparent = true
      }
    } else if (antRef.current) {
      const mat = antRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = inactiveAntennaIntensity
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
        {windowInstances.allHaloMatrices.length > 0 && (
          <instancedMesh ref={allHaloRef} args={[undefined, undefined, windowInstances.allHaloMatrices.length]} renderOrder={1}>
            <planeGeometry args={[1, 1]} />
            <primitive object={allHaloMat} attach="material" />
          </instancedMesh>
        )}
        {windowInstances.litHaloMatrices.length > 0 && (
          <instancedMesh ref={litHaloRef} args={[undefined, undefined, windowInstances.litHaloMatrices.length]} renderOrder={1}>
            <planeGeometry args={[1, 1]} />
            <primitive object={litHaloMat} attach="material" />
          </instancedMesh>
        )}
        {windowInstances.darkPaneMatrices.length > 0 && (
          <instancedMesh ref={darkPaneRef} args={[undefined, undefined, windowInstances.darkPaneMatrices.length]} renderOrder={2}>
            <planeGeometry args={[1, 1]} />
            <primitive object={darkPaneMat} attach="material" />
          </instancedMesh>
        )}
        {windowInstances.litPaneMatrices.length > 0 && (
          <instancedMesh ref={litPaneRef} args={[undefined, undefined, windowInstances.litPaneMatrices.length]} renderOrder={2}>
            <planeGeometry args={[1, 1]} />
            <primitive object={litPaneMat} attach="material" />
          </instancedMesh>
        )}
      </group>

      {/* Interior Drill-down Content */}
      {isSelected && (
        <group position={[0, 0, 0]}>
          <DepartmentInterior buildingId={buildingId} color={color} />
        </group>
      )}
      
      {/* Internal core light for glass illumination */}
      {showCoreLight && (
        <pointLight
          position={[0, target / 2, 0]}
          distance={lowPower ? 3.1 : 4}
        intensity={
          isSelected
            ? (lowPower ? 0.38 : 0.5)
            : isActive
              ? (isNight ? 2.6 : 2) * glowIntensityFactor * (lowPower ? LOW_POWER_BUILDING_TUNING.glowLightScale : 1)
              : idleCoreLightIntensity
        }
        color={color}
      />
      )}

      {/* Antenna */}
      {unlockTier >= 1 && (
        <mesh ref={antRef} position={[0, target + 0.55, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
          <meshStandardMaterial color={color} emissive={col} emissiveIntensity={isActive && !isDimmed ? 2.5 : 0.1} />
        </mesh>
      )}

      {/* Antenna tip */}
      {unlockTier >= 2 && isActive && !isDimmed && (
        <mesh position={[0, target + 1.15, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color={color} emissive={col} emissiveIntensity={4} />
        </mesh>
      )}

      {/* Glow light */}
      {showGlowLight && (
        <pointLight
          ref={lightRef}
          color={color}
          intensity={
            isActive && !isSelected
              ? 2.5 * glowIntensityFactor * (lowPower ? LOW_POWER_BUILDING_TUNING.glowLightScale : 1)
              : idleCoreLightIntensity
          }
          distance={lowPower ? 6.2 : 9}
          position={[0, target + 1.5, 0]}
        />
      )}

      {/* Ground halo */}
      {unlockTier >= 2 && isActive && !isDimmed && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[1.2, 2.2, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={(0.06 + clusterMaturity * 0.04) * (lowPower ? LOW_POWER_BUILDING_TUNING.haloOpacityScale : 1)}
            side={THREE.FrontSide}
          />
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

function areCityBuildingPropsEqual(prev: CityBuildingProps, next: CityBuildingProps) {
  return (
    prev.buildingId === next.buildingId &&
    prev.position[0] === next.position[0] &&
    prev.position[1] === next.position[1] &&
    prev.position[2] === next.position[2] &&
    prev.color === next.color &&
    prev.isActive === next.isActive &&
    prev.status === next.status &&
    prev.label === next.label &&
    prev.summary === next.summary &&
    prev.shape === next.shape &&
    prev.isSelected === next.isSelected &&
    prev.isDimmed === next.isDimmed &&
    prev.heightMultiplier === next.heightMultiplier &&
    prev.growthRateMultiplier === next.growthRateMultiplier &&
    prev.unlockTier === next.unlockTier &&
    prev.clusterMaturity === next.clusterMaturity &&
    prev.departmentMaturity === next.departmentMaturity &&
    prev.timeTheme === next.timeTheme &&
    prev.lowPower === next.lowPower &&
    prev.event?.event_id === next.event?.event_id &&
    prev.event?.status === next.event?.status &&
    prev.event?.message === next.event?.message &&
    prev.event?.is_live === next.event?.is_live &&
    prev.event?.timestamp === next.event?.timestamp
  )
}

export const CityBuilding = memo(CityBuildingComponent, areCityBuildingPropsEqual)
