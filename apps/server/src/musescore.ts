import { access, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join } from 'node:path';
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

const MUSESCORE_EXECUTABLE_NAMES = new Set([
  'musescore4.exe',
  'musescorestudio4.exe',
  'mscore4.exe',
  'musescore4',
  'musescorestudio4',
  'mscore4',
  'musescore',
  'mscore',
]);

/** Explicit user paths must identify a known MuseScore executable, not an arbitrary program. */
export function isSupportedMuseScoreExecutablePath(path: string): boolean {
  return isAbsolute(path) && MUSESCORE_EXECUTABLE_NAMES.has(basename(path).toLowerCase());
}

/** Only MuseScore Studio 4 is compatible with the MSCZ conversion contract. */
export function parseMuseScoreVersion(output: string): string | null {
  const line = output.trim().split(/\r?\n/, 1)[0]?.trim();
  if (!line || !/musescore/i.test(line)) return null;
  const version = line.match(/(?:^|\D)(\d+)\.(\d+)(?:\.\d+)?/);
  if (!version || Number(version[1]) !== 4) return null;
  return line;
}

async function readVersion(command: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, ['--version'], {
      timeout: 5_000,
      windowsHide: true,
    });
    const parsed = parseMuseScoreVersion(`${stdout}\n${stderr}`);
    if (parsed) return parsed;
    // Some Windows MuseScore 4 builds return success but do not attach version
    // output to a non-console process. The executable-name allowlist above still
    // prevents a caller from selecting an arbitrary binary.
    return /(?:musescore(?:studio)?4|mscore4)(?:\.exe)?$/i.test(basename(command))
      ? 'MuseScore Studio 4（版本号不可用）'
      : null;
  } catch {
    return null;
  }
}

export async function detectMuseScore(preferredPath?: string): Promise<MuseScoreInfo | null> {
  const requested = preferredPath?.trim();
  if (requested) {
    if (!isSupportedMuseScoreExecutablePath(requested) || !(await isExecutable(requested))) return null;
    const version = await readVersion(requested);
    return version ? { path: requested, version } : null;
  }

  const explicit = process.env.MUSESCORE_PATH?.trim();
  const fileCandidates = [explicit, ...(process.platform === 'win32' ? WINDOWS_MUSESCORE_PATHS : [])]
    .filter((value): value is string => Boolean(value));

  for (const candidate of [...new Set(fileCandidates)]) {
    if (!isSupportedMuseScoreExecutablePath(candidate)) continue;
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
  /** 测试用进程边界；生产环境默认调用 execFile。 */
  execImpl?: typeof execFileAsync;
}

export type ScoreConversionFailure = 'invalid-output' | 'process-failed' | 'timeout';

export class ScoreConversionError extends Error {
  constructor(public readonly reason: ScoreConversionFailure, options?: ErrorOptions) {
    super(`MuseScore conversion ${reason}`, options);
    this.name = 'ScoreConversionError';
  }
}

export function isMusicXmlBuffer(bytes: Buffer): boolean {
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) return false;
  const head = bytes.subarray(0, Math.min(bytes.length, 8_192)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?<score-(?:partwise|timewise)\b/i.test(head);
}

export async function convertMsczToMusicXml({
  bytes,
  filename,
  museScorePath,
  timeoutMs = 120_000,
  execImpl = execFileAsync,
}: ConvertInput): Promise<Buffer> {
  const workspace = await mkdtemp(join(tmpdir(), 'waterclip-score-'));
  const safeStem = basename(filename, extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'score';
  const inputPath = join(workspace, `${safeStem}.mscz`);
  const outputPath = join(workspace, `${safeStem}.musicxml`);

  try {
    await writeFile(inputPath, bytes, { flag: 'wx' });
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await unlink(outputPath).catch(() => undefined);
      try {
        await execImpl(museScorePath, [inputPath, '-o', outputPath], {
          cwd: workspace,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
      } catch (error) {
        lastError = error;
      }

      // MuseScore on Windows can exit non-zero after successfully flushing the
      // document (for example when its audio/GUI teardown fails). The artifact,
      // not the process exit code, is the authoritative conversion result.
      const output = await readFile(outputPath).catch(() => null);
      if (output && isMusicXmlBuffer(output)) return output;
    }
    const processError = lastError as { killed?: boolean; code?: unknown } | undefined;
    if (processError?.killed || processError?.code === 'ETIMEDOUT') {
      throw new ScoreConversionError('timeout', { cause: lastError });
    }
    if (lastError) throw new ScoreConversionError('process-failed', { cause: lastError });
    throw new ScoreConversionError('invalid-output');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
