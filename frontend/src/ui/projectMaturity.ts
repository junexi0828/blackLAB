import type { CompanyConfig, DepartmentConfig, LoopState, ProjectLibraryEntry, RunState } from '../types'
import { DEPARTMENT_ORGANIZATION, getDepartmentOrganizationSpec, type RoverHudBucket } from '../config/organizationModel'

export type ProjectMaturityTier = 0 | 1 | 2 | 3 | 4

export interface ProjectMaturityModel {
  focusProjectSlug: string | null
  baseMaturity: number
  liveIntensity: number
  maturityPercent: number
  tier: ProjectMaturityTier
  tierLabel: string
  unlockTier: ProjectMaturityTier
  clusterMaturity: Record<RoverHudBucket, number>
  departmentMaturity: Record<string, number>
  roverSpeedMultiplier: number
  buildingGrowthRateMultiplier: number
  buildingHeightMultiplier: Record<RoverHudBucket, number>
}

interface ResolveProjectMaturityInput {
  settings: CompanyConfig | null
  runs: RunState[]
  loops: LoopState[]
  activeRun: RunState | null
  activeLoop: LoopState | null
  projectLibrary: ProjectLibraryEntry[]
  currentProjectSlug: string | null
  selectedProjectSlug: string | null
  liveDepartmentKeys: Set<string>
}

const DEFAULT_CLUSTER_MATURITY: Record<RoverHudBucket, number> = {
  hq: 0,
  rnd: 0,
  operations: 0,
}

