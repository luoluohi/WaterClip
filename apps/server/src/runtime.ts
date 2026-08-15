import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveStaticRoot(moduleUrl: string, configuredRoot?: string): string {
  const explicit = configuredRoot?.trim();
  return explicit
    ? resolve(explicit)
    : resolve(dirname(fileURLToPath(moduleUrl)), '../../web/dist');
}

export function browserUrl(host: string, port: number): string {
  const browserHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${browserHost}:${port}`;
}

export function openBrowser(url: string): void {
  if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }).unref();
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  execFile(command, [url]).unref();
}
