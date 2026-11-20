import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'
import type { Note } from '../core/types'
import { IconButton } from './ui'

export function Titlebar({
  note,
  onRename,
  onError,
}: {
  note: Note
  onRename: () => void
  onError: (message: string) => void
}) {
  const run = (action: 'minimize' | 'toggleMaximize' | 'close') => {
    if (isTauri())
      void getCurrentWindow()
        [action]()
        .catch((error) => onError(String(error)))
  }
  return (
    <header className="titlebar chrome" data-tauri-drag-region="deep">
      <div className="brand">
        <span>Entrelinhas</span>
      </div>
      <button
        type="button"
        className="window-title"
        aria-label="Editar título do documento"
        data-tooltip="Editar título"
        data-shortcut="Duplo clique"
        onDoubleClick={(event) => {
          event.stopPropagation()
          onRename()
        }}
        onClick={(event) => {
          if (event.detail === 0) onRename()
        }}
      >
        {note.title}
        <span> · {note.format.toUpperCase()}</span>
      </button>
      <div className="window-controls">
        <IconButton label="Minimizar" onClick={() => run('minimize')}>
          <Minus size={14} />
        </IconButton>
        <IconButton label="Maximizar ou restaurar" onClick={() => run('toggleMaximize')}>
          <Square size={11} />
        </IconButton>
        <IconButton label="Fechar aplicativo" onClick={() => run('close')}>
          <X size={16} />
        </IconButton>
      </div>
    </header>
  )
}
