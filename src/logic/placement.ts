import type { DevicePlacement, Marker, Room } from '../types'

/** Pixels per metre on the canvas */
export const PX_PER_M = 40

/** Living-room origin: enough empty space on all sides to add rooms. */
export const LAYOUT_ORIGIN_X = 260
export const LAYOUT_ORIGIN_Y = 190
export const CANVAS_MIN_W = 760
export const CANVAS_MIN_H = 560

export function roomArea(room: Room): number {
  return room.length * room.width
}

export function aspectRatio(room: Room): number {
  const a = Math.max(room.length, room.width)
  const b = Math.min(room.length, room.width)
  return b > 0 ? a / b : 1
}

/** 二级：中心到最远角距离 d = √((L/2)² + (W/2)²) */
export function cornerDistance(room: Room): number {
  const L = Math.max(room.length, room.width)
  const W = Math.min(room.length, room.width)
  return Math.hypot(L / 2, W / 2)
}

/** 产品：3 m 内最佳收音，5 m 最远（示意圆用最佳半径，全屋统一）。 */
export const COVER_BEST_M = 3
export const COVER_MAX_M = 5

const WALL_CLEAR = 1
const HOTSPOT_PAIR_M = 4
/** 双点目标间距：按 3 m 最佳圈控制重叠（间距约 4.5～5.5，重叠约 0.5～1.5 m） */
const DUAL_SPACING_MIN = 4.5
const DUAL_SPACING_MAX = 5.5
/** 长轴可布置净长不足时，不强行多点（避免小房重叠致回声） */
const DUAL_FEASIBLE_MIN = 3.5
const TRIPLE_FEASIBLE_MIN = 7
const HOTSPOT_PULL_MIN = 0.5
const HOTSPOT_PULL_MAX = 1

function roomMarkers(room: Room, markers: Marker[]): Marker[] {
  return markers.filter((m) => m.roomId === room.id)
}

function markerLocal(room: Room, m: Marker) {
  return { x: (m.x - room.x) / PX_PER_M, y: (m.y - room.y) / PX_PER_M }
}

/** 长轴去掉两侧墙距后的可布置长度 */
function longAxisUsable(room: Room): number {
  const long = Math.max(room.length, room.width)
  return Math.max(0, long - 2 * WALL_CLEAR)
}

/** 两常坐最远间距（米）；不足两个常坐时为 0 */
function farthestHotspotDist(room: Room, markers: Marker[]): number {
  const ms = roomMarkers(room, markers)
  let best = 0
  for (let i = 0; i < ms.length; i++) {
    const a = markerLocal(room, ms[i])
    for (let j = i + 1; j < ms.length; j++) {
      const b = markerLocal(room, ms[j])
      best = Math.max(best, Math.hypot(a.x - b.x, a.y - b.y))
    }
  }
  return best
}

/**
 * 个数（对齐产品 3 m 最佳 / 5 m 最远）：
 * - d≤3：中心单点已在最佳范围内 → 固定 1（小房不因 R 加机）
 * - 3<d≤5：角在最远内；近方仍 1；狭长 2；极狭长 2（净长够再 3）
 * - d>5：近方三角 3；狭长 2；极狭长 3
 * - 五级：两常坐 >4 m → 至少 2（仍受净长门闩约束）
 * - 长轴净长不够双/三点所需间距 → 降级，避免过密重叠
 */
export function deviceCountForRoom(room: Room, markers: Marker[] = []): number {
  const d = cornerDistance(room)
  const R = aspectRatio(room)
  const usable = longAxisUsable(room)

  let count: number
  if (d <= COVER_BEST_M) {
    count = 1
  } else if (d <= COVER_MAX_M) {
    if (R <= 1.5) count = 1
    else if (R <= 2.5) count = 2
    else count = usable >= TRIPLE_FEASIBLE_MIN ? 3 : 2
  } else if (R <= 1.5) {
    count = 3
  } else if (R <= 2.5) {
    count = 2
  } else {
    count = 3
  }

  if (farthestHotspotDist(room, markers) > HOTSPOT_PAIR_M) {
    count = Math.max(count, 2)
  }

  // 仅「长轴多点」受净长约束；近方三角不靠长轴拉开，不能用同一门闩降级
  const longAxisMulti = R > 1.5
  if (longAxisMulti && count >= 3 && usable < TRIPLE_FEASIBLE_MIN) count = 2
  if (count >= 2 && usable < DUAL_FEASIBLE_MIN) count = 1

  return count
}

