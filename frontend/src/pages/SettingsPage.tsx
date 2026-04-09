import { getSettings } from '../api'
import { useJsonResource } from '../hooks/useJsonResource'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'

export function SettingsPage() {
  const settingsResource = useJsonResource(getSettings, [])

  if (settingsResource.isLoading || settingsResource.error || !settingsResource.data) {
    return (
      <>
        <PageHeader title="Runtime Settings" description="Backend engine defaults and staged department wiring." />
        <ResourceState isLoading={settingsResource.isLoading} error={settingsResource.error} />
      </>
    )
  }

  const settings = settingsResource.data

  return (
    <>
      <PageHeader title="Runtime Settings" description="Backend engine defaults and staged department wiring." />

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header"><h3>Engine Defaults</h3></div>
          <ul className="stack-list">
            <li><strong>Company</strong><p>{settings.company_name}</p></li>
            <li><strong>Default Mode</strong><p>{settings.default_mode}</p></li>
            <li><strong>Parallel Strategy</strong><p>{settings.parallel_strategy}</p></li>
            <li><strong>Max Parallel Departments</strong><p>{settings.max_parallel_departments}</p></li>
            <li><strong>Codex Timeout</strong><p>{settings.codex_worker_timeout_seconds}s</p></li>
            <li><strong>Codex Retry Attempts</strong><p>{settings.codex_retry_attempts}</p></li>
            <li><strong>Core Runtime</strong><p>{settings.default_run_settings.codex_model} · {settings.default_run_settings.codex_autonomy}</p></li>
            <li><strong>Review Runtime</strong><p>{settings.default_run_settings.codex_review_model} · {settings.default_run_settings.codex_review_autonomy}</p></li>
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header"><h3>Autonomy Profiles</h3></div>
          <ul className="stack-list">
            <li><strong>read_only</strong><p>`-s read-only`</p></li>
            <li><strong>full_auto</strong><p>`--full-auto`</p></li>
            <li><strong>yolo</strong><p>`--dangerously-bypass-approvals-and-sandbox`</p></li>
          </ul>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header"><h3>Departments</h3></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Label</th>
                <th>Purpose</th>
                <th>Output</th>
                <th>Runtime Tier</th>
              </tr>
            </thead>
            <tbody>
              {settings.departments.map((department) => (
                <tr key={department.key}>
                  <td>{department.key}</td>
                  <td>{department.label}</td>
                  <td>{department.purpose}</td>
                  <td>{department.output_title}</td>
                  <td>{department.runtime_tier}</td>
                </tr>
              ))}
              {settings.review_departments.map((department) => (
                <tr key={department.key}>
                  <td>{department.key}</td>
                  <td>{department.label}</td>
                  <td>{department.purpose}</td>
                  <td>{department.output_title}</td>
                  <td>{department.runtime_tier}</td>
                </tr>
              ))}
              {settings.enable_final_review ? (
                <tr>
                  <td>board_review</td>
                  <td>{settings.final_review_label}</td>
                  <td>Synthesize all department outputs into one operator briefing.</td>
                  <td>{settings.final_review_output_title}</td>
                  <td>review</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
