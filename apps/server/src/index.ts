import { buildApp } from './app.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT) || 4174;
const host = process.env.HOST || '127.0.0.1';

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const app = await buildApp({ staticRoot });
await app.listen({ port, host });
