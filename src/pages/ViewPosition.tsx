import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { PageProps } from '../App';
import { prettyFinding } from '../lib/data';
import { filterImages, findingCounts, type FindingCount } from '../lib/compute';
import { describeFilters } from '../lib/filters';
import { FilterPanel } from '../components/FilterPanel';
import { Axis, Card, Empty, fmt, Legend, Note, pct, Segmented, useTipHandlers, useWidth } from '../components/chart';
import { SET_COLORS, VIEW_COLORS } from '../theme';

type Scope = 'selected' | 'all';
type Sort = 'ap' | 'n' | 'name';

export function ViewPositionPage({ ds, filters, setFilters }: PageProps) {
  // the view filter would make every bar 100% one colour, so it is not applied here
  const idx = useMemo(() => filterImages(ds, filters, { ignoreView: true }), [ds, filters]);
  const counts = useMemo(() => findingCounts(ds, idx), [ds, idx]);
  const [scope, setScope] = useState<Scope>(filters.findings.length ? 'selected' : 'all');
  const [sort, setSort] = useState<Sort>('ap');
  const effScope: Scope = filters.findings.length ? scope : 'all';

  const overall: FindingCount = useMemo(() => {
    let PA = 0, AP = 0, other = 0;
    for (let j = 0; j < idx.length; j++) {
      const v = ds.view[idx[j]];
      if (v === 0) PA++; else if (v === 1) AP++; else other++;
    }
    return { finding: 'All filtered images', images: idx.length, patients: 0, PA, AP, otherView: other };
  }, [ds, idx]);

  const rows = useMemo(() => {
    let r = effScope === 'selected' ? counts.filter((c) => filters.findings.includes(c.finding)) : counts;
    const apShare = (c: FindingCount) => (c.PA + c.AP ? c.AP / (c.PA + c.AP) : -1);
    r = [...r].sort((a, b) => (sort === 'ap' ? apShare(b) - apShare(a) : sort === 'n' ? b.images - a.images : a.finding.localeCompare(b.finding)));
    return r;
  }, [counts, effScope, filters.findings, sort]);

  return (
    <div className="page with-filters">
      <FilterPanel ds={ds} filters={filters} setFilters={setFilters} idx={idx} ignoreView findingsHint="Checked findings are shown (or switch to all 14)." />
      <div className="page-body">
        <div className="page-head">
          <div>
            <h2>View position comparison</h2>
            <p className="lede">
              Among images carrying each finding, what share were taken AP (often portable / patient lying down) versus PA (standing)? Large
              differences flag possible shortcut learning: a model could learn “AP ⇒ abnormal”.
            </p>
          </div>
        </div>
        <Card
          title="AP vs PA proportion within each finding"
          subtitle={
            <>
              Unit: <b>% of images</b> with that finding (each bar sums to 100%). <b>[n]</b> = total images carrying the finding. The view-position
              filter is not applied on this page; other filters: {describeFilters(filters, { ignoreView: true })}.
            </>
          }
          actions={
            <>
              <Segmented<Scope>
                label="Findings"
                value={effScope}
                onChange={setScope}
                options={[
                  { value: 'selected', label: `Selected (${filters.findings.length})`, disabled: filters.findings.length === 0 },
                  { value: 'all', label: 'All 14 + No Finding' },
                ]}
              />
              <Segmented<Sort> label="Sort" value={sort} onChange={setSort} options={[{ value: 'ap', label: '% AP' }, { value: 'n', label: 'n' }, { value: 'name', label: 'A–Z' }]} />
            </>
          }
        >
          <div className="controls">
            <Legend items={[{ label: 'PA (posterior→anterior)', color: VIEW_COLORS.PA }, { label: 'AP (anterior→posterior)', color: VIEW_COLORS.AP }]} />
            <span className="muted small">Dashed line: AP share across all filtered images ({pct(overall.PA + overall.AP ? overall.AP / (overall.PA + overall.AP) : null)}).</span>
          </div>
          {idx.length === 0 ? (
            <Empty title="No images match the current filters">Widen the age range or reset the gender filter.</Empty>
          ) : (
            <StackedBars rows={rows} overall={overall} selected={filters.findings} />
          )}
        </Card>
        <Note>
          Proportions make AP/PA composition comparable across findings of very different frequency; the [n] column shows the sample size behind
          each bar — treat bars with small n (e.g. Hernia) with caution.
        </Note>
      </div>
    </div>
  );
}

