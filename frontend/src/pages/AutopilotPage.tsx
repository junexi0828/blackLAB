import { startTransition, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { launchLoop, listLoops, stopLoop } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import { StatusBadge } from '../ui/StatusBadge'

export function AutopilotPage() {
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState('Full Auto runs a bounded loop. 24/7 runs until you stop it.')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const loopsResource = useJsonResource(listLoops, [])
  useLiveRefresh(() => loopsResource.refresh(), 5000)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const rawPayload = Object.fromEntries(formData.entries())
    const payload: Record<string, unknown> = {
      ...rawPayload,
      max_parallel_departments: Number(rawPayload.max_parallel_departments || 7),
      pause_between_departments: Number(rawPayload.pause_between_departments || 0),
      interval_seconds: Number(rawPayload.interval_seconds || 30),
      max_iterations: Number(rawPayload.max_iterations || 3),
    }

    setIsSubmitting(true)
    setFeedback('Launching autopilot loop...')
    try {
      const result = await launchLoop(payload)
      setFeedback(`Loop ${result.loop_id} launched.`)
      startTransition(() => {
        void loopsResource.refresh()
        navigate(`/loops/${result.loop_id}`)
      })
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Autopilot launch failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleStop(loopId: string) {
    setFeedback(`Requesting stop for ${loopId}...`)
    try {
      await stopLoop(loopId)
      setFeedback(`Stop requested for ${loopId}.`)
      await loopsResource.refresh()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Stop request failed.')
    }
  }

  return (
    <>
      <PageHeader
        title="Loop Reactor"
        description="Bind a mission to a self-improving loop with a heavyweight core lane and a lightweight review lane."
      />

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <h3>Start Autopilot</h3>
            <span className="panel-note">{feedback}</span>
          </div>
          <form className="control-form" onSubmit={handleSubmit}>
            <label>
              <span>Objective</span>
              <textarea
                name="objective"
                rows={5}
                required
                placeholder="Create a 24/7 AI company that keeps improving a profitable product"
              />
            </label>
            <div className="form-grid">
              <label>
                <span>Loop Mode</span>
                <select name="loop_mode" defaultValue="full_auto">
                  <option value="full_auto">full_auto</option>
                  <option value="always_on">24/7</option>
                </select>
              </label>
              <label>
                <span>Run Mode</span>
                <select name="run_mode" defaultValue="codex">
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
                <select name="codex_autonomy" defaultValue="full_auto">
                  <option value="full_auto">full_auto</option>
                  <option value="yolo">yolo</option>
                  <option value="read_only">read_only</option>
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
              <label>
                <span>Full Auto Cycles</span>
                <input type="number" name="max_iterations" min="1" max="100" defaultValue="3" />
              </label>
              <label>
                <span>Loop Delay Seconds</span>
                <input type="number" name="interval_seconds" min="0" max="86400" defaultValue="30" />
              </label>
              <label>
                <span>Pause In Run</span>
                <input type="number" step="0.5" min="0" name="pause_between_departments" defaultValue="0" />
              </label>
            </div>
            <button className="primary-link button-reset" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Launching...' : 'Start Full Auto / 24-7'}
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>Active Loops</h3>
          </div>
          <ResourceState isLoading={loopsResource.isLoading} error={loopsResource.error} />
          <ul className="stack-list">
            {(loopsResource.data ?? []).map((loop) => (
              <li key={loop.loop_id}>
                <div className="list-row">
                  <Link to={`/loops/${loop.loop_id}`}>{loop.loop_id}</Link>
                  <StatusBadge value={loop.status} />
                </div>
                <p>{loop.objective}</p>
                {(loop.status === 'running' || loop.status === 'stopping') ? (
                  <button className="danger-inline" type="button" onClick={() => void handleStop(loop.loop_id)}>
                    Stop
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  )
}
