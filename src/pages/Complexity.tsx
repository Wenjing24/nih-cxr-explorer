import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Dataset } from '../lib/data';
import { complexityByAge, complexityByView, imagesPerPatientByAge, meanFindingsByAge, MAX_COMPLEXITY_BUCKET } from '../lib/compute';
import { Axis, AxisLabel, Card, fmt, Legend, Note, pct, Segmented, useTipHandlers, useWidth } from '../components/chart';
import { COMPLEXITY_COLORS, markerPath, VIEW_COLORS, VIEW_SHAPES } from '../theme';

const M = { top: 18, right: 18, bottom: 46, left: 62 };
const H = 280;

export function ComplexityPage({ ds }: { ds: Dataset }) {
  const byView = useMemo(() => complexityByView(ds), [ds]);
  const byAge = useMemo(() => complexityByAge(ds), [ds]);
  const meanByAge = useMemo(() => meanFindingsByAge(ds), [ds]);
  const ippByAge = useMemo(() => imagesPerPatientByAge(ds), [ds]);
  const totPA = d3.sum(byView.PA);
  const totAP = d3.sum(byView.AP);
  const multi = (arr: number[]) => d3.sum(arr.slice(2)) / d3.sum(arr);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Variables vs. label complexity</h2>
          <p className="lede">
            <b>Label complexity</b> = number of the 14 findings recorded on an image (0 = “No Finding”). How does it vary with view position,
            age and imaging frequency? Hover any mark for exact counts.
          </p>
        </div>
        <span className="scope-pill">Full dataset · filters not applied</span>
      </div>

      <div className="grid-2">
        <Card
          title="Images by number of findings, per view position"
          subtitle={`Unit: images. PA n = ${fmt(totPA)}, AP n = ${fmt(totAP)}.`}
        >
          <ViewLines PA={byView.PA} AP={byView.AP} />
          <p className="caption">
            {pct(multi(byView.AP))} of AP images carry ≥2 findings vs {pct(multi(byView.PA))} of PA images. Hover (or tap) the small points on the
            right to open a magnifier with exact counts.
          </p>
        </Card>

        <Card title="Label complexity within each age group" subtitle="Unit: % of images in each 10-year age bin (bins sum to 100%). Missing-age images excluded.">
          <AgeStack rows={byAge} />
        </Card>

        <Card title="Mean findings per image by age" subtitle="Unit: images. One dot per year of age; dot area ∝ number of images at that age.">
          <MeanByAge rows={meanByAge} />
        </Card>

        <Card title="Images per patient by age" subtitle="Unit: patients, by age at first image. y = mean images per patient; colour = mean findings per image.">
          <IppByAge rows={ippByAge} />
        </Card>
      </div>
      <Note>
        AP images (often portable/supine, sicker patients) carry more findings than PA images. A model could exploit view position as a
        shortcut for “abnormal” — see the <a href="#/view-position">View position</a> page for per-finding detail.
      </Note>
    </div>
  );
}