function StackedBars({ rows, overall, selected }: { rows: FindingCount[]; overall: FindingCount; selected: string[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const narrow = width < 520;
  const m = { top: 46, right: narrow ? 64 : 92, bottom: 10, left: narrow ? 108 : 150 };
  const rowH = 34;
  const all = [...rows, overall];
  const w = Math.max(120, width - m.left - m.right);
  const h = all.length * rowH + 10;
  const x = d3.scaleLinear().domain([0, 1]).range([0, w]);
  const overallAP = overall.PA + overall.AP ? overall.AP / (overall.PA + overall.AP) : 0;
  return (
    <div ref={ref} className="chart">
      <svg width={w + m.left + m.right} height={h + m.top + m.bottom} role="group" aria-label="AP and PA share per finding">
        <g transform={`translate(${m.left},${m.top})`}>
          <Axis scale={x as any} orient="top" ticks={narrow ? 3 : 5} format={d3.format('.0%')} grid gridSize={h} />
          <text className="axis-label" x={w / 2} y={-30} textAnchor="middle">% of images with the finding</text>
          <text className="axis-label" x={w + 8} y={-30} textAnchor="start">[n]</text>
          {all.map((r, i) => {
            const isOverall = r === overall;
            const tot = r.PA + r.AP;
            const pa = tot ? r.PA / tot : 0;
            const y0 = i * rowH + (isOverall ? 10 : 0);
            const bh = rowH - 10;
            const sel = selected.indexOf(r.finding);
            const name = isOverall ? 'All filtered images' : r.finding === 'No Finding' ? 'No Finding' : prettyFinding(r.finding);
            const tip = (
              <>
                <b>{name}</b>
                <div><span className="swatch inline" style={{ background: VIEW_COLORS.PA }} /> PA: {fmt(r.PA)} ({pct(tot ? r.PA / tot : null)})</div>
                <div><span className="swatch inline" style={{ background: VIEW_COLORS.AP }} /> AP: {fmt(r.AP)} ({pct(tot ? r.AP / tot : null)})</div>
                <div className="muted">n = {fmt(r.images)} images{r.otherView ? ` (${r.otherView} without view)` : ''}</div>
              </>
            );
            return (
              <g key={r.finding} transform={`translate(0,${y0})`} className={isOverall ? 'overall-row' : ''}>
                {isOverall && <line x1={-m.left + 8} x2={w + m.right - 8} y1={-6} y2={-6} className="sep" />}
                <text className={`row-label ${isOverall ? 'bold' : ''}`} x={-8} y={bh / 2} dy="0.35em" textAnchor="end">
                  {sel >= 0 && <tspan fill={SET_COLORS[sel]}>● </tspan>}
                  {name}
                </text>
                {tot === 0 ? (
                  <text className="muted small" x={4} y={bh / 2} dy="0.35em">No images with a recorded view</text>
                ) : (
                  <>
                    <rect className="bar" x={0} width={x(pa)} height={bh} fill={VIEW_COLORS.PA} {...tipFor(tip, `${name}: PA ${pct(pa)}`)} />
                    <rect className="bar" x={x(pa)} width={x(1 - pa)} height={bh} fill={VIEW_COLORS.AP} {...tipFor(tip, `${name}: AP ${pct(1 - pa)}`)} />
                    {x(pa) > 44 && <text className="seg-label on-dark" x={6} y={bh / 2} dy="0.35em">{pct(pa, 0)}</text>}
                    {x(1 - pa) > 44 && <text className="seg-label" x={w - 6} y={bh / 2} dy="0.35em" textAnchor="end">{pct(1 - pa, 0)}</text>}
                  </>
                )}
                <text className="n-label" x={w + 8} y={bh / 2} dy="0.35em">[{fmt(r.images)}]</text>
              </g>
            );
          })}
          <line className="ref-line" x1={x(1 - overallAP)} x2={x(1 - overallAP)} y1={-4} y2={h} />
        </g>
      </svg>
    </div>
  );
}
