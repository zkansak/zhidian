import { useEffect, useId, useRef, useState } from 'react'
import { FloorPlan } from './components/FloorPlan'
import { StepNav } from './components/StepNav'
import {
  aspectRatio,
  computePlacements,
  createPresetRooms,
  describeDevicePosition,
  deviceCountForArea,
  fitRoomsTogether,
  layoutLabel,
  placementHint,
  roomArea,
  PX_PER_M,
} from './logic/placement'
import type { DevicePlacement, Marker, Room, UnitType } from './types'
import { UNIT_OPTIONS } from './types'
import './App.css'

let seq = 0
const uid = (p: string) => `${p}-${++seq}-${Date.now().toString(36)}`

const ROOM_TEMPLATES = [
  { name: '客厅', length: 6, width: 4.5 },
  { name: '卧室', length: 4, width: 3.5 },
  { name: '餐厅', length: 3.5, width: 3 },
  { name: '厨房', length: 3, width: 2.5 },
  { name: '卫生间', length: 2.2, width: 2 },
] as const

function sizePresetsFor(room: Room) {
  const name = room.name
  if (name.includes('卫生')) {
    return [
      { label: '2.2 × 2', length: 2.2, width: 2 },
      { label: '2.5 × 2', length: 2.5, width: 2 },
      { label: '2.8 × 2.2', length: 2.8, width: 2.2 },
    ]
  }
  if (name.includes('厨房')) {
    return [
      { label: '3 × 2.5', length: 3, width: 2.5 },
      { label: '3.5 × 2.8', length: 3.5, width: 2.8 },
    ]
  }
  if (name.includes('卧室')) {
    return [
      { label: '3.5 × 3', length: 3.5, width: 3 },
      { label: '4 × 3', length: 4, width: 3 },
      { label: '4 × 3.5', length: 4, width: 3.5 },
    ]
  }
  return [
    { label: '5 × 4', length: 5, width: 4 },
    { label: '6 × 4.5', length: 6, width: 4.5 },
    { label: '7 × 5', length: 7, width: 5 },
  ]
}

const UNIT_BLURB: Record<Exclude<UnitType, 'custom'>, string> = {
  '1b1l': '客厅、卧室',
  '2b1l': '客厅、两间卧室',
  '3b1l': '客厅、三间卧室',
}

function unitLabel(type: UnitType | null, customName: string) {
  if (type === 'custom') return customName.trim() || '自定义'
  return UNIT_OPTIONS.find((o) => o.value === type)?.label ?? ''
}

function defaultMarkerLabel(roomName: string) {
  if (roomName.includes('客厅')) return '沙发'
  if (roomName.includes('餐厅')) return '餐桌'
  return '常坐处'
}

