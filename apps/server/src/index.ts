import { buildApp } from './app.js';
import { writeFile } from 'node:fs/promises';
import { browserUrl, openBrowser, resolveStaticRoot } from './runtime.js';

const port = Number(process.env.PORT) || 4174;
const host = process.env.HOST || '127.0.0.1';

const staticRoot = resolveStaticRoot(import.meta.url, process.env.WATERCLIP_STATIC_ROOT);
const app = await buildApp({ staticRoot });
await app.listen({ port, host });

const pidFile = process.env.WATERCLIP_PID_FILE?.trim();
if (pidFile) await writeFile(pidFile, String(process.pid), 'utf8');
if (process.env.WATERCLIP_OPEN_BROWSER === '1') openBrowser(browserUrl(host, port));
