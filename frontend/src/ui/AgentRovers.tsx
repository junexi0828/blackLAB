import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StepRecord } from '../types'
import { ACTIVE_ROVERS_PER_DEPARTMENT } from './roverPersona'
import { SUPPORT_FACILITY_KEYS, getDepartmentOrganizationSpec, type RoverVisualArchetype } from '../config/organizationModel'
import type { ProjectMaturityTier } from './projectMaturity'

interface AgentRoversProps {
  positions: Record<string, [number, number, number]>
  activeDepts: Set<string>
  steps: StepRecord[]
  hasActiveRun: boolean
  selectedBuilding?: string | null
  speedMultiplier?: number
  unlockTier?: ProjectMaturityTier
  departmentMaturity?: Record<string, number>
}

const ROVER_COUNT = 60

type RoverMode = 'moving' | 'sleeping'
type HeadStyle = 'none' | 'cap' | 'halo' | 'antenna'

interface RoverStyle {
  shellColor: string
  outfitColor: string
  trimColor: string
  badgeColor: string
  accentColor: string
  visorColor: string
  bodyScale: [number, number, number]
  outfitScale: [number, number, number]
  scarfScale: [number, number, number]
  capeScale: [number, number, number]
  packScale: [number, number, number]
  accentScale: [number, number, number]
  headScale: [number, number, number]
  headStyle: HeadStyle
  badgeOffsetX: number
  badgeScale: [number, number, number]
  accentOffsetX: number
  packOffsetX: number
  scarfTilt: number
  capeTilt: number
  antennaLean: number
}

interface RoverDescriptor {
  deptKey: string
  mode: RoverMode
  from: THREE.Vector3
  to: THREE.Vector3
  home: THREE.Vector3
  initialProgress: number
  renderScale: [number, number, number]
  speed: number
  moveFirstAxis: 'x' | 'z'
  sleepPhase: number
  style: RoverStyle
}

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function scale3(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z]
}

function hiddenScale(): [number, number, number] {
  return [0.0001, 0.0001, 0.0001]
}

function dim(hex: string, factor: number) {
  const color = new THREE.Color(hex).multiplyScalar(factor)
  return `#${color.getHexString()}`
}

const ROVER_GEOMETRIES = {
  body: new THREE.BoxGeometry(0.5, 0.4, 0.4),
  outfit: new THREE.BoxGeometry(0.56, 0.28, 0.44),
  scarf: new THREE.BoxGeometry(0.62, 0.07, 0.5),
  cape: new THREE.BoxGeometry(0.34, 0.3, 0.05),
  pack: new THREE.BoxGeometry(0.18, 0.18, 0.1),
  badge: new THREE.BoxGeometry(0.09, 0.07, 0.02),
  accent: new THREE.BoxGeometry(0.08, 0.18, 0.02),
  visor: new THREE.BoxGeometry(0.31, 0.13, 0.02),
  eye: new THREE.SphereGeometry(0.016, 8, 8),
  cap: new THREE.CylinderGeometry(0.16, 0.22, 0.12, 12),
  halo: new THREE.TorusGeometry(0.17, 0.025, 8, 18),
  antenna: new THREE.CylinderGeometry(0.025, 0.03, 0.24, 8),
} as const

const shellMaterialCache = new Map<string, THREE.MeshPhysicalMaterial>()
const basicMaterialCache = new Map<string, THREE.MeshBasicMaterial>()

function getShellMaterial(color: string) {
  let material = shellMaterialCache.get(color)
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.32,
      metalness: 0.16,
      clearcoat: 0.48,
    })
    shellMaterialCache.set(color, material)
  }
  return material
}

function getBasicMaterial(color: string) {
  let material = basicMaterialCache.get(color)
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, toneMapped: false })
    basicMaterialCache.set(color, material)
  }
  return material
}

function hashKey(value: string) {
  let total = 0
  for (let i = 0; i < value.length; i++) {
    total = (total * 33 + value.charCodeAt(i)) % 100000
  }
  return total
}

function buildOffsetPosition(
  base: [number, number, number],
  seedA: number,
  seedB: number,
  radius = 1.8,
) {
  const angle = seeded(seedA) * Math.PI * 2
  const dist = radius * (0.55 + seeded(seedB) * 0.45)
  return new THREE.Vector3(
    base[0] + Math.cos(angle) * dist,
    0.2,
    base[2] + Math.sin(angle) * dist,
  )
}

