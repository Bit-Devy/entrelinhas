import { useEffect, useRef, useState } from 'react'
import type { Theme } from '../core/types'
import { AppIcon } from './AppIcon'
import { DefaultAppControl } from './DefaultAppControl'
import { ThemeChoices } from './ThemeChoices'
import { Modal } from './ui'

export function WelcomeTheme({
  theme,
  onThemeChange,
  onComplete,
}: {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onComplete: () => void
}) {
  const [step, setStep] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [step])
  return (
    <Modal
      title="Bem-vindo ao Entrelinhas"
      className="welcome-modal"
      dismissible={false}
      onClose={() => {}}
    >
      <ol className="welcome-steps" aria-label="Etapas da apresentação">
        {['Boas-vindas', 'Seu tema', 'Seus arquivos'].map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined}>
            <span aria-hidden="true">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="welcome-body">
        {step === 0 && (
          <>
            <AppIcon />
            <h3 ref={heading} tabIndex={-1}>
              Um espaço para suas palavras.
            </h3>
            <p className="muted">
              Bem-vindo ao Entrelinhas. Escreva, organize suas ideias e encontre seu ritmo.
            </p>
            <div className="welcome-note">
              <span>Seu texto, seu tempo.</span>
              <p>
                Seus documentos ficam no seu computador.
                <br />
                Você escolhe quando e onde salvar.
              </p>
            </div>
            <p className="welcome-footnote">Vamos preparar seu espaço em três pequenos passos.</p>
          </>
        )}
        {step === 1 && (
          <>
            <h3 ref={heading} tabIndex={-1}>
              Seu espaço, sua luz.
            </h3>
            <p className="muted">Escolha a atmosfera que acompanha sua escrita.</p>
            <ThemeChoices value={theme} onChange={onThemeChange} welcome />
            <p className="welcome-footnote">
              Você pode mudar o tema a qualquer momento nas configurações.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h3 ref={heading} tabIndex={-1}>
              Suas ideias, a um clique.
            </h3>
            <p className="muted">Quer abrir seus documentos aqui por padrão?</p>
            <DefaultAppControl onComplete={onComplete} />
            <p className="welcome-footnote">
              A escolha é sua. Esta opção também fica em Configurações → Arquivos.
            </p>
          </>
        )}
      </div>
      <footer className="welcome-actions">
        <span className="muted small" aria-live="polite">
          Etapa {step + 1} de 3
        </span>
        <div>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              Voltar
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (step === 1) onThemeChange(theme)
                setStep(step + 1)
              }}
            >
              Continuar
            </button>
          ) : (
            <button type="button" onClick={onComplete}>
              Agora não
            </button>
          )}
        </div>
      </footer>
    </Modal>
  )
}
