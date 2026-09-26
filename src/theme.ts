export const lightPalette = {
  background: '#F3F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#E7EFEB',
  text: '#10201B',
  textMuted: '#60726B',
  border: '#D3DED9',
  primary: '#087A61',
  primaryStrong: '#045C49',
  onPrimary: '#FFFFFF',
  accent: '#E5A824',
  danger: '#C33D4A',
  flat: '#3576D3',
  sharp: '#C1533A',
  success: '#078260',
  shadow: '#071512',
  tab: '#F8FBF9',
} as const;

export const darkPalette = {
  background: '#071512',
  surface: '#10231E',
  surfaceMuted: '#18312A',
  text: '#F3FBF7',
  textMuted: '#9DB4AA',
  border: '#29473D',
  primary: '#62D7B0',
  primaryStrong: '#91E7C9',
  onPrimary: '#052019',
  accent: '#F1B84B',
  danger: '#FF8790',
  flat: '#75A8F4',
  sharp: '#F58B6E',
  success: '#5EE0B4',
  shadow: '#000000',
  tab: '#0B1B17',
} as const;

export type Palette = typeof lightPalette | typeof darkPalette;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
