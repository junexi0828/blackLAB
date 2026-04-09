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
}

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

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

  // Use curve to generate smooth flowing path for highly active links
  const pts = useMemo(() => {
    if (points.length >= 3) {
      const curve = new THREE.CatmullRomCurve3(points)
      return curve.getPoints(32).map((p) => [p.x, p.y, p.z] as [number, number, number])
    }
    return points.map((p) => [p.x, p.y, p.z] as [number, number, number])
  }, [points])

  useFrame((_, delta) => {
    if (isDashed && lineRef.current?.material) {
      // Flow backwards so it looks like it's moving from source to dest
      const material = lineRef.current.material as THREE.ShaderMaterial & { dashOffset?: number }
      material.dashOffset = (material.dashOffset ?? 0) - delta * 3.5
    }
  })

  return (
    <Line
      ref={lineRef}
      points={pts}
      color={color}
      transparent
      opacity={opacity}
      lineWidth={isDashed ? 3.5 : 1.5}
      dashed={isDashed}
      dashSize={0.8}
      gapSize={1.5}
      blending={THREE.NormalBlending}
      depthWrite={false}
      toneMapped={true}
    />
  )
}

export function DataBeams({ steps, positions, colors, activeDepts, hasActiveRun }: DataBeamsProps) {
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
          opacity: 0.8,
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
          color: new THREE.Color('#94a3b8'), // Light slate gray for bright background
          opacity: 0.25,
          isDashed: false,
        })
      }
    }

    return result
  }, [steps, positions, colors, activeDepts, hasActiveRun])

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
