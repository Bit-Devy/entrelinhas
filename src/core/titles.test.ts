import { documentTitle, editableTitle, suggestedFilename } from './titles'

it('usa o título escolhido ao sugerir o nome do arquivo e preserva Unicode', () => {
  expect(documentTitle('  Caderno 日本語.md  ')).toBe('Caderno 日本語')
  expect(suggestedFilename({ title: 'Caderno 日本語', format: 'txt' })).toBe('Caderno 日本語.txt')
  expect(editableTitle('Esboço.MARKDOWN')).toBe('Esboço')
})

it.each(['', '..', '.md', '../arquivo', 'a\\b', 'a\nb', 'a\0b', '日'.repeat(81)])(
  'recusa título inválido %j',
  (title) => {
    expect(() => documentTitle(title)).toThrow()
  },
)
