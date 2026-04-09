import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRuns } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import { StatusBadge } from '../ui/StatusBadge'

export function RunsPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const runsResource = useJsonResource(listRuns, [])
  useLiveRefresh(() => runsResource.refresh(), 6000)

  const filteredRuns = useMemo(() => {
    const runs = runsResource.data ?? []
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) {
      return runs
    }
    return runs.filter(
      (run) =>
        run.run_id.toLowerCase().includes(needle) ||
        run.mission.toLowerCase().includes(needle) ||
        run.status.toLowerCase().includes(needle),
    )
  }, [deferredQuery, runsResource.data])

  return (
    <>
      <PageHeader title="Run Vault" description="Search the archive of company runs, active missions, and stored operator briefs." />
      <section className="panel">
        <div className="panel-header">
          <h3>All Runs</h3>
          <input
            className="table-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search mission, status, or run id"
          />
        </div>
        <ResourceState isLoading={runsResource.isLoading} error={runsResource.error} />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Current Department</th>
                <th>Profile</th>
                <th>Mission</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <tr key={run.run_id}>
                  <td>
                    <Link to={`/runs/${run.run_id}`}>{run.run_id}</Link>
                  </td>
                  <td>
                    <StatusBadge value={run.status} />
                  </td>
                  <td>{run.metrics.progress_percent}%</td>
                  <td>{run.current_department ?? '-'}</td>
                  <td>
                    core {run.settings.codex_model}/{run.settings.codex_autonomy}
                    <br />
                    review {run.settings.codex_review_model}/{run.settings.codex_review_autonomy}
                  </td>
                  <td>{run.mission}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
