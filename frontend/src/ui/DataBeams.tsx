import { memo, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { CompanyConfig, DepartmentConfig, StepRecord } from '../types'
import { getDepartmentOrganizationSpec } from '../config/organizationModel'

interface DataBeamsProps {
  steps: StepRecord[]
  positions: Record<string, [number, number, number]>
  colors: Record<string, string>
  activeDepts: Set<string>
  hasActiveRun: boolean
  timeTheme?: 'day' | 'night'
  workflowConfig?: CompanyConfig | null
}

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::')
}

type BeamStyle = {
  coreWidth: number
  auraWidth: number
  coreOpacityScale: number
  auraOpacityScale: number
}

function buildWorkflowDepartments(config: CompanyConfig | null | undefined): DepartmentConfig[] {
  if (!config) {
    return []
  }
  const reviewKeys = config.review_departments.map((department) => department.key)
  const departments = [...config.departments, ...config.review_departments]
  if (config.enable_final_review) {
    departments.push({
      key: 'board_review',
      label: config.final_review_label,
      purpose: 'Synthesize all department outputs into one operator briefing.',
      output_title: config.final_review_output_title,
      temperature: 0.1,
      runtime_tier: 'review',
      resource_lane: 'review',
      priority: 40,
      depends_on: reviewKeys,
      requires_all_completed: reviewKeys.length === 0,
    })
  }
  return departments
}

function buildDependencyMap(keys: string[], config: CompanyConfig | null | undefined) {
  const keySet = new Set(keys)
  const workflowDepartments = buildWorkflowDepartments(config)
  const workflowMap = new Map(workflowDepartments.map((department) => [department.key, department]))
  const executableKeys = new Set(workflowDepartments.map((department) => department.key).filter((key) => keySet.has(key)))
  const dependencyMap = new Map<string, string[]>()

  const resolveExecutableAncestor = (key: string | null) => {
    let currentKey = key
    const visited = new Set<string>()

    while (currentKey && !visited.has(currentKey)) {
      visited.add(currentKey)
      if (executableKeys.has(currentKey)) {
        return currentKey
      }
      currentKey = getDepartmentOrganizationSpec(currentKey).reportsToKey
    }

    return null
  }

  for (const key of keySet) {
    const configured = workflowMap.get(key)
    const explicitDeps = (configured?.depends_on ?? []).filter((dependency) => keySet.has(dependency))
    if (explicitDeps.length > 0) {
      dependencyMap.set(key, explicitDeps)
      continue
    }
    const spec = getDepartmentOrganizationSpec(key)
    const resolvedParent = resolveExecutableAncestor(spec.reportsToKey)
    dependencyMap.set(
      key,
      resolvedParent ? [resolvedParent] : [],
    )
  }

  return dependencyMap
}

function buildPassiveBackboneLinks(keys: string[], config: CompanyConfig | null | undefined) {
  const keySet = new Set(keys)
  const workflowMap = new Map(buildWorkflowDepartments(config).map((department) => [department.key, department]))
  const links = new Map<string, [string, string]>()

  for (const key of keySet) {
    const spec = getDepartmentOrganizationSpec(key)
    const configured = workflowMap.get(key)
    const parentKey = spec.reportsToKey ?? configured?.depends_on?.[0] ?? null
    if (!parentKey || !keySet.has(parentKey) || parentKey === key) {
      continue
    }
    links.set(pairKey(key, parentKey), [parentKey, key])
  }

  return [...links.values()]
}

function resolveBackboneStyle(fromKey: string, toKey: string): BeamStyle {
  const fromDivision = getDepartmentOrganizationSpec(fromKey).divisionKey
  const toDivision = getDepartmentOrganizationSpec(toKey).divisionKey
  const sameDivision = fromDivision === toDivision

  if (sameDivision) {
    switch (fromDivision) {
      case 'research_engineering':
        return { coreWidth: 1.25, auraWidth: 3.1, coreOpacityScale: 1, auraOpacityScale: 0.76 }
      case 'quality_testing':
        return { coreWidth: 1.18, auraWidth: 2.9, coreOpacityScale: 0.94, auraOpacityScale: 0.7 }
      case 'product_design':
        return { coreWidth: 1.12, auraWidth: 2.7, coreOpacityScale: 0.9, auraOpacityScale: 0.66 }
      case 'headquarters':
        return { coreWidth: 1.02, auraWidth: 2.45, coreOpacityScale: 0.84, auraOpacityScale: 0.58 }
      case 'growth_marketing':
      default:
        return { coreWidth: 1.06, auraWidth: 2.55, coreOpacityScale: 0.86, auraOpacityScale: 0.6 }
    }
  }

  return { coreWidth: 0.96, auraWidth: 2.25, coreOpacityScale: 0.74, auraOpacityScale: 0.5 }
}

