// Colour tokens.
// male = blue, female = pink (Progress Book sketches).
// View position: AP images come from sicker (often supine / portable, inpatient) patients, so AP gets the warm
// "alert" red-orange and PA a calm slate blue. The pair is colour-blind safe (blue vs orange, different
// lightness), and charts also use distinct marker shapes (PA = circle, AP = triangle).
export const SEX_COLORS = ['var(--male)', 'var(--female)'] as const;
export const VIEW_COLORS = { PA: 'var(--pa)', AP: 'var(--ap)' } as const;
export const VIEW_SHAPES = { PA: 'circle', AP: 'triangle' } as const;
export const COMPLEXITY_COLORS = ['#f6d5d3', '#e8928b', '#cf4f46', '#9e2a24', '#5e1512'] as const;

// Stable categorical colour per finding (same colour on every page).
const FINDING_PALETTE = [
  '#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b',
  '#e377c2', '#4e79a7', '#bcbd22', '#7f7f7f', '#b07aa1', '#59a14f', '#e15759',
];
export function findingColor(findings: readonly string[], name: string): string {
  const i = findings.indexOf(name);
  return i < 0 ? 'var(--ink)' : FINDING_PALETTE[i % FINDING_PALETTE.length];
}

/** SVG path for a marker centred on (0,0); size ≈ radius in px. */
export function markerPath(shape: 'circle' | 'triangle', size: number): string {
  if (shape === 'triangle') {
    const s = size * 1.25;
    return `M0,${-s}L${s * 0.95},${s * 0.68}L${-s * 0.95},${s * 0.68}Z`;
  }
  return `M${-size},0a${size},${size} 0 1,0 ${size * 2},0a${size},${size} 0 1,0 ${-size * 2},0`;
}
