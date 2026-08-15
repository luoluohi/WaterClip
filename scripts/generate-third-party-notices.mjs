import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/generate-third-party-notices.mjs <output>');

const root = resolve(import.meta.dirname, '..');
const npmCli = process.env.npm_execpath
  || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npmCli)) throw new Error(`npm CLI not found: ${npmCli}`);

const raw = execFileSync(process.execPath, [npmCli, 'query', '[license]', '--json'], {
  cwd: root,
  maxBuffer: 32 * 1024 * 1024,
}).toString('utf8').replace(/^\uFEFF/, '');
const packages = JSON.parse(raw)
  .filter((item) => !item.dev && item.name && item.version && item.location)
  .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));

const mitText = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
const iscText = `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`;
const seen = new Set();
const sections = [];
let packagesWithoutBundledText = 0;
let packagesUsingSpdxFallback = 0;

for (const item of packages) {
  const key = `${item.name}@${item.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const packageRoot = resolve(root, item.location);
  const files = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const repository = typeof item.repository === 'string'
    ? item.repository
    : item.repository?.url || item.homepage || item.resolved || '';
  const header = [`## ${key}`, `License: ${item.license}`, repository ? `Source: ${repository}` : ''].filter(Boolean);
  if (!files.length) {
    const normalizedLicense = String(item.license).toUpperCase();
    const fallback = normalizedLicense === 'ISC' ? iscText : /MIT/.test(normalizedLicense) ? mitText : '';
    if (!fallback) packagesWithoutBundledText += 1;
    else packagesUsingSpdxFallback += 1;
    const author = item.author ? `Author metadata: ${typeof item.author === 'string' ? item.author : JSON.stringify(item.author)}` : '';
    const licenseBody = fallback
      ? `### SPDX standard text\n\n${fallback}`
      : 'License text: not present in the installed npm package; see the SPDX identifier and source above.';
    sections.push([...header, author, licenseBody].filter(Boolean).join('\n\n'));
    continue;
  }
  const texts = files.map((name) => {
    const licenseText = readFileSync(resolve(packageRoot, name), 'utf8').replace(/^\uFEFF/, '').trim();
    return `### ${name}\n\n${licenseText}`;
  });
  sections.push([...header, ...texts].join('\n\n'));
}

const document = [
  '# npm third-party notices',
  '',
  'This file covers production npm packages bundled into the WaterClip server or browser assets.',
  `Packages: ${seen.size}`,
  `Packages using an SPDX standard-text fallback: ${packagesUsingSpdxFallback}`,
  `Packages without license text: ${packagesWithoutBundledText}`,
  '',
  ...sections,
  '',
].join('\n');
writeFileSync(resolve(output), document, 'utf8');
console.log(JSON.stringify({ packages: seen.size, packagesUsingSpdxFallback, packagesWithoutBundledText, output: resolve(output) }));
