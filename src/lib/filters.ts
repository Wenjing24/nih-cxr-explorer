// Shared filter state for the four task pages.

export type SexFilter = 'all' | 'M' | 'F';
export type ViewFilter = 'all' | 'PA' | 'AP';

export interface Filters {
  /** selected findings (0–3), by name */
  findings: string[];
  sex: SexFilter;
  view: ViewFilter;
  ageMin: number;
  ageMax: number;
}

export const MAX_FINDINGS = 3;
export const AGE_LO = 0;
export const AGE_HI = 100;

export const DEFAULT_FILTERS: Filters = {
  findings: ['Atelectasis', 'Consolidation'],
  sex: 'all',
  view: 'all',
  ageMin: AGE_LO,
  ageMax: AGE_HI,
};

export const CLEARED_FILTERS: Filters = { ...DEFAULT_FILTERS, findings: [] };

export function ageFilterActive(f: Filters): boolean {
  return f.ageMin > AGE_LO || f.ageMax < AGE_HI;
}

export function toggleFinding(f: Filters, name: string): Filters {
  if (f.findings.includes(name)) return { ...f, findings: f.findings.filter((x) => x !== name) };
  if (f.findings.length >= MAX_FINDINGS) return f;
  return { ...f, findings: [...f.findings, name] };
}

/** Serialise to URL query so filters survive reloads and can be shared. */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  p.set('f', f.findings.join(','));
  if (f.sex !== 'all') p.set('sex', f.sex);
  if (f.view !== 'all') p.set('view', f.view);
  if (ageFilterActive(f)) p.set('age', `${f.ageMin}-${f.ageMax}`);
  return p.toString();
}

export function filtersFromQuery(q: string, validFindings: readonly string[]): Filters {
  const p = new URLSearchParams(q);
  const out: Filters = { ...DEFAULT_FILTERS };
  if (p.has('f')) {
    out.findings = (p.get('f') || '')
      .split(',')
      .filter((x) => validFindings.includes(x))
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, MAX_FINDINGS);
  }
  const sex = p.get('sex');
  if (sex === 'M' || sex === 'F') out.sex = sex;
  const view = p.get('view');
  if (view === 'PA' || view === 'AP') out.view = view;
  const age = p.get('age')?.match(/^(\d+)-(\d+)$/);
  if (age) {
    const a = Math.max(AGE_LO, Math.min(AGE_HI, +age[1]));
    const b = Math.max(AGE_LO, Math.min(AGE_HI, +age[2]));
    out.ageMin = Math.min(a, b);
    out.ageMax = Math.max(a, b);
  }
  return out;
}

export function describeFilters(f: Filters, opts: { ignoreView?: boolean; ignoreSex?: boolean } = {}): string {
  const parts: string[] = [];
  if (f.sex !== 'all' && !opts.ignoreSex) parts.push(f.sex === 'M' ? 'male' : 'female');
  if (f.view !== 'all' && !opts.ignoreView) parts.push(`${f.view} view`);
  if (ageFilterActive(f)) parts.push(`age ${f.ageMin}–${f.ageMax}`);
  return parts.length ? parts.join(', ') : 'no demographic or view filters';
}
