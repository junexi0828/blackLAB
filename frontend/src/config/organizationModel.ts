export type OrganizationDivisionKey =
  | 'headquarters'
  | 'product_design'
  | 'research_engineering'
  | 'quality_testing'
  | 'growth_marketing'

export type RoverVisualArchetype =
  | 'executive_office'
  | 'corporate_finance'
  | 'research_lab'
  | 'product_experience'
  | 'engineering'
  | 'quality_assurance'
  | 'growth_marketing'

export type RoverHudBucket = 'hq' | 'rnd' | 'operations'

export interface OrganizationDivisionSpec {
  key: OrganizationDivisionKey
  label: string
  description: string
  order: number
}

export interface DepartmentOrganizationSpec {
  key: string
  publicName: string
  publicSummary: string
  divisionKey: OrganizationDivisionKey
  reportsToKey: string | null
  visualArchetype: RoverVisualArchetype
  hudBucket: RoverHudBucket
  sortOrder: number
}

export interface OrganizationChartNode extends DepartmentOrganizationSpec {
  children: OrganizationChartNode[]
}

export interface OrganizationDirectoryGroup extends OrganizationDivisionSpec {
  departments: DepartmentOrganizationSpec[]
}

export const ORGANIZATION_DIVISIONS: OrganizationDivisionSpec[] = [
  {
    key: 'headquarters',
    label: 'Headquarters',
    description: 'Company leadership, planning, and final approval.',
    order: 10,
  },
  {
    key: 'product_design',
    label: 'Product & Design',
    description: 'Product planning, user experience, and scope definition.',
    order: 20,
  },
  {
    key: 'research_engineering',
    label: 'Research & Engineering',
    description: 'Research, software delivery, and technical execution.',
    order: 30,
  },
  {
    key: 'quality_testing',
    label: 'Quality & Testing',
    description: 'Release readiness, validation, and test coverage.',
    order: 40,
  },
  {
    key: 'growth_marketing',
    label: 'Growth & Marketing',
    description: 'Launch support, positioning, and demand generation.',
    order: 50,
  },
]

