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
  baseUrl: string;
  apiKey: string;
}

interface WorkspaceState {
  project: Project;
  parts: ScorePart[];
  selection?: ScoreSelection;
  selectedGroupId?: string;
  settings: AppSettings;
  assetUrls: Record<string, string>;
  setParts(parts: ScorePart[]): void;
  setSelection(selection?: ScoreSelection): void;
  addGroup(): ShotGroup | undefined;
  selectGroup(id?: string): void;
  updateShot(groupId: string, shotId: string, patch: Partial<Shot>): void;
  updateLayout(groupId: string, layout: SplitLayout): void;
  updateRangeOccurrence(groupId: string, occurrence: number | 'all'): void;
  swapGroupSlots(groupId: string, from: number, to: number): void;
  duplicateGroupShot(groupId: string, shotId: string): void;
  deleteGroup(groupId: string): void;
  setScore(name: string, sourceFormat: 'musicxml' | 'mscz', parts: ScorePart[]): void;
  setSettings(settings: AppSettings): void;
  setAssetUrl(assetId: string, url: string): void;
  replaceProject(project: Project): void;
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
    if (value) return { baseUrl: 'https://api.openai.com/v1', apiKey: '', ...JSON.parse(value) };
  } catch { /* corrupted settings fall back safely */ }
  return { baseUrl: 'https://api.openai.com/v1', apiKey: '' };
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  project: initialProject,
  parts: [],
  settings: loadSettings(),
  assetUrls: {},
  setParts: (parts) => set({ parts }),
  setSelection: (selection) => set({ selection }),
  addGroup: () => {
    const { selection, parts } = get();
    if (!selection) return undefined;
    const selectedParts = selection.partIds.map((id) => parts.find((part) => part.id === id)).filter(Boolean) as ScorePart[];
    if (!selectedParts.length) return undefined;
    const group = createShotGroup(selectedParts, {
      startMeasure: selection.startMeasure,
      endMeasure: selection.endMeasure,
      occurrence: 1
    });
    set((state) => ({
      project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: [...state.project.shotGroups, group] },
      selectedGroupId: group.id
    }));
    return group;
  },
  selectGroup: (selectedGroupId) => set({ selectedGroupId }),
  updateShot: (groupId, shotId, patch) => set((state) => ({
    project: {
      ...state.project,
      updatedAt: new Date().toISOString(),
      shotGroups: state.project.shotGroups.map((group) => group.id === groupId
        ? { ...group, shots: group.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot) }
        : group)
    }
  })),
  updateLayout: (groupId, layout) => set((state) => ({
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.map((g) => g.id === groupId ? { ...g, layout } : g) }
  })),
  updateRangeOccurrence: (groupId, occurrence) => set((state) => ({
    project: {
      ...state.project,
      updatedAt: new Date().toISOString(),
      shotGroups: state.project.shotGroups.map((group) => group.id === groupId
        ? { ...group, range: { ...group.range, occurrence } }
        : group)
    }
  })),
  swapGroupSlots: (groupId, from, to) => set((state) => ({
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.map((g) => g.id === groupId ? swapSlots(g, from, to) : g) }
  })),
  duplicateGroupShot: (groupId, shotId) => set((state) => ({
    project: { ...state.project, updatedAt: new Date().toISOString(), shotGroups: state.project.shotGroups.map((g) => g.id === groupId ? duplicateShot(g, shotId) : g) }
  })),
  deleteGroup: (groupId) => set((state) => ({
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
      }
    };
  }),
  setSettings: (settings) => {
    localStorage.setItem('waterclip.settings', JSON.stringify(settings));
    set({ settings });
  },
  setAssetUrl: (assetId, url) => set((state) => ({ assetUrls: { ...state.assetUrls, [assetId]: url } })),
  replaceProject: (project) => set({ project, parts: project.score?.parts ?? [], selectedGroupId: undefined, selection: undefined, assetUrls: {} })
}));

export { availableLayouts };
