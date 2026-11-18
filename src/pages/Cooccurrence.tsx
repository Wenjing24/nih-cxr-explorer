import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { PageProps } from '../App';
import { prettyFinding } from '../lib/data';
import { combinations, filterImages, pairwise, vennCounts, type Combination, type VennResult, type VennUnit } from '../lib/compute';
import { describeFilters, TOP5 } from '../lib/filters';
import { FilterPanel } from '../components/FilterPanel';
import { Card, Empty, fmt, Note, pct, Segmented, useTooltip, useWidth } from '../components/chart';
import { findingColor } from '../theme';

type Sort = 'size' | 'degree';
type TopN = '15' | '30' | 'all';

export function CooccurrencePage({ ds, filters, setFilters }: PageProps) {
  const idx = useMemo(() => filterImages(ds, filters), [ds, filters]);
  const [unit, setUnit] = useState<VennUnit>('images');
  const [sort, setSort] = useState<Sort>('size');
  const [topN, setTopN] = useState<TopN>('15');
  const [pinned, setPinned] = useState<number | null>(null);
  const [focusSet, setFocusSet] = useState<string | null>(null);
  const sel = filters.findings;
  const v = useMemo(() => vennCounts(ds, idx, sel, unit), [ds, idx, sel, unit]);
  const combos = useMemo(() => combinations(v), [v]);
  const pairs = useMemo(() => pairwise(v), [v]);
  const unitWord = unit === 'images' ? 'images' : 'patients';
  const withAny = v.denominator - v.none;

  // rows (sets) ordered by size, largest on top
  const rowOrder = useMemo(() => d3.range(sel.length).sort((a, b) => v.totals[b] - v.totals[a] || a - b), [sel, v]);

  const shown = useMemo(() => {
    const limit = topN === 'all' ? Infinity : +topN;
    const top = combos.slice(0, limit);
    if (sort === 'degree') top.sort((a, b) => a.degree - b.degree || b.count - a.count);
    return top;
  }, [combos, topN, sort]);
  const hiddenCount = combos.length - shown.length;
  const hiddenUnits = d3.sum(combos.slice(shown.length), (c) => c.count);

  const pinnedValid = pinned !== null && (v.regions.get(pinned) ?? 0) > 0 ? pinned : null;
  const focus = focusSet && sel.includes(focusSet) ? focusSet : sel.length ? sel[rowOrder[0]] : null;

  const comboName = (m: number) => {
    const inn = sel.filter((_, i) => m & (1 << i)).map(prettyFinding);
    return inn.length === 1 ? `${inn[0]} only` : inn.join(' + ');
  };

  let body;
  if (sel.length === 0) {
    body = (
      <Empty title="Select findings to compare">
        Check findings in the filter panel, or start from a suggestion:
        <span className="chip-row">
          <button type="button" className="chip" onClick={() => setFilters({ ...filters, findings: TOP5 })}>5 most common</button>
          <button type="button" className="chip" onClick={() => setFilters({ ...filters, findings: [...ds.findings] })}>All 14 findings</button>
          <button type="button" className="chip" onClick={() => setFilters({ ...filters, findings: ['Cardiomegaly', 'Effusion', 'Edema'] })}>
            Cardiomegaly · Effusion · Edema
          </button>
        </span>
      </Empty>
    );
  } else if (v.denominator === 0) {
    body = <Empty title="No images match the current filters">Widen the age range or reset gender/view filters.</Empty>;
  } else if (combos.length === 0) {
    body = (
      <Empty title={`No filtered ${unitWord} carry any selected finding`}>
        All {fmt(v.denominator)} filtered {unitWord} have none of: {sel.map(prettyFinding).join(', ')}.
      </Empty>
    );
  } else {
    body = (
      <>
        <UpSet
          sel={sel}
          findings={ds.findings}
          v={v}
          shown={shown}
          rowOrder={rowOrder}
          unitWord={unitWord}
          pinned={pinnedValid}
          onPin={(m) => setPinned(pinnedValid === m ? null : m)}
          focus={focus}
          onFocusSet={setFocusSet}
          comboName={comboName}
        />
        {topN !== '15' && <p className="hint small-only">Scroll the plot sideways to see all columns.</p>}
        <p className="caption upset-caption">
          Showing <b>{shown.length}</b> of {fmt(combos.length)} non-empty combinations
          {hiddenCount > 0 && <> ({fmt(hiddenCount)} smaller ones hidden, covering {fmt(hiddenUnits)} {unitWord})</>}.{' '}
          <span data-testid="none-count">{fmt(v.none)}</span> filtered {unitWord} ({pct(v.none / v.denominator)}) have <i>none</i> of the selected
          findings and are not drawn.
        </p>
        <div className="upset-details">
          <ComboDetail
            mask={pinnedValid}
            v={v}
            sel={sel}
            unitWord={unitWord}
            withAny={withAny}
            comboName={comboName}
            onClear={() => setPinned(null)}
          />
          {sel.length >= 2 && focus && (
            <Conditional
              focus={focus}
              sel={sel}
              findings={ds.findings}
              pairs={pairs}
              unitWord={unitWord}
              onFocus={setFocusSet}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="page with-filters">
      <FilterPanel ds={ds} filters={filters} setFilters={setFilters} idx={idx} findingsHint="Each checked finding becomes a row of the UpSet matrix." />
      <div className="page-body">
        <div className="page-head">
          <div>
            <h2>Finding co-occurrence</h2>
            <p className="lede">
              Which findings appear together? Each column of the UpSet plot is one <b>exact combination</b> of the selected findings (filled dots);
              the bar above it counts the {unitWord} with exactly that combination. Bars on the left give each finding’s total. Hover or click a
              column to see details; click a finding name to see what co-occurs with it.
            </p>
          </div>
        </div>
        <Card
          title="Exact combinations of the selected findings (UpSet plot)"
          subtitle={
            <>
              Unit: <b>{unitWord}</b>
              {unit === 'patients' && ' — a patient carries a finding if any of their filtered images does; their combination is the union over those images'}.
              Denominator: {fmt(v.denominator)} filtered {unitWord} ({describeFilters(filters)})
              {sel.length > 0 && v.denominator > 0 && <>; {fmt(withAny)} ({pct(withAny / v.denominator)}) have ≥1 selected finding</>}. Columns are
              mutually exclusive; findings that are not selected are ignored.
            </>
          }
          actions={
            <>
              <Segmented<VennUnit>
                label="Count"
                value={unit}
                onChange={(u) => { setUnit(u); setPinned(null); }}
                options={[{ value: 'images', label: 'Images' }, { value: 'patients', label: 'Patients' }]}
              />
              <Segmented<TopN> label="Show" value={topN} onChange={setTopN} options={[{ value: '15', label: 'Top 15' }, { value: '30', label: 'Top 30' }, { value: 'all', label: 'All' }]} />
              <Segmented<Sort> label="Order" value={sort} onChange={setSort} options={[{ value: 'size', label: 'Size' }, { value: 'degree', label: '# findings' }]} />
            </>
          }
        >
          {body}
        </Card>
        <Note>
          Columns are <b>exclusive</b>: an image with Effusion + Infiltration counts only in the “Effusion + Infiltration” column, not in “Effusion
          only”. Adding or removing a selected finding therefore changes the columns. A finding’s total (left bars) equals the sum of every column
          whose dot for that finding is filled.
        </Note>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ UpSet chart
function UpSet({
  sel, findings, v, shown, rowOrder, unitWord, pinned, onPin, focus, onFocusSet, comboName,
}: {
  sel: string[];
  findings: readonly string[];
  v: VennResult;
  shown: Combination[];
  rowOrder: number[];
  unitWord: string;
  pinned: number | null;
  onPin: (m: number) => void;
  focus: string | null;
  onFocusSet: (f: string) => void;
  comboName: (m: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTooltip();
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const narrow = width < 560;
  const labelW = narrow ? 88 : 128;
  const setW = narrow ? 46 : 120;
  const left = labelW + setW + 8;
  const right = narrow ? 4 : 12;
  const rowH = narrow ? 20 : 24;
  const barsH = narrow ? 150 : 200;
  const avail = Math.max(100, width - left - right);
  const colW = Math.max(narrow ? 12 : 16, Math.min(56, avail / Math.max(1, shown.length)));
  const rotateLabels = colW < 30;
  const top = rotateLabels ? 62 : 36;
  const plotW = colW * shown.length;
  const svgW = left + plotW + right;
  const matrixTop = top + barsH + 12;
  const svgH = matrixTop + rowH * sel.length + 34;
  const maxCount = d3.max(shown, (c) => c.count) ?? 1;
  const y = d3.scaleLinear().domain([0, maxCount]).range([barsH, 0]).nice();
  const setX = d3.scaleLinear().domain([0, d3.max(v.totals) || 1]).range([0, setW - (narrow ? 4 : 44)]);
  const dotR = Math.min(colW * 0.3, rowH * 0.3, 6.5);
  const active = hoverCol ?? pinned;
  const rowY = (s: number) => matrixTop + rowOrder.indexOf(s) * rowH + rowH / 2;
  const fmtShort = (n: number) => (n >= 10000 ? d3.format('.3~s')(n) : fmt(n));

  const comboTip = (c: Combination) => (
    <>
      <b>{comboName(c.mask)}</b>
      <div>{fmt(c.count)} {unitWord} with exactly this combination</div>
      <div>{pct(c.count / v.denominator, 2)} of all {fmt(v.denominator)} filtered {unitWord}</div>
      {c.degree > 1 && <div className="muted">{c.degree} selected findings together</div>}
      <div className="muted">{pinned === c.mask ? 'Click to unpin' : 'Click to pin'}</div>
    </>
  );

  return (
    <div ref={ref} className="chart upset" style={{ overflowX: svgW > width + 1 ? 'auto' : 'visible' }}>
      <svg
        width={svgW}
        height={svgH}
        role="group"
        aria-label={`UpSet plot of ${sel.length} findings`}
        data-denominator={v.denominator}
        onMouseLeave={() => { setHoverCol(null); setHoverRow(null); tip.hide(); }}
      >
        {/* alternating row stripes */}
        {rowOrder.map((s, r) => (
          <rect
            key={`stripe${s}`}
            x={0}
            y={matrixTop + r * rowH}
            width={svgW}
            height={rowH}
            className={`upset-stripe ${r % 2 ? 'odd' : ''} ${hoverRow === s || focus === sel[s] ? 'hl' : ''}`}
          />
        ))}

        {/* intersection-size axis */}
        <g transform={`translate(${left},${top})`}>
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={0} x2={plotW} className="grid-line" />
              <text x={-6} dy="0.32em" textAnchor="end" className="tick-text">{fmtShort(t)}</text>
            </g>
          ))}
          <text className="axis-label" x={-left + 4} y={-top + 14} textAnchor="start">
            # {unitWord} with exactly this combination
          </text>
        </g>

        {/* columns */}
        {shown.map((c, ci) => {
          const x0 = left + ci * colW;
          const cx = x0 + colW / 2;
          const inc = rowOrder.filter((s) => c.mask & (1 << s));
          const ys = inc.map(rowY);
          const isActive = active === c.mask;
          const rowHit = hoverRow !== null && !!(c.mask & (1 << hoverRow));
          const bw = Math.max(4, colW * 0.68);
          return (
            <g
              key={c.mask}
              className={`upset-col ${isActive ? 'active' : ''} ${pinned === c.mask ? 'pinned' : ''}`}
              data-count={c.count}
              tabIndex={0}
              role="button"
              aria-pressed={pinned === c.mask}
              aria-label={`${comboName(c.mask)}: ${c.count} ${unitWord}`}
              onMouseMove={(e) => { setHoverCol(c.mask); tip.show(e, comboTip(c)); }}
              onMouseLeave={() => { setHoverCol(null); tip.hide(); }}
              onFocus={(e) => {
                setHoverCol(c.mask);
                const r = e.currentTarget.getBoundingClientRect();
                tip.show({ clientX: r.right, clientY: r.top + 40 }, comboTip(c));
              }}
              onBlur={() => { setHoverCol(null); tip.hide(); }}
              onClick={() => onPin(c.mask)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPin(c.mask))}
            >
              <rect className="upset-hit" x={x0} y={top - 4} width={colW} height={svgH - top - 30} />
              <rect
                className="upset-bar"
                x={cx - bw / 2}
                y={top + y(c.count)}
                width={bw}
                height={Math.max(1, barsH - y(c.count))}
                fill={rowHit ? findingColor(findings, sel[hoverRow!]) : undefined}
              />
              {rotateLabels ? (
                <text className="upset-count" transform={`translate(${cx + 3.5},${top + y(c.count) - 4}) rotate(-90)`} textAnchor="start">
                  {fmtShort(c.count)}
                </text>
              ) : (
                <text className="upset-count" x={cx} y={top + y(c.count) - 5} textAnchor="middle">{fmtShort(c.count)}</text>
              )}
              {ys.length > 1 && <line className="upset-link" x1={cx} x2={cx} y1={Math.min(...ys)} y2={Math.max(...ys)} />}
              {rowOrder.map((s) => (
                <circle key={s} cx={cx} cy={rowY(s)} r={dotR} className={c.mask & (1 << s) ? 'upset-dot on' : 'upset-dot'} />
              ))}
            </g>
          );
        })}

        {/* set rows: name + set-size bar (grows leftward toward the name) */}
        {rowOrder.map((s) => {
          const f = sel[s];
          const yc = rowY(s);
          const bwid = setX(v.totals[s]);
          const color = findingColor(findings, f);
          const setTip = (
            <>
              <b>{prettyFinding(f)}</b>
              <div>{fmt(v.totals[s])} {unitWord} with this finding (any combination)</div>
              <div>{pct(v.totals[s] / v.denominator, 2)} of all filtered {unitWord}</div>
              <div className="muted">Click to see what co-occurs with it</div>
            </>
          );
          return (
            <g
              key={f}
              className={`upset-set ${focus === f ? 'focused' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`${prettyFinding(f)}: ${v.totals[s]} ${unitWord}. Show co-occurrence.`}
              onMouseMove={(e) => { setHoverRow(s); tip.show(e, setTip); }}
              onMouseLeave={() => { setHoverRow(null); tip.hide(); }}
              onFocus={() => setHoverRow(s)}
              onBlur={() => setHoverRow(null)}
              onClick={() => onFocusSet(f)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocusSet(f))}
            >
              <rect className="upset-hit" x={0} y={yc - rowH / 2} width={left - 4} height={rowH} />
              <circle cx={8} cy={yc} r={4.5} fill={color} />
              <text className="row-label upset-name" x={18} y={yc} dy="0.35em">{prettyFinding(f)}</text>
              <rect className="upset-setbar" x={left - 6 - bwid} y={yc - rowH * 0.32} width={Math.max(1, bwid)} height={rowH * 0.64} fill={color} />
              {!narrow && (
                <text className="upset-setcount" x={left - 10 - bwid} y={yc} dy="0.35em" textAnchor="end">{fmtShort(v.totals[s])}</text>
              )}
            </g>
          );
        })}
        <text className="axis-label" x={labelW + setW / 2} y={matrixTop + rowH * sel.length + 22} textAnchor="middle">
          {narrow ? `# ${unitWord}` : `Total ${unitWord} per finding`}
        </text>
        <text className="axis-label" x={left + plotW / 2} y={matrixTop + rowH * sel.length + 22} textAnchor="middle">
          Combination (filled = present)
        </text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ side panels
function ComboDetail({
  mask, v, sel, unitWord, withAny, comboName, onClear,
}: {
  mask: number | null;
  v: VennResult;
  sel: string[];
  unitWord: string;
  withAny: number;
  comboName: (m: number) => string;
  onClear: () => void;
}) {
  if (mask === null) {
    return (
      <div className="detail-box muted-box">
        <h4>Combination details</h4>
        <p className="muted">Click a column (or focus it and press Enter) to pin its exact counts here.</p>
      </div>
    );
  }
  const c = v.regions.get(mask) ?? 0;
  const inn = sel.filter((_, i) => mask & (1 << i));
  const out = sel.filter((_, i) => !(mask & (1 << i)));
  return (
    <div className="detail-box" data-testid="combo-detail">
      <div className="detail-head">
        <h4>{comboName(mask)}</h4>
        <button type="button" className="link" onClick={onClear}>Unpin</button>
      </div>
      <p className="big-number">{fmt(c)} <span>{unitWord}</span></p>
      <ul className="detail-list">
        <li><b>{pct(c / v.denominator, 2)}</b> of all {fmt(v.denominator)} filtered {unitWord}</li>
        <li><b>{pct(withAny ? c / withAny : null, 1)}</b> of the {fmt(withAny)} with ≥1 selected finding</li>
        {inn.map((f) => {
          const t = v.totals[sel.indexOf(f)];
          return <li key={f}><b>{pct(t ? c / t : null, 1)}</b> of the {fmt(t)} with {prettyFinding(f)}</li>;
        })}
      </ul>
      <p className="hint">
        Has: {inn.map(prettyFinding).join(', ')}.{out.length > 0 && <> Does <i>not</i> have: {out.map(prettyFinding).join(', ')}.</>}
      </p>
    </div>
  );
}

function Conditional({
  focus, sel, findings, pairs, unitWord, onFocus,
}: {
  focus: string;
  sel: string[];
  findings: readonly string[];
  pairs: number[][];
  unitWord: string;
  onFocus: (f: string) => void;
}) {
  const i = sel.indexOf(focus);
  const base = pairs[i][i];
  const rows = sel
    .map((f, j) => ({ f, j, both: pairs[i][j] }))
    .filter((r) => r.j !== i)
    .sort((a, b) => b.both - a.both);
  return (
    <div className="detail-box" data-testid="conditional">
      <div className="detail-head">
        <h4>
          Given <span style={{ color: findingColor(findings, focus) }}>{prettyFinding(focus)}</span>, how often is each other finding present?
        </h4>
      </div>
      <p className="hint">
        Denominator: the {fmt(base)} {unitWord} with {prettyFinding(focus)} (inclusive of any combination). Click a finding name in the plot to change.
      </p>
      {base === 0 ? (
        <p className="muted">No filtered {unitWord} have {prettyFinding(focus)}.</p>
      ) : (
        <ul className="cond-bars">
          {rows.map((r) => {
            const share = r.both / base;
            return (
              <li key={r.f}>
                <button type="button" className="cond-name link" onClick={() => onFocus(r.f)} title={`Show co-occurrence given ${prettyFinding(r.f)}`}>
                  {prettyFinding(r.f)}
                </button>
                <span className="cond-track" aria-hidden>
                  <span className="cond-fill" style={{ width: `${share * 100}%`, background: findingColor(findings, r.f) }} />
                </span>
                <span className="cond-val">
                  {pct(share)} <span className="muted">({fmt(r.both)})</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
