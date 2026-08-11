import { describe, expect, it } from 'vitest';
import { buildSectionMarkers, pageTurnTarget, playbackRequestAction, sectionLabel, seekRevealTarget } from './navigation';

describe('score navigation', () => {
  it('builds stable ABCD quarter markers when the score has no authored sections', () => {
    expect(buildSectionMarkers(100)).toEqual([
      { label: 'A', measure: 1, ratio: 0 },
      { label: 'B', measure: 26, ratio: 25 / 99 },
      { label: 'C', measure: 51, ratio: 50 / 99 },
      { label: 'D', measure: 75, ratio: 74 / 99 }
    ]);
  });

  it('keeps every authored section start in score order instead of truncating after D', () => {
    expect(buildSectionMarkers(80, [61, 1, 41, 21, 70]).map(({ label, measure }) => ({ label, measure }))).toEqual([
      { label: 'A', measure: 1 }, { label: 'B', measure: 21 }, { label: 'C', measure: 41 }, { label: 'D', measure: 61 }, { label: 'E', measure: 70 }
    ]);
  });

  it('continues section names beyond the alphabet', () => {
    expect([0, 25, 26, 27, 51, 52].map(sectionLabel)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });

  it('queues an early play request instead of silently dropping it', () => {
    expect(playbackRequestAction(false, false)).toBe('queue');
    expect(playbackRequestAction(true, false)).toBe('play');
    expect(playbackRequestAction(true, true)).toBe('pause');
  });

  it('turns only after a full viewport and keeps the previous final measure visible', () => {
    const measures = new Map([[4, { x: 900, width: 180 }], [5, { x: 1080, width: 180 }]]);
    expect(pageTurnTarget(measures, 4, 0, 1080)).toBeUndefined();
    expect(pageTurnTarget(measures, 5, 0, 1080)).toBe(900);
  });

  it('reveals a seek target with a small left context margin', () => {
    expect(seekRevealTarget({ x: 1200, width: 200 }, 0, 1000)).toBe(1080);
    expect(seekRevealTarget({ x: 300, width: 200 }, 0, 1000)).toBeUndefined();
  });
});
