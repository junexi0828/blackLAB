import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2, LineSegments2 } from 'three-stdlib'
import type { StepRecord } from '../types'

interface DataBeamsProps {
  steps: StepRecord[]
  positions: Record<string, [number, number, number]>
  colors: Record<string, string>
  activeDepts: Set<string>
  hasActiveRun: boolean
  timeTheme?: 'day' | 'night'
}

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

const FORWARD_VECTOR = new THREE.Vector3(0, 0, 1)

// A performant individual beam component to animate flows using dashOffset
function AnimatedBeam({
  points,
  color,
  opacity,
  isDashed,
}: {
  points: THREE.Vector3[]
  color: THREE.Color
  opacity: number
  isDashed: boolean
}) {
  const lineRef = useRef<Line2 | LineSegments2 | null>(null)
  const pulseRefs = useRef<THREE.Mesh[]>([])
  const pulseCount = 4

  // Use curve to generate smooth flowing path for highly active links
  const curve = useMemo(() => {
    if (points.length >= 3) {
      return new THREE.CatmullRomCurve3(points)
    }
    return new THREE.CatmullRomCurve3(points)
  }, [points])

  const pts = useMemo(
    () => curve.getPoints(points.length >= 3 ? 32 : 2).map((p) => [p.x, p.y, p.z] as [number, number, number]),
    [curve, points.length],
  )

  useFrame((_, delta) => {
    if (isDashed && lineRef.current?.material) {
      // Flow backwards so it looks like it's moving from source to dest
      const material = lineRef.current.material as THREE.ShaderMaterial & { dashOffset?: number }
      material.dashOffset = (material.dashOffset ?? 0) - delta * 1.6
    }

    if (isDashed) {
      const elapsed = performance.now() * 0.001
      pulseRefs.current.forEach((mesh, index) => {
        if (!mesh) return
        const progress = ((elapsed * 0.22) - index * 0.11 + 1) % 1
        const position = curve.getPointAt(progress)
        const tangent = curve.getTangentAt(progress).normalize()
        mesh.position.copy(position)
        mesh.quaternion.setFromUnitVectors(FORWARD_VECTOR, tangent)
        const material = mesh.material as THREE.MeshStandardMaterial
        const intensity = Math.max(0.35, 1 - index * 0.16)
        material.opacity = 0.28 + intensity * 0.6
        material.emissiveIntensity = 1.4 + intensity * 3.2
      })
    }
  })

  return (
    <group>
      <Line
        ref={lineRef}
        points={pts}
        color={color}
        transparent
        opacity={opacity}
        lineWidth={isDashed ? 2.6 : 1.4}
        dashed={isDashed}
        dashSize={0.52}
        gapSize={1.15}
        blending={THREE.NormalBlending}
        depthWrite={false}
        toneMapped={true}
      />
      {isDashed &&
        Array.from({ length: pulseCount }).map((_, index) => (
          <mesh
            key={`pulse-${index}`}
            ref={(node) => {
              if (node) {
                pulseRefs.current[index] = node
              }
            }}
          >
            <capsuleGeometry args={[0.07, 0.48, 4, 8]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={2.6}
              transparent
              opacity={0.8}
              toneMapped={false}
            />
          </mesh>
        ))}
    </group>
  )
}

export function DataBeams({
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

        // Arching mid point for dynamic organic path
        const archSeed = from.department_key.length * 17 + act.department_key.length * 29
        const mid: [number, number, number] = [
          (p0[0] + p1[0]) / 2,
          7 + seeded(archSeed) * 2,
          (p0[2] + p1[2]) / 2,
        ]
        result.push({
          key: `${from.department_key}->${act.department_key}`,
          points: [
            new THREE.Vector3(p0[0], 2.5, p0[2]),
            new THREE.Vector3(...mid),
            new THREE.Vector3(p1[0], 2.5, p1[2]),
          ],
          color: new THREE.Color(colors[act.department_key] ?? '#ffffff'),
          opacity: isNight ? 0.42 : 0.34,
          isDashed: true, // Animates!
        })
      }
    }

    // Static underlying grid network
    const keys = Object.keys(positions)
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = positions[keys[i]]
        const b = positions[keys[j]]
        if (!a || !b) continue
        const dist = Math.hypot(a[0] - b[0], a[2] - b[2])
        if (dist > 7) continue // only nearby buildings

        const midY = 0.3
        result.push({
          key: `grid-${keys[i]}-${keys[j]}`,
          points: [
            new THREE.Vector3(a[0], midY, a[2]),
            new THREE.Vector3(b[0], midY, b[2]),
          ],
          color: new THREE.Color(isNight ? '#5d7fa6' : '#94a3b8'),
          opacity: isNight ? 0.22 : 0.14,
          isDashed: false,
        })
      }
    }

    return result
  }, [steps, positions, colors, activeDepts, hasActiveRun, isNight])

  return (
    <>
      {beams.map((beam) => (
        <AnimatedBeam
          key={beam.key}
          points={beam.points}
          color={beam.color}
          opacity={beam.opacity}
          isDashed={beam.isDashed}
        />
      ))}
    </>
  )
}
