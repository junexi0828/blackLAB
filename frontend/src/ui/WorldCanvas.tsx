import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, Environment, OrbitControls, Stars } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { CampusLayout, CompanyConfig, EventEntry, StepRecord } from '../types'
import { buildCampusMaps, DEFAULT_CAMPUS_LAYOUT } from './cityConstants'
import { CityBuilding } from './CityBuilding'
import { AgentRovers } from './AgentRovers'
import { DataBeams } from './DataBeams'
import { GroundGrid } from './GroundGrid'
import { CampusMonument } from './CampusMonument'
import { resolveLiveDepartmentKeys } from './roverPersona'

interface WorldCanvasProps {
  steps: StepRecord[]
  currentDepartment: string | null
  hasActiveRun: boolean
  bubbleEvents: Record<string, EventEntry>
  onDismissBubble: (eventId: string) => void
  selectedBuilding?: string | null
  onSelectBuilding?: (id: string | null) => void
  timeTheme?: 'day' | 'night'
  layout?: CampusLayout | null
  showMonument?: boolean
  workflowConfig?: CompanyConfig | null
}

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(18, 14, 18)
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0)
const AUTO_ROTATE_RESUME_DELAY_MS = 2600
const CAMERA_ENTER_DURATION = 1.3
const CAMERA_EXIT_DURATION = 0.76

function vectorsEqual(left: [number, number, number], right: [number, number, number]) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2]
}

function areStepRecordsEqual(left: StepRecord[], right: StepRecord[]) {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftStep = left[index]
    const rightStep = right[index]
    if (
      leftStep.department_key !== rightStep.department_key ||
      leftStep.department_label !== rightStep.department_label ||
      leftStep.purpose !== rightStep.purpose ||
      leftStep.status !== rightStep.status ||
      leftStep.started_at !== rightStep.started_at ||
      leftStep.completed_at !== rightStep.completed_at ||
      leftStep.summary !== rightStep.summary ||
      leftStep.artifact_filename !== rightStep.artifact_filename
    ) {
      return false
    }
  }
  return true
}

function areBubbleEventsEqual(left: Record<string, EventEntry>, right: Record<string, EventEntry>) {
  if (left === right) {
    return true
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  for (const key of leftKeys) {
    const leftEvent = left[key]
    const rightEvent = right[key]
    if (
      !rightEvent ||
      leftEvent.event_id !== rightEvent.event_id ||
      leftEvent.scope !== rightEvent.scope ||
      leftEvent.title !== rightEvent.title ||
      leftEvent.message !== rightEvent.message ||
      leftEvent.status !== rightEvent.status ||
      leftEvent.timestamp !== rightEvent.timestamp ||
      leftEvent.run_id !== rightEvent.run_id ||
      leftEvent.loop_id !== rightEvent.loop_id ||
      leftEvent.department_key !== rightEvent.department_key ||
      leftEvent.department_label !== rightEvent.department_label ||
      leftEvent.is_live !== rightEvent.is_live
    ) {
      return false
    }
  }
  return true
}

function areLayoutsEqual(left: CampusLayout | null | undefined, right: CampusLayout | null | undefined) {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return left === right
  }

  const leftKeys = Object.keys(left.buildings)
  const rightKeys = Object.keys(right.buildings)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (const key of leftKeys) {
    const leftBuilding = left.buildings[key]
    const rightBuilding = right.buildings[key]
    if (
      !rightBuilding ||
      !vectorsEqual(leftBuilding.position, rightBuilding.position) ||
      leftBuilding.shape !== rightBuilding.shape ||
      leftBuilding.color !== rightBuilding.color
    ) {
      return false
    }
  }

  return (
    vectorsEqual(left.monument.position, right.monument.position) &&
    left.monument.baseInnerRadius === right.monument.baseInnerRadius &&
    left.monument.baseOuterRadius === right.monument.baseOuterRadius &&
    left.monument.ringInnerRadius === right.monument.ringInnerRadius &&
    left.monument.ringOuterRadius === right.monument.ringOuterRadius &&
    left.monument.torusRadius === right.monument.torusRadius &&
    left.monument.torusTube === right.monument.torusTube &&
    left.monument.orbRadius === right.monument.orbRadius &&
    left.monument.torusHeight === right.monument.torusHeight &&
    left.monument.orbHeight === right.monument.orbHeight
  )
}

