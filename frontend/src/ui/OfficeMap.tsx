import type { CSSProperties } from 'react'
import type { StepRecord } from '../types'
import { StatusBadge } from './StatusBadge'

const roomColumns = [0, 1, 2, 3, 0, 1, 2, 3]

interface OfficeMapProps {
  title: string
  note: string
  steps: StepRecord[]
  currentDepartment?: string | null
}

export function OfficeMap({ title, note, steps, currentDepartment }: OfficeMapProps) {
  const live = new Set(
    (currentDepartment ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )

  return (
    <section className="panel office-map-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="panel-note">{note}</p>
        </div>
      </div>

      <div className="office-map">
        <div className="office-hall office-hall-horizontal" />
        <div className="office-hall office-hall-vertical" />
        <div className="office-courier courier-a" />
        <div className="office-courier courier-b" />

        {steps.map((step, index) => {
          const isLive =
            step.status === 'running' ||
            live.has(step.department_key.toLowerCase()) ||
            live.has(step.department_label.toLowerCase())
          const roomClass = isLive ? 'is-live' : `is-${step.status}`
          const style = {
            '--room-col': `${roomColumns[index] ?? (index % 4)}`,
          } as CSSProperties

          return (
            <article key={step.department_key} className={`office-room ${roomClass}`} style={style}>
              <div className="office-room-head">
                <strong>{step.department_label}</strong>
                <StatusBadge value={isLive ? 'running' : step.status} />
              </div>
              <p>{step.summary || step.purpose}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
