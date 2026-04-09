import { useMemo, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky, Environment, CameraControls } from '@react-three/drei'
import type { EventEntry, StepRecord } from '../types'
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
}

function CameraRig({ selectedBuilding, positions }: { selectedBuilding?: string | null, positions: Record<string, [number, number, number]> }) {
  const controlsRef = useRef<CameraControls>(null)

  useEffect(() => {
    if (!controlsRef.current) return
    if (selectedBuilding && positions[selectedBuilding]) {
      const pos = positions[selectedBuilding]
      // Swoop in close to the building (offset slightly to look at it)
      controlsRef.current.setLookAt(
        pos[0] + 5, pos[1] + 4, pos[2] + 5, // camera pos
        pos[0], pos[1] + 1, pos[2],       // target pos
        true                              // animate
      )
    } else {
      // Return to macro view
      controlsRef.current.setLookAt(
        18, 14, 18, // camera pos
        0, 0, 0,    // target pos
        true        // animate
      )
    }
  }, [selectedBuilding, positions])

  return (
    <CameraControls 
      ref={controlsRef} 
      maxPolarAngle={Math.PI / 2.1} 
      minDistance={2} 
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
}: WorldCanvasProps) {
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
      style={{ background: '#f5f7fa' }}
      shadows
    >
      {/* Bright Daylight Lights */}
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight position={[15, 25, -10]} intensity={1.2} castShadow color="#fff3e0" shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-15, 15, 15]} intensity={0.5} color="#e0f3ff" />

      {/* Clean Sky and Reflections */}
      <Sky sunPosition={[15, 25, -10]} turbidity={0.2} rayleigh={0.1} />
      <Environment preset="city" />

      {/* Ground plane */}
      <GroundGrid />

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
      <fog attach="fog" args={['#f5f7fa', 20, 70]} />
    </Canvas>
  )
}
