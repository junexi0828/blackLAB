import { startTransition, useEffect, useState } from 'react'

interface ResourceState<T> {
  data: T | null
  error: string | null
  isLoading: boolean
  refresh: () => Promise<void>
}

export function useJsonResource<T>(
  loader: () => Promise<T>,
  dependencies: readonly unknown[] = [],
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function runLoader() {
    setIsLoading(true)
    setError(null)
    try {
      const next = await loader()
      startTransition(() => {
        setData(next)
        setError(null)
        setIsLoading(false)
      })
    } catch (loaderError) {
      const message = loaderError instanceof Error ? loaderError.message : 'Unknown request failure'
      startTransition(() => {
        setError(message)
        setIsLoading(false)
      })
    }
  }

  useEffect(() => {
    void runLoader()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return { data, error, isLoading, refresh: runLoader }
}
