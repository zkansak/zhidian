import type { DevicePlacement, Marker, Room } from '../types'

/** Pixels per metre on the canvas */
export const PX_PER_M = 40

export function roomArea(room: Room): number {
  return room.length * room.width
}

export function aspectRatio(room: Room): number {
  const a = Math.max(room.length, room.width)
  const b = Math.min(room.length, room.width)
  return b > 0 ? a / b : 1
}

/**
 * Device count from area + aspect ratio.
 * ≤25 → 1；25–50 → 1(R≤2) / 2(R>2)；>50 → 2(R≤2) / 3(R>2)
 */
export function deviceCountForArea(area: number, R = 1): number {
  if (area <= 25) return 1
  if (area <= 50) return R <= 2 ? 1 : 2
  return R <= 2 ? 2 : 3
}

/**
 * Base layout points in room-local coords (origin = room top-left, metres).
 * R ≤ 2 → center (or near-center split)；2 < R ≤ 3 → 横向双点；R > 3 → 双点/三角
 */
function basePoints(room: Room, count: number): { x: number; y: number }[] {
  const R = aspectRatio(room)
  const L = room.length
  const W = room.width
  const cx = L / 2
  const cy = W / 2
  const longIsX = L >= W

  if (count === 1) {
    return [{ x: cx, y: cy }]
  }

  // Roughly square / mild aspect: center-biased
  if (R <= 2) {
    if (count === 2) {
      return longIsX
        ? [
            { x: L * 0.38, y: cy },
            { x: L * 0.62, y: cy },
          ]
        : [
            { x: cx, y: W * 0.38 },
            { x: cx, y: W * 0.62 },
          ]
    }
    // count === 3
    return [
      { x: L * 0.3, y: W * 0.35 },
      { x: L * 0.7, y: W * 0.35 },
      { x: cx, y: W * 0.7 },
    ]
  }

  // Elongated: horizontal (or vertical) double / triangle along long axis
  if (count === 2) {
    return longIsX
      ? [
          { x: L / 3, y: cy },
          { x: (2 * L) / 3, y: cy },
        ]
      : [
          { x: cx, y: W / 3 },
          { x: cx, y: (2 * W) / 3 },
        ]
  }

  // count === 3, R > 2 → triangle
  if (longIsX) {
    return [
      { x: L * 0.22, y: cy },
      { x: L * 0.78, y: cy },
      { x: cx, y: W * (R > 3 ? 0.32 : 0.38) },
    ]
  }
  return [
    { x: cx, y: W * 0.22 },
    { x: cx, y: W * 0.78 },
    { x: L * (R > 3 ? 0.32 : 0.38), y: cy },
  ]
}

