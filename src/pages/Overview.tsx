import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { prettyFinding, type Dataset } from '../lib/data';
import { allImages, findingCounts, overview } from '../lib/compute';
import { BarChart } from '../components/BarChart';
import { Axis, Card, fmt, Note, pct, Segmented, useTipHandlers, useWidth } from '../components/chart';
import { VIEW_COLORS } from '../theme';

export function OverviewPage({ ds }: { ds: Dataset }) {
  const o = useMemo(() => overview(ds), [ds]);
  const fc = useMemo(() => findingCounts(ds, allImages(ds)), [ds]);
  const [ippRange, setIppRange] = useState<'20' | 'all'>('20');
  const noFinding = fc.at(-1)!;

  const ippBars = useMemo(() => {
    const cap = ippRange === '20' ? 20 : Infinity;
    const rows = o.imagesPerPatient.filter((r) => r.images <= cap);
    if (cap !== Infinity) {
      const over = o.imagesPerPatient.filter((r) => r.images > cap).reduce((a, r) => a + r.patients, 0);
      rows.push({ images: cap + 1, patients: over });
    }
    return rows.map((r) => {
      const label = cap !== Infinity && r.images === cap + 1 ? `${cap + 1}+` : `${r.images}`;
      return {
        key: label,
        label,
        value: r.patients,
        tip: (
          <>
            <b>{label} image{label === '1' ? '' : 's'}</b>
            <div>{fmt(r.patients)} patients ({pct(r.patients / o.patients)} of patients)</div>
          </>
        ),
      };
    });
  }, [o, ippRange]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p className="lede">
            Single-variable distributions of the full dataset, before exploring relationships. Note the two different units: each row of the
            metadata is one <b>image</b>; a <b>patient</b> can have many images (follow-up visits).
          </p>
        </div>
        <span className="scope-pill">Full dataset · filters not applied</span>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi-v">{fmt(o.images)}</span><span className="kpi-l">images (rows)</span></div>
        <div className="kpi"><span className="kpi-v">{fmt(o.patients)}</span><span className="kpi-l">unique patients</span></div>
        <div className="kpi"><span className="kpi-v">{(o.images / o.patients).toFixed(2)}</span><span className="kpi-l">mean images per patient</span></div>
        <div className="kpi accent">
          <span className="kpi-v">{pct(noFinding.images / o.images)}</span>
          <span className="kpi-l">of images labelled “No Finding” ({fmt(noFinding.images)})</span>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Patients by recorded gender" subtitle={`Unit: patients (n = ${fmt(o.patients)}). Gender is constant per patient in this dataset.`}>
          <BarChart
            xLabel="Recorded gender"
            yLabel="# patients"
            bars={[
              { key: 'M', label: 'Male', value: o.patientsBySex.M, color: 'var(--male)', tip: <><b>Male</b><div>{fmt(o.patientsBySex.M)} patients ({pct(o.patientsBySex.M / o.patients)})</div></> },
              { key: 'F', label: 'Female', value: o.patientsBySex.F, color: 'var(--female)', tip: <><b>Female</b><div>{fmt(o.patientsBySex.F)} patients ({pct(o.patientsBySex.F / o.patients)})</div></> },
            ]}
          />
        </Card>

        <Card
          title="Patients by age"
          subtitle={`Unit: patients, by age at their first image (10-year bins). ${o.patientsMissingAge ? `${fmt(o.patientsMissingAge)} with no plausible age omitted.` : 'No patient lacks a plausible age.'}`}
        >
          <BarChart
            xLabel="Age at first image (years)"
            yLabel="# patients"
            bars={o.patientsByAge.map((b) => ({
              key: `${b.bin}`,
              label: b.bin === 90 ? '90+' : `${b.bin}–${b.bin + 9}`,
              value: b.patients,
              tip: <><b>Age {b.bin === 90 ? '90–100' : `${b.bin}–${b.bin + 9}`}</b><div>{fmt(b.patients)} patients ({pct(b.patients / o.patients)})</div></>,
            }))}
          />
        </Card>

        <Card
          title="Patients by number of images"
          subtitle="Unit: patients. Most patients have one image; a long tail has dozens (max 184)."
          actions={
            <Segmented label="X range" value={ippRange} onChange={setIppRange} options={[{ value: '20', label: '1–20+' }, { value: 'all', label: 'All' }]} />
          }
        >
          <BarChart xLabel="# images per patient" yLabel="# patients" bars={ippBars} valueLabels={ippRange === '20'} />
        </Card>

        <Card title="Images by view position" subtitle={`Unit: images (n = ${fmt(o.images)}). PA = standing, posterior→anterior; AP = often supine/portable.`}>
          <BarChart
            xLabel="View position"
            yLabel="# images"
            bars={[
              { key: 'PA', label: 'PA', value: o.imagesByView.PA, color: VIEW_COLORS.PA, tip: <><b>PA</b><div>{fmt(o.imagesByView.PA)} images ({pct(o.imagesByView.PA / o.images)})</div></> },
              { key: 'AP', label: 'AP', value: o.imagesByView.AP, color: VIEW_COLORS.AP, tip: <><b>AP</b><div>{fmt(o.imagesByView.AP)} images ({pct(o.imagesByView.AP / o.images)})</div></> },
            ]}
          />
        </Card>
      </div>

      <Card
        title="How common is each finding?"
        subtitle="Unit: images. Share = images carrying the label ÷ all 112,120 images. Labels are multi-label, so shares sum to more than 100%."
      >
        <FindingFrequency rows={fc} total={o.images} />
      </Card>

      <Note>
        <b>Why this matters.</b> A classifier that always predicts “No Finding” would already be right on {pct(noFinding.images / o.images, 0)} of images —
        contextualise accuracy figures against this baseline. Rare labels such as Hernia ({fmt(fc.find((f) => f.finding === 'Hernia')!.images)} images) offer very few examples.
      </Note>
    </div>
  );
}

