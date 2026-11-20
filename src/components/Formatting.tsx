import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListTodo, Quote, Code2, Link, ImagePlus, Minus, Highlighter, Table2, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2 } from 'lucide-react'
import { IconButton } from './ui'

export function Formatting({ editor, insertImage, insertLink, compact = false }: { editor: Editor; insertImage: () => void; insertLink: () => void; compact?: boolean }) {
  const [, update] = useState(0)
  useEffect(() => {
    const refresh = () => update(value => value + 1)
    editor.on('transaction', refresh)
    return () => { editor.off('transaction', refresh) }
  }, [editor])
  const tools = [
    { label: 'Negrito (Ctrl+B)', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Itálico (Ctrl+I)', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Sublinhado (Ctrl+U)', icon: Underline, active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
    { label: 'Tachado', icon: Strikethrough, active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Destaque', icon: Highlighter, active: editor.isActive('highlight'), run: () => editor.chain().focus().toggleHighlight({ color: '#d4b66a66' }).run() },
  ]
  return <div className={`formatting ${compact ? 'compact' : ''}`} role="toolbar" aria-label="Formatação" onMouseDown={event => { if ((event.target as HTMLElement).closest('button')) event.preventDefault() }}>
    <select aria-label="Estilo do parágrafo" value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p'} onChange={event => {
      const level = Number(event.target.value) as 1 | 2 | 3
      if (event.target.value === 'p') editor.chain().focus().setParagraph().run()
      else editor.chain().focus().toggleHeading({ level }).run()
    }}><option value="p">Texto</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option></select>
    <span className="tool-divider" />
    {tools.map(tool => <IconButton key={tool.label} label={tool.label} aria-pressed={tool.active} onClick={tool.run}><tool.icon size={16} /></IconButton>)}
    {!compact && <>
      <label className="color-tool" title="Cor do texto"><span>A</span><input type="color" aria-label="Cor do texto" value={editor.getAttributes('textStyle').color || '#61755b'} onChange={event => editor.chain().focus().setColor(event.target.value).run()} /></label>
      <select aria-label="Tamanho do texto selecionado" value={editor.getAttributes('textStyle').fontSize || ''} onChange={event => event.target.value ? editor.chain().focus().setFontSize(event.target.value).run() : editor.chain().focus().unsetFontSize().run()}><option value="">Tamanho</option>{[12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map(size => <option key={size} value={`${size}px`}>{size}</option>)}</select>
      <span className="tool-divider" />
      <IconButton label="Lista com marcadores" aria-pressed={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></IconButton>
      <IconButton label="Lista numerada" aria-pressed={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></IconButton>
      <IconButton label="Checklist" aria-pressed={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo size={16} /></IconButton>
      <IconButton label="Citação" aria-pressed={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></IconButton>
      <IconButton label="Bloco de código" aria-pressed={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={16} /></IconButton>
      <IconButton label="Alinhar à esquerda" onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={16} /></IconButton>
      <IconButton label="Centralizar" onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={16} /></IconButton>
      <IconButton label="Alinhar à direita" onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={16} /></IconButton>
      <IconButton label="Inserir separador" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></IconButton>
    </>}
    <IconButton label="Inserir link" onClick={insertLink}><Link size={16} /></IconButton>
    {!compact && <>
      <IconButton label="Inserir imagem" onClick={insertImage}><ImagePlus size={16} /></IconButton>
      <IconButton label="Inserir tabela" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></IconButton>
      {editor.isActive('table') && <select aria-label="Editar tabela" value="" onChange={event => {
        const commands = editor.chain().focus()
        if (event.target.value === 'row') commands.addRowAfter().run()
        if (event.target.value === 'column') commands.addColumnAfter().run()
        if (event.target.value === 'delete-row') commands.deleteRow().run()
        if (event.target.value === 'delete-column') commands.deleteColumn().run()
        if (event.target.value === 'delete') commands.deleteTable().run()
      }}><option value="">Tabela</option><option value="row">Adicionar linha</option><option value="column">Adicionar coluna</option><option value="delete-row">Remover linha</option><option value="delete-column">Remover coluna</option><option value="delete">Remover tabela</option></select>}
      <span className="tool-divider" />
      <IconButton label="Desfazer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></IconButton>
      <IconButton label="Refazer (Ctrl+Shift+Z)" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></IconButton>
    </>}
  </div>
}
