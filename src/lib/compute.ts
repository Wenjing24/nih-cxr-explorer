// Pure aggregation functions. Every function states its unit (images vs patients)
// and denominator; the UI copies those definitions into chart labels.
import type { Dataset } from './data';
import { ageFilterActive, type Filters } from './filters';

// ---------------------------------------------------------------- filtering

/**
 * Indices of images that pass the demographic/view filters. The finding
 * selection is NOT a row filter – it chooses what to display.
 * When the age range is narrowed, images with missing age are excluded.
 */
export function filterImages(
  ds: Dataset,
  f: Filters,
  opts: { ignoreView?: boolean; ignoreSex?: boolean } = {},
): Uint32Array {
  const sex = opts.ignoreSex || f.sex === 'all' ? -2 : f.sex === 'M' ? 0 : 1;
  const view = opts.ignoreView || f.view === 'all' ? -2 : f.view === 'PA' ? 0 : 1;
  const useAge = ageFilterActive(f);
  const out = new Uint32Array(ds.n);
  let k = 0;
  for (let i = 0; i < ds.n; i++) {
    if (sex !== -2 && ds.sex[i] !== sex) continue;
    if (view !== -2 && ds.view[i] !== view) continue;
    if (useAge) {
      const a = ds.age[i];
      if (a < 0 || a < f.ageMin || a > f.ageMax) continue;
    }
    out[k++] = i;
  }
  return out.slice(0, k);
}

export function allImages(ds: Dataset): Uint32Array {
  const out = new Uint32Array(ds.n);
  for (let i = 0; i < ds.n; i++) out[i] = i;
  return out;
}

export function countPatients(ds: Dataset, idx: ArrayLike<number>): number {
  const seen = new Uint8Array(ds.nPatients);
  let c = 0;
  for (let j = 0; j < idx.length; j++) {
    const p = ds.pid[idx[j]];
    if (!seen[p]) {
      seen[p] = 1;
      c++;
    }
  }
  return c;
}

export function findingBit(ds: Dataset, name: string): number {
  const i = ds.findings.indexOf(name);
  if (i < 0) throw new Error(`Unknown finding ${name}`);
  return 1 << i;
}

/** bitmask matching ANY of the 14 findings (i.e. abnormal image) */
export function anyFindingMask(ds: Dataset): number {
  return (1 << ds.findings.length) - 1;
}

// ---------------------------------------------------------------- per-finding counts

export interface FindingCount {
  finding: string;
  images: number;
  patients: number;
  PA: number;
  AP: number;
  /** images with missing view position */
  otherView: number;
}

/** Images (and distinct patients) carrying each finding, split by view. Includes "No Finding". */
export function findingCounts(ds: Dataset, idx: ArrayLike<number>): FindingCount[] {
  const F = ds.findings.length;
  const names = [...ds.findings, 'No Finding'];
  const res = names.map((finding) => ({ finding, images: 0, patients: 0, PA: 0, AP: 0, otherView: 0 }));
  // per-finding flags: patient already counted
  const seen = names.map(() => new Uint8Array(ds.nPatients));
  for (let j = 0; j < idx.length; j++) {
    const i = idx[j];
    const m = ds.mask[i];
    const v = ds.view[i];
    const p = ds.pid[i];
    for (let b = 0; b <= F; b++) {
      const has = b === F ? m === 0 : (m >> b) & 1;
      if (!has) continue;
      const r = res[b];
      r.images++;
      if (v === 0) r.PA++;
      else if (v === 1) r.AP++;
      else r.otherView++;
      if (!seen[b][p]) {
        seen[b][p] = 1;
        r.patients++;
      }
    }
  }
  return res;
}

// ---------------------------------------------------------------- intersections / UpSet

export type CountUnit = 'images' | 'patients';

export interface IntersectionResult {
  /** exclusive region counts, keyed by bitmask over the selection (1..2^k-1) */
  regions: Map<number, number>;
  /** set totals (inclusive) per selected finding */
  totals: number[];
  /** units in the filtered population carrying none of the selected findings */
  none: number;
  /** denominator: all filtered images, or all distinct filtered patients */
  denominator: number;
}

