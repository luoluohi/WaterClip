import { create } from 'zustand';
import {
  availableLayouts,
  createShotGroup,
  duplicateShot,
  swapSlots,
  type Project,
  type ScorePart,
  type Shot,
  type ShotGroup,
  type SplitLayout
} from '../domain';
import type { ScoreSelection } from '../score/ScoreCanvas';

export interface AppSettings {
  imageBaseUrl: string;
  imageApiKey: string;
  llmBaseUrl: string;
  llmApiKey: string;
  autoPageTurn: boolean;
  timelineFollow: boolean;
  llmModel: string;
  hardwareAcceleration: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  imageBaseUrl: 'https://api.openai.com/v1',
  imageApiKey: '',
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  autoPageTurn: false,
  timelineFollow: true,
  llmModel: 'gpt-5-mini',
  hardwareAcceleration: true,
};

/** Migrates the former shared API credentials without keeping a coupled runtime field. */
export function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const stored = value as Partial<AppSettings> & { baseUrl?: unknown; apiKey?: unknown };
  const legacyBaseUrl = typeof stored.baseUrl === 'string' ? stored.baseUrl : DEFAULT_SETTINGS.imageBaseUrl;
  const legacyApiKey = typeof stored.apiKey === 'string' ? stored.apiKey : '';
  return {
    imageBaseUrl: typeof stored.imageBaseUrl === 'string' ? stored.imageBaseUrl : legacyBaseUrl,
    imageApiKey: typeof stored.imageApiKey === 'string' ? stored.imageApiKey : legacyApiKey,
    llmBaseUrl: typeof stored.llmBaseUrl === 'string' ? stored.llmBaseUrl : legacyBaseUrl,
    llmApiKey: typeof stored.llmApiKey === 'string' ? stored.llmApiKey : legacyApiKey,
    autoPageTurn: typeof stored.autoPageTurn === 'boolean' ? stored.autoPageTurn : DEFAULT_SETTINGS.autoPageTurn,
    timelineFollow: typeof stored.timelineFollow === 'boolean' ? stored.timelineFollow : true,
    llmModel: typeof stored.llmModel === 'string' ? stored.llmModel : DEFAULT_SETTINGS.llmModel,
    hardwareAcceleration: typeof stored.hardwareAcceleration === 'boolean' ? stored.hardwareAcceleration : DEFAULT_SETTINGS.hardwareAcceleration,
  };
}

interface WorkspaceState {
  project: Project;
  parts: ScorePart[];
  selection?: ScoreSelection;
  selectedGroupId?: string;
  settings: AppSettings;
  assetUrls: Record<string, string>;
  history: WorkspaceHistory;
  setParts(parts: ScorePart[]): void;
  setSelection(selection?: ScoreSelection): void;
  addGroup(): ShotGroup | undefined;
  selectGroup(id?: string): void;
  renameProject(name: string): void;
  updateShot(groupId: string, shotId: string, patch: Partial<Shot>): void;
  applyShotToSameType(groupId: string, shotId: string, scope?: ApplyShotScope): number;
  updateLayout(groupId: string, layout: SplitLayout): void;
  updateRangeOccurrence(groupId: string, occurrence: number | 'all'): void;
  swapGroupSlots(groupId: string, from: number, to: number): void;
  duplicateGroupShot(groupId: string, shotId: string): void;
  deleteGroup(groupId: string): void;
  setScore(name: string, sourceFormat: 'musicxml' | 'mscz', parts: ScorePart[]): void;
  setSettings(settings: AppSettings): void;
  setAssetUrl(assetId: string, url: string): void;
  replaceProject(project: Project): void;
  undo(): void;
  redo(): void;
}

export interface ApplyShotScope {
  image: boolean;
  description: boolean;
}

interface WorkspaceSnapshot {
  project: Project;
  parts: ScorePart[];
  selection?: ScoreSelection;
  selectedGroupId?: string;
}

interface WorkspaceHistory {
  past: WorkspaceSnapshot[];
  future: WorkspaceSnapshot[];
}

const HISTORY_LIMIT = 100;

function snapshot(state: WorkspaceState): WorkspaceSnapshot {
  return {
    project: state.project,
    parts: state.parts,
    selection: state.selection,
    selectedGroupId: state.selectedGroupId
  };
}

function recordChange(state: WorkspaceState, change: Partial<WorkspaceState>): Partial<WorkspaceState> {
  return {
    ...change,
    history: {
      past: [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: []
    }
  };
}

/** Storyboard order is chronological while equal starts retain their existing slot order. */
export function sortShotGroupsForStoryboard(groups: ShotGroup[]): ShotGroup[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => a.group.range.startMeasure - b.group.range.startMeasure || a.index - b.index)
    .map(({ group }) => group);
}

const now = new Date().toISOString();
const initialProject: Project = {
  schemaVersion: 1,
  id: crypto.randomUUID(),
  name: '未命名合奏',
  createdAt: now,
  updatedAt: now,
  shotGroups: []
};

