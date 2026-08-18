import { useEffect, useId, useRef, useState } from 'react'
import { FloorPlan } from './components/FloorPlan'
import { SchemeSummary } from './components/SchemeSummary'
import { StepNav } from './components/StepNav'
import {
  computePlacements,
  createPresetRooms,
  describeDevicePosition,
  fitRoomsTogether,
  nextRoomPosition,
  roomArea,
} from './logic/placement'
import { downloadSchemePng } from './logic/exportScheme'
import type { DevicePlacement, Marker, Room, UnitType } from './types'
import { STEP_LABELS, UNIT_OPTIONS } from './types'
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
    if (step !== 3) return
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
    setStep(1)
  }

  function addRoom(template?: { name: string; length: number; width: number }) {
    const t = template ?? { name: `房间${rooms.length + 1}`, length: 4, width: 3.5 }
    const sameNameCount = rooms.filter((r) => r.name.startsWith(t.name)).length
    const name = sameNameCount === 0 ? t.name : `${t.name}${sameNameCount + 1}`
    const pos = nextRoomPosition(rooms, t.length, t.width)
    const r: Room = {
      id: uid('room'),
      name,
      x: pos.x,
      y: pos.y,
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
    if (n === 3 && rooms.length > 0) {
      setRooms((prev) => fitRoomsTogether(prev))
    }
    if (n === 4) {
      setDevices(computePlacements(rooms, markers))
      setConfirmed(false)
    }
    setStep(n)
  }

  function pickUnit(type: UnitType) {
    initFromUnit(type)
    setStep(2)
  }

  function goNext() {
    if (step === 1) {
      if (!unitType) return
      enterStep(2)
      return
    }
    if (step === 2) {
      if (rooms.length === 0) return
      enterStep(3)
      return
    }
    if (step === 3) {
      enterStep(4)
      return
    }
    if (step === 4) {
      enterStep(5)
    }
  }

  function goPrev() {
    if (step === 5) setConfirmed(false)
    if (step > 1) setStep(step - 1)
  }

  async function confirmScheme() {
    setConfirmed(true)
    await downloadSchemePng(rooms, markers, devices)
  }

  function regenerate() {
    setDevices(computePlacements(rooms, markers))
  }

  function patchDevice(id: string, patch: Partial<DevicePlacement>) {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d
        const next = { ...d, ...patch }
        const room = rooms.find((r) => r.id === next.roomId)
        if (room) {
          next.description = describeDevicePosition(
            room,
            next.x,
            next.y,
            markers,
            next.originX,
            next.originY,
          )
        }
        return next
      }),
    )
  }

  const canNext =
    step === 1
      ? !!unitType
      : step === 2
        ? rooms.length > 0 &&
          rooms.every((r) => r.name && r.length > 0 && r.width > 0)
        : step === 3
          ? rooms.some((r) => r.selected)
          : true

  function toggleRoomCover(id: string) {
    const turningOff = !!rooms.find((r) => r.id === id)?.selected
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)))
    if (turningOff) {
      commitMarkers((ms) => ms.filter((m) => m.roomId !== id))
    }
  }

  return (
    <div className="app">
      <div className="bg-wash" aria-hidden />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="brand-name">置点</p>
            <p className="brand-sub">户内收发端布置向导</p>
          </div>
        </div>
        <StepNav step={step} onJump={(n) => n <= step && enterStep(n)} />
      </header>

      <main className="app-main">
        <section className="panel panel-primary" key={step === 1 ? 'pick' : step}>
          {step === 1 && (
            <>
              <h1>户型选择</h1>
              <p className="lead">你家是几室几厅？选一个最接近的，下一步可以改大小、加减房间。</p>
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
                      onChange={() => pickUnit(opt.value)}
                    />
                    <span className="unit-title">{opt.label}</span>
                    <span className="unit-meta">{UNIT_BLURB[opt.value as Exclude<UnitType, 'custom'>]}</span>
                  </label>
                ))}
              </div>
              <button type="button" className="custom-link" onClick={() => pickUnit('custom')}>
                没有合适的？自己加房间
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1>户型布局</h1>
              <p className="lead">
                房间是独立物块，先大致摆放；选中后可拖边角改大小，右侧数字会跟着变。拖移时磁吸贴合。
              </p>
              <div className="room-palette">
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
                <div className="layout-manage">
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={removeActiveRoom}
                    disabled={!activeRoom}
                  >
                    删除选中房间
                  </button>
                  <span className="layout-status">
                    已有 {rooms.length} 间 · 拖移贴合 · 拖边角改大小
                  </span>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() => setRooms((prev) => fitRoomsTogether(prev))}
                    disabled={rooms.length === 0}
                  >
                    一键贴合
                  </button>
                  <button type="button" className="btn ghost compact" onClick={resetUnit}>
                    重选户型
                  </button>
                </div>
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
                    mode="edit"
                    activeRoomId={activeRoomId}
                    onRoomsChange={setRooms}
                    onSelectRoom={setActiveRoomId}
                  />
                  <div className="side-form">
                    {activeRoom ? (
                      <>
                        <p className="side-title">{activeRoom.name}</p>
                        <p className="meta-line">
                          面积 {roomArea(activeRoom).toFixed(1)} m²
                        </p>
                        <div className="size-block">
                          <span className="field-label">常用大小</span>
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
                      </>
                    ) : (
                  <p className="hint">点左侧房间，拖边角改大小，或在右侧改数字</p>
                    )}
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
                          onChange={(e) => setCustomName(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h1>覆盖选择</h1>
              <p className="lead">
                点房间角上的「要装 / 不装」决定覆盖哪里；不装的会变灰。要装的房间里再点一下，标出常坐位置。
              </p>
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
                      清空常坐
                    </button>
                  )}
                </div>
              )}
              <div className="split">
                <FloorPlan
                  rooms={rooms}
                  markers={markers}
                  mode="marker"
                  onToggleCover={toggleRoomCover}
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
                <aside className="side-form">
                  <p className="side-title">房间</p>
                  <p className="hint">至少保留一个「要装」。常坐处可跳过。</p>
                  {rooms.map((r) => {
                    const sitCount = markers.filter((m) => m.roomId === r.id).length
                    return (
                      <div key={r.id} className={`cover-card${r.selected ? '' : ' is-off'}`}>
                        <div className="cover-card-head">
                          <h3>{r.name}</h3>
                          <button
                            type="button"
                            className={`chip${r.selected ? ' is-on' : ''}`}
                            onClick={() => toggleRoomCover(r.id)}
                          >
                            {r.selected ? '要装' : '不装'}
                          </button>
                        </div>
                        {r.selected ? (
                          <p className="setup-hint">
                            {sitCount > 0 ? `${sitCount} 处常坐` : '在图上点一下标常坐'}
                          </p>
                        ) : (
                          <p className="setup-hint">此房间不装收声端</p>
                        )}
                      </div>
                    )
                  })}
                </aside>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1>系统方案</h1>
              <p className="lead">根据房间面积与长宽比生成推荐点位，并向常坐处适当偏移。</p>
              <div className="split">
                <div className="plan-col">
                  <div className="result-toolbar">
                    <button type="button" className="btn ghost compact" onClick={regenerate}>
                      重新计算
                    </button>
                    <p className="legend">
                      <span>
                        <i className="leg-node" aria-hidden />
                        推荐放置
                      </span>
                      <span>
                        <i className="leg-cover" aria-hidden />
                        预计覆盖
                      </span>
                      {markers.length > 0 && (
                        <span>
                          <i className="leg-sit" aria-hidden />
                          常坐处
                        </span>
                      )}
                    </p>
                  </div>
                  <FloorPlan
                    rooms={rooms}
                    markers={markers}
                    devices={devices}
                    mode="result"
                  />
                </div>
                <aside className="side-form result-list">
                  <SchemeSummary rooms={rooms} markers={markers} devices={devices} />
                </aside>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1>{confirmed ? '安装方案' : '确认调整'}</h1>
              <p className="lead">
                {confirmed
                  ? '已按现场条件调整。右侧说明已下载，也可再下一次。'
                  : '确认天花能否安装、是否靠近噪声源。只要选了其中一项需要调整，就会出现可调范围，并可在范围内拖动。'}
              </p>
              <div className="split">
                <FloorPlan
                  rooms={rooms}
                  markers={markers}
                  devices={devices}
                  mode={confirmed ? 'result' : 'adjust'}
                  onMoveDevice={
                    confirmed ? undefined : (id, x, y) => patchDevice(id, { x, y })
                  }
                />
                <aside className="side-form result-list">
                  {confirmed ? (
                    <SchemeSummary rooms={rooms} markers={markers} devices={devices} />
                  ) : (
                    <>
                      {devices.map((d) => {
                    const room = rooms.find((r) => r.id === d.roomId)
                    const index =
                      devices.filter((x) => x.roomId === d.roomId).findIndex((x) => x.id === d.id) +
                      1
                    return (
                      <div key={d.id} className="adjust-card">
                        <h3>
                          {room?.name ?? '房间'} · 点位 {index}
                        </h3>
                        <p className="setup-hint">{d.description}</p>
                        <fieldset className="yn">
                          <legend>天花该位置可否安装？（有无梁 / 管）</legend>
                          <label>
                            <input
                              type="radio"
                              name={`${formId}-inst-${d.id}`}
                              checked={d.installable === true}
                              onChange={() =>
                                patchDevice(d.id, {
                                  installable: true,
                                  ...(d.nearNoise === true
                                    ? {}
                                    : { x: d.originX, y: d.originY }),
                                })
                              }
                            />
                            可以
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`${formId}-inst-${d.id}`}
                              checked={d.installable === false}
                              onChange={() => patchDevice(d.id, { installable: false })}
                            />
                            不可 · 请拖动调整
                          </label>
                        </fieldset>
                        <fieldset className="yn">
                          <legend>是否靠近噪声源？</legend>
                          <label>
                            <input
                              type="radio"
                              name={`${formId}-noise-${d.id}`}
                              checked={d.nearNoise === false}
                              onChange={() =>
                                patchDevice(d.id, {
                                  nearNoise: false,
                                  ...(d.installable === false
                                    ? {}
                                    : { x: d.originX, y: d.originY }),
                                })
                              }
                            />
                            否
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`${formId}-noise-${d.id}`}
                              checked={d.nearNoise === true}
                              onChange={() => patchDevice(d.id, { nearNoise: true })}
                            />
                            是 · 建议偏移
                          </label>
                        </fieldset>
                      </div>
                    )
                  })}
                  {devices.length === 0 && (
                    <p className="hint">暂无点位，请返回确认要装的房间。</p>
                  )}
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <button type="button" className="btn ghost" onClick={goPrev} disabled={step === 1}>
            上一步
          </button>
          <span className="step-indicator">
            {step} / {STEP_LABELS.length}
          </span>
          <div className="footer-actions">
            {step < 5 ? (
              <button type="button" className="btn primary" onClick={goNext} disabled={!canNext}>
                {step === 3
                  ? markers.length > 0
                    ? '看推荐方案'
                    : '跳过，看推荐'
                  : '继续'}
              </button>
            ) : confirmed ? (
              <>
                <span className="done-note">方案已记下</span>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void downloadSchemePng(rooms, markers, devices)}
                >
                  下载方案
                </button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={() => void confirmScheme()}>
                完成确认
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
