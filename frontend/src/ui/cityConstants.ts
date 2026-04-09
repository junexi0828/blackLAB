// Department 3D positions — shared constants (separate file for fast-refresh)
export const DEPT_SHAPES: Record<string, string> = {
  research: 'cylinder',
  engineering: 'pyramid',
  ceo: 'hexagon',
  product: 'box',
  design: 'cylinder',
  growth: 'pyramid',
  finance: 'hexagon',
  validation: 'box',
  test_lab: 'pyramid',
  quality_gate: 'hexagon',
  board_review: 'box',
}

export const DEPT_POSITIONS: Record<string, [number, number, number]> = {
  ceo:          [0,    0,  0],
  research:     [-5,   0, -4.5],
  product:      [5,    0, -4.5],
  design:       [-5,   0,  0],
  engineering:  [5,    0,  0],
  growth:       [-5,   0,  4.5],
  finance:      [5,    0,  4.5],
  validation:   [-8,   0,  9],
  test_lab:     [0,    0,  9],
  quality_gate: [8,    0,  9],
  board_review: [0,    0, 13],
}

export const DEPT_COLORS: Record<string, string> = {
  ceo:          '#ff006e',
  research:     '#00e5ff',
  product:      '#39ff14',
  design:       '#bf5af2',
  engineering:  '#ff9500',
  growth:       '#ffd60a',
  finance:      '#00d4aa',
  validation:   '#8be9fd',
  test_lab:     '#ff6b6b',
  quality_gate: '#9cff57',
  board_review: '#ffd700',
}
