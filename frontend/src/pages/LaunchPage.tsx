import { startTransition, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { launchRun, listRuns } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import { StatusBadge } from '../ui/StatusBadge'

export function LaunchPage() {
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState('Submit a mission and the backend will launch it in detached mode.')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const runsResource = useJsonResource(listRuns, [])
  useLiveRefresh(() => runsResource.refresh(), 6000)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const rawPayload = Object.fromEntries(formData.entries())
    const payload: Record<string, unknown> = {
      ...rawPayload,
      max_parallel_departments: Number(rawPayload.max_parallel_departments || 7),
      pause_between_departments: Number(rawPayload.pause_between_departments || 0),
    }

    setIsSubmitting(true)
    setFeedback('Launching detached run...')
    try {
      const result = await launchRun(payload)
      setFeedback(`Run ${result.run_id} launched. Moving to detail view.`)
      startTransition(() => {
        void runsResource.refresh()
        navigate(`/runs/${result.run_id}`)
      })
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Launch failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Launch Bay"
        description="Assemble one detached company run with a premium core model and a cheaper review lane."
      />

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <h3>Mission Control</h3>
            <span className="panel-note">{feedback}</span>
          </div>
          <form className="control-form" onSubmit={handleSubmit}>
            <label>
              <span>Mission</span>
              <textarea name="mission" rows={5} required placeholder="Build a profitable AI operator for Korean SMBs" />
            </label>
            <label>
              <span>Project Slug (Memory Space)</span>
              <input type="text" name="project_slug" placeholder="e.g. revenue-leak-auditor" />
              <div style={{ fontSize: '12px', color: 'var(--subtext)', marginTop: '4px' }}>
                Leave empty for a Stateless Run (No Persistent Memory).
              </div>
            </label>
            <div className="form-grid">
              <label>
                <span>Mode</span>
                <select name="mode" defaultValue="codex">
                  <option value="codex">codex</option>
                  <option value="mock">mock</option>
                  <option value="openai">openai</option>
                </select>
              </label>
              <label>
                <span>Core Model</span>
                <select name="codex_model" defaultValue="gpt-5.4">
                  <option value="gpt-5.4">gpt-5.4</option>
                  <option value="gpt-5.3-codex">gpt-5.3-codex</option>
                  <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                </select>
              </label>
              <label>
                <span>Core Autonomy</span>
                <select name="codex_autonomy" defaultValue="read_only">
                  <option value="read_only">read_only</option>
                  <option value="full_auto">full_auto</option>
                  <option value="yolo">yolo</option>
                </select>
              </label>
              <label>
                <span>Review Model</span>
                <select name="codex_review_model" defaultValue="gpt-5.4-mini">
                  <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                  <option value="gpt-5.4">gpt-5.4</option>
                  <option value="gpt-5.3-codex">gpt-5.3-codex</option>
                </select>
              </label>
              <label>
                <span>Review Autonomy</span>
                <select name="codex_review_autonomy" defaultValue="read_only">
                  <option value="read_only">read_only</option>
                  <option value="full_auto">full_auto</option>
                  <option value="yolo">yolo</option>
                </select>
              </label>
              <label>
                <span>Parallel Teams</span>
                <input type="number" name="max_parallel_departments" min="1" max="8" defaultValue="7" />
              </label>
            </div>
            <label>
              <span>Pause Between Waves</span>
              <input type="number" step="0.5" min="0" name="pause_between_departments" defaultValue="0" />
            </label>
            <button className="primary-link button-reset" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Launching...' : 'Launch Detached Run'}
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>Recent Runs</h3>
          </div>
          <ResourceState isLoading={runsResource.isLoading} error={runsResource.error} />
          <ul className="stack-list">
            {(runsResource.data ?? []).slice(0, 8).map((run) => (
              <li key={run.run_id}>
                <div className="list-row">
                  <Link to={`/runs/${run.run_id}`}>{run.run_id}</Link>
                  <StatusBadge value={run.status} />
                </div>
                <p>{run.mission}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  )
}