function loadSettings(): AppSettings {
  try {
    const value = localStorage.getItem('waterclip.settings');
    if (value) return normalizeSettings(JSON.parse(value));
  } catch { /* corrupted settings fall back safely */ }
  return { ...DEFAULT_SETTINGS };
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  project: initialProject,
  parts: [],
  settings: loadSettings(),
  assetUrls: {},
  history: { past: [], future: [] },
  setParts: (parts) => set({ parts }),
  setSelection: (selection) => set({ selection }),
  addGroup: () => {
    const { selection, parts } = get();
    if (!selection) return undefined;
    const selectedPartIds = selection.cells ? [...new Set(selection.cells.map((cell) => cell.partId))] : selection.partIds;
    const selectedParts = selectedPartIds.map((id) => parts.find((part) => part.id === id)).filter(Boolean) as ScorePart[];
    if (!selectedParts.length) return undefined;
    const group = createShotGroup(selectedParts, {
      startMeasure: selection.startMeasure,
      endMeasure: selection.endMeasure,
      occurrence: 1
    });
    set((state) => recordChange(state, {
      project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: [...state.project.shotGroups, group] },
      selectedGroupId: group.id
    }));
    return group;
  },
  selectGroup: (selectedGroupId) => set({ selectedGroupId }),
  renameProject: (name) => set((state) => {
    const cleanName = name.trim().slice(0, 100);
    if (!cleanName || cleanName === state.project.name) return state;
    return recordChange(state, {
      project: { ...state.project, name: cleanName, updatedAt: new Date().toISOString() }
    });
  }),
  updateShot: (groupId, shotId, patch) => set((state) => recordChange(state, {
    project: {
      ...state.project,
      updatedAt: new Date().toISOString(),
      shotGroups: state.project.shotGroups.map((group) => group.id === groupId
        ? { ...group, shots: group.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot) }
        : group)
    }
  })),
  applyShotToSameType: (groupId, shotId, scope = { image: true, description: true }) => {
    const state = get();
    const source = state.project.shotGroups.find((group) => group.id === groupId)?.shots.find((shot) => shot.id === shotId);
    if (!source || (!scope.image && !scope.description)) return 0;
    const matches = state.project.shotGroups.reduce((count, group) => count + group.shots.filter((shot) =>
      shot.id !== source.id && shot.partId === source.partId && shot.size === source.size
    ).length, 0);
    if (!matches) return 0;
    set((current) => recordChange(current, {
      project: {
        ...current.project,
        updatedAt: new Date().toISOString(),
        shotGroups: current.project.shotGroups.map((group) => ({
          ...group,
          shots: group.shots.map((shot) => shot.id !== source.id && shot.partId === source.partId && shot.size === source.size
            ? {
                ...shot,
                ...(scope.description ? { description: source.description } : {}),
                ...(scope.image ? {
                  imageAssetId: source.imageAssetId,
                  referenceAssetId: source.referenceAssetId,
                  generationStatus: source.imageAssetId ? 'ready' as const : 'idle' as const,
                  generationError: undefined,
                } : {})
              }
            : shot)
        }))
      }
    }));
    return matches;
  },
  updateLayout: (groupId, layout) => set((state) => recordChange(state, {
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.map((g) => g.id === groupId ? { ...g, layout } : g) }
  })),
  updateRangeOccurrence: (groupId, occurrence) => set((state) => recordChange(state, {
    project: {
      ...state.project,
      updatedAt: new Date().toISOString(),
      shotGroups: state.project.shotGroups.map((group) => group.id === groupId
        ? { ...group, range: { ...group.range, occurrence } }
        : group)
    }
  })),
  swapGroupSlots: (groupId, from, to) => set((state) => recordChange(state, {
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.map((g) => g.id === groupId ? swapSlots(g, from, to) : g) }
  })),
  duplicateGroupShot: (groupId, shotId) => set((state) => recordChange(state, {
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.map((g) => g.id === groupId ? duplicateShot(g, shotId) : g) }
  })),
  deleteGroup: (groupId) => set((state) => recordChange(state, {
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.filter((g) => g.id !== groupId) },
    selectedGroupId: state.selectedGroupId === groupId ? undefined : state.selectedGroupId
  })),
  setScore: (name, sourceFormat, parts) => set((state) => {
    const replacingScore = Boolean(state.project.score && state.project.score.name !== name);
    return {
      parts,
      selection: replacingScore ? undefined : state.selection,
      selectedGroupId: replacingScore ? undefined : state.selectedGroupId,
      project: {
        ...state.project,
        name: name.replace(/\.(mscz|musicxml|xml|mxl)$/i, '') || '未命名合奏',
        updatedAt: new Date().toISOString(),
        shotGroups: replacingScore ? [] : state.project.shotGroups,
        score: {
          name,
          sourceFormat,
          originalAssetId: `score-original-${state.project.id}`,
          normalizedMusicXmlAssetId: `score-musicxml-${state.project.id}`,
          parts
        }
      },
      history: { past: [], future: [] }
    };
  }),
  setSettings: (settings) => {
    localStorage.setItem('waterclip.settings', JSON.stringify(settings));
    set({ settings });
  },
  setAssetUrl: (assetId, url) => set((state) => ({ assetUrls: { ...state.assetUrls, [assetId]: url } })),
  replaceProject: (project) => set({ project, parts: project.score?.parts ?? [], selectedGroupId: undefined, selection: undefined, assetUrls: {}, history: { past: [], future: [] } }),
  undo: () => set((state) => {
    const previous = state.history.past.at(-1);
    if (!previous) return state;
    return {
      ...previous,
      history: {
        past: state.history.past.slice(0, -1),
        future: [snapshot(state), ...state.history.future]
      }
    };
  }),
  redo: () => set((state) => {
    const next = state.history.future[0];
    if (!next) return state;
    return {
      ...next,
      history: {
        past: [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.history.future.slice(1)
      }
    };
  })
}));

export { availableLayouts };
