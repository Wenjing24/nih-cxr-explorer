// Colour tokens follow the Progress Book sketches:
// male = blue, female = pink, PA = teal, AP = yellow, complexity = sequential reds.
export const SEX_COLORS = ['var(--male)', 'var(--female)'] as const;
export const VIEW_COLORS = { PA: 'var(--pa)', AP: 'var(--ap)' } as const;
/** categorical colours for the (up to 3) selected findings, in selection order */
export const SET_COLORS = ['#e4572e', '#2f6fdb', '#8e44c9'] as const;
export const COMPLEXITY_COLORS = ['#f6d5d3', '#e8928b', '#cf4f46', '#9e2a24', '#5e1512'] as const;
