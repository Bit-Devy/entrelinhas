import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipLayer } from './TooltipLayer'
import { IconButton } from './ui'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 30, height: 30 },
  ] as unknown as DOMRectList)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const delay = () =>
  act(() => {
    vi.advanceTimersByTime(430)
  })

it('mostra o nome e o atalho ao passar o mouse, sem usar title nativo', () => {
  render(
    <>
      <IconButton label="Negrito (Ctrl+B)">B</IconButton>
      <TooltipLayer />
    </>,
  )
  const button = screen.getByRole('button')
  expect(button).not.toHaveAttribute('title')
  fireEvent.pointerOver(button)
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  delay()
  const tip = screen.getByRole('tooltip')
  expect(tip).toHaveTextContent('Negrito')
  expect(tip.querySelector('kbd')).toHaveTextContent('Ctrl+B')
  expect(button).toHaveAttribute('aria-describedby', tip.id)
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  expect(button).not.toHaveAttribute('aria-describedby')
})

it('descreve botões com texto pelo teclado e cancela a dica ao clicar', () => {
  render(
    <>
      <button>
        Salvar <kbd>Ctrl S</kbd>
      </button>
      <TooltipLayer />
    </>,
  )
  const button = screen.getByRole('button')
  fireEvent.focusIn(button)
  delay()
  expect(screen.getByRole('tooltip')).toHaveTextContent('Salvar')
  expect(screen.getByRole('tooltip').querySelector('kbd')).toHaveTextContent('Ctrl S')
  fireEvent.pointerDown(button)
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

it('cancela dicas pendentes e visíveis ao entrar em imersão', () => {
  const { rerender } = render(
    <>
      <button aria-label="Salvar documento" />
      <TooltipLayer />
    </>,
  )
  const button = screen.getByRole('button')
  fireEvent.pointerOver(button)
  rerender(
    <>
      <button aria-label="Salvar documento" />
      <TooltipLayer hidden />
    </>,
  )
  delay()
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  rerender(
    <>
      <button aria-label="Salvar documento" />
      <TooltipLayer />
    </>,
  )
  fireEvent.pointerOver(button)
  delay()
  expect(screen.getByRole('tooltip')).toBeInTheDocument()
  rerender(
    <>
      <button aria-label="Salvar documento" />
      <TooltipLayer hidden />
    </>,
  )
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

it('voltar rapidamente ao botão reinicia a dica pendente', () => {
  render(
    <>
      <button aria-label="Salvar" />
      <TooltipLayer />
    </>,
  )
  const button = screen.getByRole('button')
  fireEvent.pointerOver(button)
  act(() => {
    vi.advanceTimersByTime(100)
  })
  fireEvent.pointerOut(button, { relatedTarget: document.body })
  act(() => {
    vi.advanceTimersByTime(50)
  })
  fireEvent.pointerOver(button)
  delay()
  expect(screen.getByRole('tooltip')).toHaveTextContent('Salvar')
})