/** @deprecated 兼容旧调用；请用 deviceCountForRoom */
export function deviceCountForArea(area: number, R = 1): number {
  const side = Math.sqrt(Math.max(area, 1))
  const fake: Room = {
    id: '_',
    name: '',
    x: 0,
    y: 0,
    length: side * Math.sqrt(R),
    width: side / Math.sqrt(R),
    height: 2.8,
    selected: true,
  }
  return deviceCountForRoom(fake, [])
}

function clampToWall(v: number, span: number) {
  if (span <= 2 * WALL_CLEAR) return span / 2
  return clamp(v, WALL_CLEAR, span - WALL_CLEAR)
}

/** 双点：沿长轴均分，间距尽量落在 4.5～5.5 m（匹配 3 m 最佳圈，减少回声重叠） */
function dualAlongLongAxis(room: Room): { x: number; y: number }[] {
  const L = room.length
  const W = room.width
  const longIsX = L >= W
  const long = longIsX ? L : W
  const midLong = long / 2
  const midShort = (longIsX ? W : L) / 2
  const maxSpan = Math.max(0.2, long - 2 * WALL_CLEAR)
  let spacing: number
  if (maxSpan < DUAL_SPACING_MIN) spacing = maxSpan
  else spacing = Math.min(DUAL_SPACING_MAX, Math.max(DUAL_SPACING_MIN, Math.min(5, maxSpan)))

  const a = midLong - spacing / 2
  const b = midLong + spacing / 2
  if (longIsX) {
    return [
      { x: clampToWall(a, L), y: midShort },
      { x: clampToWall(b, L), y: midShort },
    ]
  }
  return [
    { x: midShort, y: clampToWall(a, W) },
    { x: midShort, y: clampToWall(b, W) },
  ]
}

/** 三点：沿长轴均匀排布 */
function tripleAlongLongAxis(room: Room): { x: number; y: number }[] {
  const L = room.length
  const W = room.width
  const longIsX = L >= W
  const long = longIsX ? L : W
  const midShort = (longIsX ? W : L) / 2
  const span = Math.max(0.2, long - 2 * WALL_CLEAR)
  const xs = [0, 0.5, 1].map((t) => WALL_CLEAR + span * t)
  if (longIsX) return xs.map((x) => ({ x, y: midShort }))
  return xs.map((y) => ({ x: midShort, y }))
}

/** 近方大空间：三角布置 */
function trianglePoints(room: Room): { x: number; y: number }[] {
  const L = room.length
  const W = room.width
  const longIsX = L >= W
  if (longIsX) {
    return [
      { x: clampToWall(L * 0.28, L), y: clampToWall(W * 0.5, W) },
      { x: clampToWall(L * 0.72, L), y: clampToWall(W * 0.5, W) },
      { x: clampToWall(L * 0.5, L), y: clampToWall(W * 0.32, W) },
    ]
  }
  return [
    { x: clampToWall(L * 0.5, L), y: clampToWall(W * 0.28, W) },
    { x: clampToWall(L * 0.5, L), y: clampToWall(W * 0.72, W) },
    { x: clampToWall(L * 0.32, L), y: clampToWall(W * 0.5, W) },
  ]
}

/**
 * 六级布置。
 * 单点中心；双点长轴；三点在近方大空间用三角，否则长轴三点。
 */
function basePoints(room: Room, count: number): { x: number; y: number }[] {
  const R = aspectRatio(room)
  const d = cornerDistance(room)
  const cx = room.length / 2
  const cy = room.width / 2

  if (count <= 1) return [{ x: cx, y: cy }]
  if (count === 2) return dualAlongLongAxis(room)
  if (R <= 1.5 && d > 5) return trianglePoints(room)
  return tripleAlongLongAxis(room)
}

