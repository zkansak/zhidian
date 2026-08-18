import { useRef, useState, type PointerEvent as REPointerEvent } from 'react'
import type { DevicePlacement, Marker, Room } from '../types'
import {
  CANVAS_MIN_H,
  CANVAS_MIN_W,
  PX_PER_M,
  magneticResizeRoom,
  magneticSnapPosition,
  resolveRoomPosition,
  type ResizeHandle,
} from '../logic/placement'

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
  onDragEnd?: (kind: 'room' | 'marker' | 'device' | 'resize') => void
}

type DragState =
  | {
      kind: 'room' | 'marker' | 'device'
      id: string
      ox: number
      oy: number
      startX: number
      startY: number
    }
  | {
      kind: 'resize'
      id: string
      handle: ResizeHandle
    }

const RESIZE_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

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
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag

  const maxX = Math.max(CANVAS_MIN_W, ...rooms.map((r) => r.x + r.length * PX_PER_M + 40))
  const maxY = Math.max(CANVAS_MIN_H, ...rooms.map((r) => r.y + r.width * PX_PER_M + 40))

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

  function onPointerDownResize(e: REPointerEvent, room: Room, handle: ResizeHandle) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    onSelectRoom?.(room.id)
    setDrag({ kind: 'resize', id: room.id, handle })
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

    if (drag.kind === 'resize') {
      if (!onRoomsChange) return
      const room = rooms.find((r) => r.id === drag.id)
      if (!room) return
      const next = magneticResizeRoom(room, drag.handle, p.x, p.y, rooms)
      onRoomsChange(rooms.map((r) => (r.id === drag.id ? { ...r, ...next } : r)))
      return
    }

    if (drag.kind === 'room') {
      if (!onRoomsChange) return
      const moving = rooms.find((r) => r.id === drag.id)
      if (!moving) return
      const tentative = {
        ...moving,
        x: p.x - drag.ox,
        y: p.y - drag.oy,
      }
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
    onDragEnd?.(current.kind === 'resize' ? 'resize' : current.kind)
  }

  const showHatch = (room: Room) => {
    if (mode === 'edit') return room.id === activeRoomId
    if (mode === 'cover') return room.selected
    return false
  }

  const isEditing = mode === 'layout' || mode === 'edit' || mode === 'plan'
  const canResize = mode === 'edit'
  const showCoverageOff = mode === 'plan' || mode === 'cover' || mode === 'marker'

  function handleGeometry(room: Room, handle: ResizeHandle) {
    const w = room.length * PX_PER_M
    const h = room.width * PX_PER_M
    const cx = room.x + w / 2
    const cy = room.y + h / 2
    const edge = 28
    const corner = 18

    switch (handle) {
      case 'n':
        return { x: room.x, y: room.y - edge / 2, width: w, height: edge, kx: cx, ky: room.y, cursor: 'ns-resize' }
      case 's':
        return { x: room.x, y: room.y + h - edge / 2, width: w, height: edge, kx: cx, ky: room.y + h, cursor: 'ns-resize' }
      case 'e':
        return { x: room.x + w - edge / 2, y: room.y, width: edge, height: h, kx: room.x + w, ky: cy, cursor: 'ew-resize' }
      case 'w':
        return { x: room.x - edge / 2, y: room.y, width: edge, height: h, kx: room.x, ky: cy, cursor: 'ew-resize' }
      case 'ne':
        return {
          x: room.x + w - corner,
          y: room.y - corner / 2,
          width: corner * 1.4,
          height: corner * 1.4,
          kx: room.x + w,
          ky: room.y,
          cursor: 'nesw-resize',
        }
      case 'nw':
        return {
          x: room.x - corner / 2,
          y: room.y - corner / 2,
          width: corner * 1.4,
          height: corner * 1.4,
          kx: room.x,
          ky: room.y,
          cursor: 'nwse-resize',
        }
      case 'se':
        return {
          x: room.x + w - corner,
          y: room.y + h - corner,
          width: corner * 1.4,
          height: corner * 1.4,
          kx: room.x + w,
          ky: room.y + h,
          cursor: 'nwse-resize',
        }
      case 'sw':
        return {
          x: room.x - corner / 2,
          y: room.y + h - corner,
          width: corner * 1.4,
          height: corner * 1.4,
          kx: room.x,
          ky: room.y + h,
          cursor: 'nesw-resize',
        }
    }
  }

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
            <line x1="0" y1="0" x2="0" y2="8" stroke="#0c7c72" strokeWidth="1.25" opacity="0.42" />
          </pattern>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(19,32,41,0.055)" strokeWidth="1" />
          </pattern>
          <linearGradient id="canvasGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(12,124,114,0.04)" />
            <stop offset="100%" stopColor="rgba(27,111,143,0.03)" />
          </linearGradient>
          <radialGradient id="coverGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(12,124,114,0.2)" />
            <stop offset="100%" stopColor="rgba(12,124,114,0.16)" />
          </radialGradient>
        </defs>

        <rect width={maxX} height={maxY} fill="url(#canvasGlow)" />
        <rect width={maxX} height={maxY} fill="url(#grid)" />

        {rooms.map((room) => {
          const w = room.length * PX_PER_M
          const h = room.width * PX_PER_M
          const hatched = showHatch(room)
          const active = isEditing && room.id === activeRoomId
          const off = showCoverageOff && !room.selected
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
              {mode === 'plan' || mode === 'marker' ? (
                <g
                  className={`cover-badge${room.selected ? ' is-on' : ''}`}
                  onPointerDown={(e) => onPointerDownCoverBadge(e, room)}
                >
                  <rect x={room.x + 8} y={room.y + 8} width={42} height={20} rx={5} />
                  <text x={room.x + 29} y={room.y + 22} textAnchor="middle">
                    {room.selected ? '要装' : '不装'}
                  </text>
                </g>
              ) : null}
              {canResize && active &&
                RESIZE_HANDLES.map((handle) => {
                  const g = handleGeometry(room, handle)
                  const isCorner = handle.length === 2
                  return (
                    <g
                      key={handle}
                      className={`resize-handle resize-${handle}${isCorner ? ' is-corner' : ' is-edge'}`}
                      style={{ cursor: g.cursor }}
                      onPointerDown={(e) => onPointerDownResize(e, room, handle)}
                    >
                      <rect
                        className="resize-hit"
                        x={g.x}
                        y={g.y}
                        width={g.width}
                        height={g.height}
                      />
                      {isCorner ? (
                        <rect
                          className="resize-knob"
                          x={g.kx - 5}
                          y={g.ky - 5}
                          width={10}
                          height={10}
                          rx={2}
                        />
                      ) : handle === 'n' || handle === 's' ? (
                        <rect
                          className="resize-knob resize-knob-edge"
                          x={g.kx - 12}
                          y={g.ky - 3.5}
                          width={24}
                          height={7}
                          rx={3}
                        />
                      ) : (
                        <rect
                          className="resize-knob resize-knob-edge"
                          x={g.kx - 3.5}
                          y={g.ky - 12}
                          width={7}
                          height={24}
                          rx={3}
                        />
                      )}
                    </g>
                  )
                })}
            </g>
          )
        })}

        {(mode === 'result' || mode === 'adjust') &&
          devices.map((d) => (
            <g key={`cov-${d.id}`}>
              <circle cx={d.x} cy={d.y} r={d.coverageRadius} className="coverage-fill" />
              <circle cx={d.x} cy={d.y} r={d.coverageRadius} className="coverage-ring" />
              {mode === 'adjust' && (d.installable === false || d.nearNoise === true) && (
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
              className={`device${mode === 'adjust' && (d.installable === false || d.nearNoise === true) ? ' is-draggable' : ''}`}
              onPointerDown={(e) => {
                if (mode !== 'adjust' || (d.installable !== false && d.nearNoise !== true)) return
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
