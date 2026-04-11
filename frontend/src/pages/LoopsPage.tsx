import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listLoops, stopLoop } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import { StatusBadge } from '../ui/StatusBadge'

export function LoopsPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const loopsResource = useJsonResource(listLoops, [])
  useLiveRefresh(() => loopsResource.refresh(), 5000)

  const filteredLoops = useMemo(() => {
    const loops = loopsResource.data ?? []
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) {
      return loops
    }
    return loops.filter(
      (loop) =>
        loop.loop_id.toLowerCase().includes(needle) ||
        loop.objective.toLowerCase().includes(needle) ||
        loop.status.toLowerCase().includes(needle),
    )
  }, [deferredQuery, loopsResource.data])

  async function handleStop(loopId: string) {
    await stopLoop(loopId)
    await loopsResource.refresh()
  }

  return (
    <>
      <PageHeader title="Loop Vault" description="Track every bounded experiment and always-on reactor the company has launched." />
      <section className="panel" style={{ border: '2px solid blue' }}>
        <div className="panel-header">
          <h3>All Loops</h3>
          <input
            className="table-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search objective, status, or loop id"
          />
        </div>
        <ResourceState isLoading={loopsResource.isLoading} error={loopsResource.error} />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Loop</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Current Run</th>
                <th>Iterations</th>
                <th>Latest Note</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoops.map((loop) => (
                <tr key={loop.loop_id}>
                  <td><Link to={`/loops/${loop.loop_id}`}>{loop.loop_id}</Link></td>
                  <td><StatusBadge value={loop.status} /></td>
                  <td>{loop.loop_mode}</td>
                  <td>{loop.current_run_id ? <Link to={`/runs/${loop.current_run_id}`}>{loop.current_run_id}</Link> : '-'}</td>
                  <td>{loop.iterations_completed}{loop.max_iterations ? ` / ${loop.max_iterations}` : ''}</td>
                  <td>{loop.latest_note}</td>
                  <td>
                    {(loop.status === 'running' || loop.status === 'stopping') ? (
                      <button className="danger-inline" type="button" onClick={() => void handleStop(loop.loop_id)}>
                        Stop
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
