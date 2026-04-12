import { memo, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { StepRecord } from '../types'

interface DataBeamsProps {
  steps: StepRecord[]
  positions: Record<string, [number, number, number]>
  colors: Record<string, string>
  activeDepts: Set<string>
  hasActiveRun: boolean
  timeTheme?: 'day' | 'night'
}

const PASSIVE_CLUSTER_LINKS = [
  ['ceo', 'finance'],
  ['ceo', 'board_review'],
  ['product', 'design'],
  ['research', 'engineering'],
  ['engineering', 'dev_1'],
  ['engineering', 'dev_2'],
  ['engineering', 'dev_3'],
  ['quality_gate', 'validation'],
  ['quality_gate', 'test_lab'],
] as const

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::')
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
}: {
  points: THREE.Vector3[]
  color: THREE.Color
  opacity: number
}) {
  const linePoints = useMemo(
    () => points.map((point) => [point.x, point.y, point.z] as [number, number, number]),
    [points],
  )

  return (
    <group>
      <Line
        points={linePoints}
        color={color}
        transparent
        opacity={opacity * 0.55}
        lineWidth={2.2}
        dashed={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
      <Line
        points={linePoints}
        color={NEUTRAL_CORE}
        transparent
        opacity={opacity * 0.45}
        lineWidth={0.9}
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
}: DataBeamsProps) {
  const isNight = timeTheme === 'night'
  const beams = useMemo(() => {
    const result: {
      key: string
      points: THREE.Vector3[]
      color: THREE.Color
      opacity: number
      isDashed: boolean
    }[] = []
    const reservedPairs = new Set<string>()

    const completed = steps.filter((s) => s.status === 'completed')
    const active = hasActiveRun
      ? steps.filter(
          (s) => s.status === 'running' || activeDepts.has(s.department_key),
        )
      : []

    // Connect last 2 completed → each active (Organic flow paths)
    for (const act of active) {
      const fromCandidates = completed.slice(-2)
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

    // Passive cluster backbone to reveal the designed org neighborhoods even when idle.
    for (const [fromKey, toKey] of PASSIVE_CLUSTER_LINKS) {
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
        })
      }
    }

    return result
  }, [steps, positions, colors, activeDepts, hasActiveRun, isNight])

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
          />
        ),
      )}
    </>
  )
})
