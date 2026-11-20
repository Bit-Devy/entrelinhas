import type { Preferences } from './types'

export const defaultPreferences: Preferences = {
  theme: 'light',
  themeChosen: false,
  cursor: 'block',
  autoImmersive: true,
  askBeforeDiscard: false,
  defaultFormat: 'md',
  fontFamily: 'serif',
  fontSize: 19,
  lineHeight: 1.85,
  zoom: 100,
  editorWidth: 740,
  sidebarSide: 'left',
  sidebarWidth: 244,
  sidebarVisible: true,
  tabsPosition: 'top',
  spellcheck: false,
  selectionTools: true,
  shortcuts: {
    new: 'Ctrl+N',
    open: 'Ctrl+O',
    save: 'Ctrl+S',
    saveAs: 'Ctrl+Shift+S',
    close: 'Ctrl+W',
    find: 'Ctrl+F',
    replace: 'Ctrl+H',
    immersive: 'Ctrl+Shift+F',
  },
}

// A leitura também valida os dados: preferências antigas não devem quebrar a janela.
export function readPreferences(value: unknown): Preferences {
  const result = structuredClone(defaultPreferences)
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  // Uma instalação anterior já pode ter escolhido seu tema antes desta opção existir.
  result.themeChosen = ['light', 'dark', 'sepia'].includes(input.theme as string)
  const choices = {
    theme: ['light', 'dark', 'sepia'],
    cursor: ['block', 'thin', 'hidden'],
    defaultFormat: ['md', 'txt'],
    fontFamily: ['serif', 'sans', 'mono'],
    sidebarSide: ['left', 'right'],
    tabsPosition: ['top', 'left', 'right'],
  }
  for (const [key, options] of Object.entries(choices)) {
    if (options.includes(input[key] as string)) Object.assign(result, { [key]: input[key] })
  }
  const ranges = {
    fontSize: [12, 40],
    lineHeight: [1.2, 2.5],
    zoom: [50, 200],
    editorWidth: [440, 1100],
    sidebarWidth: [200, 380],
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const n = input[key]
    if (typeof n === 'number' && Number.isFinite(n))
      Object.assign(result, { [key]: Math.min(max, Math.max(min, n)) })
  }
  for (const key of [
    'themeChosen',
    'autoImmersive',
    'askBeforeDiscard',
    'sidebarVisible',
    'spellcheck',
    'selectionTools',
  ] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key]
  }
  if (input.shortcuts && typeof input.shortcuts === 'object') {
    for (const key of Object.keys(result.shortcuts) as (keyof Preferences['shortcuts'])[]) {
      const shortcut = (input.shortcuts as Record<string, unknown>)[key]
      if (
        typeof shortcut === 'string' &&
        /^(Ctrl\+(Shift\+)?(Alt\+)?[A-Z0-9]|F[1-9][0-2]?)$/.test(shortcut)
      )
        result.shortcuts[key] = shortcut
    }
  }
  return result
}
