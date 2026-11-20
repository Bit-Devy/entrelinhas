import { useState } from 'react'

export default function App() {
  const [text, setText] = useState('')
  return <main className="initial-shell">
    <header data-tauri-drag-region><strong>Entre Linhas</strong><span>Um espaço para escrever.</span></header>
    <textarea aria-label="Editor de texto" autoFocus placeholder="Comece a escrever…" value={text} onChange={event => setText(event.target.value)} />
    <footer>Rascunho · salvamento manual</footer>
  </main>
}
