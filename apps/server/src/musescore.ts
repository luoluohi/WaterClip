import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const WINDOWS_MUSESCORE_PATHS = [
  'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe',
  'C:\\Program Files\\MuseScore Studio 4\\bin\\MuseScore4.exe',
  'C:\\Program Files\\MuseScore Studio 4\\bin\\MuseScoreStudio4.exe',
] as const;

const PATH_COMMANDS = process.platform === 'win32'
  ? ['MuseScore4.exe', 'MuseScore4', 'mscore4.exe']
  : ['mscore', 'musescore', 'MuseScore4'];

export interface MuseScoreInfo {
  path: string;
  version: string;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readVersion(command: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, ['--version'], {
      timeout: 5_000,
      windowsHide: true,
    });
    const text = `${stdout}\n${stderr}`.trim();
    return text.split(/\r?\n/, 1)[0] || 'MuseScore 4（版本号不可用）';
  } catch {
    return null;
  }
}

export async function detectMuseScore(): Promise<MuseScoreInfo | null> {
  const explicit = process.env.MUSESCORE_PATH?.trim();
  const fileCandidates = [explicit, ...(process.platform === 'win32' ? WINDOWS_MUSESCORE_PATHS : [])]
    .filter((value): value is string => Boolean(value));

  for (const candidate of [...new Set(fileCandidates)]) {
    if (!(await isExecutable(candidate))) continue;
    const version = await readVersion(candidate);
    if (version) return { path: candidate, version };
  }

  for (const command of PATH_COMMANDS) {
    const version = await readVersion(command);
    if (version) return { path: command, version };
  }
  return null;
}

export interface ConvertInput {
  bytes: Buffer;
  filename: string;
  museScorePath: string;
  timeoutMs?: number;
}

export async function convertMsczToMusicXml({
  bytes,
  filename,
  museScorePath,
  timeoutMs = 30_000,
}: ConvertInput): Promise<Buffer> {
  const workspace = await mkdtemp(join(tmpdir(), 'waterclip-score-'));
  const safeStem = basename(filename, extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'score';
  const inputPath = join(workspace, `${safeStem}.mscz`);
  const outputPath = join(workspace, `${safeStem}.musicxml`);

  try {
    await writeFile(inputPath, bytes, { flag: 'wx' });
    await execFileAsync(museScorePath, [inputPath, '-o', outputPath], {
      cwd: workspace,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return await readFile(outputPath);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
