import { useId, useMemo, useState } from 'react';
import type { PageProps } from '../App';
import { prettyFinding } from '../lib/data';
import { filterImages, vennCounts, type VennUnit } from '../lib/compute';
import { describeFilters, toggleFinding } from '../lib/filters';
import { fitCircles, layoutCircles, regionAt, regionLabelPoints, type Circle } from '../lib/venn';
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
  const [unit, setUnit] = useState<VennUnit>('images');
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const sel = filters.findings;
  const v = useMemo(() => vennCounts(ds, idx, sel, unit), [ds, idx, sel, unit]);
  const active = hover ?? pinned;
  const unitWord = unit === 'images' ? 'images' : 'patients';
  const regionName = (m: number) => {
    const inn = sel.filter((_, i) => m & (1 << i)).map(prettyFinding);
    const out = sel.filter((_, i) => !(m & (1 << i))).map(prettyFinding);
    return `${inn.join(' + ')}${out.length ? ` only (not ${out.join(', ')})` : ''}`;
  };

  // region list sorted by size
  const regionRows = [...v.regions.entries()].sort((a, b) => b[1] - a[1]);
  const totalWithAny = v.denominator - v.none;

  let body;
  if (sel.length === 0) {
    body = (
      <Empty title="Select 1–3 findings to compare">
        Use the checkboxes in the filter panel, or start from a suggestion:
        <span className="chip-row">
          {SUGGESTED.map((s) => (
            <button key={s.join()} type="button" className="chip" onClick={() => setFilters({ ...filters, findings: s })}>
              {s.map(prettyFinding).join(' · ')}
            </button>
          ))}
        </span>
      </Empty>
    );
  } else if (v.denominator === 0) {
    body = <Empty title="No images match the current filters">Widen the age range or reset gender/view filters.</Empty>;
  } else {
    body = (
      <div className="venn-layout">
        <VennDiagram
          sel={sel}
          v={v}
          unitWord={unitWord}
          active={active}
          setHover={setHover}
          onPick={(m) => setPinned(pinned === m ? null : m)}
          regionName={regionName}
        />
        <div className="venn-side">
          <h4>Regions <span className="muted">(exclusive, {unitWord})</span></h4>
          <table className="region-table">
            <thead>
              <tr>
                <th scope="col">Combination</th>
                <th scope="col" className="num">#</th>
                <th scope="col" className="num" title={`% of all ${fmt(v.denominator)} filtered ${unitWord}`}>% of all</th>
              </tr>
            </thead>
            <tbody>
              {regionRows.map(([m, c]) => (
                <tr
                  key={m}
                  className={active === m ? 'active' : ''}
                  onMouseEnter={() => setHover(m)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setPinned(pinned === m ? null : m)}
                  tabIndex={0}
                  onFocus={() => setHover(m)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPinned(pinned === m ? null : m))}
                >
                  <td>
                    <span className="combo-dots">
                      {sel.map((s, i) => (
                        <span key={s} className={`cdot ${m & (1 << i) ? 'in' : ''}`} style={{ ['--c' as any]: SET_COLORS[i] }} />
                      ))}
                    </span>
                    {regionName(m)}
                  </td>
                  <td className="num">{fmt(c)}</td>
                  <td className="num">{pct(c / v.denominator, 2)}</td>
                </tr>
              ))}
              <tr className="none-row">
                <td>None of the selected findings</td>
                <td className="num">{fmt(v.none)}</td>
                <td className="num">{pct(v.none / v.denominator, 1)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Denominator: all filtered {unitWord}</td>
                <td className="num">{fmt(v.denominator)}</td>
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
                    v.regions.forEach((c, m) => {
                      if (m & (1 << i) && m & (1 << j)) both += c;
                    });
                    const base = v.totals[i];
                    return (
                      <li key={`${a}-${b}`}>
                        Of {fmt(base)} {unitWord} with <b style={{ color: SET_COLORS[i] }}>{prettyFinding(a)}</b>,{' '}
                        <b>{pct(base ? both / base : null)}</b> also have <b style={{ color: SET_COLORS[j] }}>{prettyFinding(b)}</b>
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
      <FilterPanel ds={ds} filters={filters} setFilters={setFilters} idx={idx} findingsHint="Each checked finding becomes a circle (max 3)." />
      <div className="page-body">
        <div className="page-head">
          <div>
            <h2>Finding co-occurrence</h2>
            <p className="lede">
              Which findings appear together? Circle area is proportional to the number of {unitWord} carrying each finding; overlaps show {unitWord}{' '}
              with several findings. Hover or click a region (or table row) to highlight it.
            </p>
          </div>
        </div>
        <Card
          title={sel.length ? sel.map(prettyFinding).join(' · ') : 'Co-occurrence'}
          subtitle={
            <>
              Unit: <b>{unitWord}</b>
              {unit === 'patients' && ' — a patient counts toward a finding if any of their filtered images carries it'}. Denominator:{' '}
              {fmt(v.denominator)} filtered {unitWord} ({describeFilters(filters)}).
              {sel.length > 0 && v.denominator > 0 && <> {fmt(totalWithAny)} ({pct(totalWithAny / v.denominator)}) have ≥1 selected finding.</>}
            </>
          }
          actions={
            <Segmented<VennUnit>
              label="Count"
              value={unit}
              onChange={(u) => { setUnit(u); setPinned(null); }}
              options={[{ value: 'images', label: 'Images' }, { value: 'patients', label: 'Patients' }]}
            />
          }
        >
          {body}
        </Card>
        {sel.length > 0 && (
          <Note>
            Circle areas and two-way overlaps are drawn to scale; with three findings the overlaps can only be approximated by circles — always
            read the exact counts in the labels and table. Selected findings can be removed with the × chips:{' '}
            {sel.map((s, i) => (
              <button key={s} type="button" className="chip small" style={{ borderColor: SET_COLORS[i] }} onClick={() => setFilters(toggleFinding(filters, s))}>
                {prettyFinding(s)} ×
              </button>
            ))}
          </Note>
        )}
      </div>
    </div>
  );
}

function VennDiagram({
  sel, v, unitWord, active, setHover, onPick, regionName,
}: {
  sel: string[];
  v: ReturnType<typeof vennCounts>;
  unitWord: string;
  active: number | null;
  setHover: (m: number | null) => void;
  onPick: (m: number) => void;
  regionName: (m: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTooltip();
  const uid = useId().replace(/:/g, '');
  const W = Math.max(260, width);
  const H = Math.min(440, Math.max(300, W * 0.72));
  const pad = W < 420 ? 40 : 64;
  const circles = useMemo(() => {
    const k = sel.length;
    const pairs = Array.from({ length: k }, (_, i) =>
      Array.from({ length: k }, (_, j) => {
        if (i === j) return v.totals[i];
        let s = 0;
        v.regions.forEach((c, m) => {
          if (m & (1 << i) && m & (1 << j)) s += c;
        });
        return s;
      }),
    );
    return fitCircles(layoutCircles(v.totals, pairs), W, H, pad, Math.max(pad, 50));
  }, [sel, v, W, H]);
  const labels = useMemo(() => regionLabelPoints(circles), [circles]);

  const setLabels = useMemo(() => placeSetLabels(circles, sel.map((f, i) => [prettyFinding(f), `${fmt(v.totals[i])} ${unitWord}`]), W, H), [circles, sel, v, unitWord, W, H]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const m = regionAt(circles, e.clientX - rect.left, e.clientY - rect.top);
    if (!m) {
      setHover(null);
      tip.hide();
      return;
    }
    setHover(m);
    const c = v.regions.get(m) ?? 0;
    tip.show(e, (
      <>
        <b>{regionName(m)}</b>
        <div>{fmt(c)} {unitWord}</div>
        <div>{pct(c / v.denominator, 2)} of all filtered {unitWord}</div>
        <div className="muted">Click to pin</div>
      </>
    ));
  };

  return (
    <div ref={ref} className="chart venn">
      <svg
        width={W}
        height={H}
        onMouseMove={handleMove}
        onMouseLeave={() => { setHover(null); tip.hide(); }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const m = regionAt(circles, e.clientX - rect.left, e.clientY - rect.top);
          if (m) onPick(m);
        }}
        role="img"
        aria-label={`Venn diagram of ${sel.join(', ')}`}
      >
        <defs>
          {circles.map((c, i) => (
            <clipPath key={i} id={`${uid}-clip-${i}`}>
              <circle cx={c.x} cy={c.y} r={c.r} />
            </clipPath>
          ))}
          {active !== null && (
            <mask id={`${uid}-mask`}>
              <rect width={W} height={H} fill="white" />
              {circles.map((c, i) => (!(active & (1 << i)) ? <circle key={i} cx={c.x} cy={c.y} r={c.r} fill="black" /> : null))}
            </mask>
          )}
        </defs>
        {circles.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={SET_COLORS[i]} fillOpacity={active === null ? 0.22 : 0.1} stroke={SET_COLORS[i]} strokeWidth={2} />
        ))}
        {active !== null &&
          (() => {
            const inc = circles.map((_, i) => i).filter((i) => active & (1 << i));
            let node: JSX.Element = <rect width={W} height={H} fill="var(--highlight)" fillOpacity={0.55} mask={`url(#${uid}-mask)`} />;
            for (const i of inc) node = <g clipPath={`url(#${uid}-clip-${i})`}>{node}</g>;
            return <g pointerEvents="none">{node}</g>;
          })()}
        {circles.map((c, i) => (
          <circle key={`o${i}`} cx={c.x} cy={c.y} r={c.r} fill="none" stroke={SET_COLORS[i]} strokeWidth={active !== null && active & (1 << i) ? 3 : 2} pointerEvents="none" />
        ))}
        {[...labels.entries()].map(([m, p]) => {
          const c = v.regions.get(m) ?? 0;
          if (p.depth < 9) return null;
          return (
            <g key={m} pointerEvents="none" className="venn-label">
              <text x={p.x} y={p.y} textAnchor="middle" dy={p.depth > 22 ? '-0.1em' : '0.35em'} className="venn-count">{fmt(c)}</text>
              {p.depth > 22 && (
                <text x={p.x} y={p.y} textAnchor="middle" dy="1.15em" className="venn-pct">{pct(c / v.denominator, c / v.denominator < 0.01 ? 2 : 1)}</text>
              )}
            </g>
          );
        })}
        {setLabels.map((L, i) => (
          <g key={`l${i}`} pointerEvents="none">
            <text x={L.x} y={L.y} textAnchor={L.anchor} className="set-label" fill={SET_COLORS[i]}>{prettyFinding(sel[i])}</text>
            <text x={L.x} y={L.y + 15} textAnchor={L.anchor} className="set-sub">{fmt(v.totals[i])} {unitWord}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * Put each set's name + total just outside its circle: try angles around the
 * preferred direction (away from the group centre) and keep the first spot
 * that stays inside the SVG, clear of every circle and of earlier labels.
 */
function placeSetLabels(circles: Circle[], texts: string[][], W: number, H: number) {
  const cx = circles.reduce((a, c) => a + c.x, 0) / circles.length;
  const cy = circles.reduce((a, c) => a + c.y, 0) / circles.length;
  const placed: Box[] = [];
  const hitsCircle = (b: Box) =>
    circles.some((c) => {
      const nx = Math.max(b.x0, Math.min(c.x, b.x1));
      const ny = Math.max(b.y0, Math.min(c.y, b.y1));
      return (nx - c.x) ** 2 + (ny - c.y) ** 2 < (c.r + 3) ** 2;
    });
  const overlaps = (b: Box) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  return circles.map((c, i) => {
    const [name, sub] = texts[i];
    const bw = Math.max(name.length * 8.2, sub.length * 6.6);
    const bh = 32;
    let pref: number;
    if (circles.length === 1) pref = -Math.PI / 2;
    else if (circles.length === 2) pref = i === 0 ? (-3 * Math.PI) / 4 : -Math.PI / 4;
    else pref = Math.atan2(c.y - cy, c.x - cx);
    const order = [0];
    for (let k = 1; k <= 8; k++) order.push(k, -k);
    let best: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box } | null = null;
    const tries: [number, number][] = [];
    for (const off of [10, 26, 44]) for (const k of order) tries.push([k, off]);
    for (const [k, off] of tries) {
      const a = pref + (k * Math.PI) / 8;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const px = c.x + (c.r + off) * cos;
      const py = c.y + (c.r + off) * sin;
      const anchor = cos > 0.35 ? 'start' : cos < -0.35 ? 'end' : 'middle';
      const x0 = anchor === 'start' ? px : anchor === 'end' ? px - bw : px - bw / 2;
      const y0 = sin < -0.35 ? py - bh : sin > 0.35 ? py : py - bh / 2;
      const box = { x0, y0, x1: x0 + bw, y1: y0 + bh };
      const cand = { x: px, y: y0 + 13, anchor: anchor as 'start' | 'middle' | 'end', box };
      if (!best) best = cand;
      if (box.x0 < 2 || box.x1 > W - 2 || box.y0 < 2 || box.y1 > H - 2) continue;
      if (hitsCircle(box) || overlaps(box)) continue;
      best = cand;
      break;
    }
    // keep the chosen label inside the SVG even when no candidate was fully clear
    const b = best!;
    const dx = b.box.x1 > W - 2 ? W - 2 - b.box.x1 : b.box.x0 < 2 ? 2 - b.box.x0 : 0;
    const dy = b.box.y1 > H - 2 ? H - 2 - b.box.y1 : b.box.y0 < 2 ? 2 - b.box.y0 : 0;
    const out = { ...b, x: b.x + dx, y: b.y + dy, box: { x0: b.box.x0 + dx, x1: b.box.x1 + dx, y0: b.box.y0 + dy, y1: b.box.y1 + dy } };
    placed.push(out.box);
    return out;
  });
}