/**
 * Exclusive intersection counts for up to 3 findings.
 * images:   each filtered image falls in exactly one region.
 * patients: a patient is "in" a finding if ANY of their filtered images carries it.
 */
export function intersectionCounts(ds: Dataset, idx: ArrayLike<number>, selection: string[], unit: CountUnit): IntersectionResult {
  const bits = selection.map((s) => findingBit(ds, s));
  const k = bits.length;
  const regionOf = (m: number) => {
    let r = 0;
    for (let s = 0; s < k; s++) if (m & bits[s]) r |= 1 << s;
    return r;
  };
  const counts = new Float64Array(1 << k);
  if (unit === 'images') {
    for (let j = 0; j < idx.length; j++) counts[regionOf(ds.mask[idx[j]])]++;
  } else {
    const pm = new Int16Array(ds.nPatients).fill(-1); // -1 = patient not in filtered set
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j];
      const p = ds.pid[i];
      pm[p] = (pm[p] < 0 ? 0 : pm[p]) | regionOf(ds.mask[i]);
    }
    for (let p = 0; p < ds.nPatients; p++) if (pm[p] >= 0) counts[pm[p]]++;
  }
  const regions = new Map<number, number>();
  for (let r = 1; r < 1 << k; r++) regions.set(r, counts[r]);
  const totals = bits.map((_, s) => {
    let t = 0;
    for (let r = 1; r < 1 << k; r++) if (r & (1 << s)) t += counts[r];
    return t;
  });
  let denominator = 0;
  for (const c of counts) denominator += c;
  return { regions, totals, none: counts[0], denominator };
}

// ---------------------------------------------------------------- prevalence by age & sex

export interface PrevalencePoint {
  /** lower bound of the age bin (years) */
  bin: number;
  /** denominator: images (or distinct patients) of this sex with an image in this bin */
  n: number;
  /** numerator: those carrying the finding */
  k: number;
  /** k / n, or null when n = 0 */
  rate: number | null;
}

export interface PrevalenceSeries {
  sex: 0 | 1;
  points: PrevalencePoint[];
}

export function ageBinOf(age: number, width: number): number {
  return Math.floor(Math.min(age, 99) / width) * width;
}

/**
 * Prevalence of `findingMask` (any bit) by age bin and recorded gender.
 * images:   n = images in bin, k = images with finding.
 * patients: n = distinct patients with ≥1 image in bin, k = distinct patients with ≥1 such image carrying the finding.
 * Images with missing age or gender are excluded (reported separately via `excluded`).
 */
export function prevalenceByAgeSex(
  ds: Dataset,
  idx: ArrayLike<number>,
  findingMask: number,
  unit: CountUnit,
  binWidth: number,
): { series: PrevalenceSeries[]; excluded: number } {
  const nb = Math.ceil(100 / binWidth);
  const n = [new Float64Array(nb), new Float64Array(nb)];
  const k = [new Float64Array(nb), new Float64Array(nb)];
  let excluded = 0;
  // patient-unit bookkeeping: key = patient*nb + bin
  const seenN = unit === 'patients' ? new Set<number>() : null;
  const seenK = unit === 'patients' ? new Set<number>() : null;
  for (let j = 0; j < idx.length; j++) {
    const i = idx[j];
    const a = ds.age[i];
    const s = ds.sex[i];
    if (a < 0 || s < 0) {
      excluded++;
      continue;
    }
    const b = Math.floor(Math.min(a, 99) / binWidth);
    const has = (ds.mask[i] & findingMask) !== 0;
    if (unit === 'images') {
      n[s][b]++;
      if (has) k[s][b]++;
    } else {
      const key = ds.pid[i] * nb + b;
      if (!seenN!.has(key)) {
        seenN!.add(key);
        n[s][b]++;
      }
      if (has && !seenK!.has(key)) {
        seenK!.add(key);
        k[s][b]++;
      }
    }
  }
  const series = ([0, 1] as const).map((s) => ({
    sex: s,
    points: Array.from({ length: nb }, (_, b) => ({
      bin: b * binWidth,
      n: n[s][b],
      k: k[s][b],
      rate: n[s][b] > 0 ? k[s][b] / n[s][b] : null,
    })),
  }));
  return { series, excluded };
}

