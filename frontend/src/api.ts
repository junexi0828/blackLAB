import type { CampusLayout, CompanyConfig, FeedPayload, LoopState, OperatorProfileData, ProjectsPayload, RunState } from './types'

const rawBase =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000')
export const API_BASE = rawBase.replace(/\/$/, '')

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json() as Promise<T>
}

export function backendUrl(path: string): string {
  return `${API_BASE}${path}`
}

export async function listRuns(): Promise<RunState[]> {
  const payload = await requestJson<{ runs: RunState[] }>('/api/runs')
  return payload.runs
}

export async function getRun(runId: string): Promise<RunState> {
  return requestJson<RunState>(`/api/runs/${runId}`)
}

export async function listLoops(): Promise<LoopState[]> {
  const payload = await requestJson<{ loops: LoopState[] }>('/api/loops')
  return payload.loops
}

export async function getLoop(loopId: string): Promise<LoopState> {
  return requestJson<LoopState>(`/api/loops/${loopId}`)
}

export async function getSettings(): Promise<CompanyConfig> {
  return requestJson<CompanyConfig>('/api/settings')
}

export async function getFeed(): Promise<FeedPayload> {
  return requestJson<FeedPayload>('/api/feed')
}

export async function getCampusLayout(): Promise<CampusLayout> {
  return requestJson<CampusLayout>('/api/campus-layout')
}

export async function saveCampusLayout(payload: CampusLayout): Promise<CampusLayout> {
  return requestJson<CampusLayout>('/api/campus-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getOperatorProfile(): Promise<OperatorProfileData> {
  return requestJson<OperatorProfileData>('/api/operator/profile')
}

export async function getProjects(): Promise<ProjectsPayload> {
  return requestJson<ProjectsPayload>('/api/projects')
}

export async function buildRelease(projectSlug: string) {
  return requestJson<{ release_id: string; pid: number | null; log_path?: string; status: string; download_path?: string | null }>(
    `/api/projects/${projectSlug}/releases`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  )
}

export async function launchRun(payload: Record<string, unknown>) {
  return requestJson<{ run_id: string; pid: number; log_path: string; status: string }>(
    '/api/launch/run',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export async function stopRun(runId: string) {
  return requestJson<RunState>(`/api/runs/${runId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export async function forceStopRun(runId: string) {
  return requestJson<RunState>(`/api/runs/${runId}/force-stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export async function launchLoop(payload: Record<string, unknown>) {
  return requestJson<{ loop_id: string; pid: number; log_path: string; status: string }>(
    '/api/launch/loop',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export async function stopLoop(loopId: string) {
  return requestJson<LoopState>(`/api/loops/${loopId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export async function forceStopLoop(loopId: string) {
  return requestJson<LoopState>(`/api/loops/${loopId}/force-stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}
