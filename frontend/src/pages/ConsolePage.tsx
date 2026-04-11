import { useEffect, useMemo, useState } from 'react'
import { getCampusLayout, getFeed, getOperatorProfile, listLoops, listRuns, saveCampusLayout } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { useSolarTheme } from '../hooks/useSolarTheme'
import type { CampusLayout, EventEntry, StepRecord } from '../types'
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

export function ConsolePage() {
  const runsResource = useJsonResource(listRuns, [])
  const loopsResource = useJsonResource(listLoops, [])
  const feedResource = useJsonResource(getFeed, [])
  const layoutResource = useJsonResource(getCampusLayout, [])
  const profileResource = useJsonResource(getOperatorProfile, [])
  const [dismissedFeedIds, setDismissedFeedIds] = useState<string[]>([])
  const [dismissedBubbleIds, setDismissedBubbleIds] = useState<string[]>([])
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editTarget, setEditTarget] = useState<string | 'monument' | null>(null)
  const [layoutDraft, setLayoutDraft] = useState<CampusLayout | null>(null)
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutStep, setLayoutStep] = useState(0.5)

  useLiveRefresh(async () => {
    await Promise.all([runsResource.refresh(), loopsResource.refresh(), feedResource.refresh(), profileResource.refresh()])
  }, 4000)

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
  const feedData = feedResource.data
  const feedEvents = useMemo(() => feedData?.events ?? [], [feedData])
  const rawBubbleEvents = useMemo(() => feedData?.bubbles ?? {}, [feedData])
  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === 'running'),
    [runs],
  )

  const activeLoop =
    loops.find((l) => l.status === 'running' || l.status === 'stopping') ??
    loops[0] ??
    null
  const activeRun = activeRuns[0] ?? null
  const latestRun = runs[0] ?? null
  const activeRunCount = activeRuns.length
  const systemMode: 'live' | 'stopping' | 'idle' =
    activeLoop?.status === 'stopping'
      ? 'stopping'
      : activeLoop?.status === 'running' || activeRunCount > 0
        ? 'live'
        : 'idle'
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
  const { timeTheme } = useSolarTheme(clockNow)
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
  const systemLabel = useMemo(() => {
    if (systemMode === 'stopping') {
      return 'Controlled Stop'
    }
    if (systemMode === 'live') {
      return 'Operating'
    }
    return 'Standby'
  }, [systemMode])
  const dockMessage = activeLoop?.latest_note ?? activeRun?.mission ?? latestRun?.mission ?? null
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
  const canvasSelectedBuilding =
    editMode && editTarget && editTarget !== 'monument' ? editTarget : selectedBuilding

  function dismissBubble(eventId: string) {
    setDismissedBubbleIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }

  function dismissFeedEvent(eventId: string) {
    setDismissedFeedIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }

  function clearFeedEvents() {
    setDismissedFeedIds(visibleFeedEvents.map((event) => event.event_id))
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
      <aside className="console-ops-dock">
        <div className="console-ops-dock__top">
          <a href="/" className="console-ops-dock__home">Home</a>
          <button
            type="button"
            className="console-ops-dock__toggle"
            onClick={() =>
              setEditMode((current) => {
                const next = !current
                setSelectedBuilding(null)
                if (next) {
                  setEditTarget('monument')
                } else {
                  setEditTarget(null)
                }
                return next
              })
            }
          >
            {editMode ? 'Close Layout' : 'Layout Edit'}
          </button>
        </div>

        <div className="console-ops-dock__status">
          <span className={`console-ops-dock__mode console-ops-dock__mode--${systemMode}`}>{systemLabel}</span>
          <span>{activeRunCount} active run{activeRunCount !== 1 ? 's' : ''}</span>
          <span>{localClockLabel}</span>
        </div>

        <div className="console-ops-dock__crew">
          <article className="console-ops-dock__crew-card">
            <small>HQ</small>
            <strong>{String(crewCounts.hq).padStart(2, '0')}</strong>
          </article>
          <article className="console-ops-dock__crew-card">
            <small>R&amp;D</small>
            <strong>{String(crewCounts.rnd).padStart(2, '0')}</strong>
          </article>
          <article className="console-ops-dock__crew-card">
            <small>Operations</small>
            <strong>{String(crewCounts.operations).padStart(2, '0')}</strong>
          </article>
        </div>

        {dockMessage && <p className="console-ops-dock__message">{dockMessage}</p>}

        {editMode && layoutDraft && (
          <div className="console-ops-dock__editor">
            <div className="layout-editor__header">
              <strong>Layout Editor</strong>
              <div className="layout-editor__header-actions">
                <button
                  type="button"
                  className="layout-editor__save"
                  onClick={handleSaveLayout}
                  disabled={layoutSaving || !layoutDraft}
                >
                  {layoutSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div className="layout-editor__body">
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
                      {key}
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
                  {editTarget} · x {selectedBuildingPosition[0].toFixed(2)} / z {selectedBuildingPosition[2].toFixed(2)}
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
                <button type="button" onClick={() => { setSelectedBuilding(null); setEditTarget('monument') }}>
                  Monument
                </button>
              </div>
              {layoutNotice && <p className="layout-editor__notice">{layoutNotice}</p>}
            </div>
          </div>
        )}
      </aside>
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
      <EventFeedOverlay
        events={visibleFeedEvents}
        onDismiss={dismissFeedEvent}
        onClearAll={clearFeedEvents}
      />
    </div>
  )
}
