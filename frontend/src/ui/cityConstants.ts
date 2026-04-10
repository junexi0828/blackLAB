import campusLayoutData from '../config/campus-layout.json'
import type { CampusLayout } from '../types'

function tuple3(values: number[]): [number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]
}

export function cloneCampusLayout(layout: CampusLayout): CampusLayout {
  const buildings = Object.fromEntries(
    Object.entries(layout.buildings).map(([key, value]) => [
      key,
      {
        position: tuple3(value.position),
        shape: value.shape,
        color: value.color,
      },
    ]),
  )

  return {
    buildings,
    monument: {
      ...layout.monument,
      position: tuple3(layout.monument.position),
    },
  }
}

export const DEFAULT_CAMPUS_LAYOUT = cloneCampusLayout(campusLayoutData as unknown as CampusLayout)

export function buildCampusMaps(layout: CampusLayout = DEFAULT_CAMPUS_LAYOUT) {
  const positions = Object.fromEntries(
    Object.entries(layout.buildings).map(([key, value]) => [key, tuple3(value.position)]),
  ) as Record<string, [number, number, number]>

  const shapes = Object.fromEntries(
    Object.entries(layout.buildings).map(([key, value]) => [key, value.shape]),
  ) as Record<string, string>

  const colors = Object.fromEntries(
    Object.entries(layout.buildings).map(([key, value]) => [key, value.color]),
  ) as Record<string, string>

  const monument = {
    ...layout.monument,
    position: tuple3(layout.monument.position),
  }

  return { positions, shapes, colors, monument }
}
