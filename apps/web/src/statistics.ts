import type { Project, ScorePart } from './domain';

export interface PartStatistic {
  partId: string;
  partName: string;
  selectedMeasureCount: number;
  shotCount: number;
}

export function buildPartStatistics(project: Project, parts: readonly ScorePart[]): PartStatistic[] {
  return parts.map((part) => {
    const measures = new Set<number>();
    let shotCount = 0;
    for (const group of project.shotGroups) {
      const matches = group.shots.filter((shot) => shot.partId === part.id);
      if (!matches.length) continue;
      shotCount += matches.length;
      for (let measure = group.range.startMeasure; measure <= group.range.endMeasure; measure += 1) measures.add(measure);
    }
    return { partId: part.id, partName: part.name, selectedMeasureCount: measures.size, shotCount };
  });
}