/** 五级：两常坐过远时，双点分别靠近这两处（贴墙 ≥1 m） */
function dualNearFarthestHotspots(
  room: Room,
  markers: Marker[],
): { x: number; y: number }[] | null {
  const pair = farthestHotspotPair(room, markers)
  if (!pair) return null
  return [
    { x: clampToWall(pair.a.x, room.length), y: clampToWall(pair.a.y, room.width) },
    { x: clampToWall(pair.b.x, room.length), y: clampToWall(pair.b.y, room.width) },
  ]
}

/** 三点且存在远距常坐对：两点罩热点，第三点放中心（三角/长轴的折中） */
function tripleWithHotspotPair(
  room: Room,
  markers: Marker[],
): { x: number; y: number }[] | null {
  const pair = farthestHotspotPair(room, markers)
  if (!pair) return null
  return [
    { x: clampToWall(pair.a.x, room.length), y: clampToWall(pair.a.y, room.width) },
    { x: clampToWall(pair.b.x, room.length), y: clampToWall(pair.b.y, room.width) },
    { x: room.length / 2, y: room.width / 2 },
  ]
}

function farthestHotspotPair(
  room: Room,
  markers: Marker[],
): { a: { x: number; y: number }; b: { x: number; y: number }; dist: number } | null {
  const ms = roomMarkers(room, markers)
  if (ms.length < 2) return null
  let bestI = 0
  let bestJ = 1
  let best = 0
  for (let i = 0; i < ms.length; i++) {
    const a = markerLocal(room, ms[i])
    for (let j = i + 1; j < ms.length; j++) {
      const b = markerLocal(room, ms[j])
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (dist > best) {
        best = dist
        bestI = i
        bestJ = j
      }
    }
  }
  if (best <= HOTSPOT_PAIR_M) return null
  return {
    a: markerLocal(room, ms[bestI]),
    b: markerLocal(room, ms[bestJ]),
    dist: best,
  }
}

/**
 * 四级：仅单点时，从几何中心向交流热点偏移 0.5～1 m，距墙 ≥1 m。
 * 多点布置保持六级几何，避免全部被拉向同一热点。
 */
function offsetTowardMarkers(
  px: number,
  py: number,
  room: Room,
  markers: Marker[],
): { x: number; y: number; offsetDesc: string } {
  const ms = roomMarkers(room, markers)
  if (ms.length === 0) {
    return { x: px, y: py, offsetDesc: '居中布置' }
  }

  let nearest = ms[0]
  let bestDist = Infinity
  for (const m of ms) {
    const loc = markerLocal(room, m)
    const dist = Math.hypot(loc.x - px, loc.y - py)
    if (dist < bestDist) {
      bestDist = dist
      nearest = m
    }
  }

  const loc = markerLocal(room, nearest)
  const dx = loc.x - px
  const dy = loc.y - py
  const dist = Math.hypot(dx, dy) || 1
  const pull =
    dist <= HOTSPOT_PULL_MIN
      ? dist
      : Math.min(HOTSPOT_PULL_MAX, Math.max(HOTSPOT_PULL_MIN, Math.min(dist, HOTSPOT_PULL_MAX)))

  const nx = clampToWall(px + (dx / dist) * pull, room.length)
  const ny = clampToWall(py + (dy / dist) * pull, room.width)
  const moved = Math.hypot(nx - px, ny - py)

  return {
    x: nx,
    y: ny,
    offsetDesc: `向「${nearest.label || '交流区'}」偏移 ${moved.toFixed(1)} m`,
  }
}

