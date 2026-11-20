import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectAssignment } from './ProjectAssignment'

const projects = [
  { id: 'escola', name: 'Escola', color: '#61755b', icon: '📖', position: 0 },
  { id: 'ideias', name: 'Ideias', color: '#bb9977', icon: '', position: 1 },
]
afterEach(cleanup)

it('seleciona um projeto no painel do aplicativo e permite filtrar', async () => {
  const change = vi.fn().mockResolvedValue(undefined)
  render(<ProjectAssignment projects={projects} value={null} onChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: 'Projeto do documento atual' }))
  expect(screen.getByRole('dialog', { name: 'Organizar documento' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Filtrar projetos'), { target: { value: 'escola' } })
  expect(screen.queryByRole('option', { name: /Ideias/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('option', { name: /Escola/ }))
  await waitFor(() => expect(change).toHaveBeenCalledExactlyOnceWith('escola'))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('mantém o painel aberto quando a associação falha', async () => {
  const change = vi.fn().mockRejectedValue({ message: 'Não foi possível associar.' })
  render(<ProjectAssignment projects={projects} value="escola" onChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: 'Projeto do documento atual' }))
  fireEvent.click(screen.getByRole('option', { name: /Sem projeto/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível associar.')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
