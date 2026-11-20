import { renderHook, act } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import { useDocuments } from './useDocuments'
import { backend } from '../native/api'
import { save } from '@tauri-apps/plugin-dialog'
import { createNote } from '../core/notes'
import { defaultPreferences } from '../core/preferences'
import { editorExtensions } from '../editor/extensions'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('../native/api', async importOriginal => ({ ...await importOriginal<typeof import('../native/api')>(), backend: { save: vi.fn(), read: vi.fn() } }))

function setup(format: 'md' | 'txt' = 'md') {
  const note = createNote(format)
  const editor = new Editor({ extensions: editorExtensions(false), content: '<p>Olá, mundo.</p>' })
  const options = { notes: [note], setNotes: vi.fn(), setActiveId: vi.fn(), editors: { current: new Map([[note.id, editor]]) }, preferences: structuredClone(defaultPreferences), documents: [], ask: vi.fn().mockResolvedValue('text'), notify: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) }
  vi.mocked(save).mockResolvedValue('/tmp/Manual.' + format)
  vi.mocked(backend.save).mockImplementation(async request => ({ path: request.path, title: 'Manual.' + format, content: request.content, version: 'versão', warning: null }))
  const hook = renderHook(() => useDocuments(options))
  return { note, editor, options, hook }
}

beforeEach(() => vi.clearAllMocks())

it('digitar e desmontar não grava o rascunho nem chama o backend', () => {
  const { editor, hook } = setup()
  editor.commands.insertContent('Rascunho secreto')
  hook.unmount(); editor.destroy()
  expect(backend.save).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  expect(createNote().content.content?.[0].content).toBeUndefined()
})

it('salva somente depois da ação explícita, com o Markdown real', async () => {
  const { note, editor, options, hook } = setup()
  let success = false
  await act(async () => { success = await hook.result.current.saveNote(note.id) })
  expect(success).toBe(true)
  expect(backend.save).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/Manual.md', content: 'Olá, mundo.\n', expectedVersion: null, overwrite: false }))
  expect(options.setNotes).toHaveBeenCalled()
  hook.unmount(); editor.destroy()
})

it('pede uma decisão antes de perder formatação em TXT', async () => {
  const { note, editor, options, hook } = setup('txt')
  editor.commands.selectAll(); editor.commands.toggleBold()
  options.ask.mockResolvedValue('cancel')
  await act(async () => { expect(await hook.result.current.saveNote(note.id)).toBe(false) })
  expect(options.ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Salvar como texto simples?' }))
  expect(backend.save).not.toHaveBeenCalled()
  options.ask.mockResolvedValue('text')
  await act(async () => { expect(await hook.result.current.saveNote(note.id)).toBe(true) })
  expect(backend.save).toHaveBeenCalledWith(expect.objectContaining({ content: 'Olá, mundo.', assets: [] }))
  hook.unmount(); editor.destroy()
})

it('não sobrescreve um conflito quando o usuário cancela', async () => {
  const { note, editor, options, hook } = setup()
  vi.mocked(backend.save).mockRejectedValue({ code: 'conflict', message: 'Alteração externa' })
  options.ask.mockResolvedValue('cancel')
  await act(async () => { expect(await hook.result.current.saveNote(note.id)).toBe(false) })
  expect(backend.save).toHaveBeenCalledTimes(1)
  hook.unmount(); editor.destroy()
})