function areWorldCanvasPropsEqual(left: WorldCanvasProps, right: WorldCanvasProps) {
  return (
    left.currentDepartment === right.currentDepartment &&
    left.hasActiveRun === right.hasActiveRun &&
    left.selectedBuilding === right.selectedBuilding &&
    left.timeTheme === right.timeTheme &&
    left.showMonument === right.showMonument &&
    left.workflowConfig === right.workflowConfig &&
    left.onDismissBubble === right.onDismissBubble &&
    left.onSelectBuilding === right.onSelectBuilding &&
    areStepRecordsEqual(left.steps, right.steps) &&
    areBubbleEventsEqual(left.bubbleEvents, right.bubbleEvents) &&
    areLayoutsEqual(left.layout, right.layout)
  )
}

function CameraFocusController({
  selectedBuilding,
  positions,
  controlsRef,
  onTransitionStateChange,
}: {
  selectedBuilding?: string | null
  positions: Record<string, [number, number, number]>
  controlsRef: RefObject<OrbitControlsImpl | null>
  onTransitionStateChange: (isActive: boolean) => void
}) {
  const { camera } = useThree()
  const transitionRef = useRef<{
    fromPosition: THREE.Vector3
    toPosition: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    positionCurve: THREE.QuadraticBezierCurve3 | null
    isEntering: boolean
    duration: number
    progress: number
  } | null>(null)
  const focusSignatureRef = useRef<string | null>(null)
  const positionSampleRef = useRef(new THREE.Vector3())

  const stopTransition = useCallback(() => {
    if (!transitionRef.current) {
      return
    }
    transitionRef.current = null
    onTransitionStateChange(false)
  }, [onTransitionStateChange])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) {
      return
    }

    const selectedCoords = selectedBuilding ? positions[selectedBuilding] ?? null : null
    const focusSignature = selectedCoords
      ? `${selectedBuilding}:${selectedCoords[0]}:${selectedCoords[1]}:${selectedCoords[2]}`
      : 'overview'
    if (focusSignatureRef.current === focusSignature) {
      return
    }
    focusSignatureRef.current = focusSignature

    const nextPosition = DEFAULT_CAMERA_POSITION.clone()
    const nextTarget = DEFAULT_CAMERA_TARGET.clone()

    if (selectedBuilding && selectedCoords) {
      const [x, , z] = selectedCoords
      nextTarget.set(x, 1.2, z)
      nextPosition.set(x + 6.8, 5.2, z + 7.2)
    }

    const fromPosition = camera.position.clone()
    const fromTarget = controls.target.clone()
    const alreadyThere =
      fromPosition.distanceToSquared(nextPosition) < 0.0001 &&
      fromTarget.distanceToSquared(nextTarget) < 0.0001
    if (alreadyThere) {
      stopTransition()
      return
    }

    const isEntering = Boolean(selectedBuilding && selectedCoords)
    let positionCurve: THREE.QuadraticBezierCurve3 | null = null
    if (isEntering) {
      const midpoint = fromPosition.clone().lerp(nextPosition, 0.5)
      const travelDistance = fromPosition.distanceTo(nextPosition)
      midpoint.y += THREE.MathUtils.clamp(travelDistance * 0.12, 1.4, 3.6)
      positionCurve = new THREE.QuadraticBezierCurve3(fromPosition.clone(), midpoint, nextPosition.clone())
    }

    transitionRef.current = {
      fromPosition,
      toPosition: nextPosition,
      fromTarget,
      toTarget: nextTarget,
      positionCurve,
      isEntering,
      duration: isEntering ? CAMERA_ENTER_DURATION : CAMERA_EXIT_DURATION,
      progress: 0,
    }
    onTransitionStateChange(true)
  }, [selectedBuilding, positions, camera, controlsRef, onTransitionStateChange, stopTransition])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) {
      return
    }

    const handleStart = () => {
      stopTransition()
    }

    controls.addEventListener('start', handleStart)
    return () => {
      controls.removeEventListener('start', handleStart)
    }
  }, [controlsRef, stopTransition])

  useFrame((_, delta: number) => {
    const controls = controlsRef.current
    const transition = transitionRef.current
    if (!controls || !transition) {
      return
    }

    transition.progress = Math.min(1, transition.progress + delta / transition.duration)
    const t = transition.progress
    const easedPosition = t * t * t * (t * (t * 6 - 15) + 10)
    const targetT = transition.isEntering ? Math.max(0, (t - 0.08) / 0.92) : t
    const easedTarget = targetT * targetT * targetT * (targetT * (targetT * 6 - 15) + 10)

    if (transition.positionCurve) {
      transition.positionCurve.getPointAt(easedPosition, positionSampleRef.current)
      camera.position.copy(positionSampleRef.current)
    } else {
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, easedPosition)
    }
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, easedTarget)
    controls.update()

    if (transition.progress >= 1) {
      camera.position.copy(transition.toPosition)
      controls.target.copy(transition.toTarget)
      controls.update()
      transitionRef.current = null
      onTransitionStateChange(false)
    }
  })

  return null
}

