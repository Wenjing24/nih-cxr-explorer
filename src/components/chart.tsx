// Shared chart primitives: responsive sizing, D3 axes, tooltip, legend, empty state.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as d3 from 'd3';

// ------------------------------------------------------------ responsive width
export function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0].contentRect.width);
      if (width > 0) setW(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ------------------------------------------------------------ axes
type AnyScale = d3.AxisScale<d3.AxisDomain>;
export function Axis({
  scale, orient, transform, ticks, format, tickValues, grid, gridSize,
}: {
  scale: AnyScale;
  orient: 'bottom' | 'left' | 'top';
  transform?: string;
  ticks?: number;
  format?: (d: any) => string;
  tickValues?: any[];
  grid?: boolean;
  gridSize?: number;
}) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ax = orient === 'bottom' ? d3.axisBottom(scale) : orient === 'top' ? d3.axisTop(scale) : d3.axisLeft(scale);
    if (ticks !== undefined) ax.ticks(ticks);
    if (format) ax.tickFormat(format as any);
    if (tickValues) ax.tickValues(tickValues);
    if (grid && gridSize) ax.tickSizeInner(orient === 'left' ? -gridSize : orient === 'top' ? -gridSize : -gridSize);
    const g = d3.select(ref.current);
    g.call(ax as any);
    g.classed('axis', true).classed('grid-axis', !!grid);
    g.select('.domain').attr('class', grid ? 'domain hidden' : 'domain');
  });
  return <g ref={ref} transform={transform} />;
}

export function AxisLabel({ x, y, children, rotate, anchor = 'middle' }: { x: number; y: number; children: ReactNode; rotate?: boolean; anchor?: string }) {
  return (
    <text className="axis-label" x={x} y={y} textAnchor={anchor} transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}>
      {children}
    </text>
  );
}

// ------------------------------------------------------------ tooltip
interface TipState { x: number; y: number; content: ReactNode }
const TipCtx = createContext<{ show: (e: { clientX: number; clientY: number }, c: ReactNode) => void; hide: () => void }>({
  show: () => {},
  hide: () => {},
});

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const api = useRef({
    show: (e: { clientX: number; clientY: number }, content: ReactNode) => setTip({ x: e.clientX, y: e.clientY, content }),
    hide: () => setTip(null),
  });
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
  return (
    <TipCtx.Provider value={api.current}>
      {children}
      {tip && (
        <div
          className="tooltip"
          role="status"
          style={{
            left: Math.min(tip.x + 14, vw - 270),
            top: tip.y + 14,
          }}
        >
          {tip.content}
        </div>
      )}
    </TipCtx.Provider>
  );
}

export const useTooltip = () => useContext(TipCtx);

/** Props to attach to an SVG mark so it shows a tooltip on hover AND keyboard focus. */
export function useTipHandlers() {
  const tip = useTooltip();
  return (content: ReactNode, label: string) => ({
    tabIndex: 0,
    role: 'img',
    'aria-label': label,
    onMouseMove: (e: React.MouseEvent) => tip.show(e, content),
    onMouseLeave: () => tip.hide(),
    onFocus: (e: React.FocusEvent<SVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      tip.show({ clientX: r.right, clientY: r.top }, content);
    },
    onBlur: () => tip.hide(),
  });
}

// ------------------------------------------------------------ small UI bits
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; swatch?: 'line' | 'box' }[] }) {
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label}>
          {it.swatch === 'line' ? (
            <svg width="22" height="10" aria-hidden>
              <line x1="1" x2="21" y1="5" y2="5" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dashed ? '4 3' : undefined} />
            </svg>
          ) : (
            <span className="swatch" style={{ background: it.color }} />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <div className="empty-icon" aria-hidden>∅</div>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      <span className="segmented-label">{label}</span>
      <div className="segmented-opts">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'on' : ''}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, children, actions, className }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <aside className="note">{children}</aside>;
}

export const fmt = d3.format(',');
export const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