/** Pull placement toward nearest communication marker (max ~0.5 m) */
function offsetTowardMarkers(
  px: number,
  py: number,
  room: Room,
  markers: Marker[],
): { x: number; y: number; offsetDesc: string } {
  const roomMarkers = markers.filter((m) => m.roomId === room.id)
  if (roomMarkers.length === 0) {
    return { x: px, y: py, offsetDesc: '居中布置' }
  }

  let nearest = roomMarkers[0]
  let bestDist = Infinity
  for (const m of roomMarkers) {
    const mx = (m.x - room.x) / PX_PER_M
    const my = (m.y - room.y) / PX_PER_M
    const d = Math.hypot(mx - px, my - py)
    if (d < bestDist) {
      bestDist = d
      nearest = m
    }
  }

  const mx = (nearest.x - room.x) / PX_PER_M
  const my = (nearest.y - room.y) / PX_PER_M
  const dx = mx - px
  const dy = my - py
  const dist = Math.hypot(dx, dy) || 1
  const pull = Math.min(0.5, dist * 0.35)
  const nx = clamp(px + (dx / dist) * pull, 0.4, room.length - 0.4)
  const ny = clamp(py + (dy / dist) * pull, 0.4, room.width - 0.4)

  return {
    x: nx,
    y: ny,
    offsetDesc: `向「${nearest.label || '交流区'}」偏移 ${pull.toFixed(1)} m`,
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function wallDescription(room: Room, lx: number, ly: number): string {
  const fromWest = lx
  const fromEast = room.length - lx
  const fromNorth = ly
  const fromSouth = room.width - ly
  const h = fromWest <= fromEast ? `距西墙 ${fromWest.toFixed(1)} m` : `距东墙 ${fromEast.toFixed(1)} m`
  const v =
    fromNorth <= fromSouth ? `距北墙 ${fromNorth.toFixed(1)} m` : `距南墙 ${fromSouth.toFixed(1)} m`
  return `${h}，${v}`
}

/** Live description for a device at canvas position (updates while dragging). */
export function describeDevicePosition(
  room: Room,
  canvasX: number,
  canvasY: number,
  markers: Marker[],
  originX: number,
  originY: number,
): string {
  const lx = (canvasX - room.x) / PX_PER_M
  const ly = (canvasY - room.y) / PX_PER_M
  const wall = wallDescription(room, lx, ly)

  const adjM = Math.hypot(canvasX - originX, canvasY - originY) / PX_PER_M
  const roomMarkers = markers.filter((m) => m.roomId === room.id)

  let offsetDesc: string
  if (adjM > 0.05) {
    offsetDesc = `相对推荐点调整 ${adjM.toFixed(2)} m`
    if (roomMarkers.length > 0) {
      let nearestLabel = roomMarkers[0].label || '交流区'
      let best = Infinity
      for (const m of roomMarkers) {
        const d = Math.hypot(m.x - canvasX, m.y - canvasY)
        if (d < best) {
          best = d
          nearestLabel = m.label || '交流区'
        }
      }
      const toMarker = best / PX_PER_M
      offsetDesc += ` · 距「${nearestLabel}」${toMarker.toFixed(1)} m`
    }
  } else if (roomMarkers.length === 0) {
    offsetDesc = '居中布置'
  } else {
    const { offsetDesc: od } = offsetTowardMarkers(lx, ly, room, markers)
    offsetDesc = od
  }

  return `${room.name} · ${wall} · ${offsetDesc}`
}

export function coverageRadiusForArea(area: number): number {
  return Math.min(4.5, Math.max(2.2, Math.sqrt(area) * 0.45))
}

export function computePlacements(rooms: Room[], markers: Marker[]): DevicePlacement[] {
  const devices: DevicePlacement[] = []
  const covered = rooms.filter((r) => r.selected)

  for (const room of covered) {
    const area = roomArea(room)
    const R = aspectRatio(room)
    const count = deviceCountForArea(area, R)
    const bases = basePoints(room, count)
    const radius = coverageRadiusForArea(area)

    bases.forEach((base, i) => {
      const { x, y } = offsetTowardMarkers(base.x, base.y, room, markers)
      const cx = room.x + x * PX_PER_M
      const cy = room.y + y * PX_PER_M
      devices.push({
        id: `${room.id}-d${i}`,
        roomId: room.id,
        x: cx,
        y: cy,
        originX: cx,
        originY: cy,
        coverageRadius: radius * PX_PER_M,
        movableRadius: 1.2 * PX_PER_M,
        description: describeDevicePosition(room, cx, cy, markers, cx, cy),
        installable: null,
        nearNoise: null,
      })
    })
  }

  return devices
}

export function layoutLabel(R: number, count: number): string {
  if (count === 1) return '中心布置'
  if (R <= 2) return count === 2 ? '近中心双点' : '近中心布置'
  if (R <= 3) return '横向双点'
  return count >= 3 ? '三角形布置' : '横向双点'
}

/** Consumer-facing placement line (no algorithm jargon). */
export function placementHint(room: Room, markers: Marker[]): string {
  return markers.some((m) => m.roomId === room.id)
    ? '靠近常坐的地方'
    : '放在房间中间'
}

export function snapValue(v: number, grid = 10): number {
  return Math.round(v / grid) * grid
}

function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap = 2,
): boolean {
  return ax < bx + bw - gap && ax + aw > bx + gap && ay < by + bh - gap && ay + ah > by + gap
}

function roomSize(r: Room) {
  return { w: r.length * PX_PER_M, h: r.width * PX_PER_M }
}

/**
 * Free placement: light grid + collision push-out (no forced flush).
 * Used while sizes are still being decided.
 */
export function resolveRoomPosition(moving: Room, others: Room[]): { x: number; y: number } {
  let x = snapValue(Math.max(8, moving.x))
  let y = snapValue(Math.max(8, moving.y))
  const { w: mw, h: mh } = roomSize(moving)

  for (let pass = 0; pass < 4; pass++) {
    let hit = false
    for (const o of others) {
      if (o.id === moving.id) continue
      const { w: ow, h: oh } = roomSize(o)
      if (!overlaps(x, y, mw, mh, o.x, o.y, ow, oh)) continue
      hit = true

      const movingCx = x + mw / 2
      const movingCy = y + mh / 2
      const otherCx = o.x + ow / 2
      const otherCy = o.y + oh / 2
      const overlapX = Math.min(x + mw, o.x + ow) - Math.max(x, o.x)
      const overlapY = Math.min(y + mh, o.y + oh) - Math.max(y, o.y)

      if (overlapX < overlapY) {
        x = movingCx >= otherCx ? o.x + ow + 4 : o.x - mw - 4
      } else {
        y = movingCy >= otherCy ? o.y + oh + 4 : o.y - mh - 4
      }
      x = Math.max(8, x)
      y = Math.max(8, y)
    }
    if (!hit) break
  }

  return { x: snapValue(x), y: snapValue(y) }
}

/**
 * After sizes are set: magnetic edge snap so rooms can flush together (贴合).
 * Prefer contact edges; still avoid deep overlap.
 */
export function magneticSnapPosition(
  moving: Room,
  others: Room[],
  threshold = 22,
): { x: number; y: number } {
  let x = moving.x
  let y = moving.y
  const { w: mw, h: mh } = roomSize(moving)

  let bestDx = 0
  let bestDy = 0
  let bestScore = threshold + 1

  for (const o of others) {
    if (o.id === moving.id) continue
    const { w: ow, h: oh } = roomSize(o)

    const candidates: { dx: number; dy: number; score: number }[] = [
      // Flush to right / left / bottom / top of other
      { dx: o.x + ow - x, dy: 0, score: Math.abs(o.x + ow - x) },
      { dx: o.x - mw - x, dy: 0, score: Math.abs(o.x - mw - x) },
      { dx: 0, dy: o.y + oh - y, score: Math.abs(o.y + oh - y) },
      { dx: 0, dy: o.y - mh - y, score: Math.abs(o.y - mh - y) },
      // Align outer edges while approaching
      { dx: o.x - x, dy: 0, score: Math.abs(o.x - x) },
      { dx: o.x + ow - mw - x, dy: 0, score: Math.abs(o.x + ow - mw - x) },
      { dx: 0, dy: o.y - y, score: Math.abs(o.y - y) },
      { dx: 0, dy: o.y + oh - mh - y, score: Math.abs(o.y + oh - mh - y) },
    ]

    // Prefer snaps that also keep some axis overlap (true shared wall)
    for (const c of candidates) {
      const nx = x + c.dx
      const ny = y + c.dy
      const shareY = Math.min(ny + mh, o.y + oh) - Math.max(ny, o.y)
      const shareX = Math.min(nx + mw, o.x + ow) - Math.max(nx, o.x)
      const isVerticalContact = Math.abs(c.dx) > 0 && Math.abs(c.dy) === 0
      const isHorizontalContact = Math.abs(c.dy) > 0 && Math.abs(c.dx) === 0
      const wallOk =
        (isVerticalContact && shareY > 8) ||
        (isHorizontalContact && shareX > 8) ||
        (!isVerticalContact && !isHorizontalContact)

      if (!wallOk) continue
      if (c.score < bestScore && c.score <= threshold) {
        bestScore = c.score
        bestDx = c.dx
        bestDy = c.dy
      }
    }
  }

  if (bestScore <= threshold) {
    x += bestDx
    y += bestDy
  }

  // If still overlapping after snap, push out to flush (gap 0)
  for (const o of others) {
    if (o.id === moving.id) continue
    const { w: ow, h: oh } = roomSize(o)
    if (!overlaps(x, y, mw, mh, o.x, o.y, ow, oh, 0.5)) continue
    const movingCx = x + mw / 2
    const movingCy = y + mh / 2
    const otherCx = o.x + ow / 2
    const otherCy = o.y + oh / 2
    const overlapX = Math.min(x + mw, o.x + ow) - Math.max(x, o.x)
    const overlapY = Math.min(y + mh, o.y + oh) - Math.max(y, o.y)
    if (overlapX < overlapY) {
      x = movingCx >= otherCx ? o.x + ow : o.x - mw
    } else {
      y = movingCy >= otherCy ? o.y + oh : o.y - mh
    }
  }

  return { x: Math.max(0, x), y: Math.max(0, y) }
}

/**
 * One-shot: pack rooms so nearby blocks flush into a contiguous plan.
 * Keeps relative neighborhood (closest neighbor), anchor = top-left-most.
 */
export function fitRoomsTogether(rooms: Room[]): Room[] {
  if (rooms.length <= 1) return rooms.map((r) => ({ ...r }))

  const ordered = [...rooms].sort((a, b) => a.y - b.y || a.x - b.x)
  const result: Room[] = ordered.map((r) => ({ ...r }))
  const byId = new Map(result.map((r) => [r.id, r]))

  // Anchor stays; pull each other room to flush against nearest already-settled neighbor
  const settled = new Set<string>([ordered[0].id])

  while (settled.size < result.length) {
    let best: {
      id: string
      x: number
      y: number
      dist: number
    } | null = null

    for (const room of result) {
      if (settled.has(room.id)) continue
      for (const sid of settled) {
        const o = byId.get(sid)!
        const { w: mw, h: mh } = roomSize(room)
        const { w: ow, h: oh } = roomSize(o)

        const opts = [
          { x: o.x + ow, y: o.y },
          { x: o.x + ow, y: o.y + oh - mh },
          { x: o.x - mw, y: o.y },
          { x: o.x - mw, y: o.y + oh - mh },
          { x: o.x, y: o.y + oh },
          { x: o.x + ow - mw, y: o.y + oh },
          { x: o.x, y: o.y - mh },
          { x: o.x + ow - mw, y: o.y - mh },
        ]

        for (const opt of opts) {
          const dist = Math.hypot(opt.x - room.x, opt.y - room.y)
          // Prefer options that share a meaningful wall segment
          const shareY = Math.min(opt.y + mh, o.y + oh) - Math.max(opt.y, o.y)
          const shareX = Math.min(opt.x + mw, o.x + ow) - Math.max(opt.x, o.x)
          const touchesV = Math.abs(opt.x - (o.x + ow)) < 1 || Math.abs(opt.x + mw - o.x) < 1
          const touchesH = Math.abs(opt.y - (o.y + oh)) < 1 || Math.abs(opt.y + mh - o.y) < 1
          if ((touchesV && shareY < 12) || (touchesH && shareX < 12)) continue

          if (!best || dist < best.dist) {
            best = { id: room.id, x: opt.x, y: opt.y, dist }
          }
        }
      }
    }

    if (!best) break
    const target = byId.get(best.id)!
    target.x = Math.max(0, best.x)
    target.y = Math.max(0, best.y)
    settled.add(best.id)
  }

  // Resolve any residual overlaps with flush push
  for (let pass = 0; pass < 6; pass++) {
    for (const room of result) {
      const pos = magneticSnapPosition(room, result, 0)
      // only apply overlap resolution part by reusing magnetic with 0 threshold after nudge
      const resolved = magneticSnapPosition({ ...room, x: pos.x, y: pos.y }, result, 8)
      room.x = resolved.x
      room.y = resolved.y
    }
  }

  return rooms.map((r) => {
    const u = byId.get(r.id)!
    return { ...r, x: u.x, y: u.y }
  })
}

export function createPresetRooms(type: '1b1l' | '2b1l' | '3b1l', height: number): Room[] {
  /** Separate blocks — not fused into one silhouette */
  const gap = 12
  const living: Room = {
    id: 'living',
    name: '客厅',
    x: 40,
    y: 40,
    length: 6,
    width: 4.5,
    height,
    selected: true,
  }

  if (type === '1b1l') {
    return [
      living,
      {
        id: 'bed1',
        name: '卧室',
        x: 40 + living.length * PX_PER_M + gap,
        y: 40,
        length: 4,
        width: 3.5,
        height,
        selected: true,
      },
    ]
  }

  if (type === '2b1l') {
    const bed1: Room = {
      id: 'bed1',
      name: '卧室1',
      x: 40 + living.length * PX_PER_M + gap,
      y: 40,
      length: 4,
      width: 3.2,
      height,
      selected: true,
    }
    return [
      living,
      bed1,
      {
        id: 'bed2',
        name: '卧室2',
        x: bed1.x,
        y: 40 + bed1.width * PX_PER_M + gap,
        length: 4,
        width: 3,
        height,
        selected: true,
      },
    ]
  }

  // 3b1l
  const bed1: Room = {
    id: 'bed1',
    name: '卧室1',
    x: 40 + living.length * PX_PER_M + gap,
    y: 40,
    length: 3.8,
    width: 3,
    height,
    selected: true,
  }
  const bed2: Room = {
    id: 'bed2',
    name: '卧室2',
    x: bed1.x,
    y: 40 + bed1.width * PX_PER_M + gap,
    length: 3.8,
    width: 3,
    height,
    selected: true,
  }
  return [
    living,
    bed1,
    bed2,
    {
      id: 'bed3',
      name: '卧室3',
      x: 40,
      y: 40 + living.width * PX_PER_M + gap,
      length: 3.5,
      width: 3,
      height,
      selected: true,
    },
  ]
}
