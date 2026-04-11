import { getSettings } from '../api'
import {
  buildOrganizationDirectory,
  buildOrganizationHierarchy,
  getOrganizationDivision,
  type OrganizationChartNode,
  type OrganizationDirectoryGroup,
} from '../config/organizationModel'
import { useJsonResource } from '../hooks/useJsonResource'
import { PageHeader } from '../ui/PageHeader'
import { ResourceState } from '../ui/ResourceState'
import type { DepartmentConfig } from '../types'

function getBoardReviewStub(label: string, outputTitle: string): DepartmentConfig {
  return {
    key: 'board_review',
    label,
    purpose: 'Synthesize all department outputs into one operator briefing.',
    output_title: outputTitle,
    temperature: 0.1,
    runtime_tier: 'review',
    resource_lane: 'review',
    priority: 40,
    depends_on: [],
    requires_all_completed: true,
  }
}

function OrganizationNode({ node, depth = 0 }: { node: OrganizationChartNode; depth?: number }) {
  const division = getOrganizationDivision(node.divisionKey)
  const childCountLabel = node.children.length > 0 ? `${node.children.length} team${node.children.length > 1 ? 's' : ''}` : null

  return (
    <div className={`org-tree-node org-tree-node--depth-${Math.min(depth, 2)}`}>
      <article className="org-visual-card">
        <span className="org-visual-card__category">{division.label}</span>
        <h4>{node.publicName}</h4>
        <p>{node.publicSummary}</p>
        {childCountLabel && <span className="org-visual-card__count">{childCountLabel}</span>}
      </article>
      {node.children.length > 0 && (
        <div className={`org-tree-children org-tree-children--count-${Math.min(node.children.length, 4)}`}>
          {node.children.map((child) => (
            <OrganizationNode key={child.key} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function DirectoryGroup({ group }: { group: OrganizationDirectoryGroup }) {
  return (
    <article className="org-directory-group">
      <div className="org-directory-group__header">
        <h4>{group.label}</h4>
        <p>{group.description}</p>
      </div>
      <div className="org-directory-grid">
        {group.departments.map((department) => (
          <article key={department.key} className="org-directory-card">
            <h5>{department.publicName}</h5>
            <p>{department.publicSummary}</p>
          </article>
        ))}
      </div>
    </article>
  )
}

export function SettingsPage() {
  const settingsResource = useJsonResource(getSettings, [])

  if (settingsResource.isLoading || settingsResource.error || !settingsResource.data) {
    return (
      <>
        <PageHeader title="Organization" description="Simple view of who leads each team and how the company is structured." />
        <ResourceState isLoading={settingsResource.isLoading} error={settingsResource.error} />
      </>
    )
  }

  const settings = settingsResource.data
  const departments = [
    ...settings.departments,
    ...settings.review_departments,
    ...(settings.enable_final_review ? [getBoardReviewStub(settings.final_review_label, settings.final_review_output_title)] : []),
  ]
  const hierarchy = buildOrganizationHierarchy(departments.map((department) => department.key))
  const directory = buildOrganizationDirectory(departments.map((department) => department.key))

  return (
    <>
      <PageHeader title="Organization" description="Simple view of who leads each team and how the company is structured." />

      <section className="panel organization-panel">
        <div className="panel-header"><h3>Organization Chart</h3></div>
        <p className="organization-panel__note">
          This view shows the company the way a user expects to read it: one leadership group at the top, major teams below it,
          and specialist teams nested under the groups they support.
        </p>
        <div className="organization-visual-map">
          {hierarchy.map((node) => (
            <OrganizationNode key={node.key} node={node} />
          ))}
        </div>
      </section>

      <section className="panel organization-directory-panel">
        <div className="panel-header"><h3>Teams at a Glance</h3></div>
        <p className="organization-panel__note">
          Use this section when you want a simple summary of what each team does, without internal keys or system labels.
        </p>
        <div className="organization-directory">
          {directory.map((group) => (
            <DirectoryGroup key={group.key} group={group} />
          ))}
        </div>
      </section>
    </>
  )
}