function buildRoverStyle(
  archetype: RoverVisualArchetype,
  mode: RoverMode,
  seed: number,
  unlockTier: ProjectMaturityTier,
): RoverStyle {
  const style: RoverStyle = {
    shellColor: '#edf3fb',
    outfitColor: '#64748b',
    trimColor: '#f8fafc',
    badgeColor: '#ffffff',
    accentColor: '#94a3b8',
    visorColor: '#0f172a',
    bodyScale: scale3(
      0.98 + seeded(seed + 0.4) * 0.08,
      0.98 + seeded(seed + 1.1) * 0.08,
      0.96 + seeded(seed + 1.8) * 0.08,
    ),
    outfitScale: scale3(1.04, 1.0, 1.02),
    scarfScale: hiddenScale(),
    capeScale: hiddenScale(),
    packScale: hiddenScale(),
    accentScale: hiddenScale(),
    headScale: hiddenScale(),
    headStyle: 'none',
    badgeOffsetX: 0.11,
    badgeScale: scale3(1, 1, 1),
    accentOffsetX: 0,
    packOffsetX: 0.19,
    scarfTilt: 0,
    capeTilt: 0,
    antennaLean: 0,
  }

  if (archetype === 'executive_office') {
    style.outfitColor = '#1f2937'
    style.trimColor = '#f8fafc'
    style.badgeColor = '#fbbf24'
    style.accentColor = '#dc2626'
    style.visorColor = '#111827'
    style.outfitScale = scale3(1.08, 1.08, 1.02)
    style.accentScale = scale3(0.95, 1.14, 1)
    style.badgeOffsetX = 0.14
  } else if (archetype === 'corporate_finance') {
    style.outfitColor = '#1f2937'
    style.trimColor = '#cbd5e1'
    style.badgeColor = '#14b8a6'
    style.accentColor = '#f59e0b'
    style.visorColor = '#0f172a'
    style.outfitScale = scale3(1.08, 0.98, 1.02)
    style.accentScale = scale3(0.82, 1, 1)
    style.badgeOffsetX = 0.13
  } else if (archetype === 'research_lab') {
    style.shellColor = '#f7fbff'
    style.outfitColor = '#ffffff'
    style.trimColor = '#dbeafe'
    style.badgeColor = '#38bdf8'
    style.accentColor = '#93c5fd'
    style.visorColor = '#1d4ed8'
    style.outfitScale = scale3(1.16, 1.14, 1.08)
    style.accentScale = scale3(0.72, 0.86, 1)
    style.headStyle = 'halo'
    style.headScale = scale3(1.02, 1, 1.02)
  } else if (archetype === 'product_experience') {
    style.outfitColor = '#7c3aed'
    style.trimColor = '#f9a8d4'
    style.badgeColor = '#fb7185'
    style.accentColor = '#22c55e'
    style.visorColor = '#4c1d95'
    style.scarfScale = scale3(1.14, 1, 1.08)
    style.capeScale = scale3(1.02, 1.16, 1)
    style.headStyle = 'halo'
    style.headScale = scale3(1.08, 1, 1.08)
    style.scarfTilt = -0.06
    style.capeTilt = 0.04
  } else if (archetype === 'engineering') {
    style.outfitColor = '#ea580c'
    style.trimColor = '#fed7aa'
    style.badgeColor = '#67e8f9'
    style.accentColor = '#22c55e'
    style.visorColor = '#1f2937'
    style.packScale = scale3(1, 1.02, 1)
    style.headStyle = 'antenna'
    style.headScale = scale3(1, 1.08, 1)
    style.accentScale = scale3(0.88, 0.64, 1)
    style.antennaLean = -0.12
  } else if (archetype === 'quality_assurance') {
    style.outfitColor = '#84cc16'
    style.trimColor = '#ecfccb'
    style.badgeColor = '#facc15'
    style.accentColor = '#bef264'
    style.visorColor = '#365314'
    style.outfitScale = scale3(1.08, 0.96, 1.02)
    style.headStyle = 'halo'
    style.headScale = scale3(1.06, 1, 1.06)
    style.accentScale = scale3(1.08, 0.58, 1)
  } else if (archetype === 'growth_marketing') {
    style.outfitColor = '#f59e0b'
    style.trimColor = '#fde047'
    style.badgeColor = '#fb7185'
    style.accentColor = '#ef4444'
    style.visorColor = '#92400e'
    style.scarfScale = scale3(1.08, 1, 1.06)
    style.headStyle = 'cap'
    style.headScale = scale3(1, 1, 1)
    style.scarfTilt = 0.08
  }

  if (mode === 'sleeping') {
    style.shellColor = dim(style.shellColor, 0.82)
    style.outfitColor = dim(style.outfitColor, 0.84)
    style.trimColor = dim(style.trimColor, 0.9)
    style.badgeColor = dim(style.badgeColor, 0.9)
    style.accentColor = dim(style.accentColor, 0.88)
    style.visorColor = dim(style.visorColor, 0.9)
  }

  if (unlockTier === 0) {
    style.badgeScale = hiddenScale()
    style.accentScale = hiddenScale()
    style.packScale = hiddenScale()
    style.scarfScale = hiddenScale()
    style.capeScale = hiddenScale()
    style.headScale = hiddenScale()
    style.headStyle = 'none'
  } else if (unlockTier === 1) {
    style.accentScale = hiddenScale()
    style.packScale = hiddenScale()
    style.scarfScale = hiddenScale()
    style.capeScale = hiddenScale()
    style.headScale = hiddenScale()
    style.headStyle = 'none'
  } else if (unlockTier === 2) {
    style.capeScale = hiddenScale()
    style.headScale = hiddenScale()
    style.headStyle = 'none'
  } else if (unlockTier === 3) {
    style.capeScale = scale3(style.capeScale[0] * 0.88, style.capeScale[1] * 0.88, style.capeScale[2] * 0.88)
    style.headScale = scale3(style.headScale[0] * 0.94, style.headScale[1] * 0.94, style.headScale[2] * 0.94)
  }

  return style
}

