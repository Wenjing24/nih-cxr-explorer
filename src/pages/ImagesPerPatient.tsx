import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { PageProps } from '../App';
import { prettyFinding } from '../lib/data';
import { filterImages, findingBit, imagesPerPatient, imagesPerPatientCounts, IPP_BINS, ipp_label, type IppResult } from '../lib/compute';
import { describeFilters } from '../lib/filters';
import { FilterPanel } from '../components/FilterPanel';
import { BarChart } from '../components/BarChart';
import { Card, Empty, fmt, Note, pct, Segmented } from '../components/chart';
import { SET_COLORS } from '../theme';

type Measure = 'share' | 'count';

export function ImagesPerPatientPage({ ds, filters, setFilters }: PageProps) {
  const idx = useMemo(() => filterImages(ds, filters), [ds, filters]);
  const pre = useMemo(() => imagesPerPatientCounts(ds, idx), [ds, idx]);
  const [measure, setMeasure] = useState<Measure>('share');
  const [sharedY, setSharedY] = useState<'shared' | 'free'>('shared');
  const base = useMemo(() => imagesPerPatient(ds, pre, null), [ds, pre]);
  const panels = useMemo(
    () => filters.findings.map((f, i) => ({ finding: f, color: SET_COLORS[i], r: imagesPerPatient(ds, pre, findingBit(ds, f)) })),
    [ds, pre, filters.findings],
  );
  const v = (r: IppResult, i: number) => (measure === 'share' ? (r.patients ? r.bins[i] / r.patients : 0) : r.bins[i]);
  const all = [{ finding: '__all__', color: 'var(--muted-bar)', r: base }, ...panels];
  const maxY = sharedY === 'shared' ? d3.max(all.flatMap((p) => IPP_BINS.map((_, i) => Math.max(v(p.r, i), measure === 'share' ? v(base, i) : 0)))) : undefined;

  const statLine = (r: IppResult) =>
    r.patients === 0 ? null : (
      <dl className="stats">
        <div><dt>Patients</dt><dd>{fmt(r.patients)}</dd></div>
        <div><dt>Their images</dt><dd>{fmt(r.images)}</dd></div>
        <div><dt>Median</dt><dd>{r.median}</dd></div>
        <div><dt>Mean</dt><dd>{r.mean!.toFixed(1)}</dd></div>
        <div><dt>Max</dt><dd>{fmt(r.max)}</dd></div>
        <div><dt>≥ 6 images</dt><dd>{pct(d3.sum(r.bins.slice(5)) / r.patients)}</dd></div>
      </dl>
    );

  const panel = (p: (typeof all)[number]) => {
    const title = p.finding === '__all__' ? 'All patients (reference)' : `Patients with ${prettyFinding(p.finding)}`;
    return (
      <div className="panel" key={p.finding}>
        <h4 style={{ color: p.finding === '__all__' ? 'var(--ink-soft)' : p.color }}>{title}</h4>
        {p.r.patients === 0 ? (
          <Empty title="No patients">No filtered patient has an image with this finding.</Empty>
        ) : (
          <>
            {statLine(p.r)}
            <BarChart
              height={230}
              xLabel="# images per patient"
              yLabel={measure === 'share' ? '% of these patients' : '# patients'}
              yFormat={measure === 'share' ? (x) => pct(x, 0) : undefined}
              maxY={maxY}
              valueLabels={false}
              refLabel={measure === 'share' && p.finding !== '__all__' ? 'all patients' : undefined}
              bars={IPP_BINS.map((b, i) => ({
                key: ipp_label(b),
                label: ipp_label(b),
                value: v(p.r, i),
                color: p.color,
                ref: measure === 'share' && p.finding !== '__all__' ? v(base, i) : undefined,
                tip: (
                  <>
                    <b>{title}: {ipp_label(b)} image{ipp_label(b) === '1' ? '' : 's'}</b>
                    <div>{fmt(p.r.bins[i])} patients ({pct(p.r.patients ? p.r.bins[i] / p.r.patients : null)} of {fmt(p.r.patients)})</div>
                    {p.finding !== '__all__' && <div className="muted">All patients: {pct(base.patients ? base.bins[i] / base.patients : null)}</div>}
                  </>
                ),
              }))}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="page with-filters">
      <FilterPanel ds={ds} filters={filters} setFilters={setFilters} idx={idx} findingsHint="One histogram per finding (max 3)." />
      <div className="page-body">
        <div className="page-head">
          <div>
            <h2>Images per patient by finding</h2>
            <p className="lede">
              Do patients with certain findings get imaged more often? Patients with chronic abnormalities tend to accumulate many follow-up X-rays,
              so a finding can be over-represented in images relative to patients.
            </p>
          </div>
        </div>
        <Card
          title="Distribution of images per patient"
          subtitle={
            <>
              Unit: <b>patients</b>. A patient is included in a finding’s panel if <i>any</i> of their filtered images carries it; x = <i>all</i> of that
              patient’s filtered images (with or without the finding). {measure === 'share' ? 'Bars = % of patients in that panel.' : 'Bars = number of patients.'}{' '}
              Filters: {describeFilters(filters)}.
            </>
          }
          actions={
            <>
              <Segmented<Measure> label="Show" value={measure} onChange={setMeasure} options={[{ value: 'share', label: '% of patients' }, { value: 'count', label: '# patients' }]} />
              <Segmented label="Y axes" value={sharedY} onChange={setSharedY} options={[{ value: 'shared', label: 'Shared' }, { value: 'free', label: 'Per panel' }]} />
            </>
          }
        >
          {idx.length === 0 ? (
            <Empty title="No images match the current filters">Widen the age range or reset gender/view filters.</Empty>
          ) : (
            <>
              {panels.length === 0 && (
                <p className="hint banner">Select up to 3 findings in the filter panel to compare them against the all-patient reference below.</p>
              )}
              <div className={`multiples n${Math.min(all.length, 4)}`}>{all.map(panel)}</div>
            </>
          )}
        </Card>
        <Note>
          The horizontal ticks (<span className="ref-swatch" />) on each finding’s bars show the reference distribution of all filtered patients, so a
          rightward shift means patients with that finding have more images than average.
        </Note>
      </div>
    </div>
  );
}
