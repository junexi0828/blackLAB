import { useEffect, useMemo, useState } from 'react'
import { getCampusLayout, getFeed, getOperatorProfile, getProjects, launchLoop, launchRun, listLoops, listRuns, saveCampusLayout, stopLoop, stopRun } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { useSolarTheme } from '../hooks/useSolarTheme'
import type { CampusLayout, EventEntry, ProjectLibraryEntry, StepRecord } from '../types'
import { ConsoleHUD } from '../ui/ConsoleHUD'
import { EventFeedOverlay } from '../ui/EventFeedOverlay'
import { WorldCanvas } from '../ui/WorldCanvas'
import { buildCrewCounts, resolveLiveDepartmentKeys } from '../ui/roverPersona'

const BUBBLE_TTL_MS = 14000

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
  const [dismissedFeedIds, setDismissedFeedIds] = useState<string[]>([])
  const [dismissedBubbleIds, setDismissedBubbleIds] = useState<string[]>([])
  const [feedCollapsed, setFeedCollapsed] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [utilityDockTab, setUtilityDockTab] = useState<'runtime' | 'layout' | null>(null)
  const [editTarget, setEditTarget] = useState<string | 'monument' | null>(null)
  const [layoutDraft, setLayoutDraft] = useState<CampusLayout | null>(null)
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutStep, setLayoutStep] = useState(0.5)
  const [selectedProjectSlug, setSelectedProjectSlug] = useState('')
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (layoutResource.data) {
      setLayoutDraft(layoutResource.data)
    }
  }, [layoutResource.data])

  const runs = useMemo(() => runsResource.data ?? [], [runsResource.data])
  const loops = useMemo(() => loopsResource.data ?? [], [loopsResource.data])
  const operatorProfile = profileResource.data
  const projectsPayload = projectsResource.data
  const feedData = feedResource.data
  const feedEvents = useMemo(() => feedData?.events ?? [], [feedData])
  const rawBubbleEvents = useMemo(() => feedData?.bubbles ?? {}, [feedData])
  const currentProject = projectsPayload?.current_project ?? null
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
      },
      ...items,
    ]
  }, [projectsPayload?.projects, currentProject])
  const selectedProject = useMemo(
    () => projectLibrary.find((project) => project.slug === selectedProjectSlug) ?? null,
    [projectLibrary, selectedProjectSlug],
  )
  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === 'running'),
    [runs],
  )

  const activeLoop =
    loops.find((l) => l.status === 'running' || l.status === 'stopping') ??
    loops[0] ??
    null
  const liveLoop = useMemo(
    () => loops.find((loop) => loop.status === 'running' || loop.status === 'stopping') ?? null,
    [loops],
  )
  const activeRun = activeRuns[0] ?? null
  const latestRun = runs[0] ?? null
  const activeRunCount = activeRuns.length
  const systemMode: 'live' | 'stopping' | 'idle' =
    activeLoop?.status === 'stopping'
      ? 'stopping'
      : activeLoop?.status === 'running' || activeRunCount > 0
        ? 'live'
        : 'idle'
  const refreshIntervalMs = systemMode === 'idle' ? 12000 : 4000
  const hiddenRefreshIntervalMs = systemMode === 'idle' ? 30000 : 12000
  const liveDepartmentKeys = useMemo(
    () => resolveLiveDepartmentKeys(activeRun?.steps ?? [], activeRun?.current_department ?? null),
    [activeRun?.current_department, activeRun?.steps],
  )
  const crewCounts = useMemo(
    () => buildCrewCounts(liveDepartmentKeys),
    [liveDepartmentKeys],
  )

  const bubbleEvents = useMemo(() => {
    const visible = Object.values(rawBubbleEvents)
      .filter((event) => !dismissedBubbleIds.includes(event.event_id))
      .filter((event) => clockNow - new Date(event.timestamp).getTime() < BUBBLE_TTL_MS)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 6)
    return Object.fromEntries(visible.map((event) => [event.department_key ?? event.event_id, event]))
  }, [rawBubbleEvents, dismissedBubbleIds, clockNow])

  const visibleFeedEvents = useMemo(
    () => feedEvents.filter((event) => !dismissedFeedIds.includes(event.event_id)),
    [feedEvents, dismissedFeedIds],
  )

  const localDate = useMemo(() => new Date(clockNow), [clockNow])
  const { timeTheme, themeSource } = useSolarTheme(clockNow)
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
        return activeDepartmentKeys.has(key) && !hiddenCampusItems.has(key)
      }),
    )
    return {
      buildings,
      monument: layoutDraft.monument,
    }
  }, [layoutDraft, operatorProfile, activeDepartmentKeys, hiddenCampusItems])
  const buildingKeys = useMemo(
    () => Object.keys(layoutDraft?.buildings ?? {}).filter((key) => key !== 'engineering'),
    [layoutDraft],
  )
  const selectedBuildingPosition =
    editTarget && editTarget !== 'monument' ? layoutDraft?.buildings[editTarget]?.position ?? null : null
  const monumentPosition = layoutDraft?.monument.position ?? null
  const localClockLabel = useMemo(
    () =>
      localDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [localDate],
  )
  const selectedStep = useMemo<StepRecord | null>(() => {
    if (!selectedBuilding) {
      return null
    }
    const sourceSteps = activeRun?.steps ?? latestRun?.steps ?? []
    return sourceSteps.find((step) => step.department_key === selectedBuilding) ?? null
  }, [selectedBuilding, activeRun?.steps, latestRun?.steps])
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
    liveLoop ? 'Loop active' : activeRun ? 'Run active' : selectedProject?.name ?? currentProject?.name ?? 'Ready'
  const layoutBookmarkMeta = editMode ? describeLayoutTarget(editTarget) : layoutNotice ?? 'Adjust campus'

  useLiveRefresh(
    async () => {
      await Promise.all([
        runsResource.refresh(),
        loopsResource.refresh(),
        feedResource.refresh(),
        profileResource.refresh(),
        projectsResource.refresh(),
      ])
    },
    refreshIntervalMs,
    true,
    hiddenRefreshIntervalMs,
  )

  useEffect(() => {
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
    currentProject?.slug,
    operatorProfile?.autopilot.project_slug,
    operatorProfile?.launch.project_slug,
    projectLibrary,
    selectedProjectSlug,
  ])

  function dismissBubble(eventId: string) {
    setDismissedBubbleIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }

  function dismissFeedEvent(eventId: string) {
    setDismissedFeedIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }

  function clearFeedEvents() {
    setFeedCollapsed(true)
  }

  function dismissAllFeedEvents() {
    setDismissedFeedIds((current) => {
      const next = new Set(current)
      for (const event of feedEvents) {
        next.add(event.event_id)
      }
      return [...next]
    })
    setFeedCollapsed(true)
  }

  function reopenFeedEvents() {
    setFeedCollapsed(false)
  }

  function setUtilityDock(nextTab: 'runtime' | 'layout' | null) {
    setUtilityDockTab(nextTab)
    if (nextTab === 'layout') {
      setSelectedBuilding(null)
      setEditTarget((current) => current ?? 'monument')
      return
    }
    setEditTarget(null)
  }

  function toggleUtilityDock(tab: 'runtime' | 'layout') {
    setUtilityDock(utilityDockTab === tab ? null : tab)
  }

  function toggleUtilityLauncher() {
    setUtilityDock(utilityDockTab ? null : 'runtime')
  }

  async function refreshConsoleRuntime() {
    await Promise.all([
      runsResource.refresh(),
      loopsResource.refresh(),
      feedResource.refresh(),
      profileResource.refresh(),
      projectsResource.refresh(),
    ])
  }

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
              className={`console-utility-dock__tool ${utilityDockTab === 'layout' ? 'is-active' : ''}`}
              onClick={() => toggleUtilityDock('layout')}
              aria-pressed={utilityDockTab === 'layout'}
              aria-label="Open layout editor"
              title={layoutBookmarkMeta}
            >
              <span className="console-utility-dock__glyph console-utility-dock__glyph--layout" aria-hidden="true" />
            </button>
          </div>
        </div>
        {utilityDockTab === 'runtime' && (
          <aside className="console-utility-dock__panel">
            <div className="console-utility-dock__panel-header">
              <div>
                <span className="hud-small-tag">PROJECT RUNTIME</span>
                <strong className="console-utility-dock__title">
                  {selectedProject?.name ?? currentProject?.name ?? 'No saved project selected'}
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
                  <span>{selectedProject?.run_count ?? 0} saved run{selectedProject?.run_count === 1 ? '' : 's'}</span>
                  {currentProject?.slug === selectedProjectSlug && <span>{currentProject.reference_label}</span>}
                </div>
                <div className="console-project-dock__actions">
                  {liveLoop || activeRun ? (
                    <button
                      type="button"
                      className="console-project-dock__button console-project-dock__button--danger"
                      onClick={() => void handleStopRuntime()}
                      disabled={runtimeBusy}
                    >
                      {runtimeBusy ? 'Stopping…' : liveLoop ? 'Stop Loop' : 'Stop Run'}
                    </button>
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
      </div>
      <WorldCanvas
        steps={activeRun?.steps ?? []}
        currentDepartment={activeRun?.current_department ?? null}
        hasActiveRun={Boolean(activeRun)}
        bubbleEvents={bubbleEvents}
        onDismissBubble={dismissBubble}
        selectedBuilding={canvasSelectedBuilding}
        onSelectBuilding={(next) => {
          if (editMode) {
            setEditTarget(next ?? 'monument')
            setSelectedBuilding(null)
            return
          }
          setSelectedBuilding(next)
        }}
        timeTheme={timeTheme}
        layout={visibleLayout}
        showMonument={!hiddenCampusItems.has('monument')}
      />
      <ConsoleHUD
        mission={activeRun?.mission ?? activeLoop?.objective ?? latestRun?.mission ?? null}
        iteration={activeLoop?.current_iteration ?? null}
        iterationsCompleted={activeLoop?.iterations_completed ?? 0}
        loopStatus={activeLoop?.status ?? null}
        activeRunCount={activeRunCount}
        loopNote={activeLoop?.latest_note ?? null}
        timeTheme={timeTheme}
        localClockLabel={localClockLabel}
        themeSource={themeSource}
        crewCounts={crewCounts}
        systemMode={systemMode}
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
