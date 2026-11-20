import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ArrowUp, ArrowDown, X } from 'lucide-react'
import { findMatches, searchKey } from '../editor/search'
import { IconButton } from './ui'

export function FindBar({ editor, replace, onClose }: { editor: Editor; replace: boolean; onClose: () => void }) {
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState(''), [caseSensitive, setCaseSensitive] = useState(false)
  const [current, setCurrent] = useState(0), [, refresh] = useState(0)
  const matches = findMatches(editor.state.doc, query, caseSensitive)
  useEffect(() => {
    editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, caseSensitive }))
    setCurrent(0)
    return () => { if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query: '', caseSensitive: false })) }
  }, [editor, query, caseSensitive])
  useEffect(() => {
    const update = () => refresh(value => value + 1)
    editor.on('update', update)
    return () => { editor.off('update', update) }
  }, [editor])
  const navigate = (direction: number) => {
    if (!matches.length) return
    const index = (current + direction + matches.length) % matches.length
    setCurrent(index)
    editor.chain().setTextSelection(matches[index]).scrollIntoView().run()
  }
  const replaceOne = () => {
    const match = matches[Math.min(current, matches.length - 1)]
    if (!match) return
    editor.chain().insertContentAt(match, replacement ? { type: 'text', text: replacement } : '').run()
  }
  const replaceAll = () => {
    let transaction = editor.state.tr
    for (const match of [...matches].reverse()) {
      transaction = replacement ? transaction.insertText(replacement, match.from, match.to) : transaction.delete(match.from, match.to)
    }
    editor.view.dispatch(transaction)
  }
  return <div className="find-bar chrome" role="search" aria-label="Pesquisa no documento">
    <div className="find-row"><input autoFocus aria-label="Localizar no texto" placeholder="Localizar no texto…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); navigate(event.shiftKey ? -1 : 1) } }} /><span className="match-count">{matches.length ? `${Math.min(current + 1, matches.length)} de ${matches.length}` : '0 resultados'}</span><IconButton label="Resultado anterior" onClick={() => navigate(-1)}><ArrowUp size={15} /></IconButton><IconButton label="Próximo resultado" onClick={() => navigate(1)}><ArrowDown size={15} /></IconButton><IconButton label="Fechar pesquisa" onClick={onClose}><X size={15} /></IconButton></div>
    <label className="small-check"><input type="checkbox" checked={caseSensitive} onChange={event => setCaseSensitive(event.target.checked)} />Diferenciar maiúsculas</label>
    {replace && <div className="find-row"><input aria-label="Substituir por" placeholder="Substituir por…" value={replacement} onChange={event => setReplacement(event.target.value)} /><button onClick={replaceOne} disabled={!matches.length}>Substituir</button><button onClick={replaceAll} disabled={!matches.length}>Todas</button></div>}
  </div>
}