function FindingFrequency({ rows, total }: { rows: ReturnType<typeof findingCounts>; total: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const sorted = [...rows].sort((a, b) => b.images - a.images);
  const narrow = width < 520;
  const m = { top: 8, right: narrow ? 92 : 120, bottom: 34, left: narrow ? 112 : 140 };
  const rowH = 24;
  const w = Math.max(100, width - m.left - m.right);
  const h = sorted.length * rowH;
  const x = d3.scaleLinear().domain([0, d3.max(sorted, (r) => r.images)!]).range([0, w]).nice();
  const y = d3.scaleBand().domain(sorted.map((r) => r.finding)).range([0, h]).padding(0.2);
  return (
    <div ref={ref} className="chart">
      <svg width={w + m.left + m.right} height={h + m.top + m.bottom} role="group" aria-label="Images per finding">
        <g transform={`translate(${m.left},${m.top})`}>
          <Axis scale={x as any} orient="bottom" transform={`translate(0,${h})`} ticks={Math.max(2, Math.floor(w / 90))} format={d3.format('~s')} grid gridSize={h} />
          {sorted.map((r) => (
            <g key={r.finding} transform={`translate(0,${y(r.finding)})`}>
              <text className="row-label" x={-8} y={y.bandwidth() / 2} dy="0.35em" textAnchor="end">
                {r.finding === 'No Finding' ? 'No Finding' : prettyFinding(r.finding)}
              </text>
              <rect
                className="bar"
                width={Math.max(1, x(r.images))}
                height={y.bandwidth()}
                fill={r.finding === 'No Finding' ? 'var(--muted-bar)' : 'var(--bar)'}
                {...tipFor(
                  <>
                    <b>{prettyFinding(r.finding)}</b>
                    <div>{fmt(r.images)} images ({pct(r.images / total)} of all images)</div>
                    <div>{fmt(r.patients)} patients with ≥1 such image</div>
                  </>,
                  `${r.finding}: ${r.images} images`,
                )}
              />
              <text className="bar-value" x={x(r.images) + 6} y={y.bandwidth() / 2} dy="0.35em">
                {fmt(r.images)} {!narrow && <tspan className="muted">({pct(r.images / total)})</tspan>}
              </text>
            </g>
          ))}
          <text className="axis-label" x={w / 2} y={h + 30} textAnchor="middle"># images</text>
        </g>
      </svg>
    </div>
  );
}
