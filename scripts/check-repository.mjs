import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version } from '../src/version.mjs';

// A small developer check, never imported by the ACP runtime. This checks the
// tracked tree and local document links; it is not a replacement secret scanner.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean).map(entry => {
    const [metadata, path] = entry.split('\t');
    return { mode: metadata.split(' ')[0], path };
  });
const allowedRoots = new Set(['.github', 'docs', 'examples', 'scripts', 'src', 'test']);
const allowedFiles = new Set(['.editorconfig', '.gitattributes', '.gitignore', 'AGENTS.md',
  'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'NOTICE', 'README.md', 'SECURITY.md', 'package.json']);
const privatePath = /(^|\/)(?:\.env(?:\.[^/]*)?|\.agentlink|\.benchmarks|\.claude|\.codex|\.gemini|\.cursor|node_modules|career_vault|applications|jobs|outputs|resume_versions|resume_templates|private_documents|review_artifacts|integration-run-[^/]+)(\/|$)/i;
const generated = /\.(?:tgz|zip|log|jsonl|sarif|db|sqlite(?:3)?|pem|p12)$/i;
const failures = [];
if (!entries.length) failures.push('No tracked/staged files. Stage the intended source tree before checking.');
for (const { mode, path } of entries) {
  if (!allowedFiles.has(path) && !allowedRoots.has(path.split('/')[0])) failures.push('Unreviewed tree path: ' + path);
  if (privatePath.test(path) || generated.test(path)) failures.push('Private/generated path is tracked: ' + path);
  if (mode === '120000' || mode === '160000') failures.push('Linked content needs an explicit repository policy: ' + path);
  if (!path.endsWith('.md') || !existsSync(resolve(root, path))) continue;
  const markdown = readFileSync(resolve(root, path), 'utf8').replace(/^[ \t]*(?:```|~~~)[^\n]*\n[\s\S]*?^[ \t]*(?:```|~~~)[^\n]*$/gm, '');
  for (const [, link] of markdown.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = link.replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
    const absolute = resolve(dirname(resolve(root, path)), decodeURIComponent(target));
    const part = relative(root, absolute);
    if (part === '..' || part.startsWith('..' + sep) || /^[A-Za-z]:|^\//.test(target)) {
      failures.push('Nonportable local link in ' + path);
    } else if (!existsSync(absolute)) failures.push('Missing local link in ' + path + ': ' + target);
  }
}
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (pkg.version !== version) failures.push('package.json and src/version.mjs versions disagree.');
if (pkg.name !== '@prplkane/agentlink' || pkg.private === true || pkg.publishConfig?.access !== 'public') {
  failures.push('Release identity must be the public @prplkane/agentlink package.');
}
if (pkg.version.includes('-') && pkg.publishConfig?.tag !== 'beta') {
  failures.push('Prerelease packages must use the beta distribution tag.');
}
if (Object.keys(pkg.dependencies || {}).length) failures.push('Runtime dependency added; review the zero-dependency policy explicitly.');
if (!pkg.license || !existsSync(resolve(root, 'LICENSE'))) failures.push('Package licensing is incomplete.');
if (failures.length) {
  for (const message of failures) process.stderr.write(message + '\n');
  process.exitCode = 1;
} else process.stdout.write('Repository checks passed: ' + entries.length + ' tracked files; local links, versions and package policy verified.\n');
