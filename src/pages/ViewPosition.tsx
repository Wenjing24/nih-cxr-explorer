import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { prettyFinding, type Dataset } from '../lib/data';
import { allImages, findingCounts, type FindingCount } from '../lib/compute';
import { Axis, Card, fmt, Legend, Note, pct, Segmented, useTipHandlers, useWidth } from '../components/chart';
import { VIEW_COLORS } from '../theme';

type Sort = 'ap' | 'n' | 'name';

export function ViewPositionPage({ ds }: { ds: Dataset }) {
  // full dataset, all 14 findings + No Finding; no filters on this page
  const idx = useMemo(() => allImages(ds), [ds]);
  const counts = useMemo(() => findingCounts(ds, idx), [ds, idx]);
  const [sort, setSort] = useState<Sort>('ap');

  const overall: FindingCount = useMemo(() => {
    let PA = 0, AP = 0, other = 0;
    for (let j = 0; j < idx.length; j++) {
      const v = ds.view[idx[j]];
      if (v === 0) PA++; else if (v === 1) AP++; else other++;
    }
    return { finding: 'All images', images: idx.length, patients: 0, PA, AP, otherView: other };
  }, [ds, idx]);

  const rows = useMemo(() => {
    const apShare = (c: FindingCount) => (c.PA + c.AP ? c.AP / (c.PA + c.AP) : -1);
    return [...counts].sort((a, b) => (sort === 'ap' ? apShare(b) - apShare(a) : sort === 'n' ? b.images - a.images : a.finding.localeCompare(b.finding)));
  }, [counts, sort]);
  const overallAP = overall.AP / (overall.PA + overall.AP || 1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>View position comparison</h2>
          <p className="lede">
            Among images carrying each finding, what share were taken <b style={{ color: VIEW_COLORS.AP }}>AP</b> (often portable, patient lying down —
            typically sicker, inpatient) versus <b style={{ color: VIEW_COLORS.PA }}>PA</b> (standing, usually outpatient)? Large differences flag
            possible shortcut learning: a model could learn “AP ⇒ abnormal”.
          </p>
        </div>
        <span className="scope-pill">Full dataset · all findings · no filters</span>
      </div>
      <Card
        title="AP vs PA proportion within each finding"
        subtitle={
          <>
            Unit: <b>% of images</b> with that finding (each bar sums to 100%). <b>[n]</b> = total images carrying the finding. All{' '}
            {fmt(ds.n)} images; an image with several findings counts once in each of its findings’ bars.
          </>
        }
        actions={<Segmented<Sort> label="Sort" value={sort} onChange={setSort} options={[{ value: 'ap', label: '% AP' }, { value: 'n', label: 'n' }, { value: 'name', label: 'A–Z' }]} />}
      >
        <div className="controls">
          <Legend items={[{ label: 'PA (posterior→anterior, standing)', color: VIEW_COLORS.PA }, { label: 'AP (anterior→posterior, often supine / sicker)', color: VIEW_COLORS.AP }]} />
          <span className="muted small">Dashed line: AP share across all images ({pct(overallAP)}).</span>
        </div>
        <StackedBars rows={rows} overall={overall} />
      </Card>
      <Note>
        Proportions make AP/PA composition comparable across findings of very different frequency; the [n] column shows the sample size behind
        each bar — treat bars with small n (e.g. Hernia) with caution.
      </Note>
    </div>
  );
}

function StackedBars({ rows, overall }: { rows: FindingCount[]; overall: FindingCount }) {
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
            const name = isOverall ? 'All images' : r.finding === 'No Finding' ? 'No Finding' : prettyFinding(r.finding);
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
                  {name}
                </text>
                {tot === 0 ? (
                  <text className="muted small" x={4} y={bh / 2} dy="0.35em">No images with a recorded view</text>
                ) : (
                  <>
                    <rect className="bar" x={0} width={x(pa)} height={bh} fill={VIEW_COLORS.PA} {...tipFor(tip, `${name}: PA ${pct(pa)}`)} />
                    <rect className="bar" x={x(pa)} width={x(1 - pa)} height={bh} fill={VIEW_COLORS.AP} {...tipFor(tip, `${name}: AP ${pct(1 - pa)}`)} />
                    {x(pa) > 44 && <text className="seg-label on-dark" x={6} y={bh / 2} dy="0.35em">{pct(pa, 0)}</text>}
                    {x(1 - pa) > 44 && <text className="seg-label on-dark" x={w - 6} y={bh / 2} dy="0.35em" textAnchor="end">{pct(1 - pa, 0)}</text>}
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
