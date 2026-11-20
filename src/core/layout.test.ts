import { getWritingLayout } from './layout'
import { defaultPreferences } from './preferences'

describe('coluna de escrita', () => {
  it.each([720, 900, 1180, 1500, 1920])(
    'mantém o centro da janela de %i px sem invadir painéis',
    (width) => {
      for (const sidebarSide of ['left', 'right'] as const) {
        for (const tabsPosition of ['top', 'left', 'right'] as const) {
          for (const sidebarWidth of [200, 244, 380]) {
            const layout = getWritingLayout(width, {
              ...defaultPreferences,
              sidebarSide,
              tabsPosition,
              sidebarWidth,
            })
            const left = layout.left + layout.writingOffset
            expect(left + layout.writingWidth / 2).toBeCloseTo(width / 2)
            expect(left).toBeGreaterThanOrEqual(layout.left + 31)
            expect(left + layout.writingWidth).toBeLessThanOrEqual(width - layout.right - 31)
            expect(layout.writingWidth).toBeGreaterThanOrEqual(320)
            expect(layout.writingWidth).toBeLessThanOrEqual(defaultPreferences.editorWidth)
          }
        }
      }
    },
  )
  it('usa o limite escolhido mesmo sem navegação', () => {
    const layout = getWritingLayout(1920, {
      ...defaultPreferences,
      sidebarVisible: false,
      editorWidth: 600,
    })
    expect(layout.writingWidth).toBe(600)
    expect(layout.writingOffset).toBe(660)
  })
})
