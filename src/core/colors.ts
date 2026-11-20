export interface HsvColor {
  h: number
  s: number
  v: number
}
const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value))
const channel = (value: number) => Math.round(clamp(value, 255)).toString(16).padStart(2, '0')

export function normalizeColor(value: string): string | null {
  const color = value.trim().toLowerCase()
  if (/^#[\da-f]{6}$/.test(color)) return color
  if (/^#[\da-f]{3}$/.test(color))
    return '#' + [...color.slice(1)].map((char) => char + char).join('')
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  return rgb ? '#' + rgb.slice(1, 4).map(Number).map(channel).join('') : null
}

export function hexToHsv(hex: string): HsvColor {
  const color = normalizeColor(hex) ?? '#768c66'
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min
  let h =
    delta === 0
      ? 0
      : max === r
        ? 60 * (((g - b) / delta) % 6)
        : max === g
          ? 60 * ((b - r) / delta + 2)
          : 60 * ((r - g) / delta + 4)
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  h = ((h % 360) + 360) % 360
  const c = clamp(v) * clamp(s),
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = clamp(v) - c
  const rgb =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return '#' + rgb.map((value) => channel((value + m) * 255)).join('')
}
