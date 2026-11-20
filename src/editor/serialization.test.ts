import { Editor } from '@tiptap/core'
import { editorExtensions } from './extensions'
import { markdownToHtml, parseDocument, serializeHtml, documentHtml } from './serialization'
import { textFromDocument } from '../core/notes'
import { findMatches } from './search'

describe('Markdown e texto simples', () => {
  it('lê títulos, Unicode, listas, links, citações e código', () => {
    const json = parseDocument(
      '# Olá 日本語\n\n**Forte** e *suave*\n\n- Grüß Gott\n\n> citação\n\n```ts\nconst a = 1\n```\n\n[site](https://example.com)',
      'md',
    )
    const out = serializeHtml(documentHtml(json)).content
    expect(out).toContain('# Olá 日本語')
    expect(out).toContain('**Forte**')
    expect(out).toContain('Grüß Gott')
    expect(out).toContain('```ts')
    expect(out).toContain('https://example.com')
  })
  it('preserva cores, tamanho, sublinhado, alinhamento, destaque e tabelas em um ciclo real', () => {
    const original =
      '<h2 style="text-align: center"><span style="color: #dd3344; font-size: 24px"><u><strong>Um título</strong></u></span></h2><p><mark data-color="#ffcc88" style="background-color: #ffcc88">Destaque</mark></p><table><tbody><tr><th><p>Nome</p></th></tr><tr><td><p>Olá</p></td></tr></tbody></table>'
    const first = parseDocument(original, 'md')
    const markdown = serializeHtml(documentHtml(first)).content
    const second = parseDocument(markdown, 'md')
    expect(documentHtml(second)).toBe(documentHtml(first))
  })
  it('lê checklists GFM e mantém o estado marcado depois de salvar', () => {
    const json = parseDocument('- [x] Feito\n- [ ] Pendente', 'md')
    expect(json.content?.[0].type).toBe('taskList')
    expect(json.content?.[0].content?.[0].attrs?.checked).toBe(true)
    expect(parseDocument(serializeHtml(documentHtml(json)).content, 'md')).toEqual(json)
  })
  it('não interpreta HTML ou Markdown em um arquivo TXT', () => {
    const json = parseDocument('<b>Olá</b>\n**Apenas texto**\n日本語 🌿', 'txt')
    expect(textFromDocument(json)).toBe('<b>Olá</b>\n**Apenas texto**\n日本語 🌿')
  })
  it('remove scripts e links executáveis de arquivos externos', () => {
    const html = markdownToHtml(
      '<script>alert(1)</script><p onclick="alert(1)">Texto</p><a href="javascript:alert(1)">link</a>',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
  })
  it('prepara imagens em memória e preserva o tamanho sem gravar arquivos', () => {
    const result = serializeHtml(
      '<p>Foto</p><img src="data:image/png;base64,eA==" alt="Paisagem" width="320" height="200">',
    )
    expect(result.assets).toHaveLength(1)
    expect(result.content).toContain(result.assets[0].token)
    expect(result.content).toContain('width="320"')
    expect(result.content).not.toContain('base64')
  })
  it('busca entre marcas e mantém posições UTF-16 corretas', () => {
    const editor = new Editor({
      extensions: editorExtensions(false),
      content: '<p>🌿 ca<strong>fé</strong> café</p>',
    })
    const matches = findMatches(editor.state.doc, 'café')
    expect(matches).toHaveLength(2)
    for (const match of matches)
      expect(editor.state.doc.textBetween(match.from, match.to)).toBe('café')
    editor.destroy()
  })

  it('não desloca as posições ao pesquisar depois de caracteres com caixa especial', () => {
    const editor = new Editor({
      extensions: editorExtensions(false),
      content: '<p>İstanbul: café e CAFÉ</p>',
    })
    const matches = findMatches(editor.state.doc, 'café')
    expect(matches).toHaveLength(2)
    expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('café')
    expect(editor.state.doc.textBetween(matches[1].from, matches[1].to)).toBe('CAFÉ')
    editor.destroy()
  })
})
