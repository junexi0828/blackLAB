import type { EventEntry } from '../types'

interface EventFeedOverlayProps {
  events: EventEntry[]
  onDismiss: (eventId: string) => void
  onClearAll: () => void
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function EventFeedOverlay({ events, onDismiss, onClearAll }: EventFeedOverlayProps) {
  const visibleEvents = events.slice(0, 8)

  return (
    <aside className="console-event-feed">
      <div className="console-event-feed__header">
        <span className="hud-small-tag">EVENT FEED</span>
        <div className="console-event-feed__actions">
          <span className="console-event-feed__count">{visibleEvents.length}</span>
          {visibleEvents.length > 0 && (
            <button type="button" className="console-event-feed__clear" onClick={onClearAll}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="console-event-feed__list">
        {visibleEvents.map((event) => (
          <article
            key={event.event_id}
            className={`console-event-card console-event-card--${event.status} ${event.is_live ? 'is-live' : ''}`}
          >
            <div className="console-event-card__meta">
              <span>{event.department_label ?? event.scope.toUpperCase()}</span>
              <div className="console-event-card__meta-right">
                <span>{formatTimestamp(event.timestamp)}</span>
                <button
                  type="button"
                  className="console-event-card__dismiss"
                  onClick={() => onDismiss(event.event_id)}
                  aria-label={`Dismiss ${event.title}`}
                >
                  ×
                </button>
              </div>
            </div>
            <strong>{event.title}</strong>
            <p>{event.message}</p>
          </article>
        ))}
      </div>
    </aside>
  )
}
