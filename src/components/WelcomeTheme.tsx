import type { Theme } from '../core/types'
import { AppIcon } from './AppIcon'
import { ThemeChoices } from './ThemeChoices'
import { Modal } from './ui'

export function WelcomeTheme({ onChoose }: { onChoose: (theme: Theme) => void }) {
  return (
    <Modal
      title="Bem-vindo ao Entrelinhas"
      className="welcome-modal"
      dismissible={false}
      onClose={() => {}}
    >
      <div className="welcome-body">
        <AppIcon />
        <h3>Como você quer começar?</h3>
        <p className="muted">Escolha a luz da sua primeira página.</p>
        <ThemeChoices value={null} onChange={onChoose} welcome />
        <p className="welcome-footnote">
          Você pode mudar o tema a qualquer momento nas configurações.
        </p>
      </div>
    </Modal>
  )
}