export default function App() {
  const formId = useId()
  const [step, setStep] = useState(1)
  const [unitType, setUnitType] = useState<UnitType | null>(null)
  const [customName, setCustomName] = useState('')
  const [ceilingHeight, setCeilingHeight] = useState(2.8)
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [markerPast, setMarkerPast] = useState<Marker[][]>([])
  const [markerFuture, setMarkerFuture] = useState<Marker[][]>([])
  const markersRef = useRef(markers)
  markersRef.current = markers
  const markerDragOrigin = useRef<Marker[] | null>(null)
  const [devices, setDevices] = useState<DevicePlacement[]>([])
  const [confirmed, setConfirmed] = useState(false)

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null

  function resetMarkerHistory() {
    setMarkerPast([])
    setMarkerFuture([])
    markerDragOrigin.current = null
  }

  function commitMarkers(next: Marker[] | ((prev: Marker[]) => Marker[])) {
    setMarkers((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      setMarkerPast((p) => [...p, prev])
      setMarkerFuture([])
      return resolved
    })
  }

  function undoMarker() {
    setMarkerPast((past) => {
      if (past.length === 0) return past
      const previous = past[past.length - 1]
      setMarkers((current) => {
        setMarkerFuture((f) => [current, ...f])
        return previous
      })
      return past.slice(0, -1)
    })
  }

  function redoMarker() {
    setMarkerFuture((future) => {
      if (future.length === 0) return future
      const next = future[0]
      setMarkers((current) => {
        setMarkerPast((p) => [...p, current])
        return next
      })
      return future.slice(1)
    })
  }

  useEffect(() => {
    if (step !== 2) return
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoMarker()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redoMarker()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function initFromUnit(type: UnitType) {
    setUnitType(type)
    if (type === 'custom') {
      setRooms([])
      setActiveRoomId(null)
    } else {
      const preset = fitRoomsTogether(createPresetRooms(type, ceilingHeight))
      setRooms(preset)
      setActiveRoomId(preset[0]?.id ?? null)
    }
    setMarkers([])
    resetMarkerHistory()
    setDevices([])
    setConfirmed(false)
  }

  function resetUnit() {
    setUnitType(null)
    setCustomName('')
    setRooms([])
    setActiveRoomId(null)
    setMarkers([])
    resetMarkerHistory()
    setDevices([])
    setConfirmed(false)
  }

  function addRoom(template?: { name: string; length: number; width: number }) {
    const t = template ?? { name: `房间${rooms.length + 1}`, length: 4, width: 3.5 }
    const sameNameCount = rooms.filter((r) => r.name.startsWith(t.name)).length
    const name = sameNameCount === 0 ? t.name : `${t.name}${sameNameCount + 1}`
    const col = rooms.length % 3
    const row = Math.floor(rooms.length / 3)
    const r: Room = {
      id: uid('room'),
      name,
      x: 40 + col * (t.length * PX_PER_M + 28),
      y: 40 + row * (t.width * PX_PER_M + 28),
      length: t.length,
      width: t.width,
      height: ceilingHeight,
      selected: true,
    }
    setRooms((prev) => [...prev, r])
    setActiveRoomId(r.id)
  }

  function removeActiveRoom() {
    if (!activeRoomId) return
    setRooms((prev) => prev.filter((r) => r.id !== activeRoomId))
    setActiveRoomId(null)
  }

  function updateActiveRoom(patch: Partial<Room>) {
    if (!activeRoomId) return
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== activeRoomId) return r
        return { ...r, ...patch }
      }),
    )
  }

  function applyCeilingToAll(h: number) {
    setCeilingHeight(h)
    setRooms((prev) => prev.map((r) => ({ ...r, height: h })))
  }

  function enterStep(n: number) {
    if (n === 2 && rooms.length > 0) {
      setRooms((prev) => fitRoomsTogether(prev))
    }
    if (n === 3) {
      setDevices(computePlacements(rooms, markers))
      setConfirmed(false)
    }
    setStep(n)
  }

  function goNext() {
    if (step === 1) {
      if (!unitType || rooms.length === 0) return
      enterStep(2)
      return
    }
    if (step === 2) {
      enterStep(3)
    }
  }

  function goPrev() {
    if (step > 1) setStep(step - 1)
  }

  function regenerate() {
    setDevices(computePlacements(rooms, markers))
  }

  const canNext =
    step === 1
      ? !!unitType &&
        rooms.length > 0 &&
        rooms.every((r) => r.name && r.length > 0 && r.width > 0) &&
        rooms.some((r) => r.selected)
      : true

  return (
    <div className="app">
      <div className="bg-wash" aria-hidden />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="brand-name">置点</p>
            <p className="brand-sub">找出收声端该装在哪</p>
          </div>
        </div>
        <StepNav step={step} onJump={(n) => n <= step && enterStep(n)} />
      </header>

      <main className="app-main">
        <section className="panel panel-primary" key={`${step}-${unitType ?? 'pick'}`}>
          {step === 1 && !unitType && (
            <>
              <h1>你家是几室几厅？</h1>
              <p className="lead">选一个最接近的，进去后可以改大小、加减房间。</p>
              <div className="unit-grid" role="radiogroup" aria-label="户型">
                {UNIT_OPTIONS.filter((opt) => opt.value !== 'custom').map((opt) => (
                  <label
                    key={opt.value}
                    className={`unit-card${unitType === opt.value ? ' is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`${formId}-unit`}
                      value={opt.value}
                      checked={unitType === opt.value}
                      onChange={() => initFromUnit(opt.value)}
                    />
                    <span className="unit-title">{opt.label}</span>
                    <span className="unit-meta">
                      {opt.value === 'custom' ? '下一步自行添加房间' : UNIT_BLURB[opt.value]}
                    </span>
                  </label>
                ))}
              </div>
              <button type="button" className="custom-link" onClick={() => initFromUnit('custom')}>
                没有合适的？自己加房间
              </button>
            </>
          )}

          {step === 1 && unitType && (
            <>
              <h1>画出你家</h1>
              <p className="lead">点房间改大小。不装的房间点「要装」关掉。</p>
              <div className="unit-bar">
                <span>
                  当前：<strong>{unitLabel(unitType, customName)}</strong>
                </span>
                <button type="button" className="btn ghost compact" onClick={resetUnit}>
                  重选户型
                </button>
              </div>
              {rooms.length === 0 ? (
                <div className="empty-plan">
                  <p>先放一个房间</p>
                  <p className="hint">从客厅开始，之后还能加卧室、餐厅</p>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => addRoom(ROOM_TEMPLATES[0])}
                  >
                    放入客厅
                  </button>
                </div>
              ) : (
                <div className="split">
                  <FloorPlan
                    rooms={rooms}
                    mode="plan"
                    activeRoomId={activeRoomId}
                    onRoomsChange={setRooms}
                    onSelectRoom={setActiveRoomId}
                    onToggleCover={(id) =>
                      setRooms((prev) =>
                        prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
                      )
                    }
                  />
                  <div className="side-form">
                    {activeRoom ? (
                      <>
                        <p className="side-title">{activeRoom.name}</p>
                        <div className="size-block">
                          <span className="field-label">大小</span>
                          <div className="size-chips">
                            {sizePresetsFor(activeRoom).map((s) => {
                              const on =
                                activeRoom.length === s.length && activeRoom.width === s.width
                              return (
                                <button
                                  key={s.label}
                                  type="button"
                                  className={`chip${on ? ' is-on' : ''}`}
                                  onClick={() =>
                                    updateActiveRoom({ length: s.length, width: s.width })
                                  }
                                >
                                  {s.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <details className="more-block nested">
                          <summary>名称与精确尺寸</summary>
                          <label className="field tight">
                            <span>名称</span>
                            <input
                              type="text"
                              value={activeRoom.name}
                              onChange={(e) => updateActiveRoom({ name: e.target.value })}
                            />
                          </label>
                          <div className="dim-row">
                            <label className="field tight">
                              <span>长度 (m)</span>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                step={0.1}
                                value={activeRoom.length}
                                onChange={(e) =>
                                  updateActiveRoom({ length: Number(e.target.value) })
                                }
                              />
                            </label>
                            <label className="field tight">
                              <span>宽度 (m)</span>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                step={0.1}
                                value={activeRoom.width}
                                onChange={(e) =>
                                  updateActiveRoom({ width: Number(e.target.value) })
                                }
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="btn ghost danger compact"
                            onClick={removeActiveRoom}
                          >
                            删除这个房间
                          </button>
                        </details>
                      </>
                    ) : (
                      <p className="hint">点左侧房间，改名字和大小</p>
                    )}
                  </div>
                </div>
              )}
              <details className="more-block">
                <summary>更多：加减房间、层高、贴合</summary>
                <div className="room-palette nested">
                  <p className="palette-label">添加房间</p>
                  <div className="palette-row">
                    {ROOM_TEMPLATES.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        className="btn palette"
                        onClick={() => addRoom(t)}
                      >
                        + {t.name}
                      </button>
                    ))}
                    <button type="button" className="btn primary" onClick={() => addRoom()}>
                      + 空白房间
                    </button>
                  </div>
                </div>
                <div className="more-grid">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setRooms((prev) => fitRoomsTogether(prev))}
                  >
                    一键贴合
                  </button>
                  <label className="field tight">
                    <span>统一层高 (m)</span>
                    <input
                      type="number"
                      min={2.2}
                      max={5}
                      step={0.1}
                      value={ceilingHeight}
                      onChange={(e) => applyCeilingToAll(Number(e.target.value))}
                    />
                  </label>
                  {unitType === 'custom' && (
                    <label className="field tight">
                      <span>自定义名称</span>
                      <input
                        type="text"
                        value={customName}
                        placeholder="例如：跃层 / 复式"
                        onChange={(e) => {
                          setCustomName(e.target.value)
                          setRooms((prev) =>
                            prev.length === 1
                              ? [{ ...prev[0], name: e.target.value || '房间1' }]
                              : prev,
                          )
                        }}
                      />
                    </label>
                  )}
                </div>
                {activeRoom && (
                  <p className="meta-line">
                    面积 {roomArea(activeRoom).toFixed(1)} m²
                  </p>
                )}
              </details>
            </>
          )}

          {step === 2 && (
            <>
              <h1>人平时坐在哪？</h1>
              <p className="lead">在客厅、餐厅里点一下即可。没有把握可以直接看推荐。</p>
              {(markerPast.length > 0 || markerFuture.length > 0 || markers.length > 0) && (
                <div className="toolbar">
                  <div className="history-btns" role="group" aria-label="撤销重做">
                    <button
                      type="button"
                      className="btn icon"
                      title="撤销 (⌘Z)"
                      aria-label="撤销"
                      disabled={markerPast.length === 0}
                      onClick={undoMarker}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M9 14L4 9l5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4 9h10a6 6 0 010 12h-3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn icon"
                      title="重做 (⌘⇧Z)"
                      aria-label="重做"
                      disabled={markerFuture.length === 0}
                      onClick={redoMarker}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M15 14l5-5-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M20 9H10a6 6 0 000 12h3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {markers.length > 0 && (
                    <button
                      type="button"
                      className="btn ghost compact"
                      onClick={() => commitMarkers([])}
                    >
                      清空
                    </button>
                  )}
                </div>
              )}
              <FloorPlan
                rooms={rooms}
                markers={markers}
                mode="marker"
                onAddMarker={(roomId, x, y) => {
                  const room = rooms.find((r) => r.id === roomId)
                  commitMarkers((prev) => [
                    ...prev,
                    {
                      id: uid('mk'),
                      roomId,
                      x,
                      y,
                      label: defaultMarkerLabel(room?.name ?? ''),
                    },
                  ])
                }}
                onMoveMarker={(id, x, y) => {
                  if (!markerDragOrigin.current) {
                    markerDragOrigin.current = markersRef.current
                  }
                  setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)))
                }}
                onDragEnd={(kind) => {
                  if (kind !== 'marker' || !markerDragOrigin.current) return
                  const origin = markerDragOrigin.current
                  markerDragOrigin.current = null
                  setMarkerPast((p) => [...p, origin])
                  setMarkerFuture([])
                }}
              />
            </>
          )}

          {step === 3 && (
            <>
              <h1>推荐 {devices.length} 个收声端</h1>
              <p className="lead">根据房间大小和常坐位置生成。装不了就拖开黑色圆点。</p>
              <div className="split">
                <div className="plan-col">
                  <p className="legend">
                    {markers.length > 0 && (
                      <span>
                        <i className="leg-sit" aria-hidden />
                        常坐处
                      </span>
                    )}
                    <span>
                      <i className="leg-node" aria-hidden />
                      收声端
                    </span>
                    <span>
                      <i className="leg-cover" aria-hidden />
                      覆盖范围
                    </span>
                  </p>
                  <FloorPlan
                    rooms={rooms}
                    markers={markers}
                    devices={devices}
                    mode="adjust"
                    onMoveDevice={(id, x, y) =>
                      setDevices((prev) =>
                        prev.map((d) => {
                          if (d.id !== id) return d
                          const room = rooms.find((r) => r.id === d.roomId)
                          if (!room) return { ...d, x, y }
                          return {
                            ...d,
                            x,
                            y,
                            description: describeDevicePosition(
                              room,
                              x,
                              y,
                              markers,
                              d.originX,
                              d.originY,
                            ),
                          }
                        }),
                      )
                    }
                  />
                </div>
                <aside className="side-form result-list">
                  {rooms
                    .filter((r) => r.selected)
                    .map((r) => {
                      const count = devices.filter((d) => d.roomId === r.id).length
                      return (
                        <div key={r.id} className="setup-card">
                          <h3>{r.name}</h3>
                          <p className="setup-count">{count} × 收声端</p>
                          <p className="setup-hint">{placementHint(r, markers)}</p>
                        </div>
                      )
                    })}
                  {devices.length === 0 && (
                    <p className="hint">暂无点位，请返回确认要装的房间。</p>
                  )}
                  <details className="more-block nested">
                    <summary>为什么这样放？</summary>
                    {rooms
                      .filter((r) => r.selected)
                      .map((r) => {
                        const area = roomArea(r)
                        const R = aspectRatio(r)
                        const count = deviceCountForArea(area, R)
                        const roomDevices = devices.filter((d) => d.roomId === r.id)
                        return (
                          <div key={r.id} className="result-card">
                            <h3>{r.name}</h3>
                            <p>
                              面积 {area.toFixed(1)} m² → {count} 个
                            </p>
                            <p>
                              长宽比 {R.toFixed(2)} → {layoutLabel(R, count)}
                            </p>
                            {roomDevices.map((d) => (
                              <p key={d.id}>{d.description}</p>
                            ))}
                          </div>
                        )
                      })}
                    <button type="button" className="btn ghost compact" onClick={regenerate}>
                      重新计算
                    </button>
                  </details>
                </aside>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <button type="button" className="btn ghost" onClick={goPrev} disabled={step === 1}>
          上一步
        </button>
        <div className="footer-actions">
          {step < 3 ? (
            <button type="button" className="btn primary" onClick={goNext} disabled={!canNext}>
              {step === 1 ? '继续' : markers.length > 0 ? '看推荐方案' : '跳过，看推荐'}
            </button>
          ) : confirmed ? (
            <span className="done-note">方案已记下，可按此安装</span>
          ) : (
            <button type="button" className="btn primary" onClick={() => setConfirmed(true)}>
              就用这个方案
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
