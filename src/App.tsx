import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Editor } from '@tiptap/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import {
  FolderOpen,
  Save,
  Plus,
  X,
  Minus,
  Square,
  PanelLeftOpen,
  Settings2,
  Search,
  FileText,
  ChevronDown,
  Maximize2,
  SlidersHorizontal,
  Keyboard,
  Focus,
  Check,
} from 'lucide-react'
import { createNote, countText, moveItem, updateNote } from './core/notes'
import { defaultPreferences, readPreferences } from './core/preferences'
import { shortcutAction } from './core/shortcuts'
import type { Note, Preferences, RegisteredDocument, Project } from './core/types'
import { backend, errorMessage } from './native/api'
import { useDocuments } from './documents/useDocuments'
import { useDialog } from './components/useDialog'
import { open as openNative } from '@tauri-apps/plugin-dialog'
import { EditorPane } from './editor/EditorPane'
import { Formatting } from './components/Formatting'
import { WindowResize } from './native/WindowResize'
import { Sidebar } from './components/Sidebar'
import { LibrarySearch } from './components/LibrarySearch'
import { FindBar } from './components/FindBar'
import { Settings } from './components/Settings'
import { IconButton, Modal } from './components/ui'

export default function App() {
  const [preferences, setPreferences] = useState<Preferences>(() =>
    structuredClone(defaultPreferences),
  )
  const [notes, setNotes] = useState<Note[]>(() => [createNote()])
  const [documents, setDocuments] = useState<RegisteredDocument[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const preferencesQueue = useRef<Promise<void>>(Promise.resolve())
  const dialog = useDialog()
  const [activeId, setActiveId] = useState(() => notes[0].id)
  const [immersive, setImmersive] = useState(false),
    [settings, setSettings] = useState(false)
  const [librarySearch, setLibrarySearch] = useState(false)
  const [toolbar, setToolbar] = useState(false),
    [menu, setMenu] = useState(false)
  const [find, setFind] = useState<'find' | 'replace' | null>(null)
  const [stats, setStats] = useState({ words: 0, characters: 0 })
  const [editorVersion, setEditorVersion] = useState(0)
  const [link, setLink] = useState<string | null>(null)
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null)
  const [notice, setNotice] = useState('')
  const editors = useRef(new Map<string, Editor>())
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dragged = useRef<string | null>(null)
  const activeNote = notes.find((note) => note.id === activeId) ?? notes[0]
  const activeEditor = editors.current.get(activeId)
  const onReady = useCallback((id: string, editor: Editor | null) => {
    if (editor) editors.current.set(id, editor)
    else editors.current.delete(id)
    setEditorVersion((value) => value + 1)
  }, [])
  void editorVersion
  useEffect(() => {
    if (!menu) return
    const frame = requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus(),
    )
    const outside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.document-menu-wrapper')) setMenu(false)
    }
    window.addEventListener('mousedown', outside)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousedown', outside)
    }
  }, [menu])
  const closeSettings = useCallback(() => setSettings(false), [])
  const newNote = useCallback(
    (projectId: string | null = null) => {
      const note = createNote(preferences.defaultFormat, projectId)
      setNotes((current) => [...current, note])
      setActiveId(note.id)
      setImmersive(false)
    },
    [preferences.defaultFormat],
  )
  const notify = useCallback((message: string) => setNotice(message), [])
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [notice])
  const refresh = useCallback(async () => {
    try {
      const library = await backend.library()
      setDocuments(library.documents)
      setProjects(library.projects)
    } catch (error) {
      notify(`Biblioteca indisponível: ${errorMessage(error)}`)
    }
  }, [notify])
  const fileOps = useDocuments({
    notes,
    setNotes,
    setActiveId,
    editors,
    preferences,
    documents,
    ask: dialog.ask,
    notify,
    refresh,
  })
  const closeNote = useCallback(
    async (id: string) => {
      await fileOps.waitForSaves()
      const note = notes.find((note) => note.id === id)
      if (!note || !(await fileOps.mayDiscard(note))) return
      const remaining = notes.filter((note) => note.id !== id)
      if (!remaining.length) {
        const blank = createNote(preferences.defaultFormat)
        setNotes([blank])
        setActiveId(blank.id)
      } else {
        setNotes(remaining)
        if (id === activeId)
          setActiveId(remaining[Math.max(0, notes.findIndex((note) => note.id === id) - 1)].id)
      }
    },
    [notes, activeId, preferences.defaultFormat, fileOps.mayDiscard, fileOps.waitForSaves],
  )
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    void backend
      .library()
      .then((library) => {
        if (cancelled) return
        const loaded = readPreferences(library.preferences)
        setPreferences(loaded)
        setProjects(library.projects)
        setDocuments(library.documents)
        setNotes((current) =>
          current.map((note) =>
            !note.path && !note.dirty ? { ...note, format: loaded.defaultFormat } : note,
          ),
        )
        setPreferencesLoaded(true)
      })
      .catch((error) => notify(`Não foi possível ler as preferências: ${errorMessage(error)}`))
    return () => {
      cancelled = true
    }
  }, [notify])
  useEffect(() => {
    if (!preferencesLoaded) return
    preferencesQueue.current = preferencesQueue.current
      .catch(() => {})
      .then(() => backend.preferences(preferences))
      .catch((error) => notify(`Não foi possível guardar as preferências: ${errorMessage(error)}`))
  }, [preferences, preferencesLoaded, notify])
  const lifecycle = useRef({
    notes,
    mayDiscard: fileOps.mayDiscard,
    waitForSaves: fileOps.waitForSaves,
  })
  lifecycle.current = { notes, mayDiscard: fileOps.mayDiscard, waitForSaves: fileOps.waitForSaves }
  useEffect(() => {
    if (!isTauri()) return
    let closing = false
    const unsubscribe = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault()
      if (closing) return
      closing = true
      try {
        await lifecycle.current.waitForSaves()
        for (const note of lifecycle.current.notes) {
          setImmersive(false)
          if (!(await lifecycle.current.mayDiscard(note))) return
        }
        await preferencesQueue.current
        await getCurrentWindow().destroy()
      } catch (error) {
        notify(errorMessage(error))
      } finally {
        closing = false
      }
    })
    return () => {
      void unsubscribe.then((fn) => fn())
    }
  }, [notify])
  const chooseImage = useCallback(async () => {
    const editor = editors.current.get(activeId)
    if (!editor) return
    try {
      const selected = await openNative({
        title: 'Inserir imagem',
        multiple: true,
        filters: [
          { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] },
        ],
      })
      for (const path of Array.isArray(selected) ? selected : selected ? [selected] : []) {
        const src = await backend.importImage(path)
        editor
          .chain()
          .focus()
          .setImage({ src, alt: path.split('/').pop() ?? '' })
          .run()
      }
    } catch (error) {
      notify(errorMessage(error))
    }
  }, [activeId, notify])
  const insertImages = useCallback(
    async (files: File[], editor: Editor) => {
      for (const file of files) {
        if (
          ![
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
            'image/avif',
            'image/bmp',
          ].includes(file.type)
        ) {
          notify('Use uma imagem PNG, JPEG, GIF, WebP, AVIF ou BMP.')
          continue
        }
        if (file.size > 20 * 1024 * 1024) {
          notify('A imagem excede o limite de 20 MB.')
          continue
        }
        const reader = new FileReader()
        reader.onload = () => {
          if (!editor.isDestroyed)
            editor
              .chain()
              .focus()
              .setImage({ src: String(reader.result), alt: file.name })
              .run()
        }
        reader.onerror = () => notify('Não foi possível ler a imagem.')
        reader.readAsDataURL(file)
      }
    },
    [notify],
  )
  const onStats = useCallback((text: string) => setStats(countText(text)), [])
  const onChange = useCallback(
    (id: string) =>
      setNotes((current) =>
        current.find((note) => note.id === id)?.dirty
          ? current
          : updateNote(current, id, { dirty: true }),
      ),
    [],
  )
  const onTyping = useCallback(() => {
    if (
      preferences.autoImmersive &&
      !settings &&
      !find &&
      !dialog.visible &&
      !librarySearch &&
      link === null
    ) {
      setImmersive(true)
      setMenu(false)
      setSelectionRect(null)
    }
  }, [preferences.autoImmersive, settings, find, link, dialog.visible, librarySearch])
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    document.documentElement.style.colorScheme = preferences.theme === 'light' ? 'light' : 'dark'
  }, [preferences.theme])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (event.key === 'Escape') {
        setImmersive(false)
        setMenu(false)
        setFind(null)
        setSelectionRect(null)
        return
      }
      if (event.key === 'F11') {
        event.preventDefault()
        if (isTauri())
          void getCurrentWindow()
            .isFullscreen()
            .then((full) => getCurrentWindow().setFullscreen(!full))
        return
      }
      if (
        settings ||
        dialog.visible ||
        librarySearch ||
        link !== null ||
        (event.target as HTMLElement).closest?.('[role=dialog]')
      )
        return
      if (event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setImmersive(false)
        setMenu((value) => !value)
        return
      }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        const index = notes.findIndex((note) => note.id === activeId)
        setActiveId(notes[(index + (event.shiftKey ? -1 : 1) + notes.length) % notes.length].id)
        return
      }
      if (event.ctrlKey && ['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault()
        setPreferences((current) => ({
          ...current,
          zoom:
            event.key === '0'
              ? 100
              : Math.min(200, Math.max(50, current.zoom + (event.key === '-' ? -10 : 10))),
        }))
        return
      }
      const action = shortcutAction(event, preferences)
      if (!action) return
      event.preventDefault()
      if (action === 'new') newNote()
      if (action === 'open') {
        setImmersive(false)
        void fileOps.openDocument()
      }
      if (action === 'save' || action === 'saveAs') {
        setImmersive(false)
        void fileOps.saveNote(activeId, action === 'saveAs')
      }
      if (action === 'close') closeNote(activeId)
      if (action === 'find' || action === 'replace') {
        setImmersive(false)
        setFind(action)
      }
      if (action === 'immersive') {
        setImmersive((value) => !value)
        editors.current.get(activeId)?.commands.focus()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [
    preferences,
    notes,
    activeId,
    settings,
    dialog.visible,
    librarySearch,
    link,
    newNote,
    closeNote,
    fileOps.openDocument,
    fileOps.saveNote,
  ])
  useEffect(() => {
    if (!immersive) return
    const move = (event: MouseEvent) => {
      const nearEdge =
        event.clientY < 12 ||
        (preferences.sidebarSide === 'left'
          ? event.clientX < 8
          : event.clientX > window.innerWidth - 8)
      if (nearEdge && !edgeTimer.current)
        edgeTimer.current = setTimeout(() => {
          setImmersive(false)
          edgeTimer.current = null
        }, 400)
      if (!nearEdge && edgeTimer.current) {
        clearTimeout(edgeTimer.current)
        edgeTimer.current = null
      }
    }
    window.addEventListener('mousemove', move)
    return () => {
      window.removeEventListener('mousemove', move)
      if (edgeTimer.current) clearTimeout(edgeTimer.current)
      edgeTimer.current = null
    }
  }, [immersive, preferences.sidebarSide])

  const style = {
    '--sidebar-width': `${preferences.sidebarVisible ? preferences.sidebarWidth : 0}px`,
    '--editor-width': `${preferences.editorWidth}px`,
    '--editor-font-size': `${(preferences.fontSize * preferences.zoom) / 100}px`,
    '--editor-line-height': preferences.lineHeight,
    '--editor-font':
      preferences.fontFamily === 'serif'
        ? "'Noto Serif', 'DejaVu Serif', Georgia, serif"
        : preferences.fontFamily === 'mono'
          ? "'Ubuntu Mono', 'DejaVu Sans Mono', monospace"
          : "'Ubuntu', 'Noto Sans', sans-serif",
  } as CSSProperties
  return (
    <div
      className={`app ${immersive ? 'immersive' : ''} sidebar-${preferences.sidebarSide} tabs-${preferences.tabsPosition} ${preferences.sidebarVisible ? '' : 'sidebar-hidden'}`}
      style={style}
    >
      <header className="titlebar chrome" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <div className="brand-symbol">
            <i />
            <i />
            <i />
            <b />
          </div>
          <span data-tauri-drag-region>Entre Linhas</span>
        </div>
        <div className="window-title" data-tauri-drag-region>
          {activeNote.title}
          <span> · {activeNote.format.toUpperCase()}</span>
        </div>
        <div className="window-controls">
          <IconButton
            label="Minimizar"
            onClick={() => isTauri() && void getCurrentWindow().minimize()}
          >
            <Minus size={14} />
          </IconButton>
          <IconButton
            label="Maximizar ou restaurar"
            onClick={() => isTauri() && void getCurrentWindow().toggleMaximize()}
          >
            <Square size={11} />
          </IconButton>
          <IconButton
            label="Fechar aplicativo"
            onClick={() => isTauri() && void getCurrentWindow().close()}
          >
            <X size={16} />
          </IconButton>
        </div>
      </header>
      <Sidebar
        preferences={preferences}
        projects={projects}
        documents={documents}
        activePath={activeNote.path}
        newNote={newNote}
        openDocument={() => void fileOps.openDocument()}
        openPath={fileOps.openPath}
        settings={() => {
          setSettings(true)
          setImmersive(false)
        }}
        search={() => {
          setLibrarySearch(true)
          setImmersive(false)
        }}
        changePreferences={(change) => setPreferences((current) => ({ ...current, ...change }))}
        refresh={refresh}
        notify={notify}
        ask={dialog.ask}
        onDeletedProject={(id) =>
          setNotes((current) =>
            current.map((note) => (note.projectId === id ? { ...note, projectId: null } : note)),
          )
        }
        onAssociate={(path, projectId) =>
          setNotes((current) =>
            current.map((note) => (note.path === path ? { ...note, projectId } : note)),
          )
        }
      />
      <section className="workspace">
        <div className="tabs chrome" role="tablist" aria-label="Documentos abertos">
          {!preferences.sidebarVisible && (
            <IconButton
              label="Mostrar navegação"
              onClick={() => setPreferences((current) => ({ ...current, sidebarVisible: true }))}
            >
              <PanelLeftOpen size={17} />
            </IconButton>
          )}
          {notes.map((note) => (
            <div
              key={note.id}
              className={`tab ${note.id === activeId ? 'active' : ''}`}
              role="tab"
              tabIndex={0}
              aria-selected={note.id === activeId}
              draggable
              onDragStart={() => {
                dragged.current = note.id
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                setNotes((current) =>
                  moveItem(
                    current,
                    current.findIndex((item) => item.id === dragged.current),
                    current.findIndex((item) => item.id === note.id),
                  ),
                )
                dragged.current = null
              }}
              onClick={() => {
                setActiveId(note.id)
                setSelectionRect(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setActiveId(note.id)
              }}
            >
              <FileText size={14} />
              <span>{note.title}</span>
              {note.dirty && <i className="dirty-dot" title="Alterações não salvas" />}
              <IconButton
                label={`Fechar ${note.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  closeNote(note.id)
                }}
              >
                <X size={13} />
              </IconButton>
            </div>
          ))}
          <IconButton label="Nova aba" onClick={() => newNote()}>
            <Plus size={16} />
          </IconButton>
        </div>
        <div className="document-area">
          <div className="document-toolbar chrome">
            <div className="document-menu-wrapper">
              <button
                className="document-menu"
                aria-expanded={menu}
                onClick={() => setMenu((value) => !value)}
              >
                <FileText size={15} />
                <span>{activeNote.path ? activeNote.title : 'Rascunho'}</span>
                <ChevronDown size={13} />
              </button>
              {menu && (
                <div
                  ref={menuRef}
                  className="dropdown"
                  role="menu"
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const items = [
                      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]'),
                    ]
                    const index = items.indexOf(document.activeElement as HTMLButtonElement)
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? items.length - 1
                          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                            items.length
                    items[next]?.focus()
                  }}
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      newNote()
                      setMenu(false)
                    }}
                  >
                    <Plus size={15} />
                    Nova nota<kbd>Ctrl N</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      void fileOps.openDocument()
                      setMenu(false)
                    }}
                  >
                    <FolderOpen size={15} />
                    Abrir documento<kbd>Ctrl O</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      void fileOps.saveNote(activeId)
                      setMenu(false)
                    }}
                  >
                    <Save size={15} />
                    Salvar<kbd>Ctrl S</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      void fileOps.saveNote(activeId, true)
                      setMenu(false)
                    }}
                  >
                    <Save size={15} />
                    Salvar como<kbd>Ctrl Shift S</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setFind('find')
                      setMenu(false)
                    }}
                  >
                    <Search size={15} />
                    Pesquisar<kbd>Ctrl F</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setSettings(true)
                      setMenu(false)
                    }}
                  >
                    <Settings2 size={15} />
                    Configurações
                  </button>
                </div>
              )}
            </div>
            <div className="document-actions">
              <select
                className="project-assignment"
                aria-label="Projeto do documento atual"
                value={activeNote.projectId ?? ''}
                onChange={(event) => {
                  const projectId = event.target.value || null
                  if (activeNote.path)
                    void backend
                      .associate(activeNote.path, projectId)
                      .then(async () => {
                        setNotes((current) => updateNote(current, activeId, { projectId }))
                        await refresh()
                      })
                      .catch((error) => notify(errorMessage(error)))
                  else setNotes((current) => updateNote(current, activeId, { projectId }))
                }}
              >
                <option value="">Sem projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <IconButton label="Salvar documento" onClick={() => void fileOps.saveNote(activeId)}>
                <Save size={16} />
              </IconButton>
              <IconButton
                label="Ferramentas de formatação"
                aria-pressed={toolbar}
                onClick={() => setToolbar((value) => !value)}
              >
                <SlidersHorizontal size={17} />
              </IconButton>
              <IconButton
                label="Modo imersivo (Ctrl+Shift+F)"
                onClick={() => {
                  setImmersive(true)
                  activeEditor?.commands.focus()
                }}
              >
                <Maximize2 size={16} />
              </IconButton>
            </div>
          </div>
          <div className="formatting-slot chrome">
            {toolbar && activeEditor && (
              <Formatting
                editor={activeEditor}
                insertImage={() => void chooseImage()}
                insertLink={() => setLink(activeEditor.getAttributes('link').href || '')}
              />
            )}
          </div>
          <div className="document-caption chrome">
            <span className="eyebrow">{activeNote.path ? 'DOCUMENTO' : 'UMA NOVA PÁGINA'}</span>
            <div className="caption-meta">
              <span className="small-line" />
              {activeNote.path ? 'Salve quando quiser.' : 'Sem pressa. Sem distrações.'}
            </div>
          </div>
          {notes.map((note) => (
            <EditorPane
              key={note.id}
              note={note}
              active={note.id === activeId}
              preferences={preferences}
              onReady={onReady}
              onChange={onChange}
              onTyping={onTyping}
              onImages={insertImages}
              onStats={note.id === activeId ? onStats : () => {}}
              onSelection={note.id === activeId ? setSelectionRect : () => {}}
            />
          ))}
          {find && activeEditor && (
            <FindBar
              editor={activeEditor}
              replace={find === 'replace'}
              onClose={() => {
                setFind(null)
                activeEditor.commands.focus()
              }}
            />
          )}
          <footer className="statusbar chrome">
            <span className="save-status">
              {activeNote.dirty ? (
                <>
                  <span className="unsaved-dot" />
                  Não salvo
                </>
              ) : (
                <>
                  <Check size={13} />
                  {activeNote.path ? 'Salvo' : 'Pronto para escrever'}
                </>
              )}
            </span>
            <span className="word-count">
              {stats.words.toLocaleString('pt-BR')} palavras<span className="status-dot">·</span>
              {stats.characters.toLocaleString('pt-BR')} caracteres
            </span>
            <div className="status-right">
              <button
                onClick={() =>
                  setPreferences((current) => ({
                    ...current,
                    zoom: current.zoom >= 150 ? 100 : current.zoom + 10,
                  }))
                }
                title="Zoom · Ctrl + / Ctrl -"
              >
                {preferences.zoom}%
              </button>
              <span>{activeNote.format.toUpperCase()}</span>
              <Focus size={13} />
            </div>
          </footer>
          {!activeNote.dirty && !activeNote.path && (
            <div className="writing-hint chrome">
              <Keyboard size={13} />
              <span>Comece a escrever. O resto desaparece.</span>
            </div>
          )}
        </div>
      </section>
      {librarySearch && (
        <LibrarySearch onClose={() => setLibrarySearch(false)} onOpen={fileOps.openPath} />
      )}
      {settings && (
        <Settings
          preferences={preferences}
          onChange={(change) => setPreferences((current) => ({ ...current, ...change }))}
          onClose={closeSettings}
        />
      )}
      {link !== null && (
        <Modal title="Inserir link" onClose={() => setLink(null)}>
          <form
            className="modal-body"
            onSubmit={(event) => {
              event.preventDefault()
              if (link && !/^(https?:\/\/|mailto:)/i.test(link)) {
                notify('Use um endereço https://, http:// ou mailto:.')
                return
              }
              if (link)
                activeEditor?.chain().focus().extendMarkRange('link').setLink({ href: link }).run()
              else activeEditor?.chain().focus().unsetLink().run()
              setLink(null)
            }}
          >
            <label>
              Endereço
              <input
                autoFocus
                type="text"
                placeholder="https://"
                value={link}
                onChange={(event) => setLink(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setLink(null)}>
                Cancelar
              </button>
              <button className="primary" type="submit">
                Aplicar
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog.element}
      {selectionRect &&
        preferences.selectionTools &&
        !immersive &&
        !settings &&
        !find &&
        !dialog.visible &&
        !librarySearch &&
        activeEditor && (
          <div
            className="selection-toolbar chrome"
            style={{
              top: Math.max(50, selectionRect.top - 52),
              left: Math.min(window.innerWidth - 420, Math.max(12, selectionRect.left)),
            }}
          >
            <Formatting
              editor={activeEditor}
              compact
              insertImage={() => void chooseImage()}
              insertLink={() => setLink(activeEditor.getAttributes('link').href || '')}
            />
          </div>
        )}
      <WindowResize onError={notify} />
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Dispensar aviso" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
