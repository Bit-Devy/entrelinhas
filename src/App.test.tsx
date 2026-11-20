import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import App from './App'

afterEach(cleanup)

it('sempre inicia com uma nota vazia, sem recuperar rascunhos', () => {
  const first = render(<App />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Não deve persistir' } })
  first.unmount()
  render(<App />)
  expect(screen.getByRole('textbox')).toHaveValue('')
})
