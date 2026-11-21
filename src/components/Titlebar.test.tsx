import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createNote } from '../core/notes'
import { Titlebar } from './Titlebar'

const actions = vi.hoisted(() => ({
  startDragging: vi.fn(),
  toggleMaximize: vi.fn(),
  minimize: vi.fn(),
  close: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => actions }))
beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)
const setup = () => {
  const rename = vi.fn(),
    error = vi.fn()
  render(<Titlebar note={createNote()} onRename={rename} onError={error} />)
  return { rename, error, bar: screen.getByRole('banner') }
}

it('arrasta pelo nome do aplicativo e alterna maximização no segundo clique de áreas livres', () => {
  const { bar } = setup()
  fireEvent.mouseDown(screen.getByText('Entrelinhas'), { button: 0, detail: 1 })
  expect(actions.startDragging).toHaveBeenCalledOnce()
  fireEvent.mouseDown(screen.getByText('Entrelinhas'), { button: 0, detail: 2 })
  fireEvent.mouseDown(bar.querySelector('.window-controls')!, { button: 0, detail: 2 })
  expect(actions.toggleMaximize).toHaveBeenCalledTimes(2)
  expect(actions.startDragging).toHaveBeenCalledOnce()
})

it('exclui botões e seus ícones do arraste e do duplo clique da barra', () => {
  const { rename } = setup()
  for (const button of screen.getAllByRole('button')) {
    const child = button.querySelector('svg path, svg rect, span') ?? button
    fireEvent.mouseDown(child, { button: 0, detail: 1 })
    fireEvent.mouseDown(child, { button: 0, detail: 2 })
  }
  expect(actions.startDragging).not.toHaveBeenCalled()
  expect(actions.toggleMaximize).not.toHaveBeenCalled()
  fireEvent.doubleClick(
    screen.getByRole('button', { name: 'Editar título do documento' }).querySelector('span')!,
  )
  expect(rename).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Maximizar ou restaurar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Fechar aplicativo' }))
  expect(actions.minimize).toHaveBeenCalledOnce()
  expect(actions.toggleMaximize).toHaveBeenCalledOnce()
  expect(actions.close).toHaveBeenCalledOnce()
})

it('ignora outros botões do mouse e mantém a edição do título pelo teclado', () => {
  const { bar, rename } = setup()
  fireEvent.mouseDown(bar, { button: 2, detail: 2 })
  fireEvent.mouseDown(bar, { button: 1, detail: 1 })
  fireEvent.mouseDown(bar, { button: 0, detail: 3 })
  expect(actions.startDragging).not.toHaveBeenCalled()
  expect(actions.toggleMaximize).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Editar título do documento' }), { detail: 0 })
  expect(rename).toHaveBeenCalledOnce()
})

it('informa uma falha do sistema ao tentar maximizar', async () => {
  const { bar, error } = setup()
  actions.toggleMaximize.mockRejectedValueOnce('Não foi possível maximizar a janela.')
  fireEvent.mouseDown(bar, { button: 0, detail: 2 })
  await waitFor(() =>
    expect(error).toHaveBeenCalledExactlyOnceWith('Não foi possível maximizar a janela.'),
  )
})
