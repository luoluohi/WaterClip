import { describe, expect, it } from 'vitest';
import { resolveScoreRenderStrategy, scoreRenderClassName } from './renderPerformance';

describe('score render performance strategy', () => {
  it('uses Canvas and Worker only when acceleration and capabilities permit it', () => {
    const strategy = resolveScoreRenderStrategy(true, { worker: true, canvas2d: true, reducedMotion: false });
    expect(strategy).toMatchObject({ engine: 'html5', useWorkers: true, compositedCursor: true });
    expect(scoreRenderClassName(strategy)).toContain('score-render--composited-cursor');
  });

  it('keeps Canvas but avoids motion compositing for reduced-motion users', () => {
    const strategy = resolveScoreRenderStrategy(true, { worker: false, canvas2d: true, reducedMotion: true });
    expect(strategy).toMatchObject({ engine: 'html5', useWorkers: false, compositedCursor: false });
    expect(strategy.label).toBe('增强渲染（Canvas）');
  });

  it('falls back to deterministic SVG when disabled or Canvas is unavailable', () => {
    expect(resolveScoreRenderStrategy(false, { worker: true, canvas2d: true, reducedMotion: false })).toMatchObject({ engine: 'svg', useWorkers: false });
    expect(resolveScoreRenderStrategy(true, { worker: true, canvas2d: false, reducedMotion: false })).toMatchObject({ engine: 'svg', useWorkers: false });
  });
});
