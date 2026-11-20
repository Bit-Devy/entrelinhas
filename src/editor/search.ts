import { Extension } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface Match {
  from: number
  to: number
}
export function findMatches(doc: Node, query: string, caseSensitive = false): Match[] {
  if (!query) return []
  const matches: Match[] = []
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    caseSensitive ? 'gu' : 'giu',
  )
  // textBetween mantém uma busca contínua mesmo quando a palavra tem marcas diferentes.
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const source = node.textBetween(0, node.content.size, '', '\ufffc')
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) {
      matches.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length })
    }
    return false
  })
  return matches
}

export const searchKey = new PluginKey<{ query: string; caseSensitive: boolean }>('document-search')
export const SearchExtension = Extension.create({
  name: 'documentSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => ({ query: '', caseSensitive: false }),
          apply: (tr, state) => tr.getMeta(searchKey) ?? state,
        },
        props: {
          decorations: (state) => {
            const search = searchKey.getState(state)!
            return DecorationSet.create(
              state.doc,
              findMatches(state.doc, search.query, search.caseSensitive).map((match) =>
                Decoration.inline(match.from, match.to, { class: 'search-match' }),
              ),
            )
          },
        },
      }),
    ]
  },
})
