import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { PageProps } from '../App';
import { prettyFinding } from '../lib/data';
import { filterImages, intersectionCounts, type CountUnit } from '../lib/compute';
import { describeFilters, toggleFinding } from '../lib/filters';
import { FilterPanel } from '../components/FilterPanel';
import { Card, Empty, fmt, Note, pct, Segmented, useTooltip, useWidth } from '../components/chart';
import { SET_COLORS } from '../theme';

const SUGGESTED: string[][] = [
  ['Effusion', 'Atelectasis', 'Infiltration'],
  ['Cardiomegaly', 'Effusion', 'Edema'],
  ['Mass', 'Nodule'],
];

export function CooccurrencePage({ ds, filters, setFilters }: PageProps) {
  const idx = useMemo(() => filterImages(ds, filters), [ds, filters]);
  const [unit, setUnit] = useState<CountUnit>('images');
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const sel = filters.findings;
  const intersections = useMemo(() => intersectionCounts(ds, idx, sel, unit), [ds, idx, sel, unit]);
  const active = hover ?? pinned;
  const unitWord = unit === 'images' ? 'images' : 'patients';
  const regionName = (mask: number) => {
    const included = sel.filter((_, i) => mask & (1 << i)).map(prettyFinding);
    const excluded = sel.filter((_, i) => !(mask & (1 << i))).map(prettyFinding);
    return `${included.join(' + ')}${excluded.length ? ` only (not ${excluded.join(', ')})` : ''}`;
  };

  const regionRows = [...intersections.regions.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const totalWithAny = intersections.denominator - intersections.none;

  let body;
  if (sel.length === 0) {
    body = (
      <Empty title="Select 1–3 findings to compare">
        Use the checkboxes in the filter panel, or start from a suggestion:
        <span className="chip-row">
          {SUGGESTED.map((suggestion) => (
            <button key={suggestion.join()} type="button" className="chip" onClick={() => setFilters({ ...filters, findings: suggestion })}>
              {suggestion.map(prettyFinding).join(' · ')}
            </button>
          ))}
        </span>
      </Empty>
    );
  } else if (intersections.denominator === 0) {
    body = <Empty title="No images match the current filters">Widen the age range or reset gender/view filters.</Empty>;
  } else {
    body = (
      <div className="upset-layout">
        <UpSetPlot
          sel={sel}
          result={intersections}
          unitWord={unitWord}
          active={active}
          pinned={pinned}
          setHover={setHover}
          onPick={(mask) => setPinned(pinned === mask ? null : mask)}
          regionName={regionName}
        />
        <div className="upset-side">
          <h4>Intersections <span className="muted">(exclusive, {unitWord})</span></h4>
          <table className="region-table">
            <thead>
              <tr>
                <th scope="col">Combination</th>
                <th scope="col" className="num">#</th>
                <th scope="col" className="num" title={`% of all ${fmt(intersections.denominator)} filtered ${unitWord}`}>% of all</th>
              </tr>
            </thead>
            <tbody>
              {regionRows.map(([mask, count]) => (
                <tr
                  key={mask}
                  className={active === mask ? 'active' : ''}
                  onMouseEnter={() => setHover(mask)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setPinned(pinned === mask ? null : mask)}
                  tabIndex={0}
                  onFocus={() => setHover(mask)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPinned(pinned === mask ? null : mask))}
                >
                  <td>
                    <span className="combo-dots" aria-hidden>
                      {sel.map((finding, i) => (
                        <span key={finding} className={`cdot ${mask & (1 << i) ? 'in' : ''}`} style={{ ['--c' as any]: SET_COLORS[i] }} />
                      ))}
                    </span>
                    {regionName(mask)}
                  </td>
                  <td className="num">{fmt(count)}</td>
                  <td className="num">{pct(count / intersections.denominator, 2)}</td>
                </tr>
              ))}
              <tr className="none-row">
                <td>None of the selected findings</td>
                <td className="num">{fmt(intersections.none)}</td>
                <td className="num">{pct(intersections.none / intersections.denominator, 1)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Denominator: all filtered {unitWord}</td>
                <td className="num">{fmt(intersections.denominator)}</td>
                <td className="num">100%</td>
              </tr>
            </tfoot>
          </table>

          {sel.length >= 2 && (
            <>
              <h4>Conditional co-occurrence</h4>
              <ul className="cond-list">
                {sel.flatMap((a, i) =>
                  sel.map((b, j) => {
                    if (i === j) return null;
                    let both = 0;
                    intersections.regions.forEach((count, mask) => {
                      if (mask & (1 << i) && mask & (1 << j)) both += count;
                    });
                    const base = intersections.totals[i];
                    return (
                      <li key={`${a}-${b}`}>
                        Of {fmt(base)} {unitWord} with <b>{prettyFinding(a)}</b>,{' '}
                        <b>{pct(base ? both / base : null)}</b> also have <b>{prettyFinding(b)}</b>
                      </li>
                    );
                  }),
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page with-filters">
      <FilterPanel ds={ds} filters={filters} setFilters={setFilters} idx={idx} findingsHint="Each checked finding becomes a row in the UpSet plot (max 3)." />
      <div className="page-body">
        <div className="page-head">
          <div>
            <h2>Finding co-occurrence</h2>
            <p className="lede">
              Which findings appear together? Each bar is one exact intersection; the filled dots below show which findings are included.
              Bars are sorted from largest to smallest. Hover or click a column (or table row) to highlight it.
            </p>
          </div>
        </div>
        <Card
          title={sel.length ? sel.map(prettyFinding).join(' · ') : 'Co-occurrence'}
          subtitle={
            <>
              Unit: <b>{unitWord}</b>
              {unit === 'patients' && ' · a patient counts toward a finding if any of their filtered images carries it'}. Denominator:{' '}
              {fmt(intersections.denominator)} filtered {unitWord} ({describeFilters(filters)}).
              {sel.length > 0 && intersections.denominator > 0 && <> {fmt(totalWithAny)} ({pct(totalWithAny / intersections.denominator)}) have ≥1 selected finding.</>}
            </>
          }
          actions={
            <Segmented<CountUnit>
              label="Count"
              value={unit}
              onChange={(nextUnit) => { setUnit(nextUnit); setPinned(null); }}
              options={[{ value: 'images', label: 'Images' }, { value: 'patients', label: 'Patients' }]}
            />
          }
        >
          {body}
        </Card>
        {sel.length > 0 && (
          <Note>
            UpSet bars show mutually exclusive combinations, so each {unitWord.slice(0, -1)} appears in exactly one bar. Filled dots identify
            included findings; open dots identify excluded findings. Selected findings can be removed with these chips:{' '}
            {sel.map((finding, i) => (
              <button key={finding} type="button" className="chip small" style={{ borderColor: SET_COLORS[i] }} onClick={() => setFilters(toggleFinding(filters, finding))}>
                {prettyFinding(finding)} ×
              </button>
            ))}
          </Note>
        )}
      </div>
    </div>
  );
}

function UpSetPlot({
  sel, result, unitWord, active, pinned, setHover, onPick, regionName,
}: {
  sel: string[];
  result: ReturnType<typeof intersectionCounts>;
  unitWord: string;
  active: number | null;
  pinned: number | null;
  setHover: (mask: number | null) => void;
  onPick: (mask: number) => void;
  regionName: (mask: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTooltip();
  const columns = [...result.regions.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const W = Math.max(300, width);
  const compact = W < 520;
  const margin = { top: 28, right: 12, left: 154 };
  const plotW = Math.max(120, W - margin.left - margin.right);
  const barH = compact ? 150 : 190;
  const matrixTop = barH + 42;
  const rowH = compact ? 28 : 32;
  const H = matrixTop + sel.length * rowH + 24;
  const x = d3.scaleBand<number>().domain(columns.map(([mask]) => mask)).range([0, plotW]).padding(0.22);
  const maxCount = d3.max(columns, ([, count]) => count) ?? 1;
  const y = d3.scaleLinear().domain([0, Math.max(1, maxCount) * 1.12]).range([barH, 0]).nice();

  const showTip = (e: { clientX: number; clientY: number }, mask: number, count: number) => tip.show(e, (
    <>
      <b>{regionName(mask)}</b>
      <div>{fmt(count)} {unitWord}</div>
      <div>{pct(count / result.denominator, 2)} of all filtered {unitWord}</div>
      <div className="muted">Click to pin</div>
    </>
  ));

  return (
    <div ref={ref} className="chart upset">
      <svg width={W} height={H} role="img" aria-label={`UpSet plot of ${sel.join(', ')}`}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          <AxisForUpSet scale={y} width={plotW} unitWord={unitWord} />
          <text className="axis-label" x={-margin.left + 12} y={barH / 2} textAnchor="middle" transform={`rotate(-90 ${-margin.left + 12} ${barH / 2})`}>
            # {unitWord}
          </text>
          {sel.map((finding, row) => (
            <g key={finding} transform={`translate(0,${matrixTop + row * rowH})`}>
              <line className="upset-row-line" x1={0} x2={plotW} y1={0} y2={0} />
              <circle cx={-10} cy={0} r={5} fill={SET_COLORS[row]} />
              <text className="upset-set-label" x={-20} y={0} dy="0.35em" textAnchor="end">
                {prettyFinding(finding)} ({fmt(result.totals[row])})
              </text>
            </g>
          ))}
          {columns.map(([mask, count]) => {
            const bx = x(mask)!;
            const cx = bx + x.bandwidth() / 2;
            const included = sel.map((_, row) => row).filter((row) => mask & (1 << row));
            const first = included[0];
            const last = included.at(-1)!;
            const isActive = active === mask;
            const labelFits = x.bandwidth() >= 29;
            return (
              <g
                key={mask}
                className={`upset-column ${isActive ? 'active' : ''}`}
                role="button"
                aria-label={`${regionName(mask)}: ${fmt(count)} ${unitWord}`}
                aria-pressed={pinned === mask}
                tabIndex={0}
                onMouseEnter={() => setHover(mask)}
                onMouseMove={(e) => showTip(e, mask, count)}
                onMouseLeave={() => { setHover(null); tip.hide(); }}
                onFocus={(e) => {
                  setHover(mask);
                  const box = e.currentTarget.getBoundingClientRect();
                  showTip({ clientX: box.right, clientY: box.top }, mask, count);
                }}
                onBlur={() => { setHover(null); tip.hide(); }}
                onClick={() => onPick(mask)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(mask))}
              >
                <rect className="upset-hit" x={bx} y={0} width={x.bandwidth()} height={H - margin.top - 10} />
                <rect
                  className="upset-bar"
                  x={bx}
                  y={count ? y(count) : barH - 1}
                  width={x.bandwidth()}
                  height={count ? Math.max(1, barH - y(count)) : 1}
                />
                {labelFits && count > 0 && (
                  <text className="upset-count" x={cx} y={y(count) - 5} textAnchor="middle">{fmt(count)}</text>
                )}
                {included.length > 1 && (
                  <line
                    className="upset-connector"
                    x1={cx}
                    x2={cx}
                    y1={matrixTop + first * rowH}
                    y2={matrixTop + last * rowH}
                  />
                )}
                {sel.map((finding, row) => {
                  const on = Boolean(mask & (1 << row));
                  return (
                    <circle
                      key={finding}
                      className={`upset-dot ${on ? 'in' : 'out'}`}
                      cx={cx}
                      cy={matrixTop + row * rowH}
                      r={compact ? 5.5 : 6.5}
                      fill={on ? SET_COLORS[row] : 'var(--surface)'}
                    />
                  );
                })}
              </g>
            );
          })}
          <text className="upset-caption" x={plotW / 2} y={H - margin.top - 2} textAnchor="middle">Exclusive intersections · largest first</text>
        </g>
      </svg>
    </div>
  );
}

function AxisForUpSet({ scale, width, unitWord }: { scale: d3.ScaleLinear<number, number>; width: number; unitWord: string }) {
  const ticks = scale.ticks(5);
  return (
    <g className="upset-axis" aria-label={`Number of ${unitWord}`}>
      {ticks.map((tick) => (
        <g key={tick} transform={`translate(0,${scale(tick)})`}>
          <line x1={0} x2={width} />
          <text x={-8} dy="0.35em" textAnchor="end">{d3.format('~s')(tick)}</text>
        </g>
      ))}
      <line className="domain" x1={0} x2={0} y1={0} y2={scale(0)} />
    </g>
  );
}