function ViewLines({ PA, AP }: { PA: number[]; AP: number[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const [unit, setUnit] = useState<'count' | 'share'>('count');
  // magnifier: centre k of a 3-point window, or null when hidden
  const [zoomK, setZoomK] = useState<number | null>(null);
  const w = width - M.left - M.right;
  const h = H - M.top - M.bottom;
  const tot = { PA: d3.sum(PA), AP: d3.sum(AP) };
  const ks = d3.range(PA.length);
  const series = { PA, AP };
  const val = (v: 'PA' | 'AP', k: number) => (unit === 'count' ? series[v][k] : series[v][k] / tot[v]);
  const x = d3.scalePoint<number>().domain(ks).range([0, w]).padding(0.3);
  const step = x.step();
  const dodge = { PA: -Math.min(5, step * 0.12), AP: Math.min(5, step * 0.12) };
  const maxV = d3.max(ks.flatMap((k) => [val('PA', k), val('AP', k)]))!;
  const y = d3.scaleLinear().domain([0, maxV * 1.08]).range([h, 0]).nice();
  const f = unit === 'count' ? d3.format('~s') : (v: number) => pct(v, v < 0.01 ? 2 : 0);
  const exact = (v: 'PA' | 'AP', k: number) => (unit === 'count' ? fmt(series[v][k]) : pct(val(v, k), val(v, k) < 0.001 ? 3 : val(v, k) < 0.01 ? 2 : 1));
  // points too small to read at full scale: < 25% of the maximum
  const zoomable = (k: number) => Math.max(val('PA', k), val('AP', k)) < maxV * 0.25;
  const firstZoom = ks.find(zoomable) ?? ks.length;

  const kAt = (px: number) => Math.max(0, Math.min(ks.length - 1, Math.round((px - x(0)!) / step)));
  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - M.left;
    const py = e.clientY - r.top - M.top;
    const k = kAt(px);
    setZoomK(py >= -10 && py <= h + 20 && zoomable(k) ? k : null);
  };

  // magnifier geometry
  let zoom: JSX.Element | null = null;
  if (zoomK !== null && w > 0) {
    const lo = Math.max(firstZoom, zoomK - 1);
    const hi = Math.min(ks.length - 1, lo + 2);
    const win = d3.range(Math.max(firstZoom, hi - 2), hi + 1);
    const zMax = d3.max(win.flatMap((k) => [val('PA', k), val('AP', k)])) || 1;
    const narrow = width < 420;
    const bw = narrow ? 168 : 230;
    const bh = narrow ? 112 : 132;
    const bandX0 = x(win[0])! - step / 2;
    const bandX1 = x(win[win.length - 1])! + step / 2;
    const bandTop = y(zMax) - 8;
    const minLeft = x(Math.min(firstZoom, ks.length - 1))! - step / 2;
    const bx = Math.max(minLeft, Math.min(w - bw, (bandX0 + bandX1) / 2 - bw / 2));
    const by = 0;
    const ip = { l: 40, r: 10, t: 24, b: 30 };
    const xi = d3.scalePoint<number>().domain(win).range([ip.l, bw - ip.r]).padding(0.45);
    const yi = d3.scaleLinear().domain([0, zMax * 1.15]).range([bh - ip.b, ip.t]).nice(3);
    const di = { PA: -7, AP: 7 };
    zoom = (
      <g className="magnifier" pointerEvents="none">
        <rect className="mag-band" x={bandX0} y={bandTop} width={bandX1 - bandX0} height={h - bandTop + 4} />
        <line className="mag-link" x1={bandX0} y1={bandTop} x2={bx} y2={by + bh} />
        <line className="mag-link" x1={bandX1} y1={bandTop} x2={bx + bw} y2={by + bh} />
        <g transform={`translate(${bx},${by})`}>
          <rect className="mag-box" width={bw} height={bh} rx={8} />
          <text className="mag-title" x={10} y={15}>Zoom · y-axis rescaled (0–{f(yi.domain()[1])})</text>
          {yi.ticks(3).map((t) => (
            <g key={t} transform={`translate(0,${yi(t)})`}>
              <line x1={ip.l} x2={bw - ip.r} className="mag-grid" />
              <text x={ip.l - 5} dy="0.32em" textAnchor="end" className="mag-tick">{f(t)}</text>
            </g>
          ))}
          {win.map((k) => (
            <text key={k} x={xi(k)} y={bh - 6} textAnchor="middle" className="mag-tick">{k}</text>
          ))}
          {(['PA', 'AP'] as const).map((v) => (
            <g key={v}>
              <path
                d={d3.line<number>().x((k) => xi(k)! + di[v]).y((k) => yi(val(v, k)))(win)!}
                fill="none"
                stroke={VIEW_COLORS[v]}
                strokeWidth={2}
                strokeDasharray={v === 'AP' ? '6 3' : undefined}
              />
              {win.map((k) => (
                <g key={k} transform={`translate(${xi(k)! + di[v]},${yi(val(v, k))})`}>
                  <path d={markerPath(VIEW_SHAPES[v], 4.5)} fill="var(--surface)" stroke={VIEW_COLORS[v]} strokeWidth={2} />
                  <text className="mag-val" x={v === 'PA' ? -6 : 6} y={v === 'PA' ? 15 : -7} textAnchor={v === 'PA' ? 'end' : 'start'} fill={VIEW_COLORS[v]}>
                    {exact(v, k)}
                  </text>
                </g>
              ))}
            </g>
          ))}
        </g>
      </g>
    );
  }

  return (
    <div ref={ref} className="chart">
      <div className="controls">
        <Segmented label="Y" value={unit} onChange={setUnit} options={[{ value: 'count', label: '# images' }, { value: 'share', label: '% within view' }]} />
        <Legend items={[{ label: 'PA (standing)', color: VIEW_COLORS.PA, swatch: 'line', marker: 'circle' }, { label: 'AP (often supine, sicker)', color: VIEW_COLORS.AP, swatch: 'line', marker: 'triangle', dashed: true }]} />
      </div>
      <svg width={width} height={H} onPointerMove={onPointer} onPointerDown={onPointer} onMouseLeave={() => setZoomK(null)} className="view-lines">
        <g transform={`translate(${M.left},${M.top})`}>
          <Axis scale={y as any} orient="left" ticks={5} grid gridSize={w} format={f as any} />
          <Axis scale={x as any} orient="bottom" transform={`translate(0,${h})`} />
          {firstZoom < ks.length && zoomK === null && (
            <text className="mag-hint" x={x(firstZoom)! - step / 2 + 4} y={y(maxV * 0.25) - 6}>
              🔍 hover here to magnify {firstZoom}+ findings
            </text>
          )}
          {(['PA', 'AP'] as const).map((v) => (
            <g key={v}>
              <path
                d={d3.line<number>().x((k) => x(k)! + dodge[v]).y((k) => y(val(v, k)))(ks)!}
                fill="none"
                stroke={VIEW_COLORS[v]}
                strokeWidth={2.5}
                strokeDasharray={v === 'AP' ? '7 4' : undefined}
              />
              {ks.map((k) => {
                const n = series[v][k];
                return (
                  <path
                    key={k}
                    className="dot"
                    d={markerPath(VIEW_SHAPES[v], 5)}
                    transform={`translate(${x(k)! + dodge[v]},${y(val(v, k))})`}
                    fill="var(--surface)"
                    stroke={VIEW_COLORS[v]}
                    strokeWidth={2.5}
                    {...tipFor(
                      <>
                        <b>{v} · {k} finding{k === 1 ? '' : 's'}</b>
                        <div>{fmt(n)} images</div>
                        <div>{pct(n / tot[v], 2)} of {v} images</div>
                      </>,
                      `${v}, ${k} findings: ${n} images`,
                    )}
                    onFocusCapture={() => setZoomK(zoomable(k) ? k : null)}
                  />
                );
              })}
            </g>
          ))}
          {zoom}
          <AxisLabel x={-M.left + 14} y={h / 2} rotate>{unit === 'count' ? '# images' : '% of images within view'}</AxisLabel>
          <AxisLabel x={w / 2} y={h + 38}># findings on image</AxisLabel>
        </g>
      </svg>
    </div>
  );
}

function AgeStack({ rows }: { rows: ReturnType<typeof complexityByAge> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const w = width - M.left - M.right;
  const h = H - M.top - M.bottom;
  const label = (b: number) => (b === 90 ? '90+' : `${b}–${b + 9}`);
  const x = d3.scaleBand().domain(rows.map((r) => `${r.bin}`)).range([0, w]).padding(0.18);
  const y = d3.scaleLinear().domain([0, 1]).range([h, 0]);
  const keys = d3.range(MAX_COMPLEXITY_BUCKET + 1);
  const kLabel = (k: number) => (k === MAX_COMPLEXITY_BUCKET ? `${k}+ findings` : `${k} finding${k === 1 ? '' : 's'}`);
  return (
    <div ref={ref} className="chart">
      <div className="controls">
        <Legend items={keys.map((k) => ({ label: kLabel(k), color: COMPLEXITY_COLORS[k] }))} />
      </div>
      <svg width={width} height={H}>
        <g transform={`translate(${M.left},${M.top})`}>
          <Axis scale={y as any} orient="left" ticks={5} format={d3.format('.0%')} grid gridSize={w} />
          <Axis scale={x as any} orient="bottom" transform={`translate(0,${h})`} format={(b: string) => label(+b)} />
          {rows.map((r) => {
            let acc = 0;
            return (
              <g key={r.bin} transform={`translate(${x(`${r.bin}`)},0)`}>
                {r.total === 0 ? (
                  <text className="muted small" x={x.bandwidth() / 2} y={h - 6} textAnchor="middle">n=0</text>
                ) : (
                  keys.map((k) => {
                    const share = r.counts[k] / r.total;
                    const y0 = acc;
                    acc += share;
                    return (
                      <rect
                        key={k}
                        className="bar"
                        y={y(acc)}
                        height={Math.max(0, y(y0) - y(acc))}
                        width={x.bandwidth()}
                        fill={COMPLEXITY_COLORS[k]}
                        {...tipFor(
                          <>
                            <b>Age {label(r.bin)} · {kLabel(k)}</b>
                            <div>{fmt(r.counts[k])} of {fmt(r.total)} images ({pct(share)})</div>
                          </>,
                          `Age ${label(r.bin)}, ${kLabel(k)}: ${pct(share)}`,
                        )}
                      />
                    );
                  })
                )}
              </g>
            );
          })}
          <AxisLabel x={-M.left + 14} y={h / 2} rotate>% of images in age bin</AxisLabel>
          <AxisLabel x={w / 2} y={h + 38}>Patient age at image (years)</AxisLabel>
        </g>
      </svg>
    </div>
  );
}

function MeanByAge({ rows }: { rows: ReturnType<typeof meanFindingsByAge> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const w = width - M.left - M.right;
  const h = H - M.top - M.bottom;
  const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.mean)! * 1.1]).range([h, 0]).nice();
  const r = d3.scaleSqrt().domain([0, d3.max(rows, (d) => d.images)!]).range([1.5, 9]);
  return (
    <div ref={ref} className="chart">
      <svg width={width} height={H}>
        <g transform={`translate(${M.left},${M.top})`}>
          <Axis scale={y as any} orient="left" ticks={5} grid gridSize={w} />
          <Axis scale={x as any} orient="bottom" transform={`translate(0,${h})`} />
          {rows.map((d) => (
            <circle
              key={d.age}
              className="dot"
              cx={x(d.age)}
              cy={y(d.mean)}
              r={r(d.images)}
              fill="var(--bar)"
              fillOpacity={d.images < 30 ? 0.15 : 0.55}
              stroke="var(--bar)"
              {...tipFor(
                <>
                  <b>Age {d.age}</b>
                  <div>Mean {d.mean.toFixed(2)} findings per image</div>
                  <div>n = {fmt(d.images)} images</div>
                </>,
                `Age ${d.age}: mean ${d.mean.toFixed(2)} findings`,
              )}
            />
          ))}
          <AxisLabel x={-M.left + 14} y={h / 2} rotate>Mean # findings per image</AxisLabel>
          <AxisLabel x={w / 2} y={h + 38}>Patient age at image (years)</AxisLabel>
        </g>
      </svg>
    </div>
  );
}

