export type RunStatus = 'queued' | 'running' | 'stopping' | 'completed' | 'failed' | 'stale'
export type LoopStatus = 'queued' | 'running' | 'stopping' | 'completed' | 'failed'
export type ReleaseStatus = 'queued' | 'running' | 'completed' | 'failed' | 'stale'

export interface RunSettings {
  codex_model: string
  codex_autonomy: string
  codex_review_model: string
  codex_review_autonomy: string
  detached: boolean
  max_parallel_departments: number | null
  active_department_keys?: string[] | null
}

export interface StepRecord {
  department_key: string
  department_label: string
  purpose: string
  status: string
  started_at: string | null
  completed_at: string | null
  summary: string
  artifact_filename: string | null
}

export interface ArtifactRecord {
  department_key: string
  title: string
  path: string
  created_at: string
  preview: string
}

export interface ProcessRecord {
  label: string
  pid: number
  command_preview: string
  status: string
  started_at: string
  ended_at: string | null
  exit_code: number | null
}

export interface RunState {
  run_id: string
  project_slug: string | null
  project_name: string | null
  mission: string
  company_name: string
  mode: string
  status: RunStatus
  created_at: string
  updated_at: string
  current_department: string | null
  next_action: string
  current_status: string
  summary: string
  risks: string[]
  settings: RunSettings
  metrics: Record<string, number | string>
  steps: StepRecord[]
  artifacts: ArtifactRecord[]
  current_processes: ProcessRecord[]
  process_history: ProcessRecord[]
}

export interface LoopIterationRecord {
  iteration: number
  run_id: string | null
  status: RunStatus | null
  summary: string
  created_at: string
  completed_at: string | null
}

export interface LoopState {
  loop_id: string
  project_slug: string | null
  project_name: string | null
  objective: string
  loop_mode: string
  run_mode: string
  status: LoopStatus
  created_at: string
  updated_at: string
  current_run_id: string | null
  current_iteration: number
  iterations_completed: number
  max_iterations: number | null
  interval_seconds: number
  stop_requested: boolean
  summary: string
  latest_note: string
  run_settings: RunSettings
  runs: LoopIterationRecord[]
}

export interface DepartmentConfig {
  key: string
  label: string
  purpose: string
  output_title: string
  temperature: number
  runtime_tier: string
  resource_lane?: string
  priority?: number
  depends_on?: string[]
  requires_all_completed?: boolean
}

export interface CompanyConfig {
  company_name: string
  default_mode: string
  mission_style: string
  parallel_strategy: string
  max_parallel_departments: number
  enable_final_review: boolean
  final_review_label: string
  final_review_output_title: string
  codex_worker_timeout_seconds: number
  codex_retry_attempts: number
  default_run_settings: RunSettings
  departments: DepartmentConfig[]
  review_departments: DepartmentConfig[]
}

export interface OperatorRoster {
  active_department_keys: string[]
  hidden_campus_items: string[]
}

export interface OperatorLaunchProfile {
  mode: string
  project_slug: string | null
  pause_between_departments: number
  run_settings: RunSettings
}

export interface OperatorAutopilotProfile {
  run_mode: string
  project_slug: string | null
  loop_mode: string
  interval_seconds: number
  max_iterations: number
  pause_between_departments: number
  run_settings: RunSettings
}

export interface OperatorProfileData {
  launch: OperatorLaunchProfile
  autopilot: OperatorAutopilotProfile
  roster: OperatorRoster
}

export interface ProjectLibraryEntry {
  slug: string
  name: string
  brief: string
  run_count: number
  last_run_id: string | null
  latest_release: ReleaseSummary | null
  active_release: ReleaseSummary | null
}

export interface ReleaseSummary {
  release_id: string
  status: ReleaseStatus
  status_label: string
  created_at: string
  updated_at: string
  summary: string
  current_status: string
  release_type: string | null
  action_label: string
  download_url: string | null
  download_filename: string | null
}

export interface CurrentProjectData {
  slug: string
  name: string
  source: string
  entity_id: string | null
  reference_label: string
}

export interface ProjectsPayload {
  projects: ProjectLibraryEntry[]
  current_project: CurrentProjectData | null
}

export interface EventEntry {
  event_id: string
  scope: string
  title: string
  message: string
  status: string
  timestamp: string
  project_slug: string | null
  run_id: string | null
  loop_id: string | null
  department_key: string | null
  department_label: string | null
  is_live: boolean
}

export interface FeedPayload {
  events: EventEntry[]
  bubbles: Record<string, EventEntry>
}

export interface CampusBuildingLayout {
  position: [number, number, number]
  shape: string
  color: string
}

export interface CampusMonumentLayout {
  position: [number, number, number]
  baseInnerRadius: number
  baseOuterRadius: number
  ringInnerRadius: number
  ringOuterRadius: number
  torusRadius: number
  torusTube: number
  orbRadius: number
  torusHeight: number
  orbHeight: number
}

export interface CampusLayout {
  buildings: Record<string, CampusBuildingLayout>
  monument: CampusMonumentLayout
}
