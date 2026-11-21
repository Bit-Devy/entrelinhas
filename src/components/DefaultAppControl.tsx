import { useEffect, useState } from 'react'
import { Check, FileText } from 'lucide-react'
import { backend, errorCode, errorMessage, type DefaultAppStatus } from '../native/api'

export function DefaultAppControl({ onComplete }: { onComplete?: () => void }) {
  const [status, setStatus] = useState<DefaultAppStatus | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    backend.defaultAppStatus().then(
      (value) => {
        if (active) {
          setStatus(value)
          setBusy(false)
        }
      },
      (reason) => {
        if (active) {
          setError(
            errorCode(reason) === 'desktop'
              ? 'Esta opção está disponível no aplicativo instalado.'
              : errorMessage(reason),
          )
          setBusy(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [])

  const complete = !!status?.markdown && !!status.text
  const apply = async () => {
    if (complete) {
      onComplete?.()
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await backend.setDefaultApp()
      setStatus(result)
      if (result.markdown && result.text) onComplete?.()
      else setError('O sistema ainda não confirmou a alteração. Tente novamente.')
    } catch (reason) {
      setError(errorMessage(reason))
      // Uma recusa do sistema pode acontecer após alterar somente um dos tipos.
      try {
        setStatus(await backend.defaultAppStatus())
      } catch {
        /* Mantém o erro original. */
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="default-app" aria-label="Aplicativo padrão" aria-busy={busy}>
      <h4>Aplicativo padrão</h4>
      <p className="muted">Abra seus arquivos Markdown e de texto direto no Entrelinhas.</p>
      <ul className="default-app-types">
        {[
          { label: 'Markdown', extensions: '.md · .markdown', active: status?.markdown },
          { label: 'Texto simples', extensions: '.txt', active: status?.text },
        ].map((item) => (
          <li key={item.label}>
            <FileText size={18} aria-hidden="true" />
            <span>
              <strong>{item.label}</strong>
              <small>{item.extensions}</small>
            </span>
            <span className={item.active ? 'default-app-current' : 'muted'}>
              {item.active ? (
                <>
                  <Check size={14} aria-hidden="true" /> É o padrão
                </>
              ) : busy ? (
                'Verificando…'
              ) : (
                'Opcional'
              )}
            </span>
          </li>
        ))}
      </ul>
      {status && !status.supported && (
        <p className="muted small">
          Escolha o Entrelinhas nas configurações de aplicativos padrão do sistema.
        </p>
      )}
      {status?.supported && !status.registered && (
        <p className="muted small">Instale ou atualize o Entrelinhas para habilitar esta opção.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="default-app-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !status?.supported || !status.registered || (complete && !onComplete)}
          onClick={() => void apply()}
        >
          {busy
            ? 'Verificando…'
            : complete
              ? onComplete
                ? 'Começar a escrever'
                : 'Já é o padrão'
              : 'Usar como padrão'}
        </button>
      </div>
      <p className="muted small">
        Você pode mudar essa escolha depois, em “Abrir com” no explorador de arquivos.
      </p>
    </section>
  )
}
