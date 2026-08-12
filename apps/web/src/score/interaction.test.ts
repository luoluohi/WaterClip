import { describe, expect, it } from 'vitest';
import { autoScrollDelta, intersects, isMeaningfulDrag, normalizeDragRect, pointRelativeToHost, pointerGesture } from './interaction';

describe('score pointer geometry', () => {
  it('uses the scrolled host rectangle as the single source of content coordinates', () => {
    expect(pointRelativeToHost(150, 80, { left: -250, top: -20 })).toEqual({ x: 400, y: 100 });
  });

  it('normalizes reverse drags and ignores accidental clicks', () => {
    expect(normalizeDragRect({ x: 90, y: 70 }, { x: 20, y: 10 })).toEqual({ x: 20, y: 10, w: 70, h: 60 });
    expect(isMeaningfulDrag(normalizeDragRect({ x: 10, y: 10 }, { x: 12, y: 13 }))).toBe(false);
    expect(pointerGesture({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe('click');
    expect(pointerGesture({ x: 10, y: 10 }, { x: 20, y: 18 })).toBe('drag');
  });

  it('detects a bar touched by a selection rectangle', () => {
    expect(intersects({ x: 20, y: 20, w: 60, h: 30 }, { x: 70, y: 40, w: 80, h: 50 })).toBe(true);
    expect(intersects({ x: 20, y: 20, w: 10, h: 10 }, { x: 70, y: 40, w: 80, h: 50 })).toBe(false);
  });

  it('accelerates auto-scroll only near or beyond viewport edges', () => {
    const viewport = { left: 100, right: 500, top: 50, bottom: 350 };
    expect(autoScrollDelta({ x: 300, y: 200 }, viewport)).toEqual({ x: 0, y: 0 });
    expect(autoScrollDelta({ x: 80, y: 370 }, viewport)).toEqual({ x: -18, y: 18 });
    const near = autoScrollDelta({ x: 490, y: 60 }, viewport);
    expect(near.x).toBeGreaterThan(0);
    expect(near.y).toBeLessThan(0);
    expect(Math.abs(near.x)).toBeLessThanOrEqual(18);
  });
});
