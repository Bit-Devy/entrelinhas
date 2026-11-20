import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const directions = [
  'North',
  'South',
  'East',
  'West',
  'NorthEast',
  'NorthWest',
  'SouthEast',
  'SouthWest',
] as const

export function WindowResize({ onError }: { onError: (message: string) => void }) {
  if (!isTauri()) return null
  return (
    <div className="window-resize-handles" aria-hidden="true">
      {directions.map((direction) => (
        <div
          key={direction}
          className={`resize-${direction}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            void getCurrentWindow()
              .startResizeDragging(direction)
              .catch((error) => onError(String(error)))
          }}
        />
      ))}
    </div>
  )
}