function isVisible(scale: [number, number, number]) {
  return scale[0] > 0.001 || scale[1] > 0.001 || scale[2] > 0.001
}

const EYE_MATERIAL = getBasicMaterial('#ffffff')

const RoverMesh = memo(function RoverMesh({ rover }: { rover: RoverDescriptor }) {
  const style = rover.style
  const shellMaterial = getShellMaterial(style.shellColor)
  const outfitMaterial = getBasicMaterial(style.outfitColor)
  const trimMaterial = getBasicMaterial(style.trimColor)
  const badgeMaterial = getBasicMaterial(style.badgeColor)
  const accentMaterial = getBasicMaterial(style.accentColor)
  const visorMaterial = getBasicMaterial(style.visorColor)

  return (
    <group>
      <mesh castShadow receiveShadow geometry={ROVER_GEOMETRIES.body} material={shellMaterial} />

      <mesh castShadow receiveShadow geometry={ROVER_GEOMETRIES.outfit} material={outfitMaterial} position={[0, -0.01, 0]} scale={style.outfitScale} />

      {isVisible(style.scarfScale) && (
        <mesh
          castShadow
          receiveShadow
          geometry={ROVER_GEOMETRIES.scarf}
          material={trimMaterial}
          position={[0, 0.1, 0.02]}
          scale={style.scarfScale}
          rotation={[0, 0, style.scarfTilt]}
        />
      )}

      {isVisible(style.capeScale) && (
        <mesh
          castShadow
          receiveShadow
          geometry={ROVER_GEOMETRIES.cape}
          material={outfitMaterial}
          position={[0, -0.01, -0.23]}
          scale={style.capeScale}
          rotation={[0, style.capeTilt, 0]}
        />
      )}

      {isVisible(style.packScale) && (
        <mesh
          castShadow
          receiveShadow
          geometry={ROVER_GEOMETRIES.pack}
          material={trimMaterial}
          position={[style.packOffsetX, -0.02, -0.15]}
          scale={style.packScale}
        />
      )}

      {isVisible(style.badgeScale) && (
        <mesh
          geometry={ROVER_GEOMETRIES.badge}
          material={badgeMaterial}
          position={[style.badgeOffsetX, 0.02, 0.215]}
          scale={style.badgeScale}
        />
      )}

      {isVisible(style.accentScale) && (
        <mesh geometry={ROVER_GEOMETRIES.accent} material={accentMaterial} position={[style.accentOffsetX, -0.02, 0.215]} scale={style.accentScale} />
      )}

      <mesh geometry={ROVER_GEOMETRIES.visor} material={visorMaterial} position={[0, 0.08, 0.216]} />

      <mesh geometry={ROVER_GEOMETRIES.eye} material={EYE_MATERIAL} position={[-0.08, 0.08, 0.227]} />

      <mesh geometry={ROVER_GEOMETRIES.eye} material={EYE_MATERIAL} position={[0.08, 0.08, 0.227]} />

      {style.headStyle === 'cap' && (
        <mesh castShadow receiveShadow geometry={ROVER_GEOMETRIES.cap} material={trimMaterial} position={[0, 0.24, 0]} scale={style.headScale} />
      )}

      {style.headStyle === 'halo' && (
        <mesh geometry={ROVER_GEOMETRIES.halo} material={badgeMaterial} position={[0, 0.28, 0]} scale={style.headScale} rotation={[Math.PI / 2, 0, 0]} />
      )}

      {style.headStyle === 'antenna' && (
        <mesh
          geometry={ROVER_GEOMETRIES.antenna}
          material={trimMaterial}
          position={[0, 0.28, -0.02]}
          scale={style.headScale}
          rotation={[style.antennaLean, 0, 0]}
        />
      )}
    </group>
  )
})

