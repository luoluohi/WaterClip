export type ScoreRenderEngine = 'svg' | 'html5';

export interface ScoreRenderCapabilities {
  worker: boolean;
  canvas2d: boolean;
  reducedMotion: boolean;
}

export interface ScoreRenderStrategy {
  engine: ScoreRenderEngine;
  useWorkers: boolean;
  compositedCursor: boolean;
  label: string;
  explanation: string;
}

export function detectScoreRenderCapabilities(targetWindow: Window = window): ScoreRenderCapabilities {
  const canvas = targetWindow.document.createElement('canvas');
  return {
    worker: 'Worker' in targetWindow && typeof (targetWindow as Window & { Worker?: unknown }).Worker === 'function',
    canvas2d: Boolean(canvas.getContext('2d')),
    reducedMotion: targetWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  };
}

/**
 * alphaTab's html5 engine renders partial canvases and may benefit from browser
 * GPU compositing, but the browser makes the final GPU decision. SVG remains the
 * deterministic compatibility path. Worker use is enabled only when available.
 */
export function resolveScoreRenderStrategy(
  accelerationEnabled: boolean,
  capabilities: ScoreRenderCapabilities
): ScoreRenderStrategy {
  if (!accelerationEnabled || !capabilities.canvas2d) {
    return {
      engine: 'svg',
      useWorkers: false,
      compositedCursor: false,
      label: accelerationEnabled ? '兼容渲染（Canvas 不可用）' : '兼容渲染',
      explanation: '使用 SVG 排版；适合显卡驱动受限、远程桌面或需要更清晰缩放的环境。'
    };
  }
  return {
    engine: 'html5',
    useWorkers: capabilities.worker,
    compositedCursor: !capabilities.reducedMotion,
    label: capabilities.worker ? '增强渲染（Canvas + Worker）' : '增强渲染（Canvas）',
    explanation: capabilities.worker
      ? '将乐谱栅格化任务交给 Canvas，并在浏览器支持时使用 Worker；GPU 是否参与合成由浏览器决定。'
      : '使用 Canvas 分片渲染；当前浏览器没有 Worker，因此排版仍在主线程完成。'
  };
}

export function scoreRenderClassName(strategy: ScoreRenderStrategy): string {
  return strategy.compositedCursor ? 'score-render score-render--composited-cursor' : 'score-render';
}
