import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Select } from './Select'
import { Modal } from './ui'

afterEach(cleanup)

function Field() {
  const [value, setValue] = useState('left')
  return (
    <Select
      label="Posição"
      value={value}
      onChange={setValue}
      options={[
        { value: 'left', label: 'Esquerda' },
        { value: 'off', label: 'Indisponível', disabled: true },
        { value: 'right', label: 'Direita' },
      ]}
    />
  )
}

it('seleciona com mouse em um menu do app e mantém o valor atual marcado', () => {
  render(<Field />)
  const trigger = screen.getByRole('combobox', { name: 'Posição' })
  fireEvent.click(trigger)
  expect(screen.getByRole('option', { name: 'Esquerda' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('option', { name: 'Indisponível' }))
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('option', { name: 'Direita' }))
  expect(trigger).toHaveTextContent('Direita')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(document.querySelector('select')).toBeNull()
})

it('navega com teclado, pula opções indisponíveis e cancela sem fechar o painel', () => {
  const close = vi.fn()
  render(
    <Modal title="Painel" onClose={close}>
      <Field />
    </Modal>,
  )
  const trigger = screen.getByRole('combobox')
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(screen.getByRole('option', { name: 'Direita' })).toHaveAttribute(
    'id',
    trigger.getAttribute('aria-activedescendant'),
  )
  fireEvent.keyDown(trigger, { key: 'Enter' })
  expect(trigger).toHaveTextContent('Direita')
  fireEvent.keyDown(trigger, { key: ' ' })
  fireEvent.keyDown(trigger, { key: 'Home' })
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(trigger).toHaveTextContent('Direita')
  expect(close).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
})

it('busca digitando e fecha com Tab ou clique fora sem alterar a opção', () => {
  render(<Field />)
  const trigger = screen.getByRole('combobox')
  fireEvent.keyDown(trigger, { key: 'd' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  expect(trigger).toHaveTextContent('Direita')
  fireEvent.click(trigger)
  fireEvent.keyDown(trigger, { key: 'Tab' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