export const AgentRovers = memo(function AgentRovers({
  positions,
  activeDepts,
  steps,
  hasActiveRun,
  selectedBuilding = null,
  speedMultiplier = 1,
  unlockTier = 0,
  departmentMaturity = {},
}: AgentRoversProps) {
  const groupRefs = useRef<Array<THREE.Group | null>>([])
  const progressRef = useRef<number[]>([])

  const rovers = useMemo(() => {
    const arr: RoverDescriptor[] = []
    const deptKeys = Object.keys(positions).filter(
      (key) => !SUPPORT_FACILITY_KEYS.includes(key as (typeof SUPPORT_FACILITY_KEYS)[number]),
    )
    if (deptKeys.length === 0) {
      return arr
    }

    const runningKeys = Array.from(
      new Set(
        steps
          .filter((step) => step.status === 'running' || activeDepts.has(step.department_key))
          .map((step) => step.department_key)
          .filter((key) => key in positions),
      ),
    )

    const scopedRunningKeys = selectedBuilding
      ? runningKeys.filter((key) => key === selectedBuilding)
      : runningKeys
    const activeRoversPerDepartment = [3, 4, 5, ACTIVE_ROVERS_PER_DEPARTMENT, ACTIVE_ROVERS_PER_DEPARTMENT][unlockTier]

    const movingCount = hasActiveRun
      ? Math.min(ROVER_COUNT, Math.max(0, scopedRunningKeys.length * activeRoversPerDepartment))
      : 0

    for (let i = 0; i < movingCount; i++) {
      const toKey = scopedRunningKeys[i % scopedRunningKeys.length]
      const choices = deptKeys.filter((key) => key !== toKey)
      const fromKey = choices[Math.floor(seeded(i * 4.13 + 1.9) * choices.length)] ?? toKey
      const styleSeed = i * 14.7 + hashKey(toKey) * 0.19 + hashKey(fromKey) * 0.07
      const archetype = getDepartmentOrganizationSpec(toKey).visualArchetype
      const style = buildRoverStyle(archetype, 'moving', styleSeed, unlockTier)
      const departmentSpeedFactor = 0.94 + (departmentMaturity[toKey] ?? 0) * 0.12

      arr.push({
        deptKey: toKey,
        mode: 'moving',
        from: buildOffsetPosition(positions[fromKey], i * 3.17 + 0.5, i * 9.77 + 1.1, 2.2),
        to: buildOffsetPosition(positions[toKey], i * 5.21 + 1.7, i * 7.03 + 2.4, 1.6),
        home: buildOffsetPosition(positions[toKey], i * 1.91 + 8.2, i * 6.51 + 0.4, 1.6),
        initialProgress: seeded(i * 5.5),
        renderScale: style.bodyScale,
        speed: (0.2 + seeded(i * 1.1 + 0.3) * 0.18) * speedMultiplier * departmentSpeedFactor,
        moveFirstAxis: seeded(i * 8.1) > 0.5 ? 'x' : 'z',
        sleepPhase: seeded(i * 11.3) * Math.PI * 2,
        style,
      })
    }

    for (let i = movingCount; i < ROVER_COUNT; i++) {
      const homeKey = deptKeys[(i - movingCount) % deptKeys.length]
      const styleSeed = i * 13.1 + hashKey(homeKey) * 0.17
      const archetype = getDepartmentOrganizationSpec(homeKey).visualArchetype

      const style = buildRoverStyle(archetype, 'sleeping', styleSeed, unlockTier)

      arr.push({
        deptKey: homeKey,
        mode: 'sleeping',
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        home: buildOffsetPosition(positions[homeKey], i * 2.71 + 4.4, i * 3.91 + 2.2, 2.1),
        initialProgress: 0,
        renderScale: scale3(style.bodyScale[0] * 1.01, style.bodyScale[1] * 0.82, style.bodyScale[2] * 1.04),
        speed: 0,
        moveFirstAxis: 'x',
        sleepPhase: seeded(i * 4.7 + 2.9) * Math.PI * 2,
        style,
      })
    }

    return arr
  }, [positions, activeDepts, steps, hasActiveRun, selectedBuilding, speedMultiplier, unlockTier, departmentMaturity])

  useEffect(() => {
    progressRef.current = rovers.map((rover) => rover.initialProgress)
    groupRefs.current = groupRefs.current.slice(0, rovers.length)
  }, [rovers])

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime()

    for (let i = 0; i < rovers.length; i++) {
      const rover = rovers[i]
      const group = groupRefs.current[i]
      if (!group) {
        continue
      }

      if (rover.mode === 'moving') {
        const nextProgress = (progressRef.current[i] ?? rover.initialProgress) + delta * rover.speed
        const progress = nextProgress > 1 ? 0 : nextProgress
        progressRef.current[i] = progress

        let curX: number
        let curZ: number
        const half = 0.5

        if (rover.moveFirstAxis === 'x') {
          if (progress < half) {
            const p = progress / half
            curX = THREE.MathUtils.lerp(rover.from.x, rover.to.x, p)
            curZ = rover.from.z
          } else {
            const p = (progress - half) / half
            curX = rover.to.x
            curZ = THREE.MathUtils.lerp(rover.from.z, rover.to.z, p)
          }
        } else {
          if (progress < half) {
            const p = progress / half
            curX = rover.from.x
            curZ = THREE.MathUtils.lerp(rover.from.z, rover.to.z, p)
          } else {
            const p = (progress - half) / half
            curX = THREE.MathUtils.lerp(rover.from.x, rover.to.x, p)
            curZ = rover.to.z
          }
        }

        const lift = 0.34 + Math.abs(Math.sin(progress * Math.PI * 10)) * 0.05
        const prevX = group.position.x
        const prevZ = group.position.z
        group.position.set(curX, lift, curZ)

        const dx = curX - prevX
        const dz = curZ - prevZ
        const rotY = Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001
          ? Math.atan2(dx, dz)
          : group.rotation.y

        group.rotation.set(0, rotY, Math.sin(progress * Math.PI * 8) * 0.04)
      } else {
        const breathe = Math.sin(elapsed * 1.25 + rover.sleepPhase)
        const sway = Math.sin(elapsed * 0.55 + rover.sleepPhase)

        group.position.set(
          rover.home.x,
          0.16 + breathe * 0.018,
          rover.home.z,
        )
        group.rotation.set(0.22 + breathe * 0.03, sway * 0.18, 0.08 + sway * 0.02)
      }
    }
  })

  return (
    <group>
      {rovers.map((rover, index) => (
        <group
          key={`${rover.deptKey}-${index}`}
          scale={rover.renderScale}
          ref={(node) => {
            groupRefs.current[index] = node
          }}
        >
          <RoverMesh rover={rover} />
        </group>
      ))}
    </group>
  )
})
