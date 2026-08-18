import { deviceInstallLines } from '../logic/placement'
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
  const covered = rooms.filter((r) => r.selected)

  return (
    <>
      {covered.map((r) => {
        const roomDevices = devices.filter((d) => d.roomId === r.id)
        return (
          <div key={r.id} className="result-card">
            <h3>{r.name}</h3>
            <p className="result-stat">{roomDevices.length} 个收声端</p>
            {roomDevices.map((d, i) => {
              const lines = deviceInstallLines(r, d.x, d.y, markers, d.originX, d.originY)
              return (
                <div key={d.id} className="result-point">
                  {roomDevices.length > 1 && (
                    <p className="result-point-label">点位 {i + 1}</p>
                  )}
                  <p>{lines.h}</p>
                  <p>{lines.v}</p>
                </div>
              )
            })}
          </div>
        )
      })}
      {devices.length === 0 && <p className="hint">暂无点位，请返回确认要装的房间。</p>}
    </>
  )
}
