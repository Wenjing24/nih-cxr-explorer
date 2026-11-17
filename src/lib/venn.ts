// Area-proportional (Euler) layout for 1–3 circles.
// Circle areas are exact; pairwise overlaps are exact for 2 sets and
// approximately honoured for 3 sets (triangle constraint). Region counts are
// always shown as exact numbers.

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Area of intersection of two circles with radii r1, r2 at centre distance d. */
export function overlapArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a + b - c;
}

/** Centre distance giving the requested overlap area (bisection; overlap decreases with d). */
export function distanceForOverlap(r1: number, r2: number, area: number): number {
  const full = Math.PI * Math.min(r1, r2) ** 2;
  if (area <= 0) return r1 + r2 + Math.min(r1, r2) * 0.15; // disjoint: small visible gap
  if (area >= full - 1e-9) return Math.abs(r1 - r2);
  let lo = Math.abs(r1 - r2);
  let hi = r1 + r2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (overlapArea(r1, r2, mid) > area) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * sizes[i]   = |A_i| (inclusive set size)
 * pairs[i][j] = |A_i ∩ A_j|
 * Returns circles in abstract units, centred on their bounding box at (0,0).
 */
export function layoutCircles(sizes: number[], pairs: number[][]): Circle[] {
  const k = sizes.length;
  // radius from area; empty sets get a tiny placeholder radius so they are still drawn
  const maxSize = Math.max(1, ...sizes);
  const r = sizes.map((s) => Math.sqrt(Math.max(s, maxSize * 1e-4) / Math.PI));
  const scale = (area: number) => area; // areas share the same units as sizes
  let circles: Circle[];
  if (k === 0) return [];
  if (k === 1) circles = [{ x: 0, y: 0, r: r[0] }];
  else {
    const d01 = distanceForOverlap(r[0], r[1], scale(pairs[0][1]));
    if (k === 2) circles = [{ x: 0, y: 0, r: r[0] }, { x: d01, y: 0, r: r[1] }];
    else {
      const d02 = distanceForOverlap(r[0], r[2], scale(pairs[0][2]));
      const d12 = distanceForOverlap(r[1], r[2], scale(pairs[1][2]));
      // law of cosines; clamp when the three distances do not form a triangle
      let cos = (d01 * d01 + d02 * d02 - d12 * d12) / (2 * d01 * d02 || 1);
      cos = Math.max(-1, Math.min(1, cos));
      const sin = Math.sqrt(1 - cos * cos);
      circles = [
        { x: 0, y: 0, r: r[0] },
        { x: d01, y: 0, r: r[1] },
        { x: d02 * cos, y: d02 * sin, r: r[2] },
      ];
    }
  }
  const minX = Math.min(...circles.map((c) => c.x - c.r));
  const maxX = Math.max(...circles.map((c) => c.x + c.r));
  const minY = Math.min(...circles.map((c) => c.y - c.r));
  const maxY = Math.max(...circles.map((c) => c.y + c.r));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return circles.map((c) => ({ x: c.x - cx, y: c.y - cy, r: c.r }));
}

/** Fit circles into a w×h box with padding; returns new circles in pixel space. */
export function fitCircles(circles: Circle[], w: number, h: number, pad: number, padY = pad): Circle[] {
  if (!circles.length) return [];
  const minX = Math.min(...circles.map((c) => c.x - c.r));
  const maxX = Math.max(...circles.map((c) => c.x + c.r));
  const minY = Math.min(...circles.map((c) => c.y - c.r));
  const maxY = Math.max(...circles.map((c) => c.y + c.r));
  const s = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * padY) / (maxY - minY || 1));
  const ox = w / 2 - ((minX + maxX) / 2) * s;
  const oy = h / 2 - ((minY + maxY) / 2) * s;
  return circles.map((c) => ({ x: c.x * s + ox, y: c.y * s + oy, r: c.r * s }));
}

/** Region (bitmask over circles) a point falls in; 0 = outside all circles. */
export function regionAt(circles: Circle[], x: number, y: number): number {
  let m = 0;
  circles.forEach((c, i) => {
    if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) m |= 1 << i;
  });
  return m;
}

/**
 * Label anchor for each region: the sampled point inside the region that is
 * farthest from any circle boundary (a cheap "pole of inaccessibility").
 * Returns null for regions with no visible area.
 */
export function regionLabelPoints(circles: Circle[], steps = 70): Map<number, { x: number; y: number; depth: number }> {
  const out = new Map<number, { x: number; y: number; depth: number }>();
  if (!circles.length) return out;
  const minX = Math.min(...circles.map((c) => c.x - c.r));
  const maxX = Math.max(...circles.map((c) => c.x + c.r));
  const minY = Math.min(...circles.map((c) => c.y - c.r));
  const maxY = Math.max(...circles.map((c) => c.y + c.r));
  const dx = (maxX - minX) / steps;
  const dy = (maxY - minY) / steps;
  for (let ix = 0; ix <= steps; ix++)
    for (let iy = 0; iy <= steps; iy++) {
      const x = minX + ix * dx;
      const y = minY + iy * dy;
      const m = regionAt(circles, x, y);
      if (!m) continue;
      const depth = Math.min(...circles.map((c) => Math.abs(Math.hypot(x - c.x, y - c.y) - c.r)));
      const prev = out.get(m);
      if (!prev || depth > prev.depth) out.set(m, { x, y, depth });
    }
  return out;
}
