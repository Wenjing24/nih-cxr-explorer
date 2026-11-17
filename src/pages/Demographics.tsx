import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { PageProps } from '../App';
import { prettyFinding, SEX_LABELS, type Dataset } from '../lib/data';
import { anyFindingMask, filterImages, findingBit, prevalenceByAgeSex, type CountUnit, type PrevalenceSeries } from '../lib/compute';
import { describeFilters } from '../lib/filters';
import { FilterPanel } from '../components/FilterPanel';
import { Axis, AxisLabel, Card, Empty, fmt, Legend, Note, pct, Segmented, useTipHandlers, useWidth } from '../components/chart';
import { SET_COLORS, SEX_COLORS } from '../theme';

type Measure = 'rate' | 'count';
const SMALL_N = 30;

export function DemographicsPage({ ds, filters, setFilters }: PageProps) {
  const idx = useMemo(() => filterImages(ds, filters), [ds, filters]);
  const [unit, setUnit] = useState<CountUnit>('images');
  const [measure, setMeasure] = useState<Measure>('rate');
  const [bin, setBin] = useState<5 | 10>(10);
  const [sharedY, setSharedY] = useState<'shared' | 'free'>('free');
  const panels = filters.findings.length
    ? filters.findings.map((f, i) => ({ key: f, title: prettyFinding(f), mask: findingBit(ds, f), color: SET_COLORS[i] }))
    : [{ key: 'any', title: 'Any finding (≥1 of 14)', mask: anyFindingMask(ds), color: 'var(--ink)' }];
  const results = useMemo(
    () => panels.map((p) => ({ ...p, ...prevalenceByAgeSex(ds, idx, p.mask, unit, bin) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds, idx, unit, bin, filters.findings.join()],
  );
  const sexes = filters.sex === 'all' ? [0, 1] : [filters.sex === 'M' ? 0 : 1];
  const val = (p: { k: number; rate: number | null }) => (measure === 'rate' ? p.rate : p.k);
  const globalMax = d3.max(results.flatMap((r) => r.series.filter((s) => sexes.includes(s.sex)).flatMap((s) => s.points.map((p) => val(p) ?? 0)))) ?? 0;
  const unitWord = unit === 'images' ? 'images' : 'patients';

  return (
    <div className="page with-filters">
      <FilterPanel
        ds={ds}
        filters={filters}
        setFilters={setFilters}
        idx={idx}
        findingsHint="One panel per finding (max 3). None checked = any abnormal finding."
      />
      <div className="page-body">
        <div className="page-head">
          <div>
            <h2>Findings by age and recorded gender</h2>
            <p className="lede">How does the prevalence of each finding change across age, and does it differ between male and female patients?</p>
          </div>
        </div>
        <Card
          title="Prevalence by age group"
          subtitle={
            measure === 'rate' ? (
              unit === 'images' ? (
                <>Unit: <b>% of images</b> — images with the finding ÷ all filtered images of that gender in the age bin.</>
              ) : (
                <>Unit: <b>% of patients</b> — patients with ≥1 image carrying the finding in that age bin ÷ patients with ≥1 filtered image in the bin.</>
              )
            ) : (
              <>Unit: <b># {unitWord}</b> carrying the finding in each age bin{unit === 'patients' ? ' (a patient imaged at several ages counts in each bin)' : ''}.</>
            )
          }
          actions={
            <>
              <Segmented<Measure> label="Show" value={measure} onChange={setMeasure} options={[{ value: 'rate', label: 'Prevalence %' }, { value: 'count', label: 'Count' }]} />
              <Segmented<CountUnit> label="Unit" value={unit} onChange={setUnit} options={[{ value: 'images', label: 'Images' }, { value: 'patients', label: 'Patients' }]} />
              <Segmented<'5' | '10'> label="Age bins" value={`${bin}` as '5' | '10'} onChange={(b) => setBin(+b as 5 | 10)} options={[{ value: '5', label: '5 y' }, { value: '10', label: '10 y' }]} />
              {panels.length > 1 && (
                <Segmented label="Y axes" value={sharedY} onChange={setSharedY} options={[{ value: 'free', label: 'Per panel' }, { value: 'shared', label: 'Shared' }]} />
              )}
            </>
          }
        >
          <div className="controls">
            <Legend
              items={sexes.map((s) => ({ label: SEX_LABELS[s], color: SEX_COLORS[s], swatch: 'line' as const, dashed: s === 1 }))}
            />
            <span className="muted small">Hollow points: fewer than {SMALL_N} {unitWord} in the bin (unstable). Filters: {describeFilters(filters)}.</span>
          </div>
          {idx.length === 0 ? (
            <Empty title="No images match the current filters">Widen the age range or reset the gender/view filters.</Empty>
          ) : (
            <div className={`multiples n${results.length}`}>
              {results.map((r) => (
                <AgePanel
                  key={r.key}
                  ds={ds}
                  title={r.title}
                  color={r.color}
                  series={r.series.filter((s) => sexes.includes(s.sex))}
                  measure={measure}
                  unitWord={unitWord}
                  bin={bin}
                  maxY={sharedY === 'shared' ? globalMax : undefined}
                  excluded={r.excluded}
                />
              ))}
            </div>
          )}
        </Card>
        <Note>
          “Recorded gender” is the <code>Patient Gender</code> field (M/F) as recorded in the metadata. Ages above 100 (16 images, data-entry errors such
          as 414) are treated as missing and left out of this chart. Ages 90–100 are pooled into the last bin.
        </Note>
      </div>
    </div>
  );
}

function AgePanel({
  title, color, series, measure, unitWord, bin, maxY, excluded,
}: {
  ds: Dataset;
  title: string;
  color: string;
  series: PrevalenceSeries[];
  measure: Measure;
  unitWord: string;
  bin: number;
  maxY?: number;
  excluded: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const [hoverBin, setHoverBin] = useState<number | null>(null);
  const m = { top: 14, right: 14, bottom: 44, left: 56 };
  const H = 260;
  const w = Math.max(160, width - m.left - m.right);
  const h = H - m.top - m.bottom;
  const val = (p: { n: number; k: number; rate: number | null }) => (measure === "rate" ? p.rate : p.n > 0 ? p.k : null);
  const bins = series[0]?.points.map((p) => p.bin) ?? [];
  const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
  const cx = (b: number) => x(Math.min(b + bin / 2, b === 90 && bin === 10 ? 95 : b + bin / 2));
  const top = maxY ?? d3.max(series.flatMap((s) => s.points.map((p) => val(p) ?? 0))) ?? 0;
  const y = d3.scaleLinear().domain([0, Math.max(top, measure === 'rate' ? 0.01 : 1) * 1.1]).range([h, 0]).nice();
  const hasData = series.some((s) => s.points.some((p) => p.n > 0));
  const label = (b: number) => (b + bin >= 100 ? `${b}–100` : `${b}–${b + bin - 1}`);

  return (
    <div ref={ref} className="panel">
      <h4 style={{ color }}>{title}</h4>
      {!hasData ? (
        <Empty title="No data for this selection" />
      ) : (
        <svg width={w + m.left + m.right} height={H}>
          <g transform={`translate(${m.left},${m.top})`}>
            <Axis scale={y as any} orient="left" ticks={5} grid gridSize={w} format={measure === 'rate' ? d3.format('.0%') : d3.format('~s')} />
            <Axis scale={x as any} orient="bottom" transform={`translate(0,${h})`} tickValues={d3.range(0, 101, 20)} />
            {hoverBin !== null && <line className="crosshair" x1={cx(hoverBin)} x2={cx(hoverBin)} y1={0} y2={h} />}
            {series.map((s) => {
              const line = d3
                .line<(typeof s.points)[number]>()
                .defined((p) => val(p) !== null)
                .x((p) => cx(p.bin))
                .y((p) => y(val(p)!))
                .curve(d3.curveMonotoneX);
              return (
                <g key={s.sex}>
                  <path d={line(s.points) ?? ''} fill="none" stroke={SEX_COLORS[s.sex]} strokeWidth={2.5} strokeDasharray={s.sex === 1 ? '6 4' : undefined} />
                  {s.points.map((p) =>
                    val(p) === null ? null : (
                      <circle
                        key={p.bin}
                        cx={cx(p.bin)}
                        cy={y(val(p)!)}
                        r={hoverBin === p.bin ? 5 : 3.5}
                        fill={p.n < SMALL_N ? 'var(--surface)' : SEX_COLORS[s.sex]}
                        stroke={SEX_COLORS[s.sex]}
                        strokeWidth={1.8}
                        pointerEvents="none"
                      />
                    ),
                  )}
                </g>
              );
            })}
            {bins.map((b) => {
              const pts = series.map((s) => ({ sex: s.sex, p: s.points.find((q) => q.bin === b)! }));
              const x0 = x(b);
              const x1 = x(Math.min(100, b + bin));
              return (
                <rect
                  key={b}
                  x={x0}
                  y={0}
                  width={Math.max(1, x1 - x0)}
                  height={h}
                  fill="transparent"
                  onMouseEnter={() => setHoverBin(b)}
                  {...(() => {
                    const t = tipFor(
                      <>
                        <b>{title} · age {label(b)}</b>
                        {pts.map(({ sex, p }) => (
                          <div key={sex}>
                            <span className="swatch inline" style={{ background: SEX_COLORS[sex] }} /> {SEX_LABELS[sex]}:{' '}
                            {p.n === 0 ? (
                              <span className="muted">no {unitWord}</span>
                            ) : (
                              <>
                                <b>{measure === 'rate' ? pct(p.rate) : fmt(p.k)}</b> <span className="muted">({fmt(p.k)} / {fmt(p.n)} {unitWord})</span>
                              </>
                            )}
                          </div>
                        ))}
                      </>,
                      `Age ${label(b)}`,
                    );
                    return {
                      ...t,
                      onMouseLeave: () => { setHoverBin(null); t.onMouseLeave(); },
                      onFocus: (e: React.FocusEvent<SVGElement>) => { setHoverBin(b); t.onFocus(e); },
                      onBlur: () => { setHoverBin(null); t.onBlur(); },
                    };
                  })()}
                />
              );
            })}
            <AxisLabel x={-m.left + 12} y={h / 2} rotate>{measure === 'rate' ? `% of ${unitWord}` : `# ${unitWord} with finding`}</AxisLabel>
            <AxisLabel x={w / 2} y={h + 36}>Patient age at image (years)</AxisLabel>
          </g>
        </svg>
      )}
      {excluded > 0 && <p className="muted small">{fmt(excluded)} filtered images without a plausible age not shown.</p>}
    </div>
  );
}
