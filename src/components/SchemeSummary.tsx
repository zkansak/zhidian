import {
  aspectRatio,
  deviceCountForArea,
  layoutLabel,
  placementHint,
  roomArea,
} from '../logic/placement'
import type { DevicePlacement, Marker, Room } from '../types'

export function SchemeSummary({
  rooms,
  markers,
  devices,
}: {
  rooms: Room[]
  markers: Marker[]
  devices: DevicePlacement[]
}) {
  return (
    <>
      {rooms
        .filter((r) => r.selected)
        .map((r) => {
          const area = roomArea(r)
          const R = aspectRatio(r)
          const count = devices.filter((d) => d.roomId === r.id).length
          return (
            <div key={r.id} className="result-card">
              <h3>{r.name}</h3>
              <p>
                面积 {area.toFixed(1)} m² → 建议 {count} 个
              </p>
              <p>
                长宽比 {R.toFixed(2)} → {layoutLabel(R, deviceCountForArea(area, R))}
              </p>
              <p className="setup-hint">{placementHint(r, markers)}</p>
            </div>
          )
        })}
      {devices.length === 0 && <p className="hint">暂无点位，请返回确认要装的房间。</p>}
      {devices.length > 0 && (
        <div className="device-descs">
          {devices.map((d) => {
            const room = rooms.find((r) => r.id === d.roomId)
            return (
              <p key={d.id}>
                {room?.name}：{d.description}
              </p>
            )
          })}
        </div>
      )}
    </>
  )
}