/** 按二级～六级得到房间内点位（米，相对房间左上） */
function resolveRoomBases(
  room: Room,
  markers: Marker[],
): { bases: { x: number; y: number }[]; applyHotspotOffset: boolean } {
  const count = deviceCountForRoom(room, markers)

  if (count === 1) {
    return {
      bases: [{ x: room.length / 2, y: room.width / 2 }],
      applyHotspotOffset: true,
    }
  }

  if (count === 2) {
    const dual = dualNearFarthestHotspots(room, markers)
    if (dual) return { bases: dual, applyHotspotOffset: false }
    return { bases: dualAlongLongAxis(room), applyHotspotOffset: false }
  }

  // count >= 3
  const withHotspots = tripleWithHotspotPair(room, markers)
  if (withHotspots) return { bases: withHotspots, applyHotspotOffset: false }
  return { bases: basePoints(room, count), applyHotspotOffset: false }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function deviceWallRefs(room: Room, canvasX: number, canvasY: number) {
  const lx = (canvasX - room.x) / PX_PER_M
  const ly = (canvasY - room.y) / PX_PER_M
  const w = room.length * PX_PER_M
  const h = room.width * PX_PER_M
  const fromWest = lx
  const fromEast = room.length - lx
  const fromNorth = ly
  const fromSouth = room.width - ly
  const useWest = fromWest <= fromEast
  const useNorth = fromNorth <= fromSouth

  return {
    h: {
      side: useWest ? ('west' as const) : ('east' as const),
      meters: useWest ? fromWest : fromEast,
      x1: useWest ? room.x : room.x + w,
      y1: canvasY,
      x2: canvasX,
      y2: canvasY,
    },
    v: {
      side: useNorth ? ('north' as const) : ('south' as const),
      meters: useNorth ? fromNorth : fromSouth,
      x1: canvasX,
      y1: useNorth ? room.y : room.y + h,
      x2: canvasX,
      y2: canvasY,
    },
  }
}

export function dimGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  vertical: boolean,
) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len < 18) return null
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const gap = 12
  const ex = x2 - ux * gap
  const ey = y2 - uy * gap
  const tx = -uy * 5
  const ty = ux * 5
  const t = 0.7
  const mx = x1 + (ex - x1) * t + (vertical ? -14 : 0)
  const my = y1 + (ey - y1) * t + (vertical ? 0 : -10)
  return { ex, ey, tx, ty, mx, my }
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 6,
) {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w > b.x - gap &&
    a.y < b.y + b.h + gap &&
    a.y + a.h > b.y - gap
  )
}

/** Place the room name in a corner that doesn't sit on wall-distance labels. */
export function roomNameTagPos(room: Room, devices: DevicePlacement[], name: string) {
  const tw = Math.max(36, 14 + name.length * 13)
  const th = 20
  const pad = 6
  const w = room.length * PX_PER_M
  const h = room.width * PX_PER_M
  const obstacles = devices
    .filter((d) => d.roomId === room.id)
    .flatMap((d) => {
      const refs = deviceWallRefs(room, d.x, d.y)
      const boxes: { x: number; y: number; w: number; h: number }[] = []
      for (const [seg, vertical] of [
        [refs.h, false],
        [refs.v, true],
      ] as const) {
        const g = dimGeometry(seg.x1, seg.y1, seg.x2, seg.y2, vertical)
        if (!g) continue
        boxes.push({ x: g.mx - 24, y: g.my - 9, w: 48, h: 18 })
      }
      return boxes
    })

  const cands = [
    { x: room.x + pad, y: room.y + pad },
    { x: room.x + w - pad - tw, y: room.y + pad },
    { x: room.x + pad, y: room.y + h - pad - th },
    { x: room.x + w - pad - tw, y: room.y + h - pad - th },
  ]
  const pick =
    cands.find((c) => !obstacles.some((o) => boxesOverlap({ ...c, w: tw, h: th }, o))) ??
    cands[2]
  return { x: pick.x, y: pick.y, tw, th }
}

export function wallDistances(room: Room, lx: number, ly: number): { h: string; v: string } {
  const refs = deviceWallRefs(room, room.x + lx * PX_PER_M, room.y + ly * PX_PER_M)
  const h = refs.h.side === 'west' ? `距西墙 ${refs.h.meters.toFixed(1)} m` : `距东墙 ${refs.h.meters.toFixed(1)} m`
  const v =
    refs.v.side === 'north'
      ? `距北墙 ${refs.v.meters.toFixed(1)} m`
      : `距南墙 ${refs.v.meters.toFixed(1)} m`
  return { h, v }
}

export function wallDescription(room: Room, lx: number, ly: number): string {
  const { h, v } = wallDistances(room, lx, ly)
  return `${h}，${v}`
}

