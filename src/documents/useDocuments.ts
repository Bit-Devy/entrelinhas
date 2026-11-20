import { useCallback, useRef, type Dispatch, type SetStateAction, type RefObject } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { createNote, hasFormatting, textFromDocument, updateNote } from '../core/notes'
import type { Note, Preferences, RegisteredDocument } from '../core/types'
import { backend, errorCode, errorMessage } from '../native/api'
import { parseDocument, serializeHtml } from '../editor/serialization'
import type { AskDialog } from '../components/useDialog'

interface Options {
  notes: Note[]; setNotes: Dispatch<SetStateAction<Note[]>>; setActiveId: Dispatch<SetStateAction<string>>
  editors: RefObject<Map<string, Editor>>; preferences: Preferences
  documents: RegisteredDocument[]; ask: AskDialog; notify: (message: string) => void; refresh: () => Promise<void>
}

export function useDocuments(options: Options) {
  const current = useRef(options); current.current = options
  const saving = useRef(new Set<string>())
  const opening = useRef(new Set<string>())

  const openPath = useCallback(async (path: string) => {
    const { notes, setNotes, setActiveId, documents, notify, refresh } = current.current
    const duplicate = notes.find(note => note.path === path)
    if (duplicate) { setActiveId(duplicate.id); return true }
    if (opening.current.has(path)) return false
    opening.current.add(path)
    try {
      const read = await backend.read(path)
      const canonical = current.current.notes.find(note => note.path === read.path)
      if (canonical) { setActiveId(canonical.id); return true }
      const content = parseDocument(read.content, read.format)
      let unavailable = 0
      const hydrate = async (node: JSONContent): Promise<void> => {
        if (node.type === 'image' && node.attrs?.src && !String(node.attrs.src).startsWith('data:')) {
          try { node.attrs.src = await backend.image(read.path, node.attrs.src) } catch { unavailable++ }
        }
        await Promise.all((node.content ?? []).map(hydrate))
      }
      await hydrate(content)
      const note: Note = { ...createNote(read.format), title: read.title, path: read.path, version: read.version, content, savedContent: JSON.stringify(content), projectId: documents.find(item => item.path === read.path)?.projectId ?? null }
      setNotes(existing => [...existing, note]); setActiveId(note.id)
      if (unavailable) notify(`${unavailable} imagem(ns) indisponível(is). As referências foram mantidas. Imagens remotas não são baixadas automaticamente.`)
      await refresh()
      return true
    } catch (error) { notify(`Não foi possível abrir o documento: ${errorMessage(error)}`); return false }
    finally { opening.current.delete(path) }
  }, [])

  const openDocument = useCallback(async () => {
    try {
      const selected = await open({ title: 'Abrir documento', multiple: true, filters: [{ name: 'Documentos', extensions: ['md', 'markdown', 'txt'] }] })
      for (const path of Array.isArray(selected) ? selected : selected ? [selected] : []) await openPath(path)
    } catch (error) { current.current.notify(errorMessage(error)) }
  }, [openPath])

  const saveNote = useCallback(async (id: string, saveAs = false): Promise<boolean> => {
    if (saving.current.has(id)) return false
    saving.current.add(id)
    const { notes, editors, setNotes, ask, notify, refresh } = current.current
    const note = notes.find(note => note.id === id), editor = editors.current.get(id)
    if (!note || !editor) { saving.current.delete(id); return false }
    try {
      let path = note.path
      if (!path || saveAs) {
        path = await save({ title: 'Salvar como', defaultPath: note.path ?? `Sem título.${note.format}`, filters: [{ name: 'Markdown (.md)', extensions: ['md'] }, { name: 'Texto simples (.txt)', extensions: ['txt'] }] })
        if (!path) return false
        if (!/\.[^/]+$/.test(path)) path += `.${note.format}`
      }
      if (!/\.(md|markdown|txt)$/i.test(path)) { notify('Use a extensão .md ou .txt para escolher o formato.'); return false }
      if (current.current.notes.some(other => other.id !== id && other.path === path)) { notify('Este arquivo já está aberto em outra aba. Salve com outro nome.'); return false }
      const format = /\.txt$/i.test(path) ? 'txt' : 'md'
      const snapshot = editor.state.doc
      const json = editor.getJSON()
      if (format === 'txt' && hasFormatting(json)) {
        const choice = await ask({ title: 'Salvar como texto simples?', message: 'TXT preserva somente o texto. Formatação, tabelas e imagens não serão mantidas no arquivo. O documento aberto continuará com a formatação até ser fechado.', choices: [{ id: 'cancel', label: 'Cancelar' }, { id: 'text', label: 'Salvar somente o texto', primary: true }] })
        if (choice !== 'text') return false
      }
      const serialized = format === 'txt' ? { content: textFromDocument(json), assets: [] } : serializeHtml(editor.getHTML())
      let result
      const request = { path, ...serialized, expectedVersion: path === note.path ? note.version : null, overwrite: false, projectId: note.projectId }
      try { result = await backend.save(request) }
      catch (error) {
        if (errorCode(error) !== 'conflict') throw error
        const choice = await ask({ title: 'O arquivo no disco é diferente', message: `${errorMessage(error)}\n\nDeseja substituir o arquivo por esta versão? Você também pode cancelar e usar Salvar como.`, choices: [{ id: 'cancel', label: 'Cancelar' }, { id: 'overwrite', label: 'Substituir arquivo', danger: true }] })
        if (choice !== 'overwrite') return false
        result = await backend.save({ ...request, overwrite: true })
      }
      setNotes(existing => updateNote(existing, id, { path: result.path, title: result.title, version: result.version, format, dirty: !editor.state.doc.eq(snapshot), savedContent: JSON.stringify(json) }))
      notify(result.warning ?? `Salvo · ${result.title}`)
      await refresh()
      return true
    } catch (error) { notify(`Não foi possível salvar: ${errorMessage(error)}`); return false }
    finally { saving.current.delete(id) }
  }, [])

  const mayDiscard = useCallback(async (note: Note): Promise<boolean> => {
    const { preferences, ask } = current.current
    if (!preferences.askBeforeDiscard || !note.dirty) return true
    const choice = await ask({ title: 'Salvar antes de fechar?', message: `“${note.title}” tem alterações não salvas. Ao descartar, o texto não poderá ser recuperado.`, choices: [{ id: 'cancel', label: 'Cancelar' }, { id: 'discard', label: 'Descartar', danger: true }, { id: 'save', label: 'Salvar', primary: true }] })
    return choice === 'discard' || (choice === 'save' && await saveNote(note.id))
  }, [saveNote])
  return { openPath, openDocument, saveNote, mayDiscard }
}
