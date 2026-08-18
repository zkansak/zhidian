export type UnitType = '1b1l' | '2b1l' | '3b1l' | 'custom'

export interface Point {
  x: number
  y: number
}

export interface Room {
  id: string
  name: string
  /** Canvas position (top-left), metres when scaled by metersPerUnit */
  x: number
  y: number
  length: number
  width: number
  height: number
  selected: boolean
}

export interface Marker {
  id: string
  roomId: string
  x: number
  y: number
  label: string
}

export interface DevicePlacement {
  id: string
  roomId: string
  /** Current position (canvas px) */
  x: number
  y: number
  /** Original recommended position (canvas px) — adjust range center */
  originX: number
  originY: number
  coverageRadius: number
  movableRadius: number
  description: string
  installable: boolean | null
  nearNoise: boolean | null
}

export interface AppState {
  step: number
  unitType: UnitType | null
  customName: string
  ceilingHeight: number
  rooms: Room[]
  markers: Marker[]
  devices: DevicePlacement[]
  activeRoomId: string | null
}

export const STEP_LABELS = ['户型选择', '户型布局', '覆盖选择', '系统方案', '确认调整'] as const

export const UNIT_OPTIONS: { value: UnitType; label: string; rooms: number }[] = [
  { value: '1b1l', label: '一室一厅', rooms: 2 },
  { value: '2b1l', label: '两室一厅', rooms: 3 },
  { value: '3b1l', label: '三室一厅', rooms: 4 },
  { value: 'custom', label: '自定义', rooms: 0 },
]
