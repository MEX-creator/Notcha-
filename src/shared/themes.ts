export interface Theme {
  id: string
  name: string
  note: string
  /** Price in Paws. Zero means it ships with the app. */
  price: number
  /** The chip, the active tab and the little accents. */
  accent: string
  accent2: string
  /** The glass the island is poured from. */
  tint: string
}

export const DEFAULT_THEME = 'midnight'

export const THEMES: Theme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    note: 'The notch as it shipped: cool ink and moonlight.',
    price: 0,
    accent: '#9db4ff',
    accent2: '#c3b1ff',
    tint: 'rgba(7, 8, 10, 0.96)'
  },
  {
    id: 'mint',
    name: 'Mochi Mint',
    note: 'Soft chlorophyll for long afternoons.',
    price: 40,
    accent: '#8ff0c1',
    accent2: '#a9e8ff',
    tint: 'rgba(6, 16, 14, 0.96)'
  },
  {
    id: 'amber',
    name: 'Amber Hour',
    note: 'Late sun on a warm desk.',
    price: 60,
    accent: '#ffc16b',
    accent2: '#ff9f8a',
    tint: 'rgba(18, 12, 7, 0.96)'
  },
  {
    id: 'rose',
    name: 'Rose Static',
    note: 'Neon drifting through the rain.',
    price: 80,
    accent: '#ffb3d1',
    accent2: '#c3b1ff',
    tint: 'rgba(18, 9, 16, 0.96)'
  },
  {
    id: 'glacier',
    name: 'Glacier',
    note: 'Cold light, very quiet.',
    price: 120,
    accent: '#a8f0ff',
    accent2: '#d6c8ff',
    tint: 'rgba(6, 14, 20, 0.96)'
  }
]

export function themeById(id: string | null | undefined): Theme {
  const found = THEMES.find((theme) => theme.id === id)
  return found ?? (THEMES[0] as Theme)
}
