import Dexie, { type Table } from 'dexie';
import type { BinaryAsset, Project } from '../domain';

interface ProjectRow {
  id: string;
  updatedAt: string;
  project: Project;
}

interface AssetRow extends BinaryAsset {
  projectId: string;
}

export class WaterClipDatabase extends Dexie {
  projects!: Table<ProjectRow, string>;
  assets!: Table<AssetRow, string>;

  constructor(name = 'waterclip') {
    super(name);
    this.version(1).stores({
      projects: 'id,updatedAt',
      assets: 'id,projectId,kind'
    });
  }
}

export class ProjectRepository {
  constructor(private readonly db: WaterClipDatabase = new WaterClipDatabase()) {}

  async save(project: Project, assets: readonly BinaryAsset[] = []): Promise<void> {
    const snapshot = structuredClone(project);
    await this.db.transaction('rw', this.db.projects, this.db.assets, async () => {
      await this.db.projects.put({ id: snapshot.id, updatedAt: snapshot.updatedAt, project: snapshot });
      if (assets.length) await this.db.assets.bulkPut(assets.map((asset) => ({ ...asset, projectId: snapshot.id })));
    });
  }

  async load(projectId: string): Promise<{ project: Project; assets: BinaryAsset[] } | undefined> {
    const row = await this.db.projects.get(projectId);
    if (!row) return undefined;
    return {
      project: structuredClone(row.project),
      assets: await this.db.assets.where('projectId').equals(projectId).toArray()
    };
  }

  async list(): Promise<Array<Pick<Project, 'id' | 'name' | 'updatedAt'>>> {
    const rows = await this.db.projects.orderBy('updatedAt').reverse().toArray();
    return rows.map(({ project }) => ({ id: project.id, name: project.name, updatedAt: project.updatedAt }));
  }

  async putAsset(asset: BinaryAsset): Promise<void> {
    await this.db.assets.put(asset);
  }

  async getAsset(assetId: string): Promise<BinaryAsset | undefined> {
    return this.db.assets.get(assetId);
  }
}

export interface ProjectAutosave {
  schedule(project: Project, assets?: readonly BinaryAsset[]): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

/** Debounced, serial autosave. `flush` is useful before project export or page unload. */
export function createProjectAutosave(repository: Pick<ProjectRepository, 'save'>, delayMs = 500): ProjectAutosave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { project: Project; assets: readonly BinaryAsset[] } | undefined;
  let chain = Promise.resolve();

  const persistPending = () => {
    if (!pending) return chain;
    const next = pending;
    pending = undefined;
    chain = chain.then(() => repository.save(next.project, next.assets));
    return chain;
  };

  return {
    schedule(project, assets = []) {
      pending = { project: structuredClone(project), assets: [...assets] };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void persistPending();
      }, delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await persistPending();
    },
    async dispose() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await persistPending();
    }
  };
}
