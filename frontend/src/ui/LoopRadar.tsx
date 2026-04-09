import type { CSSProperties } from 'react'

interface LoopRadarProps {
  title: string
  value: number
  total?: number | null
  note: string
}

export function LoopRadar({ title, value, total, note }: LoopRadarProps) {
  const ratio = total && total > 0 ? Math.max(0.08, Math.min(1, value / total)) : Math.max(0.12, Math.min(1, value / 8))

  return (
    <article className="loop-radar panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="panel-note">{note}</p>
        </div>
      </div>

      <div className="radar-wrap">
        <div className="radar-ring" style={{ '--ring-progress': `${ratio}` } as CSSProperties}>
          <div className="radar-core">
            <strong>{value}</strong>
            <span>{total ? `of ${total}` : 'cycles observed'}</span>
          </div>
        </div>
      </div>
    </article>
  )
}
