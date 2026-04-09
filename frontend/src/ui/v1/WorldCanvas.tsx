import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stars, OrbitControls } from '@react-three/drei'
import type { StepRecord } from '../../types'
import { DEPT_COLORS, DEPT_POSITIONS } from './cityConstants'
import { CityBuilding } from './CityBuilding'
import { AgentCloud } from './AgentCloud'
import { DataBeams } from './DataBeams'
import { GroundGrid } from './GroundGrid'

interface WorldCanvasProps {
  steps: StepRecord[]
  currentDepartment: string | null
}

export function WorldCanvas({ steps, currentDepartment }: WorldCanvasProps) {
  const activeDepts = useMemo(
    () =>
      new Set(
        (currentDepartment ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
    [currentDepartment],
  )

  const stepMap = useMemo(() => {
    const map: Record<string, StepRecord> = {}
    for (const step of steps) map[step.department_key] = step
    return map
  }, [steps])

  return (
    <Canvas
      camera={{ position: [18, 11, 18], fov: 48 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      style={{ background: '#030712' }}
    >
      {/* Lights */}
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 25, 0]} intensity={0.6} color="#3040ff" />
      <pointLight position={[-15, 8, -15]} intensity={0.3} color="#0040ff" />
      <pointLight position={[15, 8, 15]} intensity={0.3} color="#800080" />

      {/* Deep space stars */}
      <Stars radius={120} depth={60} count={12000} factor={4} saturation={0.3} fade speed={0.5} />

      {/* Ground plane */}
      <GroundGrid />

      {/* Buildings per department */}
      {Object.entries(DEPT_POSITIONS).map(([key, pos]) => {
        const step = stepMap[key]
        const isActive =
          activeDepts.has(key) ||
          step?.status === 'running'
        const status = step?.status ?? 'queued'
        const color = DEPT_COLORS[key] ?? '#ffffff'
        const label = step?.department_label ?? key.replace('_', ' ').toUpperCase()

        return (
          <CityBuilding
            key={key}
            position={pos}
            color={color}
            isActive={isActive}
            status={status}
            label={label}
            summary={step?.summary}
          />
        )
      })}

      {/* Glowing data connections */}
      <DataBeams
        steps={steps}
        positions={DEPT_POSITIONS}
        colors={DEPT_COLORS}
        activeDepts={activeDepts}
      />

      {/* Floating agent particles */}
      <AgentCloud
        positions={DEPT_POSITIONS}
        activeDepts={activeDepts}
        colors={DEPT_COLORS}
        steps={steps}
      />

      {/* Interactive, auto-rotating camera orbit */}
      <OrbitControls autoRotate autoRotateSpeed={0.5} maxPolarAngle={Math.PI / 2.1} />

      {/* Atmospheric distance fog */}
      <fog attach="fog" args={['#030712', 28, 65]} />
    </Canvas>
  )
}
