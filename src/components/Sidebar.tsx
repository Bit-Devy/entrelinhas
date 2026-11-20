import { useRef, useState, type CSSProperties } from 'react'
import {
  Plus,
  PanelLeftClose,
  FolderOpen,
  Search,
  Settings as Gear,
  BookOpen,
  ChevronRight,
  MoreHorizontal,
  FileText,
  Folder,
  Pencil,
  ArrowUp,
  ArrowDown,
  Trash2,
  Link2,
  Unlink,
  MapPin,
} from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import type { Preferences, Project, RegisteredDocument } from '../core/types'
import { backend, errorMessage } from '../native/api'
import { moveItem } from '../core/notes'
import type { AskDialog } from './useDialog'
import { ProjectAssignment } from './ProjectAssignment'
import { IconButton, Modal } from './ui'

interface Props {
  preferences: Preferences
  projects: Project[]
  documents: RegisteredDocument[]
  activePath: string | null
  newNote: (projectId?: string | null) => void
  openDocument: () => void
  openPath: (path: string) => Promise<boolean>
  settings: () => void
  search: () => void
  changePreferences: (change: Partial<Preferences>) => void
  refresh: () => Promise<void>
  notify: (message: string) => void
  ask: AskDialog
  onDeletedProject: (id: string) => void
  onAssociate: (path: string, projectId: string | null) => void
}

