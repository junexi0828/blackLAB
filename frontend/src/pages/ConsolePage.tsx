import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { backendUrl, buildRelease, forceStopLoop, forceStopRun, getCampusLayout, getFeed, getOperatorProfile, getProjects, getSettings, launchLoop, launchRun, listLoops, listRuns, saveCampusLayout, stopLoop, stopRun } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { useSolarTheme } from '../hooks/useSolarTheme'
import type { CampusLayout, EventEntry, ProjectLibraryEntry, ReleaseSummary, StepRecord } from '../types'
import { SUPPORT_FACILITY_KEYS } from '../config/organizationModel'
import { ConsoleHUD } from '../ui/ConsoleHUD'
import { EventFeedOverlay } from '../ui/EventFeedOverlay'
import { resolveProjectMaturity } from '../ui/projectMaturity'
import { buildCrewCounts, resolveLiveDepartmentKeys } from '../ui/roverPersona'

const BUBBLE_TTL_MS = 14000
const EMPTY_STEPS: StepRecord[] = []
const CONSOLE_RENDER_MODE_STORAGE_KEY = 'blacklab.console.render_mode'
const CONSOLE_CAMERA_SETTINGS_STORAGE_KEY = 'blacklab.console.camera_settings'
const DEFAULT_AUTO_ROTATE_SPEED = -0.42
const AUTO_ROTATE_SPEED_MIN = -0.9
const AUTO_ROTATE_SPEED_MAX = 0.9
const AUTO_ROTATE_SPEED_PRESETS = [-0.7, -0.42, 0.42, 0.7] as const

type ConsoleRenderMode = 'normal' | 'low-power'
type ReleaseStatusTone = 'standby' | 'running' | 'ready' | 'failed' | 'attention'

interface ReleasePanelModel {
  statusLabel: string
  statusTone: ReleaseStatusTone
  headline: string
  summary: string
  buildLabel: string
  canDownload: boolean
  timestampLabel: string | null
}

interface ConsoleCameraSettings {
  autoRotate: boolean
  autoRotateSpeed: number
}

const LazyWorldCanvas = lazy(async () => {
  const module = await import('../ui/WorldCanvas')
  return { default: module.WorldCanvas }
})

function readConsoleRenderMode(): ConsoleRenderMode {
  if (typeof window === 'undefined') {
    return 'normal'
  }
  try {
    return window.localStorage.getItem(CONSOLE_RENDER_MODE_STORAGE_KEY) === 'low-power' ? 'low-power' : 'normal'
  } catch {
    return 'normal'
  }
}

function writeConsoleRenderMode(renderMode: ConsoleRenderMode) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(CONSOLE_RENDER_MODE_STORAGE_KEY, renderMode)
  } catch {
    // ignore localStorage failures
  }
}

function clampAutoRotateSpeed(value: number) {
  return Math.min(AUTO_ROTATE_SPEED_MAX, Math.max(AUTO_ROTATE_SPEED_MIN, value))
}

function readConsoleCameraSettings(): ConsoleCameraSettings {
  if (typeof window === 'undefined') {
    return { autoRotate: true, autoRotateSpeed: DEFAULT_AUTO_ROTATE_SPEED }
  }
  try {
    const raw = window.localStorage.getItem(CONSOLE_CAMERA_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return { autoRotate: true, autoRotateSpeed: DEFAULT_AUTO_ROTATE_SPEED }
    }
    const parsed = JSON.parse(raw) as Partial<ConsoleCameraSettings>
    return {
      autoRotate: parsed.autoRotate !== false,
      autoRotateSpeed:
        typeof parsed.autoRotateSpeed === 'number'
          ? clampAutoRotateSpeed(parsed.autoRotateSpeed)
          : DEFAULT_AUTO_ROTATE_SPEED,
    }
  } catch {
    return { autoRotate: true, autoRotateSpeed: DEFAULT_AUTO_ROTATE_SPEED }
  }
}

function writeConsoleCameraSettings(settings: ConsoleCameraSettings) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(
      CONSOLE_CAMERA_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        autoRotate: settings.autoRotate,
        autoRotateSpeed: clampAutoRotateSpeed(settings.autoRotateSpeed),
      }),
    )
  } catch {
    // ignore localStorage failures
  }
}

