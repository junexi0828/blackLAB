import { Link, useParams } from 'react-router-dom'
import { backendUrl, getLoop, stopLoop } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { AlertStack } from '../ui/AlertStack'
import { LoopRadar } from '../ui/LoopRadar'
import { MissionTicker } from '../ui/MissionTicker'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import { StatusBadge } from '../ui/StatusBadge'

export function LoopDetailPage() {
  const { loopId = '' } = useParams()
  const loopResource = useJsonResource(() => getLoop(loopId), [loopId])
  useLiveRefresh(() => loopResource.refresh(), 5000, loopResource.data?.status === 'running')

  if (!loopId) {
    return <div className="panel error-panel">Missing loop id.</div>
  }

  async function handleStop() {
    await stopLoop(loopId)
    await loopResource.refresh()
  }

  if (loopResource.isLoading || loopResource.error || !loopResource.data) {
    return (
      <>
        <PageHeader title="Loop Detail" description="Inspect one full-auto or 24/7 loop." />
        <ResourceState isLoading={loopResource.isLoading} error={loopResource.error} />
      </>
    )
  }

  const loop = loopResource.data
  const tickerItems = [
    `Loop ${loop.loop_id} :: ${loop.latest_note}`,
    `Mode ${loop.loop_mode} :: interval ${loop.interval_seconds}s`,
    ...loop.runs.slice(0, 4).map((iteration) => `Cycle ${iteration.iteration} :: ${iteration.summary || 'Waiting for synthesis'}`),
  ]
  const loopAlerts = loop.runs
    .filter((iteration) => iteration.status === 'failed')
    .map((iteration) => `Cycle ${iteration.iteration} failed and needs operator review.`)
  if (!loopAlerts.length && loop.latest_note) {
    loopAlerts.push(loop.latest_note)
  }

  return (
    <>
      <PageHeader
        title={loop.objective}
        description={
          `Loop ${loop.loop_id} · ${loop.loop_mode} · core ${loop.run_settings.codex_model} / ${loop.run_settings.codex_autonomy} · ` +
          `review ${loop.run_settings.codex_review_model} / ${loop.run_settings.codex_review_autonomy}`
        }
        actions={
          <>
            <StatusBadge value={loop.status} />
            {(loop.status === 'running' || loop.status === 'stopping') ? (
              <button className="danger-inline" type="button" onClick={() => void handleStop()}>
                Stop Loop
              </button>
            ) : null}
          </>
        }
      />

      <section className="hq-stage">
        <article className="panel hq-briefing">
          <p className="eyebrow">Loop reactor</p>
          <h2>{loop.summary || 'The loop is still tightening its next company thesis.'}</h2>
          <p className="hq-copy">{loop.latest_note}</p>
          <div className="ticker-grid">
            <article className="signal-card">
              <span>Current run</span>
              <strong>{loop.current_run_id ? 'live' : '-'}</strong>
              <p>{loop.current_run_id ?? 'No active run attached yet.'}</p>
            </article>
            <article className="signal-card">
              <span>Loop delay</span>
              <strong>{loop.interval_seconds}s</strong>
              <p>Cooldown between company cycles.</p>
            </article>
            <article className="signal-card">
              <span>Mode</span>
              <strong>{loop.loop_mode}</strong>
              <p>{loop.max_iterations ? `Cap ${loop.max_iterations}` : 'No cap while always_on is active.'}</p>
            </article>
          </div>
        </article>

        <LoopRadar
          title="Loop Iterations"
          value={loop.iterations_completed}
          total={loop.max_iterations}
          note={loop.loop_mode}
        />
      </section>

      <MissionTicker items={tickerItems} />

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header"><h3>Cycle Briefing</h3></div>
          <p>{loop.summary || 'No loop summary yet.'}</p>
          <p className="panel-note">{loop.latest_note}</p>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>Loop Log</h3>
            <a href={backendUrl(`/loops/${loop.loop_id}/log`)} target="_blank" rel="noreferrer">
              raw
            </a>
          </div>
          <pre className="log-box">Open the raw log to inspect cycle-by-cycle notes.</pre>
        </article>
      </section>

      <AlertStack
        title="Loop Alerts"
        note="Escalations emitted by the reactor across recent cycles."
        items={loopAlerts}
      />

      <section className="panel">
        <div className="panel-header">
          <h3>Iteration Rail</h3>
        </div>
        <div className="iteration-rail">
          {loop.runs.map((iteration) => (
            <article
              key={`${iteration.iteration}-${iteration.created_at}`}
              className={`iteration-card${iteration.iteration === loop.current_iteration ? ' is-current' : ''}`}
            >
              <div className="list-row">
                <strong>Cycle {iteration.iteration}</strong>
                <StatusBadge value={iteration.status ?? 'queued'} />
              </div>
              <p>{iteration.summary || 'Waiting for synthesis.'}</p>
              <p className="panel-note">
                {iteration.run_id ? <Link to={`/runs/${iteration.run_id}`}>{iteration.run_id}</Link> : 'Run id pending'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
