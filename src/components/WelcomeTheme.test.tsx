import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WelcomeTheme } from './WelcomeTheme'

afterEach(cleanup)
it.each([
  ['Claro', 'light'],
  ['Escuro', 'dark'],
  ['Sépia Noturno', 'sepia'],
])('permite começar com o tema %s', (label, theme) => {
  const choose = vi.fn()
  render(<WelcomeTheme onChoose={choose} />)
  fireEvent.click(screen.getByRole('button', { name: `Usar tema ${label}` }))
  expect(choose).toHaveBeenCalledExactlyOnceWith(theme)
})
it('não registra uma escolha ao pressionar Esc', () => {
  const choose = vi.fn()
  render(<WelcomeTheme onChoose={choose} />)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(choose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
