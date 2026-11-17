import * as d3 from 'd3';
import type { ReactNode } from 'react';
import { Axis, AxisLabel, fmt, useTipHandlers, useWidth } from './chart';

export interface Bar {
  key: string;
  label: string;
  value: number;
  color?: string;
  tip: ReactNode;
  /** optional reference value drawn as a tick (e.g. baseline distribution) */
  ref?: number;
}

/** Vertical bar chart with labelled axes. Values must be non-negative. */
export function BarChart({
  bars, xLabel, yLabel, height = 260, yFormat, valueLabels = true, refLabel, maxY,
}: {
  bars: Bar[];
  xLabel: string;
  yLabel: string;
  height?: number;
  yFormat?: (v: number) => string;
  valueLabels?: boolean;
  refLabel?: string;
  /** shared y maximum, used for small multiples */
  maxY?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tipFor = useTipHandlers();
  const m = { top: 22, right: 12, bottom: 46, left: 62 };
  const w = Math.max(200, width) - m.left - m.right;
  const h = height - m.top - m.bottom;
  const x = d3.scaleBand().domain(bars.map((b) => b.key)).range([0, w]).padding(0.22);
  const top = maxY ?? d3.max(bars, (b) => Math.max(b.value, b.ref ?? 0)) ?? 1;
  const y = d3.scaleLinear().domain([0, Math.max(1, top) * 1.08]).range([h, 0]).nice();
  const yv = (v: number) => y(v);
  const fmtY = yFormat ?? ((v: number) => d3.format("~s")(v));
  const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor(w / 34)));
  return (
    <div ref={ref} className="chart">
      <svg width={w + m.left + m.right} height={height} role="group" aria-label={`${yLabel} by ${xLabel}`}>
        <g transform={`translate(${m.left},${m.top})`}>
          <Axis scale={y as any} orient="left" ticks={5} format={fmtY} grid gridSize={w} />
          <Axis
            scale={x as any}
            orient="bottom"
            transform={`translate(0,${h})`}
            tickValues={bars.filter((_, i) => i % labelEvery === 0).map((b) => b.key)}
            format={(k: string) => bars.find((b) => b.key === k)?.label ?? k}
          />
          {bars.map((b) => {
            const bx = x(b.key)!;
            const by = yv(b.value);
            return (
              <g key={b.key}>
                <rect
                  className="bar"
                  x={bx}
                  y={b.value > 0 ? by : h}
                  width={x.bandwidth()}
                  height={b.value > 0 ? Math.max(1, h - by) : 0}
                  fill={b.color ?? 'var(--bar)'}
                  {...tipFor(b.tip, `${b.label}: ${fmt(b.value)}`)}
                />
                {b.ref !== undefined && (
                  <line className="ref-tick" x1={bx - 2} x2={bx + x.bandwidth() + 2} y1={yv(b.ref)} y2={yv(b.ref)} />
                )}
                {valueLabels && x.bandwidth() > 26 && b.value > 0 && (
                  <text className="bar-value" x={bx + x.bandwidth() / 2} y={by - 4} textAnchor="middle">
                    {yFormat ? yFormat(b.value) : fmt(b.value)}
                  </text>
                )}
              </g>
            );
          })}
          <AxisLabel x={-m.left + 14} y={h / 2} rotate>
            {yLabel}
          </AxisLabel>
          <AxisLabel x={w / 2} y={h + 38}>
            {xLabel}
          </AxisLabel>
          {refLabel && (
            <g transform={`translate(${w - 4},${-10})`}>
              <line className="ref-tick" x1={-150} x2={-136} y1={-3} y2={-3} />
              <text className="ref-label" x={-132} y={0}>{refLabel}</text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
