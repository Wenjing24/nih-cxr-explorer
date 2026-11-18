// Filter state. Each task page (co-occurrence, demographics, images per patient) keeps its OWN
// independent copy; the active page's copy is mirrored in the URL.

export type SexFilter = 'all' | 'M' | 'F';
export type ViewFilter = 'all' | 'PA' | 'AP';

export interface Filters {
  /** selected findings (0–14), by name */
  findings: string[];
  sex: SexFilter;
  view: ViewFilter;
  ageMin: number;
  ageMax: number;
}

/** all 14 findings may be selected */
export const MAX_FINDINGS = 14;
export const AGE_LO = 0;
export const AGE_HI = 100;

export const DEFAULT_FILTERS: Filters = {
  findings: ['Atelectasis', 'Consolidation'],
  sex: 'all',
  view: 'all',
  ageMin: AGE_LO,
  ageMax: AGE_HI,
};

/** five most frequent findings: a readable starting point for the UpSet plot */
export const TOP5 = ['Infiltration', 'Effusion', 'Atelectasis', 'Nodule', 'Mass'];

export type FilterPage = 'cooccurrence' | 'demographics' | 'images-per-patient';
export const FILTER_PAGES: FilterPage[] = ['cooccurrence', 'demographics', 'images-per-patient'];
export const PAGE_DEFAULTS: Record<FilterPage, Filters> = {
  cooccurrence: { ...DEFAULT_FILTERS, findings: TOP5 },
  demographics: DEFAULT_FILTERS,
  'images-per-patient': DEFAULT_FILTERS,
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

export function filtersFromQuery(q: string, validFindings: readonly string[], defaults: Filters = DEFAULT_FILTERS): Filters {
  const p = new URLSearchParams(q);
  const out: Filters = { ...defaults };
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