function IppByAge({ rows }: { rows: ReturnType<typeof imagesPerPatientByAge> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const w = width - M.left - M.right;
  const h = H - M.top - M.bottom;
  const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
  // ages with very few patients produce noisy means; keep them but make them faint
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.meanImages)! * 1.08]).range([h, 0]).nice();
  const ext = d3.extent(rows, (r) => r.meanFindings) as [number, number];
  const c = d3.scaleSequential(d3.interpolateYlGnBu).domain([ext[0] - 0.1 * (ext[1] - ext[0]), ext[1]]);
  const legendW = 140;
  return (
    <div ref={ref} className="chart">
      <div className="controls">
        <div className="colorbar" aria-label="Colour scale: mean findings per image">
          <span>Mean findings / image</span>
          <svg width={legendW + 50} height={26}>
            <defs>
              <linearGradient id="ippGrad">
                {d3.range(0, 1.01, 0.1).map((t) => (
                  <stop key={t} offset={`${t * 100}%`} stopColor={c(ext[0] + t * (ext[1] - ext[0]))} />
                ))}
              </linearGradient>
            </defs>
            <rect x={20} y={2} width={legendW} height={10} fill="url(#ippGrad)" rx={2} />
            <text x={20} y={24} className="small" textAnchor="middle">{ext[0].toFixed(2)}</text>
            <text x={20 + legendW} y={24} className="small" textAnchor="middle">{ext[1].toFixed(2)}</text>
          </svg>
        </div>
      </div>
      <svg width={width} height={H}>
        <g transform={`translate(${M.left},${M.top})`}>
          <Axis scale={y as any} orient="left" ticks={5} grid gridSize={w} />
          <Axis scale={x as any} orient="bottom" transform={`translate(0,${h})`} />
          {rows.map((d) => (
            <circle
              key={d.age}
              className="dot"
              cx={x(d.age)}
              cy={y(d.meanImages)}
              r={d.patients < 10 ? 3 : 5}
              fill={c(d.meanFindings)}
              stroke="var(--ink-soft)"
              strokeWidth={0.6}
              opacity={d.patients < 10 ? 0.45 : 1}
              {...tipFor(
                <>
                  <b>Age {d.age} at first image</b>
                  <div>{fmt(d.patients)} patients</div>
                  <div>Mean {d.meanImages.toFixed(2)} images per patient</div>
                  <div>Mean {d.meanFindings.toFixed(2)} findings per image</div>
                  {d.patients < 10 && <div className="muted">Fewer than 10 patients — noisy estimate</div>}
                </>,
                `Age ${d.age}: ${d.meanImages.toFixed(2)} images per patient`,
              )}
            />
          ))}
          <AxisLabel x={-M.left + 14} y={h / 2} rotate>Mean # images per patient</AxisLabel>
          <AxisLabel x={w / 2} y={h + 38}>Age at first image (years)</AxisLabel>
        </g>
      </svg>
    </div>
  );
}
