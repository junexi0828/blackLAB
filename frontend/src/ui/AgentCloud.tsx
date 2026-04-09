import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StepRecord } from '../types'

interface AgentCloudProps {
  positions: Record<string, [number, number, number]>
  activeDepts: Set<string>
  colors: Record<string, string>
  steps: StepRecord[]
}

const PARTICLE_COUNT = 480

// Seeded pseudo-random — deterministic, no Math.random in render
function seeded(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123
  return x - Math.floor(x)
}

export function AgentCloud({ positions, activeDepts, colors, steps }: AgentCloudProps) {
  const pointsRef = useRef<THREE.Points>(null)

  const stepStatusMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of steps) m[s.department_key] = s.status
    return m
  }, [steps])

  // All random values computed deterministically from seed — pure, safe in useMemo
  const { geometry, velRef } = useMemo(() => {
    const posArr = new Float32Array(PARTICLE_COUNT * 3)
    const colArr = new Float32Array(PARTICLE_COUNT * 3)
    const velArr = new Float32Array(PARTICLE_COUNT * 3)
    const deptKeys = Object.keys(positions)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ri = i * 7  // seed index
      const keyIdx = Math.floor(seeded(ri) * deptKeys.length)
      const key = deptKeys[keyIdx]
      const [bx, , bz] = positions[key]
      const isActive = activeDepts.has(key) || stepStatusMap[key] === 'running'
      const spread = isActive ? 3.5 : 2.0
      const maxH   = isActive ? 7.0 : 2.5

      posArr[i * 3]     = bx + (seeded(ri + 1) - 0.5) * spread
      posArr[i * 3 + 1] = seeded(ri + 2) * maxH
      posArr[i * 3 + 2] = bz + (seeded(ri + 3) - 0.5) * spread

      velArr[i * 3]     = (seeded(ri + 4) - 0.5) * 0.003
      velArr[i * 3 + 1] = (seeded(ri + 5) - 0.5) * 0.006
      velArr[i * 3 + 2] = (seeded(ri + 6) - 0.5) * 0.003

      const c = new THREE.Color(colors[key] ?? '#4488ff')
      colArr[i * 3]     = c.r
      colArr[i * 3 + 1] = c.g
      colArr[i * 3 + 2] = c.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3))
    return { geometry: geo, velRef: { current: velArr } }
  }, [positions, activeDepts, colors, stepStatusMap])

  useFrame((state) => {
    if (!pointsRef.current) return
    const t   = state.clock.getElapsedTime()
    const pos = pointsRef.current.geometry.attributes.position
    const arr = pos.array as Float32Array
    const vel = velRef.current

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3]     += vel[i * 3]     + Math.sin(t * 0.5 + i) * 0.0008
      arr[i * 3 + 1] += vel[i * 3 + 1] + Math.cos(t * 0.4 + i * 1.3) * 0.0012
      arr[i * 3 + 2] += vel[i * 3 + 2] + Math.sin(t * 0.6 + i * 0.7) * 0.0008

      // Ground bounce
      if (arr[i * 3 + 1] < 0.1) {
        arr[i * 3 + 1] = 0.12
        vel[i * 3 + 1] = Math.abs(vel[i * 3 + 1])
      }
      if (arr[i * 3 + 1] > 9) vel[i * 3 + 1] = -Math.abs(vel[i * 3 + 1])

      // Keep in city bounds
      if (Math.abs(arr[i * 3]) > 10)     vel[i * 3]     = -vel[i * 3]
      if (Math.abs(arr[i * 3 + 2]) > 10) vel[i * 3 + 2] = -vel[i * 3 + 2]
    }
    pos.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.07}
        vertexColors
        transparent
        opacity={0.88}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
