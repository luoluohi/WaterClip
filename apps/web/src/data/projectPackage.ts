import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { BinaryAsset, Project } from '../domain';
import { blobToUint8Array } from './blob';

export const WATERCLIP_MIME = 'application/vnd.waterclip.project+zip';

interface AssetManifestEntry {
  id: string;
  projectId: string;
  kind: BinaryAsset['kind'];
  filename: string;
  mimeType: string;
  path: string;
}

interface PackageManifest {
  format: 'waterclip';
  version: 1;
  projectPath: 'project.json';
  assets: AssetManifestEntry[];
}

function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    /api[\s_-]*key/i.test(key) ? [] : [[key, withoutSecrets(child)]]
  ));
}

function extensionFor(asset: BinaryAsset): string {
  const byMime: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'application/vnd.recordare.musicxml+xml': 'musicxml',
    'application/xml': 'musicxml',
    'text/xml': 'musicxml',
    'application/vnd.musescore.mscz': 'mscz'
  };
  return byMime[asset.mimeType] ?? 'bin';
}

async function optimizeProjectImage(asset: BinaryAsset): Promise<BinaryAsset> {
  if (!asset.kind.endsWith('image') || !asset.mimeType.startsWith('image/')) return asset;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(asset.blob);
    const scale = Math.min(1, 1600 / bitmap.width, 900 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return asset;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!jpeg || jpeg.size >= asset.blob.size) return asset;
    return {
      ...asset,
      filename: `${asset.filename.replace(/\.[^.]+$/, '')}.jpg`,
      mimeType: 'image/jpeg',
      blob: jpeg,
    };
  } catch {
    return asset;
  } finally {
    bitmap?.close();
  }
}

export async function exportProjectPackage(project: Project, assets: readonly BinaryAsset[]): Promise<Blob> {
  const usedImageIds = new Set(project.shotGroups.flatMap((group) =>
    group.shots.flatMap((shot) => [shot.imageAssetId, shot.referenceAssetId].filter(Boolean) as string[])
  ));
  const matchingAssets = assets.filter((asset) =>
    asset.projectId === project.id && (!asset.kind.endsWith('image') || usedImageIds.has(asset.id))
  );
  const entries: Record<string, Uint8Array> = {};
  const manifestAssets: AssetManifestEntry[] = [];
  for (const sourceAsset of matchingAssets) {
    const asset = await optimizeProjectImage(sourceAsset);
    const path = `assets/${encodeURIComponent(asset.id)}.${extensionFor(asset)}`;
    entries[path] = await blobToUint8Array(asset.blob);
    manifestAssets.push({
      id: asset.id,
      projectId: project.id,
      kind: asset.kind,
      filename: asset.filename,
      mimeType: asset.mimeType,
      path
    });
  }
  const manifest: PackageManifest = { format: 'waterclip', version: 1, projectPath: 'project.json', assets: manifestAssets };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest));
  entries['project.json'] = strToU8(JSON.stringify(withoutSecrets(project)));
  return new Blob([zipSync(entries, { level: 9 })], { type: WATERCLIP_MIME });
}

function parseJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path];
  if (!bytes) throw new Error(`项目包缺少 ${path}`);
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch {
    throw new Error(`${path} 不是有效 JSON`);
  }
}

export async function importProjectPackage(input: Blob | ArrayBuffer | Uint8Array): Promise<{ project: Project; assets: BinaryAsset[] }> {
  const bytes = input instanceof Blob
    ? await blobToUint8Array(input)
    : input instanceof Uint8Array ? input : new Uint8Array(input);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('无法解压 .waterclip 项目包');
  }
  const manifest = parseJson<PackageManifest>(files, 'manifest.json');
  if (manifest.format !== 'waterclip' || manifest.version !== 1) throw new Error('不支持的 WaterClip 项目包版本');
  const project = parseJson<Project>(files, manifest.projectPath);
  if (project.schemaVersion !== 1 || typeof project.id !== 'string' || !Array.isArray(project.shotGroups)) {
    throw new Error('项目数据格式无效');
  }
  const assets = manifest.assets.map((entry): BinaryAsset => {
    const assetBytes = files[entry.path];
    if (!assetBytes) throw new Error(`项目包缺少资产 ${entry.filename}`);
    return { ...entry, projectId: project.id, blob: new Blob([assetBytes.slice().buffer as ArrayBuffer], { type: entry.mimeType }) };
  });
  return { project, assets };
}
