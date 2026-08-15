import type { ShotGroup } from './domain';

export function storyboardSeekMeasure(group: Pick<ShotGroup, 'range'>): number {
  return Math.max(1, Math.floor(group.range.startMeasure));
}

export function activeStoryboardTarget(groups: readonly ShotGroup[], measure: number, occurrence: number): string | undefined {
  return groups.find((group) =>
    measure >= group.range.startMeasure && measure <= group.range.endMeasure &&
    (group.range.occurrence === 'all' || group.range.occurrence === occurrence)
  )?.id;
}

export function timelineScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth';
}
