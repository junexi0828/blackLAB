import type { StepRecord } from '../types'
import { getDepartmentOrganizationSpec, type RoverHudBucket } from '../config/organizationModel'

export const ACTIVE_ROVERS_PER_DEPARTMENT = 6
const MAX_ACTIVE_ROVERS = 60

export interface RoverCrewCounts {
  hq: number
  rnd: number
  operations: number
}

export function resolveLiveDepartmentKeys(
  steps: StepRecord[],
  currentDepartment: string | null | undefined,
): Set<string> {
  const tokens = new Set(
    (currentDepartment ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )

  const active = new Set<string>()
  for (const step of steps) {
    const key = step.department_key.toLowerCase()
    const label = step.department_label.toLowerCase()
    if (step.status === 'running' || tokens.has(key) || tokens.has(label)) {
      active.add(step.department_key)
    }
  }
  return active
}

export function buildCrewCounts(
  departmentKeys: Iterable<string>,
  roversPerDepartment = ACTIVE_ROVERS_PER_DEPARTMENT,
  maxRovers = MAX_ACTIVE_ROVERS,
): RoverCrewCounts {
  const deptCounts: RoverCrewCounts = {
    hq: 0,
    rnd: 0,
    operations: 0,
  }

  for (const key of departmentKeys) {
    const bucket = getDepartmentOrganizationSpec(key).hudBucket
    deptCounts[bucket] += 1
  }

  const roverCounts: RoverCrewCounts = {
    hq: deptCounts.hq * roversPerDepartment,
    rnd: deptCounts.rnd * roversPerDepartment,
    operations: deptCounts.operations * roversPerDepartment,
  }

  const total = roverCounts.hq + roverCounts.rnd + roverCounts.operations
  if (total <= maxRovers) {
    return roverCounts
  }

  const scale = maxRovers / total
  const scaled: RoverCrewCounts = {
    hq: Math.floor(roverCounts.hq * scale),
    rnd: Math.floor(roverCounts.rnd * scale),
    operations: Math.floor(roverCounts.operations * scale),
  }

  let remainder = maxRovers - (scaled.hq + scaled.rnd + scaled.operations)
  const priority: RoverHudBucket[] = ['operations', 'rnd', 'hq']
  for (const bucket of priority) {
    if (remainder <= 0) {
      break
    }
    if (roverCounts[bucket] > 0) {
      scaled[bucket] += 1
      remainder -= 1
    }
  }

  return scaled
}