const VECTOR_A = new THREE.Vector3()
const VECTOR_B = new THREE.Vector3()
const NEUTRAL_CORE = new THREE.Color('#f8fbff')
const NEUTRAL_AURA = new THREE.Color('#dbeafe')

const AnimatedBeam = memo(function AnimatedBeam({
  points,
  color,
  opacity,
}: {
  points: THREE.Vector3[]
  color: THREE.Color
  opacity: number
}) {
  const glintRefs = useRef<THREE.Mesh[]>([])

  const samples = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points)
    const sampleCount = points.length >= 3 ? 24 : 2
    const positions = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const progress = index / sampleCount
      return curve.getPointAt(progress)
    })
    const tangents = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const progress = index / sampleCount
      return curve.getTangentAt(progress).normalize()
    })
    return {
      linePoints: positions.map((point) => [point.x, point.y, point.z] as [number, number, number]),
      positions,
      tangents,
      sampleCount,
    }
  }, [points])
  const coreColor = useMemo(() => color.clone().lerp(NEUTRAL_CORE, 0.36), [color])
  const auraColor = useMemo(() => color.clone().lerp(NEUTRAL_AURA, 0.52), [color])

  useFrame((_, delta) => {
    const elapsed = performance.now() * 0.001
    glintRefs.current.forEach((mesh, index) => {
      if (!mesh) return
      const loop = (elapsed * 0.085 + index * 0.48) % 1
      const sampleIndex = loop * samples.sampleCount
      const lowerIndex = Math.floor(sampleIndex)
      const upperIndex = Math.min(samples.sampleCount, lowerIndex + 1)
      const alpha = sampleIndex - lowerIndex
      mesh.position.lerpVectors(samples.positions[lowerIndex], samples.positions[upperIndex], alpha)
      const bloom = Math.pow(Math.sin(loop * Math.PI), 1.8)
      const material = mesh.material as THREE.MeshBasicMaterial
      material.opacity = 0.06 + bloom * opacity * 1.8
      mesh.scale.setScalar(0.45 + bloom * 1.15)
      VECTOR_A.copy(samples.tangents[lowerIndex])
      VECTOR_B.copy(samples.tangents[upperIndex])
      const drift = VECTOR_A.lerp(VECTOR_B, alpha).normalize()
      mesh.position.x += drift.x * delta * 0.08
      mesh.position.z += drift.z * delta * 0.08
    })
  })

  return (
    <group>
      <Line
        points={samples.linePoints}
        color={auraColor}
        transparent
        opacity={opacity * 0.34}
        lineWidth={4.6}
        dashed={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
      <Line
        points={samples.linePoints}
        color={coreColor}
        transparent
        opacity={opacity}
        lineWidth={1.65}
        dashed={false}
        blending={THREE.NormalBlending}
        depthWrite={false}
        toneMapped
      />
      {Array.from({ length: 2 }).map((_, index) => (
        <mesh
          key={`glint-${index}`}
          ref={(node) => {
            if (node) {
              glintRefs.current[index] = node
            }
          }}
        >
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshBasicMaterial
            color={coreColor}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
})

const StaticBeam = memo(function StaticBeam({
  points,
  color,
  opacity,
  style,
}: {
  points: THREE.Vector3[]
  color: THREE.Color
  opacity: number
  style?: BeamStyle
}) {
  const linePoints = useMemo(
    () => points.map((point) => [point.x, point.y, point.z] as [number, number, number]),
    [points],
  )
  const beamStyle = style ?? { coreWidth: 0.9, auraWidth: 2.2, coreOpacityScale: 0.45, auraOpacityScale: 0.55 }

  return (
    <group>
      <Line
        points={linePoints}
        color={color}
        transparent
        opacity={opacity * beamStyle.auraOpacityScale}
        lineWidth={beamStyle.auraWidth}
        dashed={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
      <Line
        points={linePoints}
        color={NEUTRAL_CORE}
        transparent
        opacity={opacity * beamStyle.coreOpacityScale}
        lineWidth={beamStyle.coreWidth}
        dashed={false}
        blending={THREE.NormalBlending}
        depthWrite={false}
        toneMapped
      />
    </group>
  )
})

export const DataBeams = memo(function DataBeams({
  steps,
  positions,
  colors,
  activeDepts,
  hasActiveRun,
  timeTheme = 'day',
  workflowConfig = null,
}: DataBeamsProps) {
  const isNight = timeTheme === 'night'
  const beams = useMemo(() => {
    const result: {
      key: string
      points: THREE.Vector3[]
      color: THREE.Color
      opacity: number
      isDashed: boolean
      style?: BeamStyle
    }[] = []
    const reservedPairs = new Set<string>()
    const dependencyMap = buildDependencyMap(Object.keys(positions), workflowConfig)

    const completed = steps.filter((s) => s.status === 'completed')
    const completedByKey = new Map(completed.map((step) => [step.department_key, step]))
    const active = hasActiveRun
      ? steps.filter(
          (s) => s.status === 'running' || activeDepts.has(s.department_key),
        )
      : []

    // Flow follows configured workflow dependencies first, with at most two upstreams for clarity.
    for (const act of active) {
      const dependencyKeys = dependencyMap.get(act.department_key) ?? []
      const fromCandidates = dependencyKeys
        .map((key) => completedByKey.get(key))
        .filter((step): step is StepRecord => Boolean(step))
        .sort((left, right) => {
          const leftTime = new Date(left.completed_at ?? left.started_at ?? 0).getTime()
          const rightTime = new Date(right.completed_at ?? right.started_at ?? 0).getTime()
          return rightTime - leftTime
        })
        .slice(0, 2)

      if (fromCandidates.length === 0) {
        continue
      }

      for (const from of fromCandidates) {
        const p0 = positions[from.department_key]
        const p1 = positions[act.department_key]
        if (!p0 || !p1 || from.department_key === act.department_key) continue
        reservedPairs.add(pairKey(from.department_key, act.department_key))

        const fromColor = new THREE.Color(colors[from.department_key] ?? '#cbd5e1')
        const toColor = new THREE.Color(colors[act.department_key] ?? '#ffffff')
        const beamColor = fromColor.clone().lerp(toColor, 0.58).lerp(NEUTRAL_CORE, isNight ? 0.18 : 0.28)
        const spanX = p1[0] - p0[0]
        const spanZ = p1[2] - p0[2]
        const distance = Math.hypot(spanX, spanZ)
        const archSeed = from.department_key.length * 17 + act.department_key.length * 29
        const bend = (seeded(archSeed + 7) - 0.5) * Math.min(1.1, distance * 0.035)
        const mid: [number, number, number] = [
          (p0[0] + p1[0]) / 2 + spanZ * bend,
          4.4 + Math.min(2.8, distance * 0.16) + seeded(archSeed) * 0.85,
          (p0[2] + p1[2]) / 2 - spanX * bend,
        ]
        result.push({
          key: `${from.department_key}->${act.department_key}`,
          points: [
            new THREE.Vector3(p0[0], 2.5, p0[2]),
            new THREE.Vector3(...mid),
            new THREE.Vector3(p1[0], 2.5, p1[2]),
          ],
          color: beamColor,
          opacity: isNight ? 0.34 : 0.24,
          isDashed: true,
        })
      }
    }

    // Passive backbone comes from the organization/workflow graph, not from a hand-made list.
    for (const [fromKey, toKey] of buildPassiveBackboneLinks(Object.keys(positions), workflowConfig)) {
      const from = positions[fromKey]
      const to = positions[toKey]
      if (!from || !to) continue
      reservedPairs.add(pairKey(fromKey, toKey))
      const fromColor = new THREE.Color(colors[fromKey] ?? '#cbd5e1')
      const toColor = new THREE.Color(colors[toKey] ?? '#e2e8f0')
      const backboneColor = fromColor.clone().lerp(toColor, 0.5).lerp(NEUTRAL_CORE, isNight ? 0.46 : 0.62)
        result.push({
          key: `cluster-${fromKey}-${toKey}`,
          points: [
            new THREE.Vector3(from[0], 0.38, from[2]),
            new THREE.Vector3(to[0], 0.38, to[2]),
          ],
          color: backboneColor,
          opacity: isNight ? 0.26 : 0.15,
          isDashed: false,
          style: resolveBackboneStyle(fromKey, toKey),
        })
      }

    // Static nearby grid network for local adjacency.
    const keys = Object.keys(positions)
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = positions[keys[i]]
        const b = positions[keys[j]]
        if (!a || !b) continue
        if (reservedPairs.has(pairKey(keys[i], keys[j]))) continue
        const dist = Math.hypot(a[0] - b[0], a[2] - b[2])
        if (dist > 7) continue // only nearby buildings

        const midY = 0.3
        result.push({
          key: `grid-${keys[i]}-${keys[j]}`,
          points: [
            new THREE.Vector3(a[0], midY, a[2]),
            new THREE.Vector3(b[0], midY, b[2]),
          ],
          color: new THREE.Color(isNight ? '#5f86a9' : '#aab7c8'),
          opacity: isNight ? 0.18 : 0.1,
          isDashed: false,
          style: { coreWidth: 0.82, auraWidth: 1.9, coreOpacityScale: 0.42, auraOpacityScale: 0.42 },
        })
      }
    }

    return result
  }, [steps, positions, colors, activeDepts, hasActiveRun, isNight, workflowConfig])

  return (
    <>
      {beams.map((beam) =>
        beam.isDashed ? (
          <AnimatedBeam
            key={beam.key}
            points={beam.points}
            color={beam.color}
            opacity={beam.opacity}
          />
        ) : (
          <StaticBeam
            key={beam.key}
            points={beam.points}
            color={beam.color}
            opacity={beam.opacity}
            style={beam.style}
          />
        ),
      )}
    </>
  )
})
