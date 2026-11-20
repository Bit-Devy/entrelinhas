import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ColorPicker } from './ColorPicker'

afterEach(cleanup)
it('escolhe uma cor no painel próprio e só aplica ao confirmar', () => {
  const change = vi.fn()
  render(<ColorPicker label="Cor do projeto" value="#768c66" onChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cor do projeto' }))
  expect(screen.getByRole('dialog', { name: 'Cor do projeto' })).toBeInTheDocument()
  expect(document.querySelector('input[type=color]')).toBeNull()
  fireEvent.change(screen.getByLabelText('Cor em hexadecimal'), { target: { value: '#bc9a69' } })
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar cor' }))
  expect(change).toHaveBeenCalledExactlyOnceWith('#bc9a69')
})
it('cancelar não altera a cor e valores inválidos não podem ser aplicados', () => {
  const change = vi.fn()
  render(<ColorPicker label="Cor do texto" value="rgb(12, 34, 56)" onChange={change} textTool />)
  fireEvent.click(screen.getByRole('button', { name: 'Cor do texto' }))
  fireEvent.change(screen.getByLabelText('Cor em hexadecimal'), { target: { value: '#12' } })
  expect(screen.getByRole('button', { name: 'Aplicar cor' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(change).not.toHaveBeenCalled()
})