// ---------------------------------------------------------------- images per patient

export const IPP_BINS: [number, number][] = [
  [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 10], [11, 20], [21, 50], [51, Infinity],
];
export const ipp_label = ([lo, hi]: [number, number]) =>
  lo === hi ? `${lo}` : hi === Infinity ? `${lo}+` : `${lo}–${hi}`;

/** Number of filtered images per distinct patient (patient index -> count) */
export function imagesPerPatientCounts(ds: Dataset, idx: ArrayLike<number>) {
  const cnt = new Int32Array(ds.nPatients);
  const fmask = new Uint16Array(ds.nPatients);
  for (let j = 0; j < idx.length; j++) {
    const i = idx[j];
    cnt[ds.pid[i]]++;
    fmask[ds.pid[i]] |= ds.mask[i];
  }
  return { cnt, fmask };
}

export interface IppResult {
  /** patients per bin of image count */
  bins: number[];
  patients: number;
  images: number;
  median: number | null;
  mean: number | null;
  max: number;
}

/**
 * Distribution of images per patient (all filtered images of the patient),
 * among patients with ≥1 filtered image carrying `findingMask` (null = all patients).
 */
export function imagesPerPatient(
  ds: Dataset,
  pre: ReturnType<typeof imagesPerPatientCounts>,
  findingMask: number | null,
): IppResult {
  const bins = IPP_BINS.map(() => 0);
  const values: number[] = [];
  let images = 0;
  for (let p = 0; p < ds.nPatients; p++) {
    const c = pre.cnt[p];
    if (c === 0) continue;
    if (findingMask !== null && (pre.fmask[p] & findingMask) === 0) continue;
    values.push(c);
    images += c;
    const b = IPP_BINS.findIndex(([lo, hi]) => c >= lo && c <= hi);
    bins[b]++;
  }
  values.sort((a, b) => a - b);
  const m = values.length;
  return {
    bins,
    patients: m,
    images,
    median: m ? (m % 2 ? values[(m - 1) / 2] : (values[m / 2 - 1] + values[m / 2]) / 2) : null,
    mean: m ? images / m : null,
    max: m ? values[m - 1] : 0,
  };
}

// ---------------------------------------------------------------- overview (full dataset)

export interface Overview {
  patientsBySex: { M: number; F: number; missing: number };
  imagesByView: { PA: number; AP: number; missing: number };
  /** patients by age at their earliest image with a valid age, 10-year bins; missing counted separately */
  patientsByAge: { bin: number; patients: number }[];
  patientsMissingAge: number;
  /** exact images-per-patient distribution: [count, patients] */
  imagesPerPatient: { images: number; patients: number }[];
  images: number;
  patients: number;
  abnormalImages: number;
}

export function overview(ds: Dataset): Overview {
  const firstAge = new Int16Array(ds.nPatients).fill(-1);
  const sexOf = new Int8Array(ds.nPatients).fill(-1);
  const cnt = new Int32Array(ds.nPatients);
  const imagesByView = { PA: 0, AP: 0, missing: 0 };
  let abnormal = 0;
  for (let i = 0; i < ds.n; i++) {
    const p = ds.pid[i];
    cnt[p]++;
    if (firstAge[p] < 0 && ds.age[i] >= 0) firstAge[p] = ds.age[i]; // images sorted by follow-up
    if (sexOf[p] < 0) sexOf[p] = ds.sex[i];
    if (ds.view[i] === 0) imagesByView.PA++;
    else if (ds.view[i] === 1) imagesByView.AP++;
    else imagesByView.missing++;
    if (ds.mask[i]) abnormal++;
  }
  const patientsBySex = { M: 0, F: 0, missing: 0 };
  const ageBins = new Array(10).fill(0);
  let missingAge = 0;
  const ipp = new Map<number, number>();
  for (let p = 0; p < ds.nPatients; p++) {
    if (sexOf[p] === 0) patientsBySex.M++;
    else if (sexOf[p] === 1) patientsBySex.F++;
    else patientsBySex.missing++;
    if (firstAge[p] < 0) missingAge++;
    else ageBins[ageBinOf(firstAge[p], 10) / 10]++;
    ipp.set(cnt[p], (ipp.get(cnt[p]) || 0) + 1);
  }
  return {
    patientsBySex,
    imagesByView,
    patientsByAge: ageBins.map((patients, b) => ({ bin: b * 10, patients })),
    patientsMissingAge: missingAge,
    imagesPerPatient: [...ipp.entries()].map(([images, patients]) => ({ images, patients })).sort((a, b) => a.images - b.images),
    images: ds.n,
    patients: ds.nPatients,
    abnormalImages: abnormal,
  };
}

