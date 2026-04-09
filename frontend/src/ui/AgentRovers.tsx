import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StepRecord } from '../types'

interface AgentRoversProps {
  positions: Record<string, [number, number, number]>
  activeDepts: Set<string>
  colors: Record<string, string>
  steps: StepRecord[]
  hasActiveRun: boolean
  selectedBuilding?: string | null
}

const ROVER_COUNT = 60
const ACTIVE_ROVERS_PER_DEPT = 6

type RoverMode = 'moving' | 'sleeping'

interface RoverDescriptor {
  mode: RoverMode
  from: THREE.Vector3
  to: THREE.Vector3
  home: THREE.Vector3
  initialProgress: number
  speed: number
  color: THREE.Color
  moveFirstAxis: 'x' | 'z'
  sleepPhase: number
}

function seeded(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
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

export function AgentRovers({
  positions,
  activeDepts,
  colors,
  steps,
  hasActiveRun,
  selectedBuilding = null,
}: AgentRoversProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const visorRef = useRef<THREE.InstancedMesh>(null)
  const eyeLRef = useRef<THREE.InstancedMesh>(null)
  const eyeRRef = useRef<THREE.InstancedMesh>(null)
  const progressRef = useRef<number[]>([])

  const rovers = useMemo(() => {
    const arr: RoverDescriptor[] = []
    const deptKeys = Object.keys(positions)
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

    const movingCount = hasActiveRun
      ? Math.min(ROVER_COUNT, Math.max(0, scopedRunningKeys.length * ACTIVE_ROVERS_PER_DEPT))
      : 0

    for (let i = 0; i < movingCount; i++) {
      const toKey = scopedRunningKeys[i % scopedRunningKeys.length]
      const choices = deptKeys.filter((key) => key !== toKey)
      const fromKey = choices[Math.floor(seeded(i * 4.13 + 1.9) * choices.length)] ?? toKey
      const fromBase = positions[fromKey]
      const toBase = positions[toKey]
      arr.push({
        mode: 'moving',
        from: buildOffsetPosition(fromBase, i * 3.17 + 0.5, i * 9.77 + 1.1, 2.2),
        to: buildOffsetPosition(toBase, i * 5.21 + 1.7, i * 7.03 + 2.4, 1.6),
        home: buildOffsetPosition(toBase, i * 1.91 + 8.2, i * 6.51 + 0.4, 1.6),
        initialProgress: seeded(i * 5.5),
        speed: 0.2 + seeded(i * 1.1 + 0.3) * 0.18,
        color: new THREE.Color(colors[toKey] || '#8899aa'),
        moveFirstAxis: seeded(i * 8.1) > 0.5 ? 'x' : 'z',
        sleepPhase: seeded(i * 11.3) * Math.PI * 2,
      })
    }

    for (let i = movingCount; i < ROVER_COUNT; i++) {
      const homeKey = deptKeys[(i - movingCount) % deptKeys.length]
      const homeBase = positions[homeKey]
      const dimmedColor = new THREE.Color(colors[homeKey] || '#8899aa').multiplyScalar(0.42)
      arr.push({
        mode: 'sleeping',
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        home: buildOffsetPosition(homeBase, i * 2.71 + 4.4, i * 3.91 + 2.2, 2.1),
        initialProgress: 0,
        speed: 0,
        color: dimmedColor,
        moveFirstAxis: 'x',
        sleepPhase: seeded(i * 4.7 + 2.9) * Math.PI * 2,
      })
    }

    return arr
  }, [positions, activeDepts, colors, steps, hasActiveRun, selectedBuilding])

  useEffect(() => {
    progressRef.current = rovers.map((rover) => rover.initialProgress)
  }, [rovers])

  const { dummy, visorDummy, eyeLDummy, eyeRDummy } = useMemo(() => {
    const dummy = new THREE.Object3D()

    const visorDummy = new THREE.Object3D()
    visorDummy.position.set(0, 0.08, 0.205)
    dummy.add(visorDummy)

    const eyeLDummy = new THREE.Object3D()
    eyeLDummy.position.set(-0.08, 0.08, 0.215)
    dummy.add(eyeLDummy)

    const eyeRDummy = new THREE.Object3D()
    eyeRDummy.position.set(0.08, 0.08, 0.215)
    dummy.add(eyeRDummy)

    return { dummy, visorDummy, eyeLDummy, eyeRDummy }
  }, [])

  const colorObj = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    if (!meshRef.current) {
      return
    }

    const elapsed = state.clock.getElapsedTime()

    for (let i = 0; i < rovers.length; i++) {
      const rover = rovers[i]

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
        const prevX = dummy.position.x
        const prevZ = dummy.position.z
        dummy.position.set(curX, lift, curZ)

        const dx = curX - prevX
        const dz = curZ - prevZ
        const rotY = Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001
          ? Math.atan2(dx, dz)
          : dummy.rotation.y

        dummy.rotation.set(0, rotY, Math.sin(progress * Math.PI * 8) * 0.04)
        dummy.scale.set(1, 1, 1)

        colorObj.copy(rover.color)
        colorObj.multiplyScalar(1 + Math.sin(progress * Math.PI * 10) * 0.35)
      } else {
        const breathe = Math.sin(elapsed * 1.25 + rover.sleepPhase)
        const sway = Math.sin(elapsed * 0.55 + rover.sleepPhase)

        dummy.position.set(
          rover.home.x,
          0.16 + breathe * 0.018,
          rover.home.z,
        )
        dummy.rotation.set(0.22 + breathe * 0.03, sway * 0.18, 0.08 + sway * 0.02)
        dummy.scale.set(1.02, 0.72, 1.08)

        colorObj.copy(rover.color)
        colorObj.multiplyScalar(0.9 + breathe * 0.05)
      }

      dummy.updateMatrixWorld(true)
      meshRef.current.setMatrixAt(i, dummy.matrixWorld)
      if (visorRef.current) {
        visorRef.current.setMatrixAt(i, visorDummy.matrixWorld)
      }
      if (eyeLRef.current) {
        eyeLRef.current.setMatrixAt(i, eyeLDummy.matrixWorld)
      }
      if (eyeRRef.current) {
        eyeRRef.current.setMatrixAt(i, eyeRDummy.matrixWorld)
      }
      meshRef.current.setColorAt(i, colorObj)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true
    }
    if (visorRef.current) {
      visorRef.current.instanceMatrix.needsUpdate = true
    }
    if (eyeLRef.current) {
      eyeLRef.current.instanceMatrix.needsUpdate = true
    }
    if (eyeRRef.current) {
      eyeRRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, ROVER_COUNT]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.4, 0.4]}>
          <instancedBufferAttribute attach="attributes-color" args={[new Float32Array(ROVER_COUNT * 3), 3]} />
        </boxGeometry>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.4}
          metalness={0.6}
          clearcoat={0.8}
        />
      </instancedMesh>

      <instancedMesh ref={visorRef} args={[undefined, undefined, ROVER_COUNT]}>
        <boxGeometry args={[0.35, 0.15, 0.02]} />
        <meshBasicMaterial color="#000000" />
      </instancedMesh>

      <instancedMesh ref={eyeLRef} args={[undefined, undefined, ROVER_COUNT]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>

      <instancedMesh ref={eyeRRef} args={[undefined, undefined, ROVER_COUNT]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
    </group>
  )
}
