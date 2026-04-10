import { useEffect, useMemo, useState } from 'react'

type TimeTheme = 'day' | 'night'
type ThemeSource = 'location' | 'timezone'

interface StoredCoords {
  lat: number
  lon: number
  savedAt: number
}

interface SolarThemeState {
  timeTheme: TimeTheme
  themeSource: ThemeSource
}

const STORAGE_KEY = 'blacklab.console.geo'
const GEO_MAX_AGE_MS = 1000 * 60 * 60 * 12

function getDayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / 86400000)
}

function getSolarThemeForCoords(date: Date, lat: number, lon: number): TimeTheme {
  const rad = Math.PI / 180
  const dayOfYear = getDayOfYear(date)
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24)
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const latRad = lat * rad
  const zenith = 90.833 * rad
  const cosHourAngle =
    (Math.cos(zenith) / (Math.cos(latRad) * Math.cos(decl))) - Math.tan(latRad) * Math.tan(decl)

  if (cosHourAngle >= 1) {
    return 'night'
  }
  if (cosHourAngle <= -1) {
    return 'day'
  }

  const hourAngle = Math.acos(cosHourAngle) / rad
  const timezoneMinutes = -date.getTimezoneOffset()
  const solarNoonMinutes = 720 - 4 * lon - eqtime + timezoneMinutes
  const sunriseMinutes = solarNoonMinutes - hourAngle * 4
  const sunsetMinutes = solarNoonMinutes + hourAngle * 4
  const currentMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60

  return currentMinutes >= sunriseMinutes && currentMinutes < sunsetMinutes ? 'day' : 'night'
}

function getFallbackTheme(date: Date): TimeTheme {
  return date.getHours() >= 6 && date.getHours() < 18 ? 'day' : 'night'
}

function readStoredCoords(): StoredCoords | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCoords
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lon !== 'number' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeStoredCoords(coords: StoredCoords) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
  } catch {
    // ignore localStorage failures
  }
}

export function useSolarTheme(clockNow: number): SolarThemeState {
  const [coords, setCoords] = useState<StoredCoords | null>(null)

  useEffect(() => {
    const stored = readStoredCoords()
    if (stored && Date.now() - stored.savedAt < GEO_MAX_AGE_MS) {
      setCoords(stored)
    }

    if (!('geolocation' in navigator)) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          savedAt: Date.now(),
        }
        setCoords(next)
        writeStoredCoords(next)
      },
      () => {
        // keep fallback theme
      },
      {
        enableHighAccuracy: false,
        maximumAge: GEO_MAX_AGE_MS,
        timeout: 5000,
      },
    )
  }, [])

  return useMemo(() => {
    const date = new Date(clockNow)
    if (coords) {
      return {
        timeTheme: getSolarThemeForCoords(date, coords.lat, coords.lon),
        themeSource: 'location',
      } satisfies SolarThemeState
    }
    return {
      timeTheme: getFallbackTheme(date),
      themeSource: 'timezone',
    } satisfies SolarThemeState
  }, [clockNow, coords])
}
