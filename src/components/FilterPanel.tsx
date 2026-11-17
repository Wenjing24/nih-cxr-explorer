import { useMemo, useState } from 'react';
import { prettyFinding, type Dataset } from '../lib/data';
import {
  AGE_HI, AGE_LO, CLEARED_FILTERS, MAX_FINDINGS, ageFilterActive, toggleFinding,
  type Filters, type SexFilter, type ViewFilter,
} from '../lib/filters';
import { countPatients, findingCounts } from '../lib/compute';
import { fmt, Segmented } from './chart';
import { SET_COLORS } from '../theme';

export function FilterPanel({
  ds, filters, setFilters, idx, ignoreView, ignoreSex, findingsHint,
}: {
  ds: Dataset;
  filters: Filters;
  setFilters: (f: Filters) => void;
  /** image indices passing the current filters (for the summary + counts) */
  idx: Uint32Array;
  ignoreView?: boolean;
  ignoreSex?: boolean;
  findingsHint?: string;
}) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 980);
  const counts = useMemo(() => findingCounts(ds, idx), [ds, idx]);
  const nPatients = useMemo(() => countPatients(ds, idx), [ds, idx]);
  const missingAge = useMemo(() => ds.age.reduce((c, a) => c + (a < 0 ? 1 : 0), 0), [ds]);
  const full = filters.findings.length >= MAX_FINDINGS;
  const dirty =
    filters.findings.length > 0 || filters.sex !== 'all' || filters.view !== 'all' || ageFilterActive(filters);
  const setAge = (lo: number, hi: number) => {
    const a = Math.max(AGE_LO, Math.min(AGE_HI, Math.round(lo)));
    const b = Math.max(AGE_LO, Math.min(AGE_HI, Math.round(hi)));
    setFilters({ ...filters, ageMin: Math.min(a, b), ageMax: Math.max(a, b) });
  };

  return (
    <aside className={`filters ${open ? 'open' : 'closed'}`} aria-label="Shared filters">
      <div className="filters-head">
        <h2>Filters</h2>
        <button type="button" className="link" onClick={() => setFilters(CLEARED_FILTERS)} disabled={!dirty}>
          Clear filters
        </button>
        <button type="button" className="filters-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Edit filters'}
        </button>
      </div>

      <p className="filter-summary" aria-live="polite">
        <strong>{fmt(idx.length)}</strong> images · <strong>{fmt(nPatients)}</strong> patients match
        <span className="muted"> (of {fmt(ds.n)} images · {fmt(ds.nPatients)} patients)</span>
        {!open && (
          <span className="closed-summary">
            {filters.findings.length ? filters.findings.map(prettyFinding).join(', ') : 'No findings selected'}
            {filters.sex !== 'all' && ` · ${filters.sex === 'M' ? 'Male' : 'Female'}`}
            {filters.view !== 'all' && !ignoreView && ` · ${filters.view}`}
            {ageFilterActive(filters) && ` · age ${filters.ageMin}–${filters.ageMax}`}
          </span>
        )}
      </p>
      <div className="filters-body">

        <fieldset>
          <legend>
            Findings <span className="muted">({filters.findings.length}/{MAX_FINDINGS} selected)</span>
          </legend>
          {findingsHint && <p className="hint">{findingsHint}</p>}
          <ul className="finding-list">
            {ds.findings.map((f) => {
              const on = filters.findings.includes(f);
              const order = filters.findings.indexOf(f);
              const c = counts.find((x) => x.finding === f)!;
              const disabled = !on && full;
              return (
                <li key={f}>
                  <label className={`${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`} title={disabled ? `Up to ${MAX_FINDINGS} findings — deselect one first` : undefined}>
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => setFilters(toggleFinding(filters, f))} />
                    <span className="dot" style={{ background: on ? SET_COLORS[order] : 'transparent', borderColor: on ? SET_COLORS[order] : undefined }} aria-hidden />
                    <span className="fname">{prettyFinding(f)}</span>
                    <span className="fcount" title="Images with this finding under current filters">{fmt(c.images)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {full && <p className="hint">Maximum of {MAX_FINDINGS} reached — uncheck one to choose another.</p>}
        </fieldset>

        <fieldset disabled={ignoreSex}>
          <Segmented<SexFilter>
            label={`Recorded gender${ignoreSex ? ' (split in chart)' : ''}`}
            value={filters.sex}
            onChange={(sex) => setFilters({ ...filters, sex })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'M', label: 'Male' },
              { value: 'F', label: 'Female' },
            ]}
          />
        </fieldset>

        <fieldset disabled={ignoreView}>
          <Segmented<ViewFilter>
            label={`View position${ignoreView ? ' (not applied here)' : ''}`}
            value={filters.view}
            onChange={(view) => setFilters({ ...filters, view })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'PA', label: 'PA' },
              { value: 'AP', label: 'AP' },
            ]}
          />
        </fieldset>

        <fieldset>
          <legend>
            Patient age at image <span className="muted">(years)</span>
          </legend>
          <div className="age-row">
            <label>
              From
              <input type="number" min={AGE_LO} max={AGE_HI} value={filters.ageMin} onChange={(e) => e.target.value !== '' && setAge(+e.target.value, filters.ageMax)} />
            </label>
            <label>
              to
              <input type="number" min={AGE_LO} max={AGE_HI} value={filters.ageMax} onChange={(e) => e.target.value !== '' && setAge(filters.ageMin, +e.target.value)} />
            </label>
          </div>
          <div className="dual-range">
            <input aria-label="Minimum age" type="range" min={AGE_LO} max={AGE_HI} value={filters.ageMin} onChange={(e) => setAge(Math.min(+e.target.value, filters.ageMax), filters.ageMax)} />
            <input aria-label="Maximum age" type="range" min={AGE_LO} max={AGE_HI} value={filters.ageMax} onChange={(e) => setAge(filters.ageMin, Math.max(+e.target.value, filters.ageMin))} />
          </div>
          <p className="hint">
            {ageFilterActive(filters)
              ? `${missingAge} images with an implausible recorded age (>100) are excluded while an age range is set.`
              : `Full range: includes ${missingAge} images whose recorded age (>100) was treated as missing.`}
          </p>
        </fieldset>
      </div>
    </aside>
  );
}
