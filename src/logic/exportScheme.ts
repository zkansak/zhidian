import {
  PX_PER_M,
  deviceInstallLines,
  deviceWallRefs,
  roomNameTagPos,
} from './placement'
import type { DevicePlacement, Marker, Room } from '../types'

const INK = '#132029'
const INK_SOFT = '#5c6d7a'
const ACCENT = '#0c7c72'
const ACCENT_DEEP = '#085c55'
const STROKE = '#1c2a33'
const MARKER = '#c45e38'
const LINE = 'rgba(19, 32, 41, 0.1)'
const FONT = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function drawDim(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  vertical: boolean,
  layer: 'line' | 'label',
) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len < 18) return
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const gap = 12
  const ex = x2 - ux * gap
  const ey = y2 - uy * gap
  const tx = -uy * 5
  const ty = ux * 5

  if (layer === 'line') {
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.25
    ctx.lineCap = 'square'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(ex, ey)
    ctx.moveTo(x1 - tx, y1 - ty)
    ctx.lineTo(x1 + tx, y1 + ty)
    ctx.moveTo(ex - tx, ey - ty)
    ctx.lineTo(ex + tx, ey + ty)
    ctx.stroke()
    return
  }

  const mx = (x1 + ex) / 2 + (vertical ? -14 : 0)
  const my = (y1 + ey) / 2 + (vertical ? 0 : -10)
  ctx.font = `600 12px ${FONT}`
  const tw = ctx.measureText(label).width + 10
  const th = 16
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.strokeStyle = 'rgba(12, 124, 114, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(mx - tw / 2, my - th / 2, tw, th, 3)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = ACCENT_DEEP
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, mx, my)
}

function orderedDevices(rooms: Room[], devices: DevicePlacement[]): DevicePlacement[] {
  const out: DevicePlacement[] = []
  for (const r of rooms) {
    for (const d of devices) {
      if (d.roomId === r.id) out.push(d)
    }
  }
  for (const d of devices) {
    if (!out.includes(d)) out.push(d)
  }
  return out
}

export async function downloadSchemePng(
  rooms: Room[],
  markers: Marker[],
  devices: DevicePlacement[],
): Promise<void> {
  await document.fonts.ready
  if (rooms.length === 0) return

  const scale = 2
  const margin = 40
  const header = 52
  const notePad = 22
  const noteLineH = 22
  const noteTitleH = 28
  const listed = orderedDevices(rooms, devices)
  const footerH =
    listed.length > 0 ? notePad * 2 + noteTitleH + listed.length * noteLineH : 0

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const r of rooms) {
    const w = r.length * PX_PER_M
    const h = r.width * PX_PER_M
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + w)
    maxY = Math.max(maxY, r.y + h)
  }

  const contentW = Math.max(320, maxX - minX)
  const contentH = Math.max(220, maxY - minY)
  const width = contentW + margin * 2
  const planBottom = header + margin + contentH + margin
  const height = planBottom + footerH

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)

  ctx.fillStyle = '#eef4f6'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, header)
  ctx.fillStyle = ACCENT
  ctx.beginPath()
  ctx.arc(22, header / 2, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = INK
  ctx.font = `600 16px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('置点 · 安装方案', 34, header / 2)
  ctx.fillStyle = INK_SOFT
  ctx.font = `400 12px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('图上为墙距；下方注释对照标号', width - 18, header / 2)

  ctx.save()
  ctx.translate(margin - minX, header + margin - minY)

  for (const r of rooms) {
    const w = r.length * PX_PER_M
    const h = r.width * PX_PER_M
    ctx.fillStyle = r.selected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'
    ctx.strokeStyle = STROKE
    ctx.lineWidth = 1.6
    ctx.fillRect(r.x, r.y, w, h)
    ctx.strokeRect(r.x, r.y, w, h)
  }

  for (const m of markers) {
    ctx.fillStyle = MARKER
    ctx.beginPath()
    ctx.roundRect(m.x - 8, m.y - 5.5, 16, 11, 2.5)
    ctx.fill()
  }

  for (const d of listed) {
    const room = rooms.find((r) => r.id === d.roomId)
    if (!room) continue
    const refs = deviceWallRefs(room, d.x, d.y)
    drawDim(ctx, refs.h.x1, refs.h.y1, refs.h.x2, refs.h.y2, `${refs.h.meters.toFixed(1)} m`, false, 'line')
    drawDim(ctx, refs.v.x1, refs.v.y1, refs.v.x2, refs.v.y2, `${refs.v.meters.toFixed(1)} m`, true, 'line')
  }

  listed.forEach((d, i) => {
    const n = i + 1
    ctx.beginPath()
    ctx.arc(d.x, d.y, 10, 0, Math.PI * 2)
    ctx.fillStyle = ACCENT
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${n > 9 ? 10 : 11}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), d.x, d.y + 0.5)
  })

  for (const d of listed) {
    const room = rooms.find((r) => r.id === d.roomId)
    if (!room) continue
    const refs = deviceWallRefs(room, d.x, d.y)
    drawDim(ctx, refs.h.x1, refs.h.y1, refs.h.x2, refs.h.y2, `${refs.h.meters.toFixed(1)} m`, false, 'label')
    drawDim(ctx, refs.v.x1, refs.v.y1, refs.v.x2, refs.v.y2, `${refs.v.meters.toFixed(1)} m`, true, 'label')
  }

  for (const r of rooms) {
    const name = r.name || '未命名'
    const tag = roomNameTagPos(r, devices, name)
    ctx.font = `600 13px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.strokeStyle = 'rgba(19, 32, 41, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(tag.x, tag.y, tag.tw, tag.th, 4)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, tag.x + 7, tag.y + tag.th / 2)
  }

  ctx.restore()

  if (listed.length > 0) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, planBottom, width, footerH)
    ctx.strokeStyle = LINE
    ctx.beginPath()
    ctx.moveTo(0, planBottom)
    ctx.lineTo(width, planBottom)
    ctx.stroke()

    let y = planBottom + notePad + 8
    ctx.fillStyle = INK
    ctx.font = `600 13px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('安装注释', margin, y)
    y += noteTitleH

    listed.forEach((d, i) => {
      const n = i + 1
      const room = rooms.find((r) => r.id === d.roomId)
      const name = room?.name ?? '房间'
      const lines = room
        ? deviceInstallLines(room, d.x, d.y, markers, d.originX, d.originY)
        : { h: '', v: '', note: '' }

      ctx.beginPath()
      ctx.arc(margin + 9, y, 9, 0, Math.PI * 2)
      ctx.fillStyle = ACCENT
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `600 ${n > 9 ? 9 : 11}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(n), margin + 9, y + 0.5)

      ctx.fillStyle = INK
      ctx.font = `400 13px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(`${name} · ${lines.h}，${lines.v}`, margin + 24, y)
      y += noteLineH
    })
  }

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve()
        return
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `置点方案-${stamp()}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1500)
      resolve()
    }, 'image/png')
  })
}
