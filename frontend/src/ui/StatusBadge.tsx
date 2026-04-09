interface StatusBadgeProps {
  value: string
}

export function StatusBadge({ value }: StatusBadgeProps) {
  return <span className={`status-badge status-${value}`}>{value}</span>
}
