import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
  .toString('utf8').split('\0').filter(Boolean);

const forbidden = tracked.filter((file) =>
  /(^|\/)(?:\.env(?:\..+)?|example\.mscz)$/i.test(file)
  || ['.mscz', '.waterclip'].includes(extname(file).toLowerCase()),
);

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g,
];
const assignedSecret = /(?:api[_-]?key|secret|token|credential)\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi;
const obviousTestValue = /^(?:test|example|dummy|fake|bad|secret|never|llm-secret)/i;
const secretFindings = [];
for (const file of tracked) {
  const path = resolve(root, file);
  const size = statSync(path).size;
  if (size > 2 * 1024 * 1024) continue;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) secretFindings.push(file);
  }
  assignedSecret.lastIndex = 0;
  for (const match of text.matchAll(assignedSecret)) {
    if (!obviousTestValue.test(match[1])) secretFindings.push(file);
  }
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('请通过 npm run audit:open-source 执行审计');
const packageFiles = execFileSync(process.execPath, [npmCli, 'query', '[license]', '--json'], {
  cwd: root,
  maxBuffer: 16 * 1024 * 1024,
}).toString('utf8').replace(/^\uFEFF/, '');
const packages = JSON.parse(packageFiles);
const missingLicenses = packages
  .filter((item) => !item.license || /unknown|unlicensed/i.test(String(item.license)))
  .map((item) => item.name);
const licenseCounts = {};
for (const item of packages) {
  const license = typeof item.license === 'string' ? item.license : JSON.stringify(item.license);
  licenseCounts[license] = (licenseCounts[license] ?? 0) + 1;
}

const projectLicense = tracked.some((file) => !file.includes('/') && /^licen[sc]e(?:\.|$)/i.test(basename(file)));
const report = {
  trackedFiles: tracked.length,
  forbiddenTrackedFiles: forbidden,
  suspectedSecrets: [...new Set(secretFindings)],
  dependencyPackagesWithLicense: packages.length,
  dependencyPackagesWithoutLicense: missingLicenses,
  dependencyLicenseSummary: licenseCounts,
  projectLicenseSelected: projectLicense,
  warnings: projectLicense ? [] : ['尚未选择 WaterClip 项目许可证；公开发布前必须由版权所有者决定。'],
};
console.log(JSON.stringify(report, null, 2));

if (forbidden.length || secretFindings.length || missingLicenses.length) process.exitCode = 1;
