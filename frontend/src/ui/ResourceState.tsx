interface ResourceStateProps {
  isLoading: boolean
  error: string | null
}

export function ResourceState({ isLoading, error }: ResourceStateProps) {
  if (isLoading) {
    return <div className="panel muted-panel">Loading live control data...</div>
  }
  if (error) {
    return <div className="panel error-panel">{error}</div>
  }
  return null
}