function WorldCanvasComponent({
  steps,
  currentDepartment,
  hasActiveRun,
  bubbleEvents,
  onDismissBubble,
  selectedBuilding,
  onSelectBuilding,
  timeTheme = 'day',
  layout = null,
  showMonument = true,
  workflowConfig = null,
}: WorldCanvasProps) {
  const isNight = timeTheme === 'night'
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(() => !selectedBuilding)
  const campusMaps = useMemo(
    () => buildCampusMaps(layout ?? DEFAULT_CAMPUS_LAYOUT),
    [layout],
  )
  const { positions, shapes, colors, monument } = campusMaps
  const activeDepts = useMemo(
    () => resolveLiveDepartmentKeys(steps, currentDepartment),
    [currentDepartment, steps],
  )

  const stepMap = useMemo(() => {
    const map: Record<string, StepRecord> = {}
    for (const step of steps) {
      map[step.department_key] = step
      if (step.department_key === 'engineering' && !map.dev_2) {
        map.dev_2 = step
      }
    }
    return map
  }, [steps])

  const visibleKeys = useMemo(
    () => Object.keys(positions),
    [positions],
  )
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const autoRotateTimerRef = useRef<number | null>(null)
  const [cameraTransitionActive, setCameraTransitionActive] = useState(false)
  const [visualSelectedBuilding, setVisualSelectedBuilding] = useState<string | null>(selectedBuilding ?? null)
  const cameraTransitionActiveRef = useRef(false)
  const selectedBuildingRef = useRef<string | null | undefined>(selectedBuilding)
  const autoRotateInitializedRef = useRef(false)

  const scheduleAutoRotateResume = useCallback((delay = AUTO_ROTATE_RESUME_DELAY_MS) => {
    if (autoRotateTimerRef.current !== null) {
      window.clearTimeout(autoRotateTimerRef.current)
    }
    autoRotateTimerRef.current = window.setTimeout(() => {
      if (!selectedBuildingRef.current && !cameraTransitionActiveRef.current) {
        setAutoRotateEnabled(true)
      }
      autoRotateTimerRef.current = null
    }, delay)
  }, [])

  useEffect(() => {
    return () => {
      if (autoRotateTimerRef.current !== null) {
        window.clearTimeout(autoRotateTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    cameraTransitionActiveRef.current = cameraTransitionActive
  }, [cameraTransitionActive])

  useEffect(() => {
    selectedBuildingRef.current = selectedBuilding
  }, [selectedBuilding])

  useEffect(() => {
    if (selectedBuilding || cameraTransitionActive) {
      return
    }
    setVisualSelectedBuilding(null)
  }, [cameraTransitionActive, selectedBuilding])

  useEffect(() => {
    if (!selectedBuilding || cameraTransitionActive) {
      return
    }
    setVisualSelectedBuilding(selectedBuilding)
  }, [cameraTransitionActive, selectedBuilding])

  useEffect(() => {
    if (autoRotateTimerRef.current !== null) {
      window.clearTimeout(autoRotateTimerRef.current)
      autoRotateTimerRef.current = null
    }
    if (!autoRotateInitializedRef.current && !selectedBuilding) {
      autoRotateInitializedRef.current = true
      setAutoRotateEnabled(true)
      return
    }
    setAutoRotateEnabled(false)
    if (!selectedBuilding) {
      scheduleAutoRotateResume()
    }
  }, [scheduleAutoRotateResume, selectedBuilding])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) {
      return
    }

    const handleStart = () => {
      if (autoRotateTimerRef.current !== null) {
        window.clearTimeout(autoRotateTimerRef.current)
        autoRotateTimerRef.current = null
      }
      setAutoRotateEnabled(false)
    }

    const handleEnd = () => {
      if (selectedBuilding) {
        return
      }
      scheduleAutoRotateResume()
    }

    controls.addEventListener('start', handleStart)
    controls.addEventListener('end', handleEnd)

    return () => {
      controls.removeEventListener('start', handleStart)
      controls.removeEventListener('end', handleEnd)
    }
  }, [scheduleAutoRotateResume, selectedBuilding])

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
      {showMonument && <CampusMonument timeTheme={timeTheme} monument={monument} />}

      {/* Buildings per department */}
      {visibleKeys.map((key) => {
        const pos = positions[key]
        const step = stepMap[key]
        const event = bubbleEvents[key] ?? null
        const isActive =
          (hasActiveRun && (activeDepts.has(key) || step?.status === 'running')) ||
          Boolean(event?.is_live)
        const status = hasActiveRun ? (step?.status ?? 'queued') : (event?.status ?? 'queued')
        const color = colors[key] ?? '#ffffff'
        const label = step?.department_label ?? key.replace('_', ' ').toUpperCase()
        const isSelected = visualSelectedBuilding === key
        const isDimmed = visualSelectedBuilding !== null && !isSelected

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
            shape={shapes[key] || 'box'}
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
      {visualSelectedBuilding === null && (
        <DataBeams
          steps={steps}
          positions={positions}
          colors={colors}
          activeDepts={activeDepts}
          hasActiveRun={hasActiveRun}
          timeTheme={timeTheme}
          workflowConfig={workflowConfig}
        />
      )}

      {/* Rovers move only when a run is live, otherwise they remain asleep near buildings */}
      <AgentRovers
        positions={positions}
        activeDepts={activeDepts}
        steps={steps}
        hasActiveRun={hasActiveRun}
        selectedBuilding={visualSelectedBuilding}
      />

      <CameraFocusController
        selectedBuilding={selectedBuilding}
        positions={positions}
        controlsRef={controlsRef}
        onTransitionStateChange={setCameraTransitionActive}
      />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        autoRotate={autoRotateEnabled && !selectedBuilding && !cameraTransitionActive}
        autoRotateSpeed={-0.42}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={40}
        makeDefault
      />

      {/* Soft atmospheric white fog */}
      <fog attach="fog" args={[isNight ? '#06111d' : '#f5f7fa', 20, isNight ? 58 : 70]} />
    </Canvas>
  )
}

export const WorldCanvas = memo(WorldCanvasComponent, areWorldCanvasPropsEqual)
