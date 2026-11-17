// Data model for the compact image table produced by preprocess/preprocess.py

export interface RawDataset {
  source: string;
  findings: string[];
  n: number;
  nPatients: number;
  notes: Record<string, string>;
  patientId: number[];
  pid: number[];
  age: number[];
  sex: number[];
  view: number[];
  mask: number[];
  fu: number[];
}

export interface Dataset {
  source: string;
  findings: string[];
  n: number;
  nPatients: number;
  patientId: Int32Array;
  /** patient index (0..nPatients-1) for each image; images are sorted by patient then follow-up */
  pid: Int32Array;
  /** age in years, -1 = missing / implausible */
  age: Int16Array;
  /** 0 = M, 1 = F, -1 = missing */
  sex: Int8Array;
  /** 0 = PA, 1 = AP, -1 = missing */
  view: Int8Array;
  /** bit i = findings[i] present; 0 = "No Finding" */
  mask: Uint16Array;
  /** number of findings on each image (popcount of mask) */
  nFindings: Uint8Array;
  fu: Int16Array;
}

export const SEX_LABELS = ['Male', 'Female'] as const;
export const VIEW_LABELS = ['PA', 'AP'] as const;

export function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

export function toDataset(raw: RawDataset): Dataset {
  const n = raw.n;
  const lengths = [raw.pid, raw.age, raw.sex, raw.view, raw.mask, raw.fu].map((a) => a.length);
  if (lengths.some((l) => l !== n)) throw new Error(`Corrupt data file: column lengths ${lengths.join(',')} ≠ ${n}`);
  const mask = Uint16Array.from(raw.mask);
  const nFindings = new Uint8Array(n);
  for (let i = 0; i < n; i++) nFindings[i] = popcount(mask[i]);
  return {
    source: raw.source,
    findings: raw.findings,
    n,
    nPatients: raw.nPatients,
    patientId: Int32Array.from(raw.patientId),
    pid: Int32Array.from(raw.pid),
    age: Int16Array.from(raw.age),
    sex: Int8Array.from(raw.sex),
    view: Int8Array.from(raw.view),
    mask,
    nFindings,
    fu: Int16Array.from(raw.fu),
  };
}

export async function loadDataset(url: string): Promise<Dataset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return toDataset((await res.json()) as RawDataset);
}

/** Human-readable finding name ("Pleural_Thickening" -> "Pleural thickening") */
export function prettyFinding(f: string): string {
  const s = f.replace(/_/g, ' ');
  return s.charAt(0) + s.slice(1).toLowerCase();
}
