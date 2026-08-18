import { useRef, useState, type PointerEvent as REPointerEvent } from 'react'
import type { DevicePlacement, Marker, Room } from '../types'
import { PX_PER_M, magneticSnapPosition, resolveRoomPosition } from '../logic/placement'

export type PlanMode =
  | 'layout'
  | 'edit'
  | 'plan'
  | 'cover'
  | 'marker'
  | 'result'
  | 'adjust'

interface FloorPlanProps {
  rooms: Room[]
  markers?: Marker[]
  devices?: DevicePlacement[]
  activeRoomId?: string | null
  mode: PlanMode
  onRoomsChange?: (rooms: Room[]) => void
  onSelectRoom?: (id: string) => void
  onToggleCover?: (id: string) => void
  onAddMarker?: (roomId: string, x: number, y: number) => void
  onMoveMarker?: (id: string, x: number, y: number) => void
  onMoveDevice?: (id: string, x: number, y: number) => void
  /** Fired when a marker/room/device drag ends */
  onDragEnd?: (kind: 'room' | 'marker' | 'device') => void
}

export function FloorPlan({
  rooms,
  markers = [],
  devices = [],
  activeRoomId,
  mode,
  onRoomsChange,
  onSelectRoom,
  onToggleCover,
  onAddMarker,
  onMoveMarker,
  onMoveDevice,
  onDragEnd,
}: FloorPlanProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{
    kind: 'room' | 'marker' | 'device'
    id: string
    ox: number
    oy: number
    startX: number
    startY: number
  } | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag

  const maxX = Math.max(640, ...rooms.map((r) => r.x + r.length * PX_PER_M + 40))
  const maxY = Math.max(420, ...rooms.map((r) => r.y + r.width * PX_PER_M + 40))

  function clientToSvg(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function roomAt(x: number, y: number): Room | undefined {
    return [...rooms].reverse().find(
      (r) =>
        x >= r.x &&
        x <= r.x + r.length * PX_PER_M &&
        y >= r.y &&
        y <= r.y + r.width * PX_PER_M,
    )
  }

  function onPointerDownRoom(e: REPointerEvent, room: Room) {
    if (mode === 'layout' || mode === 'edit' || mode === 'plan') {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      const p = clientToSvg(e)
      setDrag({
        kind: 'room',
        id: room.id,
        ox: p.x - room.x,
        oy: p.y - room.y,
        startX: room.x,
        startY: room.y,
      })
      onSelectRoom?.(room.id)
      return
    }
    if (mode === 'cover') {
      onToggleCover?.(room.id)
    }
  }

  function onPointerDownCoverBadge(e: REPointerEvent, room: Room) {
    e.stopPropagation()
    onSelectRoom?.(room.id)
    onToggleCover?.(room.id)
  }

  function onPointerDownBg(e: REPointerEvent) {
    if (mode !== 'marker') return
    const p = clientToSvg(e)
    const room = roomAt(p.x, p.y)
    if (room && room.selected) {
      onAddMarker?.(room.id, p.x, p.y)
    }
  }

  function onPointerMove(e: REPointerEvent) {
    if (!drag) return
    const p = clientToSvg(e)

    if (drag.kind === 'room') {
      if (!onRoomsChange) return
      const moving = rooms.find((r) => r.id === drag.id)
      if (!moving) return
      const nextX = p.x - drag.ox
      const nextY = p.y - drag.oy
      const tentative = {
        ...moving,
        x: nextX,
        y: nextY,
      }
      // layout: free place; edit/plan: magnetic flush snap
      const resolved =
        mode === 'edit' || mode === 'plan'
          ? magneticSnapPosition(tentative, rooms)
          : resolveRoomPosition(tentative, rooms)
      onRoomsChange(rooms.map((r) => (r.id === drag.id ? { ...r, ...resolved } : r)))
    } else if (drag.kind === 'marker' && onMoveMarker) {
      onMoveMarker(drag.id, p.x, p.y)
    } else if (drag.kind === 'device' && onMoveDevice) {
      const device = devices.find((d) => d.id === drag.id)
      if (!device) return
      const dx = p.x - device.originX
      const dy = p.y - device.originY
      const dist = Math.hypot(dx, dy)
      const max = device.movableRadius
      if (dist <= max) {
        onMoveDevice(drag.id, p.x, p.y)
      } else {
        const s = max / dist
        onMoveDevice(drag.id, device.originX + dx * s, device.originY + dy * s)
      }
    }
  }

  function endDrag() {
    const current = dragRef.current
    if (!current) return
    dragRef.current = null
    setDrag(null)
    onDragEnd?.(current.kind)
  }

  const showHatch = (room: Room) => {
    if (mode === 'edit') return room.id === activeRoomId
    if (mode === 'cover') return room.selected
    return false
  }

  const isEditing = mode === 'layout' || mode === 'edit' || mode === 'plan'

  return (
    <div className="plan-wrap">
      <svg
        ref={svgRef}
        className="floor-plan"
        viewBox={`0 0 ${maxX} ${maxY}`}
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#1c1b19" strokeWidth="1.25" opacity="0.22" />
          </pattern>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(28,27,25,0.045)" strokeWidth="1" />
          </pattern>
          <linearGradient id="canvasGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7f3ec" />
            <stop offset="100%" stopColor="#efeae2" />
          </linearGradient>
          <radialGradient id="coverGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(45,107,82,0.32)" />
            <stop offset="52%" stopColor="rgba(45,107,82,0.12)" />
            <stop offset="100%" stopColor="rgba(45,107,82,0)" />
          </radialGradient>
        </defs>

        <rect width={maxX} height={maxY} fill="url(#canvasGlow)" />
        <rect width={maxX} height={maxY} fill="url(#grid)" />

        {rooms.map((room) => {
          const w = room.length * PX_PER_M
          const h = room.width * PX_PER_M
          const hatched = showHatch(room)
          const active = isEditing && room.id === activeRoomId
          const off = (mode === 'plan' || mode === 'cover' || mode === 'marker') && !room.selected
          return (
            <g
              key={room.id}
              className={`room-shape${active ? ' is-active' : ''}${off ? ' is-off' : ''}${isEditing ? ' is-draggable' : ''}`}
              onPointerDown={(e) => onPointerDownRoom(e, room)}
            >
              <rect
                x={room.x}
                y={room.y}
                width={w}
                height={h}
                className="room-fill"
                fill={hatched ? 'url(#hatch)' : 'var(--room-fill)'}
              />
              <rect x={room.x} y={room.y} width={w} height={h} className="room-stroke" />
              <text
                x={room.x + w / 2}
                y={room.y + h / 2 - 6}
                textAnchor="middle"
                className="room-label"
              >
                {room.name || '未命名'}
              </text>
              <text
                x={room.x + w / 2}
                y={room.y + h / 2 + 12}
                textAnchor="middle"
                className="room-dim"
              >
                {room.length.toFixed(1)} × {room.width.toFixed(1)} m
              </text>
              {mode === 'plan' && (
                <g
                  className={`cover-badge${room.selected ? ' is-on' : ''}`}
                  onPointerDown={(e) => onPointerDownCoverBadge(e, room)}
                >
                  <rect x={room.x + 8} y={room.y + 8} width={42} height={20} rx={5} />
                  <text x={room.x + 29} y={room.y + 22} textAnchor="middle">
                    {room.selected ? '要装' : '不装'}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {(mode === 'result' || mode === 'adjust') &&
          devices.map((d) => (
            <g key={`cov-${d.id}`}>
              <circle cx={d.x} cy={d.y} r={d.coverageRadius} className="coverage-fill" />
              <circle cx={d.x} cy={d.y} r={d.coverageRadius} className="coverage-ring" />
              {mode === 'adjust' && drag?.kind === 'device' && drag.id === d.id && (
                <circle
                  cx={d.originX}
                  cy={d.originY}
                  r={d.movableRadius}
                  className="movable-ring"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          ))}

        {(mode === 'marker' || mode === 'result' || mode === 'adjust') &&
          markers.map((m) => (
            <g
              key={m.id}
              className="marker"
              onPointerDown={(e) => {
                if (mode !== 'marker') return
                e.stopPropagation()
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                setDrag({
                  kind: 'marker',
                  id: m.id,
                  ox: 0,
                  oy: 0,
                  startX: m.x,
                  startY: m.y,
                })
              }}
            >
              <title>{m.label || '常坐处'}</title>
              <circle cx={m.x} cy={m.y} r={16} className="marker-hit" />
              <rect
                x={m.x - 9}
                y={m.y - 6.5}
                width={18}
                height={13}
                rx={3}
                className="marker-halo"
              />
              <rect
                x={m.x - 8}
                y={m.y - 5.5}
                width={16}
                height={11}
                rx={2.5}
                className="marker-core"
              />
            </g>
          ))}

        {(mode === 'result' || mode === 'adjust') &&
          devices.map((d) => (
            <g
              key={d.id}
              className={`device${mode === 'adjust' ? ' is-draggable' : ''}`}
              onPointerDown={(e) => {
                if (mode !== 'adjust') return
                e.stopPropagation()
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                setDrag({
                  kind: 'device',
                  id: d.id,
                  ox: 0,
                  oy: 0,
                  startX: d.originX,
                  startY: d.originY,
                })
              }}
            >
              <circle cx={d.x} cy={d.y} r={10} className="device-dot" />
            </g>
          ))}
      </svg>
    </div>
  )
}
