import { hexToHsv, hsvToHex, normalizeColor } from './colors'

it.each(['#768c66', '#be9a69', '#ffffff', '#000000', '#cc3344', '#1267ab'])(
  'preserva a cor %s ao ajustar o seletor',
  (color) => {
    expect(hsvToHex(hexToHsv(color))).toBe(color)
  },
)
it('normaliza cores carregadas pelo editor e rejeita valores incompletos', () => {
  expect(normalizeColor('rgb(221, 51, 68)')).toBe('#dd3344')
  expect(normalizeColor('#AbC')).toBe('#aabbcc')
  expect(normalizeColor('#zzzzzz')).toBeNull()
  expect(normalizeColor('#12')).toBeNull()
})
