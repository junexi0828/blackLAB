import type { CSSProperties } from 'react'
import type { StepRecord } from '../types'
import { StatusBadge } from './StatusBadge'

const departmentHue: Record<string, number> = {
  ceo: 24,
  research: 160,
  product: 210,
  design: 334,
  engineering: 48,
  growth: 118,
  finance: 188,
  validation: 198,
  test_lab: 6,
  quality_gate: 94,
  board_review: 284,
}

interface AgentFloorProps {
  title: string
  note: string
  steps: StepRecord[]
  currentDepartment?: string | null
}

export function AgentFloor({ title, note, steps, currentDepartment }: AgentFloorProps) {
  const activeDepartments = new Set(
    (currentDepartment ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )

  return (
    <section className="panel floor-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="panel-note">{note}</p>
        </div>
      </div>

      <div className="agent-floor">
        {steps.map((step, index) => {
          const isActive =
            step.status === 'running' ||
            activeDepartments.has(step.department_label.toLowerCase()) ||
            activeDepartments.has(step.department_key.toLowerCase())
          const deskStatus = isActive ? 'running' : step.status
          const deskStyle = {
            '--desk-hue': departmentHue[step.department_key] ?? ((index * 37) % 360),
          } as CSSProperties

          return (
            <article key={step.department_key} className={`agent-desk desk-${deskStatus}`} style={deskStyle}>
              <div className="agent-desk-head">
                <div>
                  <p className="agent-tag">{step.department_key.replace('_', ' ')}</p>
                  <strong>{step.department_label}</strong>
                </div>
                <StatusBadge value={deskStatus} />
              </div>

              <div className="agent-avatar" aria-hidden="true">
                <div className="robot-head">
                  <span className="robot-eye" />
                  <span className="robot-eye" />
                </div>
                <div className="robot-body">
                  <span className="robot-core" />
                </div>
                <span className="robot-arm arm-left" />
                <span className="robot-arm arm-right" />
              </div>

              <div className="desk-track">
                <div className="desk-track-fill" />
              </div>

              <p className="desk-copy">{step.summary || step.purpose}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
