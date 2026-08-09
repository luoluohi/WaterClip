export type Id = string;

export interface ScorePart {
  id: Id;
  name: string;
  staffIds: Id[];
  playbackTrackIds: number[];
}

export type PlaybackOccurrence = number | 'all';

export interface ScoreRange {
  startMeasure: number;
  endMeasure: number;
  occurrence: PlaybackOccurrence;
}

/** Semantic score selection; renderer pixel coordinates deliberately stay outside the domain. */
export interface ScoreSelection {
  partIds: Id[];
  startMeasure: number;
  endMeasure: number;
}

export const SHOT_SIZES = ['特写', '近景', '中景', '全景'] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];
export type ShotGenerationStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface Shot {
  id: Id;
  partId: Id;
  partName: string;
  size: ShotSize;
  description: string;
  referenceAssetId?: Id;
  imageAssetId?: Id;
  generationStatus: ShotGenerationStatus;
  generationError?: string;
}

export type SplitLayout =
  | { kind: 'single' }
  | { kind: 'horizontal'; cells: number }
  | { kind: 'vertical'; cells: number }
  | { kind: 'grid'; columns: 2 | 3 | 4; rows: 2 | 3 | 4 };

export interface ShotGroup {
  id: Id;
  range: ScoreRange;
  layout: SplitLayout;
  shots: Shot[];
  /** Shot ids in storyboard cell order. */
  slotOrder: Id[];
  createdAt: string;
}

export interface ScoreDocument {
  name: string;
  sourceFormat: 'musicxml' | 'mscz';
  originalAssetId: Id;
  normalizedMusicXmlAssetId: Id;
  parts: ScorePart[];
}

export interface Project {
  schemaVersion: 1;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  score?: ScoreDocument;
  shotGroups: ShotGroup[];
}

export interface BinaryAsset {
  id: Id;
  projectId: Id;
  kind: 'score-original' | 'score-musicxml' | 'reference-image' | 'generated-image';
  filename: string;
  mimeType: string;
  blob: Blob;
}
