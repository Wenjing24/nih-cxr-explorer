import { describe, expect, it } from 'vitest';
import { distanceForOverlap, fitCircles, layoutCircles, overlapArea, regionAt, regionLabelPoints } from '../src/lib/venn';

describe('Euler geometry', () => {
  it('overlap area limits', () => {
    expect(overlapArea(1, 1, 3)).toBe(0);
    expect(overlapArea(2, 1, 0.5)).toBeCloseTo(Math.PI);
  });
  it('distanceForOverlap inverts overlapArea', () => {
    for (const target of [0.1, 0.5, 1.2]) {
      const d = distanceForOverlap(1, 0.8, target);
      expect(overlapArea(1, 0.8, d)).toBeCloseTo(target, 6);
    }
  });
  it('2-set layout reproduces exact areas', () => {
    const c = layoutCircles([100, 40], [[100, 15], [15, 40]]);
    expect(Math.PI * c[0].r ** 2).toBeCloseTo(100);
    expect(Math.PI * c[1].r ** 2).toBeCloseTo(40);
    const d = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
    expect(overlapArea(c[0].r, c[1].r, d)).toBeCloseTo(15, 4);
  });
  it('disjoint sets do not overlap; subsets are contained', () => {
    const dis = layoutCircles([10, 10], [[10, 0], [0, 10]]);
    expect(Math.hypot(dis[0].x - dis[1].x, dis[0].y - dis[1].y)).toBeGreaterThan(dis[0].r + dis[1].r);
    const sub = layoutCircles([10, 4], [[10, 4], [4, 4]]);
    expect(regionAt(sub, sub[1].x, sub[1].y)).toBe(0b11);
  });
  it('3-set layout fits the box and yields label points for visible regions', () => {
    const c = fitCircles(layoutCircles([100, 80, 60], [[100, 30, 20], [30, 80, 25], [20, 25, 60]]), 400, 300, 10);
    c.forEach((k) => {
      expect(k.x - k.r).toBeGreaterThanOrEqual(9.99);
      expect(k.y + k.r).toBeLessThanOrEqual(290.01);
    });
    const pts = regionLabelPoints(c);
    for (const m of [1, 2, 4, 3, 5, 6, 7]) expect(pts.has(m)).toBe(true);
    pts.forEach((p, m) => expect(regionAt(c, p.x, p.y)).toBe(m));
  });
  it('zero-size set still gets a drawable circle', () => {
    const c = layoutCircles([50, 0], [[50, 0], [0, 0]]);
    expect(c[1].r).toBeGreaterThan(0);
  });
});
