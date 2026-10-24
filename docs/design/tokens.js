// Phase 2 design tokens for the mocks. The chosen palette moves into apps/web in Phase 3.
const status = {
  light: {
    serious: '#B42318', seriousTint: '#FDEEEC', seriousLine: '#E9A39B',
    warn: '#8F4700', warnTint: '#FFF1DE', warnLine: '#E3B06F',
    overdueFill: '#B42318', overdueText: '#FFFFFF',
  },
  dark: {
    serious: '#FF8F84', seriousTint: '#3B1613', seriousLine: '#8A3A32',
    warn: '#F7B665', warnTint: '#36230B', warnLine: '#80561F',
    overdueFill: '#FF8F84', overdueText: '#1A0806',
  },
};

export const palettes = {
  ledger: {
    name: 'Ledger',
    idea: 'Olive of a bound quality ledger: records that are kept, not decorated.',
    light: {
      bg: '#F6F6F2', panel: '#FFFFFF', sunken: '#EEEEE8', line: '#D8D9D0', lineStrong: '#8C8F80',
      ink: '#1C1D17', ink2: '#54564B', ink3: '#666859',
      accent: '#48561C', onAccent: '#FFFFFF', accentTint: '#E9EDDA',
      ...status.light,
    },
    dark: {
      bg: '#141510', panel: '#1C1D17', sunken: '#11120E', line: '#34362D', lineStrong: '#71746A',
      ink: '#EBECE4', ink2: '#B0B2A5', ink3: '#999B8E',
      accent: '#B8C97C', onAccent: '#141510', accentTint: '#2A3015',
      ...status.dark,
    },
  },
  kraft: {
    name: 'Kraft',
    idea: 'Brown of a kraft case-file folder: every complaint is a file someone has to close.',
    light: {
      bg: '#F7F6F3', panel: '#FFFFFF', sunken: '#EFEDE8', line: '#DBD7CF', lineStrong: '#90887B',
      ink: '#1E1B17', ink2: '#58524A', ink3: '#6B645A',
      accent: '#6B4A22', onAccent: '#FFFFFF', accentTint: '#F1E7D8',
      ...status.light,
    },
    dark: {
      bg: '#161411', panel: '#1E1B17', sunken: '#12100E', line: '#38332C', lineStrong: '#7A7266',
      ink: '#EEEAE4', ink2: '#B5AEA3', ink3: '#A0988C',
      accent: '#D9B07A', onAccent: '#161411', accentTint: '#33271A',
      ...status.dark,
    },
  },
  spruce: {
    name: 'Spruce',
    idea: 'Deep conifer green on cool paper: quiet enough that the red flag is the only loud thing.',
    light: {
      bg: '#F4F6F5', panel: '#FFFFFF', sunken: '#EBEFED', line: '#D3DAD6', lineStrong: '#84908A',
      ink: '#18201C', ink2: '#4D5852', ink3: '#5F6A64',
      accent: '#1F4D39', onAccent: '#FFFFFF', accentTint: '#DDEBE3',
      ...status.light,
    },
    dark: {
      bg: '#111614', panel: '#18201C', sunken: '#0D1210', line: '#2E3934', lineStrong: '#6B7A73',
      ink: '#E6ECE9', ink2: '#A8B4AE', ink3: '#93A09A',
      accent: '#86C9A3', onAccent: '#111614', accentTint: '#1B3328',
      ...status.dark,
    },
  },
};

// Pairs that must pass WCAG 2.2 AA: 4.5 for text, 3 for UI component boundaries.
export const checks = [
  ['ink', 'bg', 4.5], ['ink', 'panel', 4.5], ['ink2', 'panel', 4.5], ['ink3', 'panel', 4.5],
  ['ink3', 'bg', 4.5], ['ink3', 'sunken', 4.5], ['accent', 'panel', 4.5], ['accent', 'bg', 4.5],
  ['onAccent', 'accent', 4.5], ['accent', 'accentTint', 4.5], ['ink', 'accentTint', 4.5],
  ['serious', 'panel', 4.5], ['serious', 'seriousTint', 4.5], ['warn', 'panel', 4.5], ['warn', 'warnTint', 4.5],
  ['overdueText', 'overdueFill', 4.5], ['lineStrong', 'panel', 3], ['lineStrong', 'bg', 3],
];

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
