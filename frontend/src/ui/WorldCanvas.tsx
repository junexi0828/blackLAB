import { useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, Environment, OrbitControls, Stars } from '@react-three/drei'
import type { EventEntry, StepRecord } from '../types'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { DEPT_COLORS, DEPT_POSITIONS, DEPT_SHAPES } from './cityConstants'
import { CityBuilding } from './CityBuilding'
import { AgentRovers } from './AgentRovers'
import { DataBeams } from './DataBeams'
import { GroundGrid } from './GroundGrid'

interface WorldCanvasProps {
  steps: StepRecord[]
  currentDepartment: string | null
  hasActiveRun: boolean
  bubbleEvents: Record<string, EventEntry>
  onDismissBubble: (eventId: string) => void
  selectedBuilding?: string | null
  onSelectBuilding?: (id: string | null) => void
  timeTheme?: 'day' | 'night'
}

function CameraRig({ selectedBuilding, positions }: { selectedBuilding?: string | null, positions: Record<string, [number, number, number]> }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()
  const desiredPosition = useRef(new THREE.Vector3(18, 14, 18))
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0))
  const isTransitioning = useRef(true)

  useEffect(() => {
    if (selectedBuilding && positions[selectedBuilding]) {
      const pos = positions[selectedBuilding]
      desiredPosition.current.set(pos[0] + 5.2, pos[1] + 4.1, pos[2] + 5.2)
      desiredTarget.current.set(pos[0], pos[1] + 1, pos[2])
    } else {
      desiredPosition.current.set(18, 14, 18)
      desiredTarget.current.set(0, 0, 0)
    }
    isTransitioning.current = true
  }, [selectedBuilding, positions])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls || !isTransitioning.current) {
      return
    }

    const ease = 1 - Math.exp(-delta * 3.4)
    camera.position.lerp(desiredPosition.current, ease)
    controls.target.lerp(desiredTarget.current, ease)
    controls.update()

    if (
      camera.position.distanceTo(desiredPosition.current) < 0.08 &&
      controls.target.distanceTo(desiredTarget.current) < 0.08
    ) {
      isTransitioning.current = false
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      autoRotate={!selectedBuilding}
      autoRotateSpeed={0.42}
      maxPolarAngle={Math.PI / 2.1}
      minDistance={3}
      maxDistance={40}
      makeDefault
    />
  )
}

export function WorldCanvas({
  steps,
  currentDepartment,
  hasActiveRun,
  bubbleEvents,
  onDismissBubble,
  selectedBuilding,
  onSelectBuilding,
  timeTheme = 'day',
}: WorldCanvasProps) {
  const isNight = timeTheme === 'night'
  const activeDepts = useMemo(() => {
    const tokens = new Set(
      (currentDepartment ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    )
    const active = new Set<string>()
    for (const step of steps) {
      const key = step.department_key.toLowerCase()
      const label = step.department_label.toLowerCase()
      if (step.status === 'running' || tokens.has(key) || tokens.has(label)) {
        active.add(step.department_key)
      }
    }
    return active
  }, [currentDepartment, steps])

  const stepMap = useMemo(() => {
    const map: Record<string, StepRecord> = {}
    for (const step of steps) map[step.department_key] = step
    return map
  }, [steps])

  return (
    <Canvas
      camera={{ position: [18, 14, 18], fov: 45 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      style={{ background: isNight ? '#06111d' : '#f5f7fa' }}
      shadows
    >
      <ambientLight intensity={isNight ? 0.26 : 0.6} color={isNight ? '#d7e3ff' : '#ffffff'} />
      <directionalLight
        position={isNight ? [-12, 22, 9] : [15, 25, -10]}
        intensity={isNight ? 0.72 : 1.2}
        castShadow
        color={isNight ? '#c6ddff' : '#fff3e0'}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-15, 15, 15]} intensity={isNight ? 0.25 : 0.5} color={isNight ? '#7dd3fc' : '#e0f3ff'} />

      <Sky
        sunPosition={isNight ? [-14, -6, 10] : [15, 25, -10]}
        turbidity={isNight ? 0.95 : 0.2}
        rayleigh={isNight ? 0.42 : 0.1}
      />
      <Environment preset="city" />
      {isNight && <Stars radius={110} depth={45} count={1800} factor={2.8} saturation={0.15} fade speed={0.18} />}

      <group position={isNight ? [-20, 16, -26] : [22, 18, -26]}>
        <mesh>
          <sphereGeometry args={[isNight ? 1.1 : 1.5, 24, 24]} />
          <meshBasicMaterial color={isNight ? '#e2e8f0' : '#ffd166'} />
        </mesh>
        <pointLight
          position={[0, 0, 0]}
          intensity={isNight ? 0.55 : 1.05}
          distance={18}
          color={isNight ? '#dbeafe' : '#ffe7a3'}
        />
      </group>

      {/* Ground plane */}
      <GroundGrid timeTheme={timeTheme} />

      {/* Buildings per department */}
      {Object.entries(DEPT_POSITIONS).map(([key, pos]) => {
        const step = stepMap[key]
        const event = bubbleEvents[key] ?? null
        const isActive =
          (hasActiveRun && (activeDepts.has(key) || step?.status === 'running')) ||
          Boolean(event?.is_live)
        const status = hasActiveRun ? (step?.status ?? 'queued') : (event?.status ?? 'queued')
        const color = DEPT_COLORS[key] ?? '#ffffff'
        const label = step?.department_label ?? key.replace('_', ' ').toUpperCase()
        const isSelected = selectedBuilding === key
        const isDimmed = selectedBuilding !== null && !isSelected

        return (
          <CityBuilding
            key={key}
            buildingId={key}
            position={pos}
            color={color}
            isActive={isActive}
            status={status}
            label={label}
            summary={step?.summary}
            shape={DEPT_SHAPES[key] || 'box'}
            event={event}
            onDismissEvent={onDismissBubble}
            isSelected={isSelected}
            isDimmed={isDimmed}
            onClick={() => onSelectBuilding?.(key)}
            timeTheme={timeTheme}
          />
        )
      })}

      {/* Glowing data connections */}
      {selectedBuilding === null && (
        <DataBeams
          steps={steps}
          positions={DEPT_POSITIONS}
          colors={DEPT_COLORS}
          activeDepts={activeDepts}
          hasActiveRun={hasActiveRun}
          timeTheme={timeTheme}
        />
      )}

      {/* Rovers move only when a run is live, otherwise they remain asleep near buildings */}
      <AgentRovers
        positions={DEPT_POSITIONS}
        activeDepts={activeDepts}
        colors={DEPT_COLORS}
        steps={steps}
        hasActiveRun={hasActiveRun}
        selectedBuilding={selectedBuilding}
      />

      {/* Interactive camera rig replaces OrbitControls */}
      <CameraRig selectedBuilding={selectedBuilding} positions={DEPT_POSITIONS} />

      {/* Soft atmospheric white fog */}
      <fog attach="fog" args={[isNight ? '#06111d' : '#f5f7fa', 20, isNight ? 58 : 70]} />
    </Canvas>
  )
}
