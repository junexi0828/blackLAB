import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { backendUrl, getRun } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { AgentFloor } from '../ui/AgentFloor'
import { AlertStack } from '../ui/AlertStack'
import { LoopRadar } from '../ui/LoopRadar'
import { MissionTicker } from '../ui/MissionTicker'
import { OfficeMap } from '../ui/OfficeMap'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import { StatusBadge } from '../ui/StatusBadge'

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const runResource = useJsonResource(() => getRun(runId), [runId])
  useLiveRefresh(() => runResource.refresh(), 4000, runResource.data?.status === 'running')

  const selectedArtifact = useMemo(() => {
    const run = runResource.data
    if (!run) {
      return null
    }
    return run.artifacts.findLast((artifact) => artifact.department_key === 'board_review') ?? run.artifacts.at(-1) ?? null
  }, [runResource.data])

  if (!runId) {
    return <div className="panel error-panel">Missing run id.</div>
  }

  if (runResource.isLoading || runResource.error || !runResource.data) {
    return (
      <>
        <PageHeader title="Run Detail" description="Inspect one run, its artifacts, and live worker state." />
        <ResourceState isLoading={runResource.isLoading} error={runResource.error} />
      </>
    )
  }

  const run = runResource.data
  const tickerItems = [
    `Run ${run.run_id} :: ${run.current_status}`,
    `Next action :: ${run.next_action}`,
    ...run.steps.slice(0, 4).map((step) => `${step.department_label} :: ${step.summary || step.purpose}`),
  ]

  return (
    <>
      {run.project_slug && (
        <div style={{
          padding: '16px 24px',
          marginBottom: '24px',
          background: 'linear-gradient(90deg, rgba(30,58,138,0.2) 0%, rgba(17,24,39,0) 100%)',
          borderLeft: '4px solid var(--highlight)',
          borderRadius: '4px',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--highlight)' }}>
            PROJECT // {run.project_name || run.project_slug}
          </h2>
        </div>
      )}
      <PageHeader
        title={run.mission}
        description={
          `Run ${run.run_id} · ${run.mode} · core ${run.settings.codex_model} / ${run.settings.codex_autonomy} · ` +
          `review ${run.settings.codex_review_model} / ${run.settings.codex_review_autonomy}`
        }
        actions={<StatusBadge value={run.status} />}
      />

      <section className="hq-stage">
        <article className="panel hq-briefing">
          <p className="eyebrow">Run telemetry</p>
          <h2>{run.summary || 'Department wave is still shaping the plan.'}</h2>
          <p className="hq-copy">{run.current_status}</p>
          <div className="ticker-grid">
            <article className="signal-card">
              <span>Progress</span>
              <strong>{run.metrics.progress_percent}%</strong>
              <p>Across department and review stages.</p>
            </article>
            <article className="signal-card">
              <span>Artifacts</span>
              <strong>{run.metrics.artifact_count}</strong>
              <p>Operator documents generated so far.</p>
            </article>
            <article className="signal-card">
              <span>Risk sirens</span>
              <strong>{run.metrics.open_risk_count}</strong>
              <p>Open contradictions or launch hazards.</p>
            </article>
          </div>
        </article>

        <LoopRadar
          title="Mission Completion"
          value={Number(run.metrics.progress_percent ?? 0)}
          total={100}
          note={run.next_action}
        />
      </section>

      <MissionTicker items={tickerItems} />

      <OfficeMap
        title="Facility Map"
        note="Each room represents a department wave. Couriers crossing the hall mean handoffs are still moving."
        steps={run.steps}
        currentDepartment={run.current_department}
      />

      <AgentFloor
        title="Run Floor"
        note="Desks pulse while they are active. Completed teams dim into archive mode."
        steps={run.steps}
        currentDepartment={run.current_department}
      />

      <section className="three-column-grid">
        <article className="panel">
          <div className="panel-header"><h3>Command Node</h3></div>
          <ul className="stack-list">
            <li><strong>Department</strong><p>{run.current_department ?? '-'}</p></li>
            <li><strong>Status</strong><p>{run.current_status}</p></li>
            <li><strong>Next Action</strong><p>{run.next_action}</p></li>
            <li><strong>Current PID</strong><p>{run.current_processes.at(-1)?.pid ?? '-'}</p></li>
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header"><h3>Department Dispatches</h3></div>
          <ul className="stack-list">
            {run.steps.map((step) => (
              <li key={step.department_key}>
                <div className="list-row">
                  <strong>{step.department_label}</strong>
                  <StatusBadge value={step.status} />
                </div>
                <p>{step.summary || step.purpose}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header"><h3>Artifact Dock</h3></div>
          <ul className="stack-list">
            {run.artifacts.map((artifact) => (
              <li key={artifact.path}>
                <div className="list-row">
                  <strong>{artifact.department_key}</strong>
                  <a href={backendUrl(`/runs/${run.run_id}/artifacts/${artifact.path.split('/').at(-1)}`)} target="_blank" rel="noreferrer">
                    open
                  </a>
                </div>
                <p>{artifact.title}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="two-column-grid">
        <AlertStack
          title="Risk Wall"
          note="The current run's unresolved contradictions and delivery threats."
          items={run.risks}
        />

        <article className="panel">
          <div className="panel-header">
            <h3>Featured Briefing</h3>
            {selectedArtifact ? (
              <a
                href={backendUrl(`/runs/${run.run_id}/artifacts/${selectedArtifact.path.split('/').at(-1)}`)}
                target="_blank"
                rel="noreferrer"
              >
                raw
              </a>
            ) : null}
          </div>
          <pre className="log-box">{selectedArtifact?.preview ?? 'No artifact preview available.'}</pre>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Process History</h3>
          <Link to="/runs">Back to ledger</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>PID</th>
                <th>Status</th>
                <th>Exit</th>
                <th>Command</th>
              </tr>
            </thead>
            <tbody>
              {run.process_history.map((process) => (
                <tr key={`${process.pid}-${process.started_at}`}>
                  <td>{process.label}</td>
                  <td>{process.pid}</td>
                  <td><StatusBadge value={process.status} /></td>
                  <td>{process.exit_code ?? '-'}</td>
                  <td>{process.command_preview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