export function Sidebar(p: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Project | null>(null)
  const [context, setContext] = useState<string | null>(null)
  const [documentMenu, setDocumentMenu] = useState<string | null>(null)
  const [projectName, setProjectName] = useState(''),
    [projectColor, setProjectColor] = useState('#768c66'),
    [projectIcon, setProjectIcon] = useState('')
  const dragged = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (operation: () => Promise<void>) => {
    try {
      await operation()
      await p.refresh()
    } catch (error) {
      p.notify(errorMessage(error))
    }
  }
  const edit = (project?: Project) => {
    const next = project ?? {
      id: crypto.randomUUID(),
      name: '',
      color: '#768c66',
      icon: '',
      position: p.projects.length,
    }
    setEditing(next)
    setProjectName(next.name)
    setProjectColor(next.color)
    setProjectIcon(next.icon)
    setContext(null)
  }
  const remove = async (project: Project) => {
    setContext(null)
    const choice = await p.ask({
      title: `Excluir “${project.name}”?`,
      message:
        'O projeto será removido da organização. Todos os documentos e suas imagens permanecerão nos locais originais.',
      choices: [
        { id: 'cancel', label: 'Cancelar' },
        { id: 'delete', label: 'Excluir projeto', danger: true },
      ],
    })
    if (choice === 'delete')
      await run(async () => {
        await backend.deleteProject(project.id)
        p.onDeletedProject(project.id)
      })
  }
  const attach = async (project: Project) => {
    setContext(null)
    try {
      const files = await open({
        title: `Associar a ${project.name}`,
        multiple: true,
        filters: [{ name: 'Documentos', extensions: ['md', 'markdown', 'txt'] }],
      })
      for (const path of Array.isArray(files) ? files : files ? [files] : []) {
        const read = await backend.read(path)
        await backend.associate(read.path, project.id)
        p.onAssociate(read.path, project.id)
      }
      setExpanded((current) => new Set([...current, project.id]))
      await p.refresh()
    } catch (error) {
      p.notify(errorMessage(error))
    }
  }
  const relocate = async (document: RegisteredDocument) => {
    setDocumentMenu(null)
    try {
      const path = await open({
        title: `Localizar novamente: ${document.title}`,
        filters: [{ name: 'Documentos', extensions: ['md', 'markdown', 'txt'] }],
      })
      if (typeof path === 'string') {
        await backend.relocate(document.path, path)
        await p.refresh()
        p.notify('Caminho atualizado. Abra o documento para continuar.')
      }
    } catch (error) {
      p.notify(errorMessage(error))
    }
  }
  const reorder = (id: string, direction: number) => {
    setContext(null)
    const index = p.projects.findIndex((project) => project.id === id)
    const ordered = moveItem(p.projects, index, index + direction)
    void run(() => backend.reorder(ordered.map((project) => project.id)))
  }
  const documentItem = (document: RegisteredDocument) => (
    <div
      key={document.path}
      className={`tree-document ${p.activePath === document.path ? 'active' : ''}`}
    >
      <button
        className="document-entry"
        title={document.path}
        onClick={() => void p.openPath(document.path)}
      >
        <FileText size={13} />
        <span>{document.title}</span>
      </button>
      <IconButton
        label={`Opções de ${document.title}`}
        onClick={() =>
          setDocumentMenu((current) => (current === document.path ? null : document.path))
        }
      >
        <MoreHorizontal size={14} />
      </IconButton>
      {documentMenu === document.path && (
        <div className="tree-menu">
          <ProjectAssignment
            label={`Projeto de ${document.title}`}
            projects={p.projects}
            value={document.projectId}
            onChange={async (projectId) => {
              await backend.associate(document.path, projectId)
              p.onAssociate(document.path, projectId)
              await p.refresh()
              setDocumentMenu(null)
            }}
          />
          <button onClick={() => void relocate(document)}>
            <MapPin size={13} />
            Localizar novamente
          </button>
          <button
            onClick={() => {
              setDocumentMenu(null)
              void run(async () => {
                await backend.forget(document.path)
                p.onAssociate(document.path, null)
              })
            }}
          >
            <Unlink size={13} />
            Remover da biblioteca
          </button>
          <small>O arquivo no disco será preservado.</small>
        </div>
      )}
    </div>
  )

  return (
    <aside className="sidebar chrome" aria-label="Navegação">
      <div className="sidebar-heading">
        <span>SEU ESPAÇO</span>
        <IconButton
          label="Ocultar navegação"
          onClick={() => p.changePreferences({ sidebarVisible: false })}
        >
          <PanelLeftClose size={16} />
        </IconButton>
      </div>
      <button className="nav-button primary-nav" onClick={() => p.newNote()}>
        <Plus size={17} />
        <span>Nova nota</span>
        <kbd>{p.preferences.shortcuts.new}</kbd>
      </button>
      <button className="nav-button" onClick={p.openDocument}>
        <FolderOpen size={16} />
        <span>Abrir documento</span>
        <kbd>{p.preferences.shortcuts.open}</kbd>
      </button>
      <button className="nav-button" onClick={p.search}>
        <Search size={16} />
        <span>Buscar documentos</span>
      </button>
      <div className="section-heading">
        <span>PROJETOS</span>
        <IconButton label="Criar projeto" onClick={() => edit()}>
          <Plus size={14} />
        </IconButton>
      </div>
      <div className="library-tree">
        {!p.projects.length && (
          <button className="empty-projects create-first-project" onClick={() => edit()}>
            <BookOpen size={23} strokeWidth={1.3} />
            <p>
              Ideias ganham espaço.
              <br />
              <span>Crie seu primeiro projeto.</span>
            </p>
          </button>
        )}
        {p.projects.map((project) => (
          <div
            className="project-group"
            key={project.id}
            draggable
            onDragStart={() => {
              dragged.current = project.id
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const ordered = moveItem(
                p.projects,
                p.projects.findIndex((item) => item.id === dragged.current),
                p.projects.findIndex((item) => item.id === project.id),
              )
              dragged.current = null
              void run(() => backend.reorder(ordered.map((project) => project.id)))
            }}
          >
            <div className="project-row">
              <button
                className="project-toggle"
                aria-expanded={expanded.has(project.id)}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current)
                    if (next.has(project.id)) next.delete(project.id)
                    else next.add(project.id)
                    return next
                  })
                }
              >
                <ChevronRight className={expanded.has(project.id) ? 'expanded' : ''} size={12} />
                <span
                  className="project-icon"
                  style={{ '--project-color': project.color } as CSSProperties}
                >
                  {project.icon || <Folder size={15} />}
                </span>
                <span className="project-name">{project.name}</span>
                <span className="project-count">
                  {p.documents.filter((document) => document.projectId === project.id).length}
                </span>
              </button>
              <IconButton
                label={`Opções do projeto ${project.name}`}
                onClick={() =>
                  setContext((current) => (current === project.id ? null : project.id))
                }
              >
                <MoreHorizontal size={15} />
              </IconButton>
            </div>
            {context === project.id && (
              <div className="tree-menu">
                <button
                  onClick={() => {
                    p.newNote(project.id)
                    setContext(null)
                  }}
                >
                  <Plus size={13} />
                  Nova nota neste projeto
                </button>
                <button onClick={() => void attach(project)}>
                  <Link2 size={13} />
                  Associar arquivo existente
                </button>
                <button onClick={() => edit(project)}>
                  <Pencil size={13} />
                  Editar projeto
                </button>
                <button onClick={() => reorder(project.id, -1)}>
                  <ArrowUp size={13} />
                  Mover para cima
                </button>
                <button onClick={() => reorder(project.id, 1)}>
                  <ArrowDown size={13} />
                  Mover para baixo
                </button>
                <button className="danger" onClick={() => void remove(project)}>
                  <Trash2 size={13} />
                  Excluir projeto
                </button>
              </div>
            )}
            {expanded.has(project.id) && (
              <div className="project-documents">
                {p.documents
                  .filter((document) => document.projectId === project.id)
                  .map(documentItem)}
                <button className="new-project-note" onClick={() => p.newNote(project.id)}>
                  <Plus size={12} />
                  Nova nota
                </button>
              </div>
            )}
          </div>
        ))}
        {p.documents.some((document) => !document.projectId) && (
          <>
            <div className="section-heading independent-heading">
              <span>SEM PROJETO</span>
            </div>
            {p.documents.filter((document) => !document.projectId).map(documentItem)}
          </>
        )}
      </div>
      <div className="sidebar-bottom">
        <div className="local-indicator">
          <span />
          Seu espaço é local.
        </div>
        <button className="nav-button" aria-label="Configurações" onClick={p.settings}>
          <Gear size={17} />
          <span>Configurações</span>
        </button>
      </div>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="Largura da navegação"
        aria-orientation="vertical"
        tabIndex={0}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight'].includes(event.key))
            p.changePreferences({
              sidebarWidth: Math.min(
                380,
                Math.max(200, p.preferences.sidebarWidth + (event.key === 'ArrowRight' ? 10 : -10)),
              ),
            })
        }}
        onPointerDown={(event) => {
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const start = event.clientX,
            width = p.preferences.sidebarWidth
          const move = (moveEvent: PointerEvent) =>
            p.changePreferences({
              sidebarWidth: Math.max(
                200,
                Math.min(
                  380,
                  width +
                    (moveEvent.clientX - start) * (p.preferences.sidebarSide === 'left' ? 1 : -1),
                ),
              ),
            })
          const end = () => {
            target.removeEventListener('pointermove', move)
            target.removeEventListener('pointerup', end)
            target.removeEventListener('pointercancel', end)
          }
          target.addEventListener('pointermove', move)
          target.addEventListener('pointerup', end)
          target.addEventListener('pointercancel', end)
        }}
      />
      {editing && (
        <Modal
          title={
            p.projects.some((project) => project.id === editing.id)
              ? 'Editar projeto'
              : 'Novo projeto'
          }
          onClose={() => setEditing(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              try {
                await backend.project({
                  ...editing,
                  name: projectName.trim(),
                  color: projectColor,
                  icon: projectIcon,
                })
                setExpanded((current) => new Set([...current, editing.id]))
                await p.refresh()
                setEditing(null)
              } catch (error) {
                p.notify(errorMessage(error))
              } finally {
                setBusy(false)
              }
            }}
          >
            <label>
              Nome
              <input
                autoFocus
                required
                maxLength={120}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Um novo espaço de ideias"
              />
            </label>
            <div className="project-customization">
              <label>
                Cor
                <input
                  aria-label="Cor do projeto"
                  type="color"
                  value={projectColor}
                  onChange={(event) => setProjectColor(event.target.value)}
                />
              </label>
              <label>
                Ícone opcional
                <input
                  aria-label="Ícone do projeto"
                  value={projectIcon}
                  onChange={(event) => setProjectIcon([...event.target.value].slice(0, 4).join(''))}
                  placeholder="Ex.: 📖"
                />
              </label>
            </div>
            <p className="muted small">
              Projetos organizam referências. Seus documentos podem ficar em qualquer pasta.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busy || !projectName.trim()}>
                {busy ? 'Salvando…' : 'Salvar projeto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  )
}