export const DEPARTMENT_ORGANIZATION: Record<string, DepartmentOrganizationSpec> = {
  ceo: {
    key: 'ceo',
    publicName: 'CEO Office',
    publicSummary: 'Sets the company direction and coordinates the major team leads.',
    divisionKey: 'headquarters',
    reportsToKey: null,
    visualArchetype: 'executive_office',
    hudBucket: 'hq',
    sortOrder: 10,
  },
  board_review: {
    key: 'board_review',
    publicName: 'Executive Review Board',
    publicSummary: 'Reviews major decisions before the final operator update goes out.',
    divisionKey: 'headquarters',
    reportsToKey: 'ceo',
    visualArchetype: 'executive_office',
    hudBucket: 'hq',
    sortOrder: 20,
  },
  finance: {
    key: 'finance',
    publicName: 'Strategy & Finance Team',
    publicSummary: 'Tracks planning, budgets, and company-level operating priorities.',
    divisionKey: 'headquarters',
    reportsToKey: 'ceo',
    visualArchetype: 'corporate_finance',
    hudBucket: 'hq',
    sortOrder: 30,
  },
  product: {
    key: 'product',
    publicName: 'Product Planning Team',
    publicSummary: 'Defines what gets built, why it matters, and what ships next.',
    divisionKey: 'product_design',
    reportsToKey: 'ceo',
    visualArchetype: 'product_experience',
    hudBucket: 'rnd',
    sortOrder: 40,
  },
  design: {
    key: 'design',
    publicName: 'Design Team',
    publicSummary: 'Shapes the interface, flows, and presentation of the product.',
    divisionKey: 'product_design',
    reportsToKey: 'product',
    visualArchetype: 'product_experience',
    hudBucket: 'rnd',
    sortOrder: 50,
  },
  research: {
    key: 'research',
    publicName: 'Research Lab',
    publicSummary: 'Studies problems, opportunities, and technical directions before build-out.',
    divisionKey: 'research_engineering',
    reportsToKey: 'ceo',
    visualArchetype: 'research_lab',
    hudBucket: 'rnd',
    sortOrder: 60,
  },
  engineering: {
    key: 'engineering',
    publicName: 'Engineering Hub',
    publicSummary: 'Coordinates core delivery systems and links the development teams to the wider R&D campus.',
    divisionKey: 'research_engineering',
    reportsToKey: 'research',
    visualArchetype: 'engineering',
    hudBucket: 'rnd',
    sortOrder: 65,
  },
  dev_1: {
    key: 'dev_1',
    publicName: 'Development Team 1',
    publicSummary: 'Builds core systems, backend services, and production foundations.',
    divisionKey: 'research_engineering',
    reportsToKey: 'engineering',
    visualArchetype: 'engineering',
    hudBucket: 'rnd',
    sortOrder: 70,
  },
  dev_2: {
    key: 'dev_2',
    publicName: 'Development Team 2',
    publicSummary: 'Builds product features, screens, and operator-facing flows.',
    divisionKey: 'research_engineering',
    reportsToKey: 'engineering',
    visualArchetype: 'engineering',
    hudBucket: 'rnd',
    sortOrder: 80,
  },
  dev_3: {
    key: 'dev_3',
    publicName: 'Development Team 3',
    publicSummary: 'Handles integrations, automation, and cross-system connections.',
    divisionKey: 'research_engineering',
    reportsToKey: 'engineering',
    visualArchetype: 'engineering',
    hudBucket: 'rnd',
    sortOrder: 90,
  },
  quality_gate: {
    key: 'quality_gate',
    publicName: 'Quality Assurance Team',
    publicSummary: 'Checks release readiness and blocks weak output before sign-off.',
    divisionKey: 'quality_testing',
    reportsToKey: 'ceo',
    visualArchetype: 'quality_assurance',
    hudBucket: 'operations',
    sortOrder: 100,
  },
  validation: {
    key: 'validation',
    publicName: 'Validation Team',
    publicSummary: 'Confirms the plan is measurable, realistic, and aligned with the brief.',
    divisionKey: 'quality_testing',
    reportsToKey: 'quality_gate',
    visualArchetype: 'quality_assurance',
    hudBucket: 'operations',
    sortOrder: 110,
  },
  test_lab: {
    key: 'test_lab',
    publicName: 'Test Team',
    publicSummary: 'Stress-tests scenarios, edge cases, and rollout risks before release.',
    divisionKey: 'quality_testing',
    reportsToKey: 'quality_gate',
    visualArchetype: 'quality_assurance',
    hudBucket: 'operations',
    sortOrder: 120,
  },
  growth: {
    key: 'growth',
    publicName: 'Growth Marketing Team',
    publicSummary: 'Plans positioning, launch support, and post-release audience growth.',
    divisionKey: 'growth_marketing',
    reportsToKey: 'ceo',
    visualArchetype: 'growth_marketing',
    hudBucket: 'operations',
    sortOrder: 130,
  },
}

function prettifyKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function collectDepartmentSpecs(keys: string[]) {
  return Array.from(new Set(keys))
    .map((key) => getDepartmentOrganizationSpec(key))
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

export function getOrganizationDivision(key: OrganizationDivisionKey): OrganizationDivisionSpec {
  return ORGANIZATION_DIVISIONS.find((division) => division.key === key) ?? ORGANIZATION_DIVISIONS[0]
}

export function getDepartmentOrganizationSpec(key: string): DepartmentOrganizationSpec {
  return (
    DEPARTMENT_ORGANIZATION[key] ?? {
      key,
      publicName: prettifyKey(key),
      publicSummary: 'General operating team.',
      divisionKey: 'research_engineering',
      reportsToKey: 'ceo',
      visualArchetype: 'engineering',
      hudBucket: 'operations',
      sortOrder: 999,
    }
  )
}

export function buildOrganizationHierarchy(keys: string[]): OrganizationChartNode[] {
  const specs = collectDepartmentSpecs(keys)
  const nodeMap = new Map<string, OrganizationChartNode>()

  for (const spec of specs) {
    nodeMap.set(spec.key, { ...spec, children: [] })
  }

  const roots: OrganizationChartNode[] = []
  for (const spec of specs) {
    const node = nodeMap.get(spec.key)
    if (!node) {
      continue
    }
    const parent = spec.reportsToKey ? nodeMap.get(spec.reportsToKey) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes: OrganizationChartNode[]) => {
    nodes.sort((left, right) => left.sortOrder - right.sortOrder)
    for (const node of nodes) {
      sortNodes(node.children)
    }
  }

  sortNodes(roots)
  return roots
}

export function buildOrganizationDirectory(keys: string[]): OrganizationDirectoryGroup[] {
  const specs = collectDepartmentSpecs(keys)

  return ORGANIZATION_DIVISIONS
    .map((division) => ({
      ...division,
      departments: specs.filter((spec) => spec.divisionKey === division.key),
    }))
    .filter((group) => group.departments.length > 0)
}
