// Colour-blind-safe tokens derived from Viridis. Chart shapes, line styles and
// labels also carry meaning so colour is never the only encoding.
export const SEX_COLORS = ['var(--male)', 'var(--female)'] as const;
export const VIEW_COLORS = { PA: 'var(--pa)', AP: 'var(--ap)' } as const;
/** categorical colours for the (up to 3) selected findings, in selection order */
export const SET_COLORS = ['var(--set-1)', 'var(--set-2)', 'var(--set-3)'] as const;
export const COMPLEXITY_COLORS = [
  'var(--complexity-0)',
  'var(--complexity-1)',
  'var(--complexity-2)',
  'var(--complexity-3)',
  'var(--complexity-4)',
] as const;
