import { useEffect } from 'react'

export function useLiveRefresh(refresh: () => Promise<void>, intervalMs: number, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const timer = window.setInterval(() => {
      void refresh()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [enabled, intervalMs, refresh])
}
