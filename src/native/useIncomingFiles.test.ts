import { act, renderHook, waitFor } from '@testing-library/react'
import { useIncomingFiles } from './useIncomingFiles'
import { backend } from './api'
import { listen } from '@tauri-apps/api/event'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  backend: { takeOpenRequests: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listen).mockResolvedValue(vi.fn())
  vi.mocked(backend.takeOpenRequests).mockResolvedValue([])
})

it('aguarda a apresentação inicial e abre os arquivos pendentes na ordem recebida', async () => {
  const open = vi.fn().mockResolvedValue(true),
    notify = vi.fn()
  vi.mocked(backend.takeOpenRequests).mockResolvedValueOnce([
    { kind: 'file', path: '/tmp/Ideia 日本語.md' },
    { kind: 'file', path: '/tmp/Texto.txt' },
    { kind: 'error', message: 'Arquivo não suportado.' },
  ])
  const { rerender, unmount } = renderHook(({ ready }) => useIncomingFiles(ready, open, notify), {
    initialProps: { ready: false },
  })
  expect(backend.takeOpenRequests).not.toHaveBeenCalled()
  rerender({ ready: true })
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
  expect(open.mock.calls.map(([path]) => path)).toEqual(['/tmp/Ideia 日本語.md', '/tmp/Texto.txt'])
  expect(notify).toHaveBeenCalledWith('Arquivo não suportado.')
  unmount()
})

it('não perde o pedido que chega enquanto outro arquivo ainda está abrindo', async () => {
  let listener!: () => void
  const stop = vi.fn()
  vi.mocked(listen).mockImplementation(async (_name, callback) => {
    listener = () => callback({} as never)
    return stop
  })
  vi.mocked(backend.takeOpenRequests)
    .mockResolvedValueOnce([{ kind: 'file', path: '/tmp/primeiro.md' }])
    .mockResolvedValueOnce([{ kind: 'file', path: '/tmp/segundo.txt' }])
  let finish!: () => void
  const open = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => resolve(true)
        }),
    )
    .mockResolvedValue(true)
  const { unmount } = renderHook(() => useIncomingFiles(true, open, vi.fn()))
  await waitFor(() => expect(open).toHaveBeenCalledOnce())
  act(() => listener())
  await act(async () => finish())
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
  expect(open.mock.calls.map(([path]) => path)).toEqual(['/tmp/primeiro.md', '/tmp/segundo.txt'])
  unmount()
  expect(stop).toHaveBeenCalledOnce()
})
