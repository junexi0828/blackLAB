import { useEffect, useMemo, useState } from 'react'
import { getFeed, listLoops, listRuns } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { ConsoleHUD } from '../ui/ConsoleHUD'
import { EventFeedOverlay } from '../ui/EventFeedOverlay'
import { WorldCanvas } from '../ui/WorldCanvas'

const BUBBLE_TTL_MS = 14000

export function ConsolePage() {
  const runsResource = useJsonResource(listRuns, [])
  const loopsResource = useJsonResource(listLoops, [])
  const feedResource = useJsonResource(getFeed, [])
  const [dismissedFeedIds, setDismissedFeedIds] = useState<string[]>([])
  const [dismissedBubbleIds, setDismissedBubbleIds] = useState<string[]>([])
  const [clockNow, setClockNow] = useState(() => Date.now())

  useLiveRefresh(async () => {
    await Promise.all([runsResource.refresh(), loopsResource.refresh(), feedResource.refresh()])
  }, 4000)

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const runs = useMemo(() => runsResource.data ?? [], [runsResource.data])
  const loops = useMemo(() => loopsResource.data ?? [], [loopsResource.data])
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

  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)

  function dismissBubble(eventId: string) {
    setDismissedBubbleIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }

  function dismissFeedEvent(eventId: string) {
    setDismissedFeedIds((current) => (current.includes(eventId) ? current : [...current, eventId]))
  }

  function clearFeedEvents() {
    setDismissedFeedIds(visibleFeedEvents.map((event) => event.event_id))
  }

  return (
    <div className="console-world">
      {selectedBuilding && (
        <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <button 
            type="button"
            className="base-button primary-button"
            style={{ padding: '0.5rem 1rem', borderRadius: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            onClick={() => setSelectedBuilding(null)}
          >
            ← Back to Campus overview
          </button>
        </div>
      )}
      <WorldCanvas
        steps={activeRun?.steps ?? []}
        currentDepartment={activeRun?.current_department ?? null}
        hasActiveRun={Boolean(activeRun)}
        bubbleEvents={bubbleEvents}
        onDismissBubble={dismissBubble}
        selectedBuilding={selectedBuilding}
        onSelectBuilding={setSelectedBuilding}
      />
      <ConsoleHUD
        mission={activeRun?.mission ?? activeLoop?.objective ?? latestRun?.mission ?? null}
        iteration={activeLoop?.current_iteration ?? null}
        iterationsCompleted={activeLoop?.iterations_completed ?? 0}
        loopStatus={activeLoop?.status ?? null}
        activeRunCount={activeRunCount}
        loopNote={activeLoop?.latest_note ?? null}
      />
      <EventFeedOverlay
        events={visibleFeedEvents}
        onDismiss={dismissFeedEvent}
        onClearAll={clearFeedEvents}
      />
    </div>
  )
}
