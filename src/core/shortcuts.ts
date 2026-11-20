import type { Preferences, ShortcutAction } from './types'

export function eventShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>,
): string {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return ''
  return `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.altKey ? 'Alt+' : ''}${event.key.toUpperCase()}`
}

export function shortcutAction(
  event: KeyboardEvent,
  preferences: Preferences,
): ShortcutAction | null {
  if (event.isComposing || event.key === 'Process') return null
  const shortcut = eventShortcut(event)
  return (
    (Object.entries(preferences.shortcuts).find(
      ([, value]) => value === shortcut,
    )?.[0] as ShortcutAction) ?? null
  )
}
