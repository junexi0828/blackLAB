import { useEffect, useRef } from 'react'

export function useLiveRefresh(
  refresh: () => Promise<void>,
  intervalMs: number,
  enabled = true,
  hiddenIntervalMs = Math.max(intervalMs * 3, intervalMs),
) {
  const refreshRef = useRef(refresh)
  const inFlightRef = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let timer: number | null = null
    let cancelled = false

    const currentDelay = () =>
      document.visibilityState === 'hidden' ? hiddenIntervalMs : intervalMs

    const scheduleNext = (delay: number) => {
      if (cancelled) {
        return
      }
      timer = window.setTimeout(() => {
        void tick()
      }, delay)
    }

    const tick = async () => {
      if (cancelled) {
        return
      }
      if (inFlightRef.current) {
        scheduleNext(currentDelay())
        return
      }

      inFlightRef.current = true
      try {
        await refreshRef.current()
      } finally {
        inFlightRef.current = false
        scheduleNext(currentDelay())
      }
    }

    const handleVisibilityChange = () => {
      if (cancelled) {
        return
      }
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      scheduleNext(currentDelay())
    }

    scheduleNext(currentDelay())
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, hiddenIntervalMs, intervalMs])
}