/** Three install lines shown under each room: two walls + offset/sit note. */
export function deviceInstallLines(
  room: Room,
  canvasX: number,
  canvasY: number,
  markers: Marker[],
  originX: number,
  originY: number,
): { h: string; v: string; note: string } {
  const lx = (canvasX - room.x) / PX_PER_M
  const ly = (canvasY - room.y) / PX_PER_M
  const { h, v } = wallDistances(room, lx, ly)

  const adjM = Math.hypot(canvasX - originX, canvasY - originY) / PX_PER_M
  const roomMarkers = markers.filter((m) => m.roomId === room.id)

  let note: string
  if (adjM > 0.05) {
    note = `相对推荐点调整 ${adjM.toFixed(2)} m`
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
      note += ` · 距「${nearestLabel}」${(best / PX_PER_M).toFixed(1)} m`
    }
  } else if (roomMarkers.length === 0) {
    note = '居中布置'
  } else {
    // 必须从几何中心算偏移文案。若传入已偏移后的 (lx,ly)，
    // offsetTowardMarkers 会再拉一次，常显示成误导的 0.1 m。
    const fromCenter = offsetTowardMarkers(room.length / 2, room.width / 2, room, markers)
    note = fromCenter.offsetDesc
  }

  return { h, v, note }
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
  const { h, v, note } = deviceInstallLines(room, canvasX, canvasY, markers, originX, originY)
  return `${room.name} · ${h}，${v} · ${note}`
}

export function coverageRadiusForArea(area: number): number {
  return Math.min(5, Math.max(2.5, Math.sqrt(area) * 0.45))
}

/**
 * 示意覆盖半径 = 产品最佳收音 3 m，全屋每机同一尺寸（与房间大小无关）。
 * 最远 5 m 不画进示意，避免与「最佳」混淆；个数规则仍用 5 m 作加机门槛。
 */
export function coverageRadiusForRoom(_room?: Room, _deviceCount?: number): number {
  return COVER_BEST_M
}

