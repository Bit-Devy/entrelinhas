import { useEffect, useRef } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { backend, errorMessage } from './api'

export function useIncomingFiles(
  ready: boolean,
  open: (path: string) => Promise<boolean>,
  notify: (message: string) => void,
) {
  const current = useRef({ open, notify })
  current.current = { open, notify }
  useEffect(() => {
    if (!ready || !isTauri()) return
    let disposed = false,
      processing = false,
      requested = false
    let unlisten: (() => void) | undefined
    const drain = async () => {
      requested = true
      if (processing) return
      processing = true
      try {
        while (requested && !disposed) {
          requested = false
          const requests = await backend.takeOpenRequests()
          for (const request of requests) {
            if (request.kind === 'file') await current.current.open(request.path)
            else current.current.notify(request.message)
          }
        }
      } catch (error) {
        current.current.notify(errorMessage(error))
      } finally {
        processing = false
      }
    }
    void listen('entrelinhas://open-files', () => {
      void drain()
    })
      .then((stop) => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
        void drain()
      })
      .catch((error) => current.current.notify(errorMessage(error)))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [ready])
}