function formatSignedSpeed(value: number) {
  const normalized = clampAutoRotateSpeed(value)
  const rounded = Math.abs(normalized) < 0.005 ? 0 : normalized
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`
}

function prettifyDepartmentKey(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatEventClock(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatReleaseTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function resolveReleasePanelModel(
  projectName: string | null,
  latestRelease: ReleaseSummary | null,
  activeRelease: ReleaseSummary | null,
): ReleasePanelModel {
  if (activeRelease) {
    return {
      statusLabel: activeRelease.status_label,
      statusTone: 'running',
      headline: `Packaging ${projectName ?? 'project'}`,
      summary: activeRelease.current_status || activeRelease.summary || 'Release Center is preparing the delivery bundle.',
      buildLabel: 'Packaging…',
      canDownload: false,
      timestampLabel: formatReleaseTimestamp(activeRelease.updated_at),
    }
  }

  if (!latestRelease) {
    return {
      statusLabel: 'Standby',
      statusTone: 'standby',
      headline: 'No delivery bundle yet',
      summary: 'Package this project when you want a downloadable release.',
      buildLabel: 'Build Release',
      canDownload: false,
      timestampLabel: null,
    }
  }

  if (latestRelease.status === 'completed') {
    return {
      statusLabel: latestRelease.status_label,
      statusTone: 'ready',
      headline: latestRelease.download_filename || latestRelease.release_id,
      summary: latestRelease.current_status || latestRelease.summary || 'Release bundle is ready for download.',
      buildLabel: latestRelease.action_label,
      canDownload: Boolean(latestRelease.download_url),
      timestampLabel: formatReleaseTimestamp(latestRelease.updated_at),
    }
  }

  if (latestRelease.status === 'failed') {
    return {
      statusLabel: latestRelease.status_label,
      statusTone: 'failed',
      headline: latestRelease.release_id,
      summary: latestRelease.current_status || latestRelease.summary || 'Release packaging failed. Start a fresh build when ready.',
      buildLabel: latestRelease.action_label,
      canDownload: false,
      timestampLabel: formatReleaseTimestamp(latestRelease.updated_at),
    }
  }

  return {
    statusLabel: latestRelease.status_label,
    statusTone: 'attention',
    headline: latestRelease.release_id,
    summary: latestRelease.current_status || latestRelease.summary || 'Release Center needs operator attention before download.',
    buildLabel: latestRelease.action_label,
    canDownload: false,
    timestampLabel: formatReleaseTimestamp(latestRelease.updated_at),
  }
}

function buildRunMission(project: ProjectLibraryEntry) {
  const focus = project.brief?.trim()
  if (focus) {
    return `Advance ${project.name}. Reuse the saved project context and memory. Priority: ${focus}`
  }
  return `Advance ${project.name}. Reuse the saved project context and memory, finish the highest-leverage next work, and refresh the operator briefing.`
}

function buildLoopObjective(project: ProjectLibraryEntry) {
  const focus = project.brief?.trim()
  if (focus) {
    return `Keep improving ${project.name} with the saved project context and validated memory. Maintain focus on ${focus}.`
  }
  return `Keep improving ${project.name} with the saved project context, reuse prior conclusions, and keep the operator briefing current.`
}

function describeLayoutTarget(value: string | 'monument' | null) {
  if (!value) {
    return 'Select target'
  }
  if (value === 'monument') {
    return 'Central Monument'
  }
  return prettifyDepartmentKey(value)
}

export function ConsolePage() {
  const runsResource = useJsonResource(listRuns, [])
  const loopsResource = useJsonResource(listLoops, [])
  const feedResource = useJsonResource(getFeed, [])
  const layoutResource = useJsonResource(getCampusLayout, [])
  const profileResource = useJsonResource(getOperatorProfile, [])
  const projectsResource = useJsonResource(getProjects, [])
  const settingsResource = useJsonResource(getSettings, [])
  const [dismissedFeedIds, setDismissedFeedIds] = useState<string[]>([])
  const [dismissedBubbleIds, setDismissedBubbleIds] = useState<string[]>([])
  const [feedCollapsed, setFeedCollapsed] = useState(false)
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [utilityDockTab, setUtilityDockTab] = useState<'runtime' | 'release' | 'layout' | 'power' | null>(null)
  const [renderMode, setRenderMode] = useState<ConsoleRenderMode>(() => readConsoleRenderMode())
  const [cameraSettings, setCameraSettings] = useState<ConsoleCameraSettings>(() => readConsoleCameraSettings())
  const [editTarget, setEditTarget] = useState<string | 'monument' | null>(null)
  const [layoutDraft, setLayoutDraft] = useState<CampusLayout | null>(null)
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutStep, setLayoutStep] = useState(0.5)
  const [selectedProjectSlug, setSelectedProjectSlug] = useState('')
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [releaseBusy, setReleaseBusy] = useState(false)
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null)
  const [releaseNotice, setReleaseNotice] = useState<string | null>(null)
  const releaseNotificationRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (layoutResource.data) {
      setLayoutDraft(layoutResource.data)
    }
  }, [layoutResource.data])

  useEffect(() => {
    writeConsoleRenderMode(renderMode)
  }, [renderMode])

  useEffect(() => {
    writeConsoleCameraSettings(cameraSettings)
  }, [cameraSettings])

  const runs = useMemo(() => runsResource.data ?? [], [runsResource.data])
  const loops = useMemo(() => loopsResource.data ?? [], [loopsResource.data])
  const operatorProfile = profileResource.data
  const projectsPayload = projectsResource.data
  const feedData = feedResource.data
  const feedEvents = useMemo(() => feedData?.events ?? [], [feedData])
  const rawBubbleEvents = useMemo(() => feedData?.bubbles ?? {}, [feedData])
  const currentProject = projectsPayload?.current_project ?? null
  const refreshRuns = runsResource.refresh
  const refreshLoops = loopsResource.refresh
  const refreshFeed = feedResource.refresh
  const refreshProfile = profileResource.refresh
  const refreshProjects = projectsResource.refresh
  const projectLibrary = useMemo(() => {
    const items = projectsPayload?.projects ?? []
    if (!currentProject || items.some((project) => project.slug === currentProject.slug)) {
      return items
    }
    return [
      {
        slug: currentProject.slug,
        name: currentProject.name,
        brief: '',
        run_count: 0,
        last_run_id: currentProject.entity_id,
        latest_release: null,
        active_release: null,
      },
      ...items,
    ]
  }, [projectsPayload?.projects, currentProject])
  const selectedProject = useMemo(
    () => projectLibrary.find((project) => project.slug === selectedProjectSlug) ?? null,
    [projectLibrary, selectedProjectSlug],
  )
  const currentProjectIsLive = currentProject?.source === 'active run' || currentProject?.source === 'active loop' || currentProject?.source === 'current loop'
  const runtimeProjectSlug = currentProjectIsLive
    ? currentProject?.slug ?? selectedProject?.slug ?? null
    : selectedProject?.slug ?? currentProject?.slug ?? null
  const runtimeProject = useMemo(
    () => projectLibrary.find((project) => project.slug === runtimeProjectSlug) ?? selectedProject ?? null,
    [projectLibrary, runtimeProjectSlug, selectedProject],
  )
  const latestRelease = runtimeProject?.latest_release ?? null
  const activeRelease = runtimeProject?.active_release ?? null
  const scopedRuns = useMemo(
    () => (runtimeProjectSlug ? runs.filter((run) => run.project_slug === runtimeProjectSlug) : runs),
    [runs, runtimeProjectSlug],
  )
  const scopedLoops = useMemo(
    () => (runtimeProjectSlug ? loops.filter((loop) => loop.project_slug === runtimeProjectSlug) : loops),
    [loops, runtimeProjectSlug],
  )
  const activeRuns = useMemo(
    () => scopedRuns.filter((run) => run.status === 'running' || run.status === 'stopping'),
    [scopedRuns],
  )

  const activeLoop =
    scopedLoops.find((loop) => loop.status === 'running' || loop.status === 'stopping') ??
    scopedLoops[0] ??
    null
  const liveLoop = useMemo(
    () => scopedLoops.find((loop) => loop.status === 'running' || loop.status === 'stopping') ?? null,
    [scopedLoops],
  )
  const activeRun = activeRuns[0] ?? null
  const activeRunSteps = activeRun?.steps ?? EMPTY_STEPS
  const latestRun = scopedRuns[0] ?? null
  const activeRunCount = activeRuns.length
  const systemMode: 'live' | 'stopping' | 'idle' =
    activeLoop?.status === 'stopping' || activeRun?.status === 'stopping'
      ? 'stopping'
      : activeLoop?.status === 'running' || activeRunCount > 0
        ? 'live'
        : 'idle'
  const isLowPowerMode = renderMode === 'low-power'
  const refreshIntervalMs = systemMode === 'idle' ? (isLowPowerMode ? 18000 : 12000) : (isLowPowerMode ? 8000 : 4000)
  const hiddenRefreshIntervalMs = systemMode === 'idle' ? (isLowPowerMode ? 60000 : 30000) : (isLowPowerMode ? 30000 : 12000)
  const liveDepartmentKeys = useMemo(
    () => resolveLiveDepartmentKeys(activeRunSteps, activeRun?.current_department ?? null),
    [activeRun?.current_department, activeRunSteps],
  )
  const crewCounts = useMemo(
    () => buildCrewCounts(liveDepartmentKeys),
    [liveDepartmentKeys],
  )
  const projectMaturity = useMemo(
    () =>
      resolveProjectMaturity({
        settings: settingsResource.data ?? null,
        runs,
        loops,
        activeRun,
        activeLoop,
        projectLibrary,
        focusProjectSlug: runtimeProjectSlug,
        liveDepartmentKeys,
      }),
    [
      settingsResource.data,
      runs,
      loops,
      activeRun,
      activeLoop,
      projectLibrary,
      runtimeProjectSlug,
      liveDepartmentKeys,
    ],
  )

  const scopedBubbleEvents = useMemo(() => {
    const allEvents = Object.values(rawBubbleEvents)
    if (!runtimeProjectSlug) {
      return allEvents
    }
    return allEvents.filter((event) => event.project_slug === runtimeProjectSlug)
  }, [rawBubbleEvents, runtimeProjectSlug])

  const bubbleEvents = useMemo(() => {
    const bubbleCutoff = Date.now() - BUBBLE_TTL_MS
    const visible = scopedBubbleEvents
      .filter((event) => !dismissedBubbleIds.includes(event.event_id))
      .filter((event) => new Date(event.timestamp).getTime() >= bubbleCutoff)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 6)
    return Object.fromEntries(visible.map((event) => [event.department_key ?? event.event_id, event]))
  }, [scopedBubbleEvents, dismissedBubbleIds])

  const scopedFeedEvents = useMemo(() => {
    if (!runtimeProjectSlug) {
      return feedEvents
    }
    return feedEvents.filter((event) => event.project_slug === runtimeProjectSlug)
  }, [feedEvents, runtimeProjectSlug])

  const visibleFeedEvents = useMemo(
    () => scopedFeedEvents.filter((event) => !dismissedFeedIds.includes(event.event_id)),
    [scopedFeedEvents, dismissedFeedIds],
  )

  const { timeTheme, themeSource } = useSolarTheme()
  const activeDepartmentKeys = useMemo(
    () => new Set(operatorProfile?.roster.active_department_keys ?? []),
    [operatorProfile],
  )
  const hiddenCampusItems = useMemo(
    () => new Set(operatorProfile?.roster.hidden_campus_items ?? []),
    [operatorProfile],
  )
  const visibleLayout = useMemo<CampusLayout | null>(() => {
    if (!layoutDraft) {
      return null
    }
    if (!operatorProfile) {
      return layoutDraft
    }
    const buildings = Object.fromEntries(
      Object.entries(layoutDraft.buildings).filter(([key]) => {
        return (activeDepartmentKeys.has(key) || SUPPORT_FACILITY_KEYS.includes(key as (typeof SUPPORT_FACILITY_KEYS)[number])) && !hiddenCampusItems.has(key)
      }),
    )
    return {
      buildings,
      monument: layoutDraft.monument,
    }
  }, [layoutDraft, operatorProfile, activeDepartmentKeys, hiddenCampusItems])
  const buildingKeys = useMemo(
    () => Object.keys(layoutDraft?.buildings ?? {}),
    [layoutDraft],
  )
  const selectedBuildingPosition =
    editTarget && editTarget !== 'monument' ? layoutDraft?.buildings[editTarget]?.position ?? null : null
  const monumentPosition = layoutDraft?.monument.position ?? null
  const selectedStep = useMemo<StepRecord | null>(() => {
    if (!selectedBuilding) {
      return null
    }
    const sourceSteps = activeRunSteps.length > 0 ? activeRunSteps : latestRun?.steps ?? EMPTY_STEPS
    return sourceSteps.find((step) => step.department_key === selectedBuilding) ?? null
  }, [selectedBuilding, activeRunSteps, latestRun?.steps])
  const selectedEvent = useMemo<EventEntry | null>(() => {
    if (!selectedBuilding) {
      return null
    }
    const direct = bubbleEvents[selectedBuilding]
    if (direct) {
      return direct
    }
    return (
      visibleFeedEvents.find((event) => event.department_key === selectedBuilding) ??
      null
    )
  }, [selectedBuilding, bubbleEvents, visibleFeedEvents])
  const selectedLabel = selectedStep?.department_label ?? (selectedBuilding ? prettifyDepartmentKey(selectedBuilding) : null)
  const selectedStatus = selectedStep?.status ?? selectedEvent?.status ?? 'idle'
  const selectedSummary =
    selectedEvent?.message ??
    selectedStep?.summary ??
    selectedStep?.purpose ??
    null
  const selectedTimestamp = formatEventClock(selectedEvent?.timestamp)
  const editMode = utilityDockTab === 'layout'
  const canvasSelectedBuilding =
    editMode && editTarget && editTarget !== 'monument' ? editTarget : selectedBuilding
  const runtimeSourceLabel =
    liveLoop ? 'Loop Live' : activeRun ? 'Run Live' : currentProject?.source ?? 'Ready'
  const runtimeBookmarkMeta =
    liveLoop ? 'Loop active' : activeRun ? 'Run active' : runtimeProject?.name ?? currentProject?.name ?? 'Ready'
  const releaseBookmarkMeta = activeRelease
    ? `Packaging ${runtimeProject?.name ?? currentProject?.name ?? 'project'}`
    : latestRelease?.status === 'completed'
      ? `Ready · ${latestRelease.download_filename ?? latestRelease.release_id}`
      : latestRelease?.status === 'failed'
        ? `Failed · ${latestRelease.release_id}`
        : 'Package delivery bundle'
  const layoutBookmarkMeta = editMode ? describeLayoutTarget(editTarget) : layoutNotice ?? 'Adjust campus'
  const powerBookmarkMeta = `${isLowPowerMode ? 'UI low power' : 'UI normal'} · ${
    cameraSettings.autoRotate ? `rotate ${formatSignedSpeed(cameraSettings.autoRotateSpeed)}` : 'rotate off'
  }`
  const releasePanel = useMemo(
    () => resolveReleasePanelModel(runtimeProject?.name ?? currentProject?.name ?? null, latestRelease, activeRelease),
    [activeRelease, currentProject?.name, latestRelease, runtimeProject?.name],
  )

  const refreshConsoleRuntime = useCallback(async () => {
    await Promise.all([
      refreshRuns(),
      refreshLoops(),
      refreshFeed(),
      refreshProfile(),
      refreshProjects(),
    ])
  }, [refreshFeed, refreshLoops, refreshProfile, refreshProjects, refreshRuns])

  useLiveRefresh(
    refreshConsoleRuntime,
    refreshIntervalMs,
    true,
    hiddenRefreshIntervalMs,
  )

  useEffect(() => {
    if (currentProjectIsLive && currentProject?.slug && selectedProjectSlug !== currentProject.slug) {
      setSelectedProjectSlug(currentProject.slug)
      return
    }
    if (selectedProjectSlug && projectLibrary.some((project) => project.slug === selectedProjectSlug)) {
      return
    }
    const fallbackSlug =
      currentProject?.slug ??
      projectLibrary[0]?.slug ??
      operatorProfile?.launch.project_slug ??
      operatorProfile?.autopilot.project_slug ??
      ''
    if (fallbackSlug) {
      setSelectedProjectSlug(fallbackSlug)
    }
  }, [
    currentProjectIsLive,
    currentProject?.slug,
    operatorProfile?.autopilot.project_slug,
    operatorProfile?.launch.project_slug,
    projectLibrary,
    selectedProjectSlug,
  ])

  useEffect(() => {
    if (!selectedProject) {
      return
    }
    const previousState = releaseNotificationRef.current[selectedProject.slug]
    const nextState = activeRelease?.status ?? latestRelease?.status ?? 'idle'
    releaseNotificationRef.current[selectedProject.slug] = nextState

    if (previousState === 'running' && !activeRelease && latestRelease?.status === 'completed') {
      const message = `Release ${latestRelease.release_id} is ready for ${selectedProject.name}.`
      setReleaseNotice(message)
      if (typeof window !== 'undefined' && 'Notification' in window && document.hidden && Notification.permission === 'granted') {
        new Notification('Release Center ready', { body: message })
      }
    }
  }, [activeRelease, latestRelease, selectedProject])

  const dismissBubble = useCallback((eventId: string) => {
    setDismissedBubbleIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }, [])

  const dismissFeedEvent = useCallback((eventId: string) => {
    setDismissedFeedIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }, [])

  const clearFeedEvents = useCallback(() => {
    setFeedCollapsed(true)
  }, [])

  const dismissAllFeedEvents = useCallback(() => {
    setDismissedFeedIds((current) => {
      const next = new Set(current)
      for (const event of feedEvents) {
        next.add(event.event_id)
      }
      return [...next]
    })
    setFeedCollapsed(true)
  }, [feedEvents])

  const reopenFeedEvents = useCallback(() => {
    setFeedCollapsed(false)
  }, [])

  function setUtilityDock(nextTab: 'runtime' | 'release' | 'layout' | 'power' | null) {
    setUtilityDockTab(nextTab)
    if (nextTab === 'layout') {
      setSelectedBuilding(null)
      setEditTarget((current) => current ?? 'monument')
      return
    }
    setEditTarget(null)
  }

  function toggleUtilityDock(tab: 'runtime' | 'release' | 'layout' | 'power') {
    setUtilityDock(utilityDockTab === tab ? null : tab)
  }

  function toggleUtilityLauncher() {
    setUtilityDock(utilityDockTab ? null : 'runtime')
  }

  const handleSelectBuilding = useCallback((next: string | null) => {
    if (editMode) {
      setEditTarget(next ?? 'monument')
      setSelectedBuilding(null)
      return
    }
    setSelectedBuilding(next)
  }, [editMode])

  async function handleLaunchRun() {
    if (!selectedProject || !operatorProfile) {
      setRuntimeNotice('Choose a saved project first.')
      return
    }
    setRuntimeBusy(true)
    setRuntimeNotice(`Launching run for ${selectedProject.name}...`)
    try {
      const launchProfile = operatorProfile.launch
      const settings = launchProfile.run_settings
      const result = await launchRun({
        mission: buildRunMission(selectedProject),
        project_slug: selectedProject.slug,
        mode: launchProfile.mode,
        codex_model: settings.codex_model,
        codex_autonomy: settings.codex_autonomy,
        codex_review_model: settings.codex_review_model,
        codex_review_autonomy: settings.codex_review_autonomy,
        max_parallel_departments: settings.max_parallel_departments ?? 9,
        pause_between_departments: launchProfile.pause_between_departments ?? 0,
      })
      setRuntimeNotice(`Run ${result.run_id} launched for ${selectedProject.name}.`)
      await refreshConsoleRuntime()
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : 'Run launch failed.')
    } finally {
      setRuntimeBusy(false)
    }
  }

  async function handleLaunchLoop() {
    if (!selectedProject || !operatorProfile) {
      setRuntimeNotice('Choose a saved project first.')
      return
    }
    setRuntimeBusy(true)
    setRuntimeNotice(`Starting loop for ${selectedProject.name}...`)
    try {
      const autopilotProfile = operatorProfile.autopilot
      const settings = autopilotProfile.run_settings
      const result = await launchLoop({
        objective: buildLoopObjective(selectedProject),
        project_slug: selectedProject.slug,
        run_mode: autopilotProfile.run_mode,
        loop_mode: autopilotProfile.loop_mode,
        codex_model: settings.codex_model,
        codex_autonomy: settings.codex_autonomy,
        codex_review_model: settings.codex_review_model,
        codex_review_autonomy: settings.codex_review_autonomy,
        max_parallel_departments: settings.max_parallel_departments ?? 9,
        pause_between_departments: autopilotProfile.pause_between_departments ?? 0,
        interval_seconds: autopilotProfile.interval_seconds,
        max_iterations: autopilotProfile.max_iterations,
      })
      setRuntimeNotice(`Loop ${result.loop_id} started for ${selectedProject.name}.`)
      await refreshConsoleRuntime()
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : 'Loop start failed.')
    } finally {
      setRuntimeBusy(false)
    }
  }

  async function handleBuildRelease() {
    if (!selectedProject) {
      setReleaseNotice('Choose a saved project first.')
      return
    }
    if (activeRelease) {
      setReleaseNotice(`Release ${activeRelease.release_id} is already packaging.`)
      return
    }
    setReleaseBusy(true)
    setReleaseNotice(`Release Center is packaging ${selectedProject.name}...`)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => {})
      }
      const result = await buildRelease(selectedProject.slug)
      setReleaseNotice(`Release ${result.release_id} started for ${selectedProject.name}.`)
      await refreshConsoleRuntime()
    } catch (error) {
      setReleaseNotice(error instanceof Error ? error.message : 'Release packaging failed to start.')
    } finally {
      setReleaseBusy(false)
    }
  }

  function handleDownloadLatest() {
    if (!latestRelease?.download_url) {
      setReleaseNotice('No completed release is ready to download yet.')
      return
    }
    window.location.href = backendUrl(latestRelease.download_url)
  }

  async function handleStopRuntime() {
    setRuntimeBusy(true)
    setRuntimeNotice(liveLoop ? `Stopping loop ${liveLoop.loop_id}...` : activeRun ? `Stopping run ${activeRun.run_id}...` : 'Nothing is running right now.')
    try {
      if (liveLoop) {
        await stopLoop(liveLoop.loop_id)
        setRuntimeNotice(`Stop requested for loop ${liveLoop.loop_id}.`)
      } else if (activeRun) {
        await stopRun(activeRun.run_id)
        setRuntimeNotice(`Stop requested for run ${activeRun.run_id}.`)
      }
      await refreshConsoleRuntime()
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : 'Stop request failed.')
    } finally {
      setRuntimeBusy(false)
    }
  }

  async function handleForceStopRuntime() {
    setRuntimeBusy(true)
    setRuntimeNotice(
      liveLoop
        ? `Force stopping loop ${liveLoop.loop_id}...`
        : activeRun
          ? `Force stopping run ${activeRun.run_id}...`
          : 'Nothing is running right now.',
    )
    try {
      if (liveLoop) {
        await forceStopLoop(liveLoop.loop_id)
        setRuntimeNotice(`Loop ${liveLoop.loop_id} force stopped. In-flight work may be incomplete.`)
      } else if (activeRun) {
        await forceStopRun(activeRun.run_id)
        setRuntimeNotice(`Run ${activeRun.run_id} force stopped. In-flight work may be incomplete.`)
      }
      await refreshConsoleRuntime()
    } catch (error) {
      setRuntimeNotice(error instanceof Error ? error.message : 'Force stop failed.')
    } finally {
      setRuntimeBusy(false)
    }
  }

  function updateBuildingPosition(buildingKey: string, dx: number, dz: number) {
    setLayoutDraft((current) => {
      if (!current?.buildings[buildingKey]) {
        return current
      }
      const next = structuredClone(current) as CampusLayout
      next.buildings[buildingKey].position = [
        Number((next.buildings[buildingKey].position[0] + dx).toFixed(2)),
        next.buildings[buildingKey].position[1],
        Number((next.buildings[buildingKey].position[2] + dz).toFixed(2)),
      ]
      return next
    })
  }

  function updateMonument(dx: number, dz: number) {
    setLayoutDraft((current) => {
      if (!current) {
        return current
      }
      const next = structuredClone(current) as CampusLayout
      next.monument.position = [
        Number((next.monument.position[0] + dx).toFixed(2)),
        next.monument.position[1],
        Number((next.monument.position[2] + dz).toFixed(2)),
      ]
      return next
    })
  }

  function updateMonumentScale(delta: number) {
    setLayoutDraft((current) => {
      if (!current) {
        return current
      }
      const next = structuredClone(current) as CampusLayout
      next.monument.baseInnerRadius = Math.max(0.3, Number((next.monument.baseInnerRadius + delta).toFixed(2)))
      next.monument.baseOuterRadius = Math.max(next.monument.baseInnerRadius + 0.06, Number((next.monument.baseOuterRadius + delta).toFixed(2)))
      next.monument.ringInnerRadius = Math.max(0.16, Number((next.monument.ringInnerRadius + delta * 0.4).toFixed(2)))
      next.monument.ringOuterRadius = Math.max(next.monument.ringInnerRadius + 0.06, Number((next.monument.ringOuterRadius + delta * 0.4).toFixed(2)))
      next.monument.torusRadius = Math.max(0.18, Number((next.monument.torusRadius + delta * 0.35).toFixed(2)))
      next.monument.orbRadius = Math.max(0.06, Number((next.monument.orbRadius + delta * 0.12).toFixed(2)))
      return next
    })
  }

  async function handleSaveLayout() {
    if (!layoutDraft) {
      return
    }
    setLayoutSaving(true)
    setLayoutNotice(null)
    try {
      const saved = await saveCampusLayout(layoutDraft)
      setLayoutDraft(saved)
      setLayoutNotice('Layout saved to local JSON.')
    } catch (error) {
      setLayoutNotice(error instanceof Error ? error.message : 'Layout save failed.')
    } finally {
      setLayoutSaving(false)
    }
  }

  async function handleResetLayout() {
    setLayoutNotice(null)
    await layoutResource.refresh()
    setLayoutNotice('Reloaded layout from file.')
  }

  return (
    <div className={`console-world console-world--${timeTheme}`}>
      {selectedBuilding && !editMode && (
        <div className="console-overview-back">
          <button type="button" className="console-overview-back__button" onClick={() => setSelectedBuilding(null)}>
            ← Back to Campus overview
          </button>
        </div>
      )}
      {selectedBuilding && !editMode && (
        <aside className="console-focus-card">
          <div className="console-focus-card__head">
            <div>
              <span className="hud-small-tag">DEPARTMENT FOCUS</span>
              <strong>{selectedLabel}</strong>
            </div>
            <button type="button" className="console-focus-card__close" onClick={() => setSelectedBuilding(null)}>
              Back
            </button>
          </div>
          <div className="console-focus-card__meta">
            <span className={`console-focus-card__status console-focus-card__status--${selectedStatus}`}>
              {selectedStatus}
            </span>
            {selectedTimestamp && <span>{selectedTimestamp}</span>}
          </div>
          {selectedSummary && <p className="console-focus-card__summary">{selectedSummary}</p>}
          {activeRun?.mission && (
            <p className="console-focus-card__mission">
              <span className="hud-small-tag">CURRENT MISSION</span>
              {activeRun.mission}
            </p>
          )}
        </aside>
      )}
      <div className={`console-utility-dock ${utilityDockTab ? 'console-utility-dock--open' : ''}`}>
        <div className="console-utility-dock__launcher" aria-label="Console utility launcher">
          <button
            type="button"
            className={`console-utility-dock__hub ${utilityDockTab ? 'is-active' : ''}`}
            onClick={toggleUtilityLauncher}
            aria-label={utilityDockTab ? 'Close utility launcher' : 'Open utility launcher'}
          >
            <span className="console-utility-dock__hub-orbit console-utility-dock__hub-orbit--outer" aria-hidden="true" />
            <span className="console-utility-dock__hub-orbit console-utility-dock__hub-orbit--inner" aria-hidden="true" />
            <span className="console-utility-dock__hub-core" aria-hidden="true" />
          </button>
          <div className="console-utility-dock__tools">
            <button
              type="button"
              className={`console-utility-dock__tool ${utilityDockTab === 'runtime' ? 'is-active' : ''}`}
              onClick={() => toggleUtilityDock('runtime')}
              aria-pressed={utilityDockTab === 'runtime'}
              aria-label="Open runtime controls"
              title={runtimeBookmarkMeta}
            >
              <span className="console-utility-dock__glyph console-utility-dock__glyph--runtime" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`console-utility-dock__tool ${utilityDockTab === 'release' ? 'is-active' : ''}`}
              onClick={() => toggleUtilityDock('release')}
              aria-pressed={utilityDockTab === 'release'}
              aria-label="Open release center"
              title={releaseBookmarkMeta}
            >
              <span className="console-utility-dock__glyph console-utility-dock__glyph--release" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`console-utility-dock__tool ${utilityDockTab === 'layout' ? 'is-active' : ''}`}
              onClick={() => toggleUtilityDock('layout')}
              aria-pressed={utilityDockTab === 'layout'}
              aria-label="Open layout editor"
              title={layoutBookmarkMeta}
            >
              <span className="console-utility-dock__glyph console-utility-dock__glyph--layout" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`console-utility-dock__tool ${utilityDockTab === 'power' ? 'is-active' : ''}`}
              onClick={() => toggleUtilityDock('power')}
              aria-pressed={utilityDockTab === 'power'}
              aria-label="Open UI power controls"
              title={powerBookmarkMeta}
            >
              <span className="console-utility-dock__glyph console-utility-dock__glyph--power" aria-hidden="true" />
            </button>
          </div>
        </div>
        {utilityDockTab === 'runtime' && (
          <aside className="console-utility-dock__panel">
            <div className="console-utility-dock__panel-header">
              <div>
                <span className="hud-small-tag">PROJECT RUNTIME</span>
                <strong className="console-utility-dock__title">
                  {runtimeProject?.name ?? currentProject?.name ?? 'No saved project selected'}
                </strong>
              </div>
              <div className="console-utility-dock__panel-actions">
                <span className="console-utility-dock__status">{runtimeSourceLabel}</span>
                <button
                  type="button"
                  className="console-utility-dock__close"
                  onClick={() => setUtilityDock(null)}
                >
                  Close
                </button>
              </div>
            </div>
            {projectLibrary.length > 0 ? (
              <div className="console-utility-dock__body">
                <label className="console-project-dock__field">
                  <span>Saved Project</span>
                  <select
                    value={selectedProjectSlug}
                    onChange={(event) => setSelectedProjectSlug(event.target.value)}
                    disabled={runtimeBusy}
                  >
                    {projectLibrary.map((project) => (
                      <option key={project.slug} value={project.slug}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedProject?.brief ? (
                  <p className="console-project-dock__brief">{selectedProject.brief}</p>
                ) : (
                  <p className="console-project-dock__brief console-project-dock__brief--muted">
                    Start from the saved workspace and project memory for the next cycle.
                  </p>
                )}
                <div className="console-project-dock__meta">
                  <span>{runtimeProject?.run_count ?? 0} saved run{runtimeProject?.run_count === 1 ? '' : 's'}</span>
                  {currentProject?.slug === selectedProjectSlug && <span>{currentProject.reference_label}</span>}
                </div>
                <div className="console-project-dock__actions">
                  {liveLoop || activeRun ? (
                    <>
                      <button
                        type="button"
                        className="console-project-dock__button console-project-dock__button--danger"
                        onClick={() => void handleStopRuntime()}
                        disabled={runtimeBusy}
                      >
                        {runtimeBusy ? 'Stopping…' : liveLoop ? 'Stop Loop' : 'Stop Run'}
                      </button>
                      <button
                        type="button"
                        className="console-project-dock__button console-project-dock__button--force"
                        onClick={() => void handleForceStopRuntime()}
                        disabled={runtimeBusy}
                      >
                        Force Stop
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="console-project-dock__button"
                        onClick={() => void handleLaunchRun()}
                        disabled={runtimeBusy || !selectedProject}
                      >
                        {runtimeBusy ? 'Starting…' : 'Run'}
                      </button>
                      <button
                        type="button"
                        className="console-project-dock__button console-project-dock__button--accent"
                        onClick={() => void handleLaunchLoop()}
                        disabled={runtimeBusy || !selectedProject}
                      >
                        {runtimeBusy ? 'Starting…' : 'Loop'}
                      </button>
                    </>
                  )}
                </div>
                {runtimeNotice && <p className="console-project-dock__notice">{runtimeNotice}</p>}
              </div>
            ) : (
              <div className="console-utility-dock__body">
                <p className="console-project-dock__brief console-project-dock__brief--muted">
                  No saved projects yet. Create one from the dashboard first, then you can run or loop it from here.
                </p>
                {runtimeNotice && <p className="console-project-dock__notice">{runtimeNotice}</p>}
              </div>
            )}
          </aside>
        )}
        {utilityDockTab === 'release' && (
          <aside className="console-utility-dock__panel">
            <div className="console-utility-dock__panel-header">
              <div>
                <span className="hud-small-tag">RELEASE CENTER</span>
                <strong className="console-utility-dock__title">
                  {runtimeProject?.name ?? currentProject?.name ?? 'No saved project selected'}
                </strong>
              </div>
              <div className="console-utility-dock__panel-actions">
                <span className={`console-utility-dock__status console-utility-dock__status--${releasePanel.statusTone}`}>
                  {releasePanel.statusLabel}
                </span>
                <button
                  type="button"
                  className="console-utility-dock__close"
                  onClick={() => setUtilityDock(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="console-utility-dock__body">
              {selectedProject ? (
                <>
                  <label className="console-project-dock__field">
                    <span>Saved Project</span>
                    <select
                      value={selectedProjectSlug}
                      onChange={(event) => setSelectedProjectSlug(event.target.value)}
                      disabled={releaseBusy}
                    >
                      {projectLibrary.map((project) => (
                        <option key={project.slug} value={project.slug}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="console-project-dock__brief">
                    Build a clean downloadable delivery bundle only when the operator asks for it. Normal run and loop flows stay unchanged.
                  </p>
                  <div className="console-project-dock__meta">
                    <span>{selectedProject.name}</span>
                    <span>{activeRelease ? activeRelease.release_id : latestRelease?.release_id ?? 'No release yet'}</span>
                    {releasePanel.timestampLabel && <span>{releasePanel.timestampLabel}</span>}
                  </div>
                  {(activeRelease || latestRelease) && (
                    <div className="console-release-dock__card">
                      <div className="console-release-dock__row">
                        <span className="console-release-dock__label">Status</span>
                        <strong>{releasePanel.statusLabel}</strong>
                      </div>
                      <strong className="console-release-dock__headline">{releasePanel.headline}</strong>
                      <p className="console-release-dock__summary">{releasePanel.summary}</p>
                      {latestRelease?.download_filename && (
                        <p className="console-release-dock__filename">{latestRelease.download_filename}</p>
                      )}
                    </div>
                  )}
                  <div className="console-project-dock__actions">
                    <button
                      type="button"
                      className="console-project-dock__button console-project-dock__button--accent"
                      onClick={() => void handleBuildRelease()}
                      disabled={releaseBusy || Boolean(activeRelease)}
                    >
                      {releaseBusy || activeRelease ? 'Packaging…' : releasePanel.buildLabel}
                    </button>
                    <button
                      type="button"
                      className="console-project-dock__button"
                      onClick={handleDownloadLatest}
                      disabled={!releasePanel.canDownload || Boolean(activeRelease) || releaseBusy}
                    >
                      Download
                    </button>
                  </div>
                  {releaseNotice && <p className="console-project-dock__notice">{releaseNotice}</p>}
                </>
              ) : (
                <>
                  <p className="console-project-dock__brief console-project-dock__brief--muted">
                    Choose a saved project first. Release Center only packages an existing project workspace into a delivery bundle.
                  </p>
                  {releaseNotice && <p className="console-project-dock__notice">{releaseNotice}</p>}
                </>
              )}
            </div>
          </aside>
        )}
        {utilityDockTab === 'layout' && (
          <aside className="console-utility-dock__panel">
            <div className="console-utility-dock__panel-header">
              <div>
                <span className="hud-small-tag">CAMPUS LAYOUT</span>
                <strong className="console-utility-dock__title">Layout Editor</strong>
              </div>
              <div className="console-utility-dock__panel-actions">
                <button
                  type="button"
                  className="layout-editor__save"
                  onClick={handleSaveLayout}
                  disabled={layoutSaving || !layoutDraft}
                >
                  {layoutSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="console-utility-dock__close"
                  onClick={() => setUtilityDock(null)}
                >
                  Close
                </button>
              </div>
            </div>
            {layoutDraft ? (
              <div className="console-utility-dock__body">
                <label className="layout-editor__field">
                  <span>Target</span>
                  <select
                    value={editTarget ?? ''}
                    onChange={(event) => {
                      const value = event.target.value || null
                      setEditTarget(value as string | 'monument' | null)
                      setSelectedBuilding(null)
                    }}
                  >
                    <option value="">Select target</option>
                    <option value="monument">Central Monument</option>
                    {buildingKeys.map((key) => (
                      <option key={key} value={key}>
                        {prettifyDepartmentKey(key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="layout-editor__field">
                  <span>Nudge</span>
                  <select value={layoutStep} onChange={(event) => setLayoutStep(Number(event.target.value))}>
                    <option value={0.25}>0.25</option>
                    <option value={0.5}>0.5</option>
                    <option value={1}>1.0</option>
                  </select>
                </label>
                {editTarget === 'monument' && monumentPosition && (
                  <p className="layout-editor__meta">
                    Monument · x {monumentPosition[0].toFixed(2)} / z {monumentPosition[2].toFixed(2)}
                  </p>
                )}
                {editTarget && editTarget !== 'monument' && selectedBuildingPosition && (
                  <p className="layout-editor__meta">
                    {describeLayoutTarget(editTarget)} · x {selectedBuildingPosition[0].toFixed(2)} / z {selectedBuildingPosition[2].toFixed(2)}
                  </p>
                )}
                <div className="layout-editor__pad">
                  <button
                    type="button"
                    onClick={() => {
                      if (editTarget === 'monument') updateMonument(0, -layoutStep)
                      else if (editTarget) updateBuildingPosition(editTarget, 0, -layoutStep)
                    }}
                    disabled={!editTarget}
                  >
                    ↑
                  </button>
                  <div className="layout-editor__pad-row">
                    <button
                      type="button"
                      onClick={() => {
                        if (editTarget === 'monument') updateMonument(-layoutStep, 0)
                        else if (editTarget) updateBuildingPosition(editTarget, -layoutStep, 0)
                      }}
                      disabled={!editTarget}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editTarget === 'monument') updateMonument(layoutStep, 0)
                        else if (editTarget) updateBuildingPosition(editTarget, layoutStep, 0)
                      }}
                      disabled={!editTarget}
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (editTarget === 'monument') updateMonument(0, layoutStep)
                      else if (editTarget) updateBuildingPosition(editTarget, 0, layoutStep)
                    }}
                    disabled={!editTarget}
                  >
                    ↓
                  </button>
                </div>
                {editTarget === 'monument' && (
                  <div className="layout-editor__scale">
                    <button type="button" onClick={() => updateMonumentScale(-0.08)}>
                      Shrink
                    </button>
                    <button type="button" onClick={() => updateMonumentScale(0.08)}>
                      Grow
                    </button>
                  </div>
                )}
                <div className="layout-editor__actions">
                  <button type="button" onClick={handleResetLayout}>
                    Reload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBuilding(null)
                      setEditTarget('monument')
                    }}
                  >
                    Monument
                  </button>
                </div>
                {layoutNotice && <p className="layout-editor__notice">{layoutNotice}</p>}
              </div>
            ) : (
              <div className="console-utility-dock__body">
                <p className="layout-editor__notice">Loading campus layout…</p>
              </div>
            )}
          </aside>
        )}
        {utilityDockTab === 'power' && (
          <aside className="console-utility-dock__panel">
            <div className="console-utility-dock__panel-header">
              <div>
                <span className="hud-small-tag">UI POWER</span>
                <strong className="console-utility-dock__title">24/7 Console Render</strong>
              </div>
              <div className="console-utility-dock__panel-actions">
                <span className="console-utility-dock__status">{isLowPowerMode ? 'Low Power' : 'Normal'}</span>
                <button
                  type="button"
                  className="console-utility-dock__close"
                  onClick={() => setUtilityDock(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="console-utility-dock__body">
              <div className="console-power-dock__card">
                <p className="console-power-dock__summary">
                  This switch only changes the local console UI. Background AI runtime and product generation stay unchanged.
                </p>
                <div className="console-power-dock__actions">
                  <button
                    type="button"
                    className={`console-project-dock__button console-power-dock__button ${renderMode === 'normal' ? 'is-selected' : ''}`}
                    onClick={() => setRenderMode('normal')}
                    aria-pressed={renderMode === 'normal'}
                  >
                    Normal UI
                  </button>
                  <button
                    type="button"
                    className={`console-project-dock__button console-project-dock__button--accent console-power-dock__button ${renderMode === 'low-power' ? 'is-selected' : ''}`}
                    onClick={() => setRenderMode('low-power')}
                    aria-pressed={renderMode === 'low-power'}
                  >
                    Low Power UI
                  </button>
                </div>
              </div>
              <div className="console-power-dock__card">
                <div className="console-power-dock__section-header">
                  <span className="hud-small-tag">CAMERA ORBIT</span>
                  <strong className="console-power-dock__value">
                    {cameraSettings.autoRotate ? formatSignedSpeed(cameraSettings.autoRotateSpeed) : 'OFF'}
                  </strong>
                </div>
                <div className="console-power-dock__actions">
                  <button
                    type="button"
                    className={`console-project-dock__button console-power-dock__button ${cameraSettings.autoRotate ? 'is-selected' : ''}`}
                    onClick={() => setCameraSettings((current) => ({ ...current, autoRotate: true }))}
                    aria-pressed={cameraSettings.autoRotate}
                  >
                    Auto Rotate On
                  </button>
                  <button
                    type="button"
                    className={`console-project-dock__button console-power-dock__button ${!cameraSettings.autoRotate ? 'is-selected' : ''}`}
                    onClick={() => setCameraSettings((current) => ({ ...current, autoRotate: false }))}
                    aria-pressed={!cameraSettings.autoRotate}
                  >
                    Auto Rotate Off
                  </button>
                </div>
                <label className="console-power-dock__field">
                  <span>Rotation Speed</span>
                  <input
                    className="console-power-dock__slider"
                    type="range"
                    min={AUTO_ROTATE_SPEED_MIN}
                    max={AUTO_ROTATE_SPEED_MAX}
                    step={0.02}
                    value={cameraSettings.autoRotateSpeed}
                    onChange={(event) => {
                      const nextSpeed = clampAutoRotateSpeed(Number(event.target.value))
                      setCameraSettings((current) => ({ ...current, autoRotateSpeed: nextSpeed }))
                    }}
                  />
                </label>
                <div className="console-power-dock__scale">
                  <span>{formatSignedSpeed(AUTO_ROTATE_SPEED_MIN)}</span>
                  <span>0.00</span>
                  <span>{formatSignedSpeed(AUTO_ROTATE_SPEED_MAX)}</span>
                </div>
                <div className="console-power-dock__preset-row">
                  {AUTO_ROTATE_SPEED_PRESETS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={`console-power-dock__preset ${
                        Math.abs(cameraSettings.autoRotateSpeed - speed) < 0.001 ? 'is-selected' : ''
                      }`}
                      onClick={() => setCameraSettings((current) => ({ ...current, autoRotateSpeed: speed }))}
                    >
                      {formatSignedSpeed(speed)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="console-power-dock__hint">
                Low power reduces canvas quality, animation load, rover count, data beams, and refresh cadence for long-running operator screens.
              </p>
            </div>
          </aside>
        )}
      </div>
      <Suspense
        fallback={(
          <div className="console-world__loading" role="status" aria-live="polite">
              <div className="console-world__loading-copy">
                <span className="console-world__loading-title">Preparing 3D campus</span>
                <p>{runtimeProject?.name ?? currentProject?.name ?? 'Current project'}</p>
              </div>
            </div>
          )}
      >
        <LazyWorldCanvas
          steps={activeRunSteps}
          currentDepartment={activeRun?.current_department ?? null}
          hasActiveRun={Boolean(activeRun)}
          bubbleEvents={bubbleEvents}
          onDismissBubble={dismissBubble}
          selectedBuilding={canvasSelectedBuilding}
          onSelectBuilding={handleSelectBuilding}
          timeTheme={timeTheme}
          layout={visibleLayout}
          showMonument={!hiddenCampusItems.has('monument')}
          workflowConfig={settingsResource.data ?? null}
          projectMaturity={projectMaturity}
          renderMode={renderMode}
          autoRotateEnabled={cameraSettings.autoRotate}
          autoRotateSpeed={cameraSettings.autoRotateSpeed}
        />
      </Suspense>
      <ConsoleHUD
        mission={activeRun?.mission ?? activeLoop?.objective ?? latestRun?.mission ?? null}
        iteration={activeLoop?.current_iteration ?? null}
        iterationsCompleted={activeLoop?.iterations_completed ?? 0}
        loopStatus={activeLoop?.status ?? null}
        activeRunCount={activeRunCount}
        loopNote={activeLoop?.latest_note ?? null}
        timeTheme={timeTheme}
        themeSource={themeSource}
        crewCounts={crewCounts}
        systemMode={systemMode}
        maturityTierLabel={projectMaturity.tierLabel}
        maturityPercent={projectMaturity.maturityPercent}
        lowPower={isLowPowerMode}
      />
      <EventFeedOverlay
        events={visibleFeedEvents}
        isCollapsed={feedCollapsed}
        onDismiss={dismissFeedEvent}
        onHide={clearFeedEvents}
        onClearAll={dismissAllFeedEvents}
        onExpand={reopenFeedEvents}
      />
    </div>
  )
}
