import { useState } from 'react'
import type { Note } from '../core/types'
import { documentTitle, editableTitle } from '../core/titles'
import { errorMessage } from '../native/api'
import { Modal } from './ui'

export function RenameDocument({
  note,
  onRename,
  onClose,
}: {
  note: Note
  onRename: (title: string) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState(() => editableTitle(note.title))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal title="Editar título" onClose={onClose} dismissible={!busy}>
      <form
        className="modal-body"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            await onRename(documentTitle(title))
            onClose()
          } catch (error) {
            setError(errorMessage(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Título do documento
          <input
            autoFocus
            aria-label="Título do documento"
            value={title}
            maxLength={120}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
          />
        </label>
        <p className="muted small">
          {note.path
            ? 'O arquivo será renomeado na mesma pasta, mantendo a extensão e o conteúdo salvo.'
            : 'Este será o nome sugerido quando você salvar a nota.'}
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy || !title.trim()}>
            {busy ? 'Aplicando…' : note.path ? 'Renomear arquivo' : 'Usar título'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