export const DEFAULT_PROJECT_MATURITY: ProjectMaturityModel = {
  focusProjectSlug: null,
  baseMaturity: 0,
  liveIntensity: 0,
  maturityPercent: 0,
  tier: 0,
  tierLabel: 'L0',
  unlockTier: 0,
  clusterMaturity: DEFAULT_CLUSTER_MATURITY,
  departmentMaturity: {},
  roverSpeedMultiplier: 0.9,
  buildingGrowthRateMultiplier: 0.9,
  buildingHeightMultiplier: {
    hq: 0.88,
    rnd: 0.88,
    operations: 0.88,
  },
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothLerp(start: number, end: number, amount: number) {
  return start + (end - start) * clamp01(amount)
}

function logScale(value: number, reference: number) {
  if (reference <= 0) {
    return 0
  }
  return clamp01(Math.log1p(Math.max(0, value)) / Math.log1p(reference))
}

function statusProgress(status: string | undefined) {
  switch (status) {
    case 'completed':
      return 1
    case 'running':
      return 0.62
    case 'failed':
      return 0.12
    default:
      return 0
  }
}

function selectFocusProjectSlug({
  activeRun,
  activeLoop,
  currentProjectSlug,
  selectedProjectSlug,
  runs,
}: Pick<ResolveProjectMaturityInput, 'activeRun' | 'activeLoop' | 'currentProjectSlug' | 'selectedProjectSlug' | 'runs'>) {
  return (
    activeRun?.project_slug ??
    activeLoop?.project_slug ??
    selectedProjectSlug ??
    currentProjectSlug ??
    runs[0]?.project_slug ??
    null
  )
}

function selectReferenceRun(runs: RunState[], focusProjectSlug: string | null, activeRun: RunState | null) {
  if (activeRun && (!focusProjectSlug || activeRun.project_slug === focusProjectSlug)) {
    return activeRun
  }
  if (focusProjectSlug) {
    return (
      runs.find((run) => run.project_slug === focusProjectSlug && run.status === 'completed') ??
      runs.find((run) => run.project_slug === focusProjectSlug) ??
      null
    )
  }
  return runs.find((run) => run.status === 'completed') ?? runs[0] ?? null
}

function computeAverageProgress(keys: string[], stepProgressMap: Map<string, number>) {
  if (keys.length === 0) {
    return 0
  }
  const total = keys.reduce((sum, key) => sum + (stepProgressMap.get(key) ?? 0), 0)
  return total / keys.length
}

function resolveTierLabel(tier: ProjectMaturityTier) {
  return `L${tier}`
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildWorkflowDepartmentMap(settings: CompanyConfig) {
  const entries = [...settings.departments, ...settings.review_departments]
  return new Map(entries.map((department) => [department.key, department]))
}

function collectTrackedDepartmentKeys(settings: CompanyConfig, referenceRun: RunState | null) {
  return Array.from(
    new Set([
      ...Object.keys(DEPARTMENT_ORGANIZATION),
      ...settings.departments.map((department) => department.key),
      ...settings.review_departments.map((department) => department.key),
      ...(referenceRun?.steps ?? []).map((step) => step.department_key),
    ]),
  )
}

function buildOrganizationChildrenMap(keys: string[]) {
  const childrenMap = new Map<string, string[]>()
  for (const key of keys) {
    childrenMap.set(key, [])
  }

  for (const key of keys) {
    const spec = getDepartmentOrganizationSpec(key)
    if (!spec.reportsToKey || !childrenMap.has(spec.reportsToKey)) {
      continue
    }
    childrenMap.get(spec.reportsToKey)?.push(key)
  }

  return childrenMap
}

function resolveDepartmentSignalMap(keys: string[], stepProgressMap: Map<string, number>, childrenMap: Map<string, string[]>) {
  const memo = new Map<string, number>()

  const resolveSignal = (key: string, trail = new Set<string>()): number => {
    const cached = memo.get(key)
    if (typeof cached === 'number') {
      return cached
    }
    if (trail.has(key)) {
      return 0
    }
    const directProgress = stepProgressMap.get(key)
    if (typeof directProgress === 'number') {
      memo.set(key, directProgress)
      return directProgress
    }

    const nextTrail = new Set(trail)
    nextTrail.add(key)
    const childSignals = (childrenMap.get(key) ?? []).map((childKey) => resolveSignal(childKey, nextTrail))
    const value = childSignals.length > 0 ? average(childSignals) : 0
    memo.set(key, value)
    return value
  }

  for (const key of keys) {
    resolveSignal(key)
  }

  return memo
}

function resolvePriorityWeight(priority: number | undefined) {
  const normalized = 1 - clamp01(((priority ?? 50) - 10) / 60)
  return smoothLerp(0.92, 1.12, normalized)
}

function computeClusterMaturity(
  baseMaturity: number,
  trackedKeys: string[],
  workflowDepartments: Map<string, DepartmentConfig>,
  departmentSignals: Map<string, number>,
) {
  const totals: Record<RoverHudBucket, { weightedProgress: number; totalWeight: number }> = {
    hq: { weightedProgress: 0, totalWeight: 0 },
    rnd: { weightedProgress: 0, totalWeight: 0 },
    operations: { weightedProgress: 0, totalWeight: 0 },
  }

  for (const key of trackedKeys) {
    const spec = getDepartmentOrganizationSpec(key)
    const workflow = workflowDepartments.get(key)
    const signal = departmentSignals.get(key) ?? 0
    const reviewWeight = workflow?.resource_lane === 'review' || key === 'board_review' ? 1.08 : 1
    const leadershipWeight = !spec.reportsToKey || spec.reportsToKey === 'ceo' ? 1.05 : 1
    const weight = resolvePriorityWeight(workflow?.priority) * reviewWeight * leadershipWeight
    totals[spec.hudBucket].weightedProgress += signal * weight
    totals[spec.hudBucket].totalWeight += weight
  }

  return {
    hq: clamp01((totals.hq.weightedProgress / Math.max(totals.hq.totalWeight, 1)) * 0.82 + baseMaturity * 0.18),
    rnd: clamp01((totals.rnd.weightedProgress / Math.max(totals.rnd.totalWeight, 1)) * 0.82 + baseMaturity * 0.18),
    operations: clamp01((totals.operations.weightedProgress / Math.max(totals.operations.totalWeight, 1)) * 0.82 + baseMaturity * 0.18),
  }
}

function computeDepartmentMaturity(
  trackedKeys: string[],
  reviewReadiness: number,
  workflowDepartments: Map<string, DepartmentConfig>,
  departmentSignals: Map<string, number>,
  clusterMaturity: Record<RoverHudBucket, number>,
) {
  const values = new Map<string, number>()

  for (const key of trackedKeys) {
    const spec = getDepartmentOrganizationSpec(key)
    const workflow = workflowDepartments.get(key)
    const bucketSupport = clusterMaturity[spec.hudBucket]
    const directSignal = departmentSignals.get(key) ?? 0
    const upstreamKeys = Array.from(
      new Set([
        ...(workflow?.depends_on ?? []),
        ...(spec.reportsToKey ? [spec.reportsToKey] : []),
      ]),
    ).filter((upstreamKey) => upstreamKey !== key)
    const upstreamSignal = upstreamKeys.length > 0
      ? average(upstreamKeys.map((upstreamKey) => departmentSignals.get(upstreamKey) ?? 0))
      : bucketSupport
    const parentSignal = spec.reportsToKey ? (departmentSignals.get(spec.reportsToKey) ?? bucketSupport) : bucketSupport
    const reviewSupport = workflow?.resource_lane === 'review' || key === 'board_review'
      ? Math.max(reviewReadiness, bucketSupport * 0.7)
      : bucketSupport

    values.set(
      key,
      clamp01(
        directSignal * 0.7 +
          upstreamSignal * 0.14 +
          parentSignal * 0.06 +
          reviewSupport * 0.04 +
          bucketSupport * 0.06,
      ),
    )
  }

  return Object.fromEntries(values) as Record<string, number>
}

function resolveIterationDepth(loops: LoopState[], focusProjectSlug: string | null) {
  if (!focusProjectSlug) {
    return 0
  }

  const projectLoops = loops.filter((loop) => loop.project_slug === focusProjectSlug)
  if (projectLoops.length === 0) {
    return 0
  }

  const completedIterations = projectLoops.reduce(
    (maxIterations, loop) => Math.max(maxIterations, loop.iterations_completed),
    0,
  )
  const configuredIterations = projectLoops.reduce(
    (maxIterations, loop) => Math.max(maxIterations, loop.max_iterations ?? 0),
    0,
  )

  return logScale(completedIterations, Math.max(configuredIterations, 6))
}

function resolveRawTier(baseMaturity: number): ProjectMaturityTier {
  if (baseMaturity >= 0.8) {
    return 4
  }
  if (baseMaturity >= 0.58) {
    return 3
  }
  if (baseMaturity >= 0.38) {
    return 2
  }
  if (baseMaturity >= 0.18) {
    return 1
  }
  return 0
}

function resolveUnlockTier(completedKeys: Set<string>): ProjectMaturityTier {
  if (completedKeys.has('board_review')) {
    return 4
  }
  if (
    completedKeys.has('validation') &&
    completedKeys.has('test_lab') &&
    completedKeys.has('quality_gate')
  ) {
    return 3
  }
  const completedDeliveryCount = ['dev_1', 'dev_2', 'dev_3'].filter((key) => completedKeys.has(key)).length
  if (
    completedKeys.has('design') &&
    completedKeys.has('finance') &&
    completedDeliveryCount >= 2
  ) {
    return 2
  }
  if (
    completedKeys.has('ceo') &&
    completedKeys.has('research') &&
    completedKeys.has('product')
  ) {
    return 1
  }
  return 0
}

export function resolveProjectMaturity({
  settings,
  runs,
  loops,
  activeRun,
  activeLoop,
  projectLibrary,
  currentProjectSlug,
  selectedProjectSlug,
  liveDepartmentKeys,
}: ResolveProjectMaturityInput): ProjectMaturityModel {
  if (!settings) {
    return DEFAULT_PROJECT_MATURITY
  }

  const focusProjectSlug = selectFocusProjectSlug({
    activeRun,
    activeLoop,
    currentProjectSlug,
    selectedProjectSlug,
    runs,
  })

  const referenceRun = selectReferenceRun(runs, focusProjectSlug, activeRun)
  const projectRecord = projectLibrary.find((project) => project.slug === focusProjectSlug) ?? null
  const coreDepartments = settings.departments
  const reviewDepartments = settings.review_departments
  const workflowDepartments = buildWorkflowDepartmentMap(settings)
  const trackedKeys = collectTrackedDepartmentKeys(settings, referenceRun)
  const organizationChildrenMap = buildOrganizationChildrenMap(trackedKeys)

  const stepProgressMap = new Map<string, number>()
  const completedKeys = new Set<string>()
  for (const step of referenceRun?.steps ?? []) {
    const progress = statusProgress(step.status)
    stepProgressMap.set(step.department_key, progress)
    if (step.status === 'completed') {
      completedKeys.add(step.department_key)
    }
  }

  const coreCompletion = computeAverageProgress(
    coreDepartments.map((department) => department.key),
    stepProgressMap,
  )
  const reviewReadiness = computeAverageProgress(
    reviewDepartments.map((department) => department.key),
    stepProgressMap,
  )
  const iterationDepth = resolveIterationDepth(loops, focusProjectSlug)
  const projectHistoryDepth = logScale(projectRecord?.run_count ?? 0, 8)

  const baseMaturity = clamp01(
    coreCompletion * 0.5 +
      reviewReadiness * 0.25 +
      iterationDepth * 0.15 +
      projectHistoryDepth * 0.1,
  )

  const departmentSignals = resolveDepartmentSignalMap(trackedKeys, stepProgressMap, organizationChildrenMap)
  const clusterMaturity = computeClusterMaturity(
    baseMaturity,
    trackedKeys,
    workflowDepartments,
    departmentSignals,
  )
  const departmentMaturity = computeDepartmentMaturity(
    trackedKeys,
    reviewReadiness,
    workflowDepartments,
    departmentSignals,
    clusterMaturity,
  )

  const activeDepartmentRatio = clamp01(
    liveDepartmentKeys.size / Math.max(2, settings.max_parallel_departments || 6),
  )
  const activeProcessRatio = clamp01((activeRun?.current_processes.length ?? 0) / 4)
  const loopMomentum = activeLoop ? clamp01(0.18 + iterationDepth * 0.22) : 0
  const liveIntensity = clamp01(
    (activeRun ? 0.22 : 0) +
      activeDepartmentRatio * 0.48 +
      activeProcessRatio * 0.2 +
      loopMomentum,
  )

  const tier = resolveRawTier(baseMaturity)
  const unlockTier = resolveUnlockTier(completedKeys)

  return {
    focusProjectSlug,
    baseMaturity,
    liveIntensity,
    maturityPercent: Math.round(baseMaturity * 100),
    tier,
    tierLabel: resolveTierLabel(tier),
    unlockTier,
    clusterMaturity,
    departmentMaturity,
    roverSpeedMultiplier: smoothLerp(0.9, 1.14, baseMaturity * 0.78 + liveIntensity * 0.22),
    buildingGrowthRateMultiplier: smoothLerp(0.92, 1.18, baseMaturity * 0.7 + liveIntensity * 0.3),
    buildingHeightMultiplier: {
      hq: smoothLerp(0.88, 1.22, clusterMaturity.hq),
      rnd: smoothLerp(0.88, 1.24, clusterMaturity.rnd),
      operations: smoothLerp(0.88, 1.2, clusterMaturity.operations),
    },
  }
}
