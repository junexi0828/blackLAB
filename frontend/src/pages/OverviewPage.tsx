import { Link } from 'react-router-dom'
import { listLoops, listRuns } from '../api'
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

export function OverviewPage() {
  const runsResource = useJsonResource(listRuns, [])
  const loopsResource = useJsonResource(listLoops, [])
  useLiveRefresh(async () => {
    await Promise.all([runsResource.refresh(), loopsResource.refresh()])
  }, 5000)
  const loadingState = (
    <ResourceState
      isLoading={runsResource.isLoading || loopsResource.isLoading}
      error={runsResource.error ?? loopsResource.error}
    />
  )

  if (loadingState) {
    const hasState = (runsResource.isLoading || loopsResource.isLoading) || (runsResource.error ?? loopsResource.error)
    if (hasState) {
      return (
        <>
          <PageHeader
            title="Operator Overview"
            description="A React control room for the blackLAB engine."
            actions={
              <>
                <Link className="primary-link" to="/launch">
                  Launch Run
                </Link>
                <Link className="secondary-link" to="/autopilot">
                  Open Autopilot
                </Link>
              </>
            }
          />
          {loadingState}
        </>
      )
    }
  }

  const runs = runsResource.data ?? []
  const loops = loopsResource.data ?? []
  const activeRuns = runs.filter((run) => run.status === 'running')
  const activeLoops = loops.filter((loop) => loop.status === 'running' || loop.status === 'stopping')
  const latestRuns = runs.slice(0, 5)
  const featuredRun = activeRuns[0] ?? runs[0] ?? null
  const featuredLoop = activeLoops[0] ?? loops[0] ?? null
  const totalRisks = runs.reduce((count, run) => count + run.risks.length, 0)
  const liveFeed = (featuredRun?.steps ?? []).slice(0, 12)
  const tickerItems = [
    featuredLoop ? `Loop ${featuredLoop.loop_id} :: ${featuredLoop.latest_note}` : '',
    featuredRun ? `Run ${featuredRun.run_id} :: ${featuredRun.current_status}` : '',
    ...latestRuns.slice(0, 3).map((run) => `${run.run_id} :: ${run.summary || run.mission}`),
  ].filter(Boolean)
  const topRisks = runs.flatMap((run) => run.risks.map((risk) => `${run.run_id} :: ${risk}`)).slice(0, 6)

  return (
    <>
      <PageHeader
        title="Night Shift Situation Room"
        description="Watch the company as a live office floor instead of a static admin screen."
        actions={
          <>
            <Link className="primary-link" to="/launch">
              Open Launch Bay
            </Link>
            <Link className="secondary-link" to="/autopilot">
              Open Loop Reactor
            </Link>
          </>
        }
      />

      <section className="hq-stage">
        <article className="panel hq-briefing">
          <p className="eyebrow">Current broadcast</p>
          <h2>{featuredLoop?.objective ?? featuredRun?.mission ?? 'No active company mission yet.'}</h2>
          <p className="hq-copy">
            {featuredLoop?.latest_note ??
              featuredRun?.summary ??
              'Spin up a detached run or an always-on loop to light the office floor.'}
          </p>

          <div className="ticker-grid">
            <article className="signal-card">
              <span>Open offices</span>
              <strong>{activeRuns.length}</strong>
              <p>Company runs currently moving.</p>
            </article>
            <article className="signal-card">
              <span>Loop reactors</span>
              <strong>{activeLoops.length}</strong>
              <p>Full-auto or 24/7 loops alive.</p>
            </article>
            <article className="signal-card">
              <span>Risk sirens</span>
              <strong>{totalRisks}</strong>
              <p>Recorded across all stored runs.</p>
            </article>
          </div>
        </article>

        <LoopRadar
          title="Autopilot Radar"
          value={featuredLoop?.iterations_completed ?? 0}
          total={featuredLoop?.max_iterations}
          note={featuredLoop?.loop_mode ?? 'No loop selected'}
        />
      </section>

      <MissionTicker items={tickerItems} />

      {featuredRun ? (
        <OfficeMap
          title="Company Floor Map"
          note="Rooms map the departments, while moving couriers represent handoffs between active teams."
          steps={featuredRun.steps}
          currentDepartment={featuredRun.current_department}
        />
      ) : null}

      {featuredRun ? (
        <AgentFloor
          title="Agent Office Floor"
          note={`Highlighted from run ${featuredRun.run_id}. Each desk lights up as its department is working.`}
          steps={featuredRun.steps}
          currentDepartment={featuredRun.current_department}
        />
      ) : null}

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <h3>Mission Feed</h3>
            <Link to="/runs">open vault</Link>
          </div>
          <ul className="stack-list">
            {latestRuns.map((run) => (
              <li key={run.run_id}>
                <div className="list-row">
                  <Link to={`/runs/${run.run_id}`}>{run.run_id}</Link>
                  <StatusBadge value={run.status} />
                </div>
                <p>{run.summary || run.mission}</p>
              </li>
            ))}
          </ul>
        </article>

        <AlertStack
          title="Risk Wall"
          note="The loudest unresolved issues across the factory."
          items={topRisks}
        />
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <h3>Desk Comms</h3>
            <Link to="/loops">open loops</Link>
          </div>
          <ul className="stack-list">
            {(liveFeed.length ? liveFeed : featuredRun?.steps ?? []).map((step) => (
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
          <div className="panel-header">
            <h3>Live Loop Snapshot</h3>
            <Link to="/autopilot">open reactor</Link>
          </div>
          <ul className="stack-list">
            {loops.slice(0, 5).map((loop) => (
              <li key={loop.loop_id}>
                <div className="list-row">
                  <Link to={`/loops/${loop.loop_id}`}>{loop.loop_id}</Link>
                  <StatusBadge value={loop.status} />
                </div>
                <p>{loop.latest_note || loop.objective}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  )
}