export function computePlacements(rooms: Room[], markers: Marker[]): DevicePlacement[] {
  const devices: DevicePlacement[] = []
  const covered = rooms.filter((r) => r.selected)

  for (const room of covered) {
    const { bases, applyHotspotOffset } = resolveRoomBases(room, markers)
    const radius = coverageRadiusForRoom(room, bases.length)

    bases.forEach((base, i) => {
      const placed = applyHotspotOffset
        ? offsetTowardMarkers(base.x, base.y, room, markers)
        : { x: base.x, y: base.y }
      const cx = room.x + placed.x * PX_PER_M
      const cy = room.y + placed.y * PX_PER_M
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
  if (count === 2) return R <= 1.5 ? '双点布置' : '长轴双点'
  if (R <= 1.5) return '三角形布置'
  return '长轴三点'
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

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_ROOM_M = 1.5

function roundMetres(v: number) {
  return Math.max(MIN_ROOM_M, Math.round(v * 10) / 10)
}

function snapToEdges(value: number, edges: number[], threshold: number) {
  let best = value
  let bestDist = threshold + 1
  for (const edge of edges) {
    const d = Math.abs(value - edge)
    if (d <= threshold && d < bestDist) {
      bestDist = d
      best = edge
    }
  }
  return best
}

/**
 * Resize a room from an edge/corner handle, with edge snap to neighboring rooms.
 * length = horizontal (m), width = vertical (m).
 */
export function magneticResizeRoom(
  room: Room,
  handle: ResizeHandle,
  pointerX: number,
  pointerY: number,
  others: Room[],
  threshold = 16,
): Pick<Room, 'x' | 'y' | 'length' | 'width'> {
  let left = room.x
  let top = room.y
  let right = room.x + room.length * PX_PER_M
  let bottom = room.y + room.width * PX_PER_M

  const moveL = handle.includes('w')
  const moveR = handle.includes('e')
  const moveT = handle.includes('n')
  const moveB = handle.includes('s')

  if (moveL) left = pointerX
  if (moveR) right = pointerX
  if (moveT) top = pointerY
  if (moveB) bottom = pointerY

  const edgesX: number[] = []
  const edgesY: number[] = []
  for (const o of others) {
    if (o.id === room.id) continue
    edgesX.push(o.x, o.x + o.length * PX_PER_M)
    edgesY.push(o.y, o.y + o.width * PX_PER_M)
  }

  if (moveL) left = snapToEdges(left, edgesX, threshold)
  if (moveR) right = snapToEdges(right, edgesX, threshold)
  if (moveT) top = snapToEdges(top, edgesY, threshold)
  if (moveB) bottom = snapToEdges(bottom, edgesY, threshold)

  const minPx = MIN_ROOM_M * PX_PER_M
  if (right - left < minPx) {
    if (moveL && !moveR) left = right - minPx
    else right = left + minPx
  }
  if (bottom - top < minPx) {
    if (moveT && !moveB) top = bottom - minPx
    else bottom = top + minPx
  }

  left = Math.max(0, left)
  top = Math.max(0, top)

  const length = roundMetres((right - left) / PX_PER_M)
  const width = roundMetres((bottom - top) / PX_PER_M)

  // Keep the unmoved edges stable after metre rounding
  const x = moveL && !moveR ? right - length * PX_PER_M : left
  const y = moveT && !moveB ? bottom - width * PX_PER_M : top

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    length,
    width,
  }
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

export function nextRoomPosition(
  rooms: Room[],
  length: number,
  width: number,
): { x: number; y: number } {
  if (rooms.length === 0) {
    return { x: LAYOUT_ORIGIN_X, y: LAYOUT_ORIGIN_Y }
  }

  const gap = 12
  const mw = length * PX_PER_M
  const mh = width * PX_PER_M
  const anchor = rooms.find((r) => r.name.includes('客厅')) ?? rooms[0]
  const ax = anchor.x
  const ay = anchor.y
  const aw = anchor.length * PX_PER_M
  const ah = anchor.width * PX_PER_M

  const candidates = [
    { x: ax + aw + gap, y: ay },
    { x: ax, y: ay + ah + gap },
    { x: ax - mw - gap, y: ay },
    { x: ax, y: ay - mh - gap },
    { x: ax + aw + gap, y: ay + ah + gap },
    { x: ax - mw - gap, y: ay + ah + gap },
    { x: ax + aw + gap, y: ay - mh - gap },
    { x: ax - mw - gap, y: ay - mh - gap },
  ]

  const overlaps = (x: number, y: number) =>
    rooms.some((r) => {
      const rw = r.length * PX_PER_M
      const rh = r.width * PX_PER_M
      return x < r.x + rw && x + mw > r.x && y < r.y + rh && y + mh > r.y
    })

  for (const c of candidates) {
    const x = Math.max(0, c.x)
    const y = Math.max(0, c.y)
    if (!overlaps(x, y)) return { x, y }
  }

  const maxRight = Math.max(...rooms.map((r) => r.x + r.length * PX_PER_M))
  return { x: maxRight + gap, y: ay }
}

export function createPresetRooms(type: '1b1l' | '2b1l' | '3b1l', height: number): Room[] {
  /** Separate blocks — not fused into one silhouette */
  const gap = 12
  const ox = LAYOUT_ORIGIN_X
  const oy = LAYOUT_ORIGIN_Y
  const living: Room = {
    id: 'living',
    name: '客厅',
    x: ox,
    y: oy,
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
        x: ox + living.length * PX_PER_M + gap,
        y: oy,
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
      x: ox + living.length * PX_PER_M + gap,
      y: oy,
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
        y: oy + bed1.width * PX_PER_M + gap,
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
    x: ox + living.length * PX_PER_M + gap,
    y: oy,
    length: 3.8,
    width: 3,
    height,
    selected: true,
  }
  const bed2: Room = {
    id: 'bed2',
    name: '卧室2',
    x: bed1.x,
    y: oy + bed1.width * PX_PER_M + gap,
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
      x: ox,
      y: oy + living.width * PX_PER_M + gap,
      length: 3.5,
      width: 3,
      height,
      selected: true,
    },
  ]
}
