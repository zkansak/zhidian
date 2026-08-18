import {
  aspectRatio,
  deviceCountForArea,
  layoutLabel,
  placementHint,
  roomArea,
} from './placement'
import type { DevicePlacement, Marker, Room } from '../types'

const INK = '#132029'
const INK_SOFT = '#5c6d7a'
const ACCENT = '#0c7c72'
const ACCENT_SOFT = 'rgba(12, 124, 114, 0.12)'
const ACCENT_LINE = 'rgba(12, 124, 114, 0.28)'
const LINE = 'rgba(19, 32, 41, 0.1)'
const FONT = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const next = line + ch
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = ch
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

export async function downloadSchemePng(
  rooms: Room[],
  markers: Marker[],
  devices: DevicePlacement[],
): Promise<void> {
  await document.fonts.ready

  const scale = 2
  const width = 440
  const pad = 28
  const inner = width - pad * 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  type Piece =
    | { t: 'title'; y: number }
    | { t: 'sub'; y: number }
    | { t: 'h3'; y: number; text: string }
    | { t: 'p'; y: number; text: string }
    | { t: 'hint'; y: number; text: string }
    | { t: 'rule'; y: number }
    | { t: 'box'; y: number; h: number; lines: string[] }

  const pieces: Piece[] = []
  let y = pad + 8

  pieces.push({ t: 'title', y })
  y += 28
  pieces.push({ t: 'sub', y })
  y += 36

  for (const r of rooms.filter((room) => room.selected)) {
    const area = roomArea(r)
    const R = aspectRatio(r)
    const count = devices.filter((d) => d.roomId === r.id).length
    pieces.push({ t: 'h3', y, text: r.name })
    y += 24
    pieces.push({ t: 'p', y, text: `面积 ${area.toFixed(1)} m² → 建议 ${count} 个` })
    y += 20
    pieces.push({
      t: 'p',
      y,
      text: `长宽比 ${R.toFixed(2)} → ${layoutLabel(R, deviceCountForArea(area, R))}`,
    })
    y += 20
    pieces.push({ t: 'hint', y, text: placementHint(r, markers) })
    y += 18
    pieces.push({ t: 'rule', y })
    y += 18
  }

  if (devices.length > 0) {
    ctx.font = `400 13px ${FONT}`
    const descLines = devices.flatMap((d, i) => {
      const room = rooms.find((r) => r.id === d.roomId)
      const text = `${room?.name ?? '房间'}：${d.description}`
      const wrapped = wrapText(ctx, text, inner - 24)
      return i === 0 ? wrapped : ['', ...wrapped]
    })
    const boxH = 16 + descLines.length * 22 + 12
    pieces.push({ t: 'box', y, h: boxH, lines: descLines })
    y += boxH
  }

  const height = y + pad
  canvas.width = width * scale
  canvas.height = height * scale
  ctx.scale(scale, scale)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

  for (const p of pieces) {
    if (p.t === 'title') {
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(pad + 5, p.y + 8, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.font = `600 18px ${FONT}`
      ctx.fillText('置点 · 安装方案', pad + 18, p.y + 14)
    } else if (p.t === 'sub') {
      ctx.fillStyle = INK_SOFT
      ctx.font = `400 12px ${FONT}`
      ctx.fillText('已按现场条件调整，可对照安装', pad, p.y + 10)
    } else if (p.t === 'h3') {
      ctx.fillStyle = INK
      ctx.font = `600 15px ${FONT}`
      ctx.fillText(p.text, pad, p.y + 12)
    } else if (p.t === 'p') {
      ctx.fillStyle = INK_SOFT
      ctx.font = `400 13px ${FONT}`
      ctx.fillText(p.text, pad, p.y + 10)
    } else if (p.t === 'hint') {
      ctx.fillStyle = ACCENT
      ctx.font = `400 12px ${FONT}`
      ctx.fillText(p.text, pad, p.y + 10)
    } else if (p.t === 'rule') {
      ctx.strokeStyle = LINE
      ctx.beginPath()
      ctx.moveTo(pad, p.y)
      ctx.lineTo(width - pad, p.y)
      ctx.stroke()
    } else if (p.t === 'box') {
      ctx.fillStyle = ACCENT_SOFT
      ctx.strokeStyle = ACCENT_LINE
      ctx.lineWidth = 1
      const x = pad
      const w = inner
      ctx.beginPath()
      ctx.roundRect(x, p.y, w, p.h, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.font = `400 13px ${FONT}`
      let ly = p.y + 28
      for (const line of p.lines) {
        if (line) ctx.fillText(line, x + 12, ly)
        ly += 22
      }
    }
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