// ---------------------------------------------------------------- label complexity (full dataset)

export const MAX_COMPLEXITY_BUCKET = 4; // 0,1,2,3,4+

/** images by number of findings (0..max) for each view; [view][nFindings] */
export function complexityByView(ds: Dataset): { PA: number[]; AP: number[]; max: number } {
  let max = 0;
  for (let i = 0; i < ds.n; i++) if (ds.nFindings[i] > max) max = ds.nFindings[i];
  const PA = new Array(max + 1).fill(0);
  const AP = new Array(max + 1).fill(0);
  for (let i = 0; i < ds.n; i++) {
    if (ds.view[i] === 0) PA[ds.nFindings[i]]++;
    else if (ds.view[i] === 1) AP[ds.nFindings[i]]++;
  }
  return { PA, AP, max };
}

/** images per 10-year age bin split by number of findings (0..3, 4+). Missing age excluded. */
export function complexityByAge(ds: Dataset): { bin: number; counts: number[]; total: number }[] {
  const rows = Array.from({ length: 10 }, (_, b) => ({ bin: b * 10, counts: new Array(MAX_COMPLEXITY_BUCKET + 1).fill(0), total: 0 }));
  for (let i = 0; i < ds.n; i++) {
    if (ds.age[i] < 0) continue;
    const r = rows[ageBinOf(ds.age[i], 10) / 10];
    r.counts[Math.min(ds.nFindings[i], MAX_COMPLEXITY_BUCKET)]++;
    r.total++;
  }
  return rows;
}

/** per year of age: mean findings per image (images unit) */
export function meanFindingsByAge(ds: Dataset): { age: number; images: number; mean: number }[] {
  const n = new Float64Array(101);
  const s = new Float64Array(101);
  for (let i = 0; i < ds.n; i++) {
    const a = ds.age[i];
    if (a < 0) continue;
    n[a]++;
    s[a] += ds.nFindings[i];
  }
  const out = [];
  for (let a = 0; a <= 100; a++) if (n[a] > 0) out.push({ age: a, images: n[a], mean: s[a] / n[a] });
  return out;
}

/**
 * per year of age (patient's age at earliest valid image):
 * mean images per patient and mean findings per image across those patients' images.
 */
export function imagesPerPatientByAge(ds: Dataset): { age: number; patients: number; meanImages: number; meanFindings: number }[] {
  const firstAge = new Int16Array(ds.nPatients).fill(-1);
  const cnt = new Int32Array(ds.nPatients);
  const fsum = new Int32Array(ds.nPatients);
  for (let i = 0; i < ds.n; i++) {
    const p = ds.pid[i];
    cnt[p]++;
    fsum[p] += ds.nFindings[i];
    if (firstAge[p] < 0 && ds.age[i] >= 0) firstAge[p] = ds.age[i];
  }
  const pts = new Float64Array(101);
  const imgs = new Float64Array(101);
  const fnd = new Float64Array(101);
  for (let p = 0; p < ds.nPatients; p++) {
    const a = firstAge[p];
    if (a < 0) continue;
    pts[a]++;
    imgs[a] += cnt[p];
    fnd[a] += fsum[p];
  }
  const out = [];
  for (let a = 0; a <= 100; a++)
    if (pts[a] > 0) out.push({ age: a, patients: pts[a], meanImages: imgs[a] / pts[a], meanFindings: fnd[a] / imgs[a] });
  return out;
}
