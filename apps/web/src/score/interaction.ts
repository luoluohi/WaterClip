export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }

export function pointRelativeToHost(clientX: number, clientY: number, hostBounds: Pick<DOMRect, 'left' | 'top'>): Point {
  return { x: clientX - hostBounds.left, y: clientY - hostBounds.top };
}

export function normalizeDragRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(start.x - end.x),
    h: Math.abs(start.y - end.y)
  };
}

export function isMeaningfulDrag(rect: Rect, minimumSize = 4): boolean {
  return rect.w >= minimumSize && rect.h >= minimumSize;
}

export function pointerGesture(start: Point, end: Point, minimumSize = 4): 'click' | 'drag' {
  return isMeaningfulDrag(normalizeDragRect(start, end), minimumSize) ? 'drag' : 'click';
}

export function intersects(rect: Rect, target: Rect): boolean {
  return rect.x <= target.x + target.w && rect.x + rect.w >= target.x && rect.y <= target.y + target.h && rect.y + rect.h >= target.y;
}

export interface AutoScrollDelta { x: number; y: number }

export function wheelScrollDelta(deltaX: number, deltaY: number, shiftKey: boolean): AutoScrollDelta {
  return shiftKey ? { x: deltaX || deltaY, y: 0 } : { x: deltaX, y: deltaY };
}

export function panScrollTarget(
  origin: Point,
  current: Point,
  initialScroll: Point
): Point {
  return {
    x: Math.max(0, initialScroll.x - (current.x - origin.x)),
    y: Math.max(0, initialScroll.y - (current.y - origin.y))
  };
}

/** Smoothly accelerates when a captured pointer moves beyond a viewport edge. */
export function autoScrollDelta(
  point: Point,
  viewport: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  edgeSize = 44,
  maximum = 18
): AutoScrollDelta {
  const axis = (value: number, low: number, high: number) => {
    if (value < low + edgeSize) return -maximum * Math.min(1, (low + edgeSize - value) / edgeSize);
    if (value > high - edgeSize) return maximum * Math.min(1, (value - (high - edgeSize)) / edgeSize);
    return 0;
  };
  return { x: axis(point.x, viewport.left, viewport.right), y: axis(point.y, viewport.top, viewport.bottom) };
}
