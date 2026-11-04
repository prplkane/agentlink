import { createHash } from 'node:crypto';
import { chmod, mkdir, open, readdir, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { error, profileName, strings } from './profiles.mjs';
import { BridgeRegistry } from './runtime.mjs';
import { inside, readJson, withLock, writeJson } from './storage.mjs';
import { readArtifact, checkDigest, extractArtifact } from './artifacts.mjs';
import { resolveCommand, runCommand } from './process.mjs';
import { inProbeDirectory, verifyAgent } from './discovery.mjs';

const npmName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const exactVersion = /^[0-9]+(?:\.[0-9A-Za-z+-]+)+$/;
export const environment = value => value === undefined || (value && typeof value === 'object' && !Array.isArray(value) &&
  Object.entries(value).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof item === 'string' && !item.includes('\0')));
const sourceURL = value => {
  if (/^[a-z]+:\/\//i.test(value)) return new URL(value).href;
  return pathToFileURL(resolve(value)).href;
};

async function fileLaunch(file, root) {
  inside(root, await realpath(file));
  const handle = await open(file, 'r'), bytes = Buffer.alloc(256);
  let size;
  try { size = (await handle.read(bytes, 0, bytes.length, 0)).bytesRead; } finally { await handle.close(); }
  const header = bytes.subarray(0, size).toString('utf8');
  return /\.(?:mjs|cjs|js)$/.test(file) || /^#!.*\bnode\b/.test(header)
    ? { command: process.execPath, prefixArgs: [file] } : { command: file, prefixArgs: [] };
}

async function npmRunner(env) {
  // npm's Windows launcher differs from ordinary npm-created package shims.
  // Locate npm's JS entry directly and never invoke cmd.exe or a shell body.
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  for (const directory of [dirname(process.execPath), ...path.split(delimiter).filter(Boolean)]) {
    for (const file of [join(directory, 'node_modules/npm/bin/npm-cli.js'), join(directory, '../lib/node_modules/npm/bin/npm-cli.js')]) {
      try { if ((await stat(file)).isFile()) return { command: process.execPath, args: [resolve(file)] }; }
      catch (cause) { if (!['ENOENT', 'ENOTDIR'].includes(cause.code)) throw cause; }
    }
  }
  if (process.platform !== 'win32') {
    const found = await resolveCommand('npm', [], env);
    return { command: found.command, args: found.prefixArgs };
  }
  throw error('INSTALLER_MISSING', 'npm is needed to install this bridge. Install Node.js with npm, or use an externally managed bridge.');
}

export async function manifestSpec(source, { distribution, offline = false, version, signal } = {}) {
  const url = sourceURL(source);
  const entry = JSON.parse((await readArtifact(url, { maxBytes: 1024 * 1024, offline, signal })).toString('utf8'));
  if (!entry.distribution || !entry.version) throw error('INVALID_MANIFEST', 'Provide an individual ACP registry agent entry, including version and distribution.');
  if (version && version !== entry.version) throw error('INVALID_MANIFEST', 'This manifest pins version ' + entry.version + '. Supply a manifest for the requested version.');
  const target = (process.platform === 'win32' ? 'windows' : process.platform) + '-' +
    ({ x64: 'x86_64', arm64: 'aarch64' }[process.arch] || process.arch);
  const binary = entry.distribution.binary?.[target];
  let kind = distribution || (binary ? 'binary' : entry.distribution.npx ? 'npm' : entry.distribution.uvx ? 'python' : undefined);
  let spec;
  if (kind === 'binary' && binary) {
    spec = { kind, version: entry.version, url: binary.archive, sha256: binary.sha256, bin: binary.cmd,
      args: binary.args || [], env: binary.env || {} };
  } else if (kind === 'npm' && entry.distribution.npx) {
    const value = entry.distribution.npx;
    const match = /^((?:@[^/]+\/)?[^@]+)(?:@(.+))?$/.exec(value.package || '');
    if (!match) throw error('INVALID_MANIFEST', 'Invalid npm package specification.');
    if (match[2] && match[2] !== entry.version) throw error('INVALID_MANIFEST', 'Manifest and npm package versions disagree.');
    spec = { kind, package: match[1], version: match[2] || entry.version, args: value.args || [], env: value.env || {} };
  } else if (kind === 'python' && entry.distribution.uvx) {
    const value = entry.distribution.uvx;
    const match = /^([A-Za-z0-9_.-]+)(?:==(.+))?$/.exec(value.package || '');
    if (!match) throw error('UNSUPPORTED_DISTRIBUTION', 'This Python package requires a custom installer; connect its installed executable instead.');
    if (match[2] && match[2] !== entry.version) throw error('INVALID_MANIFEST', 'Manifest and Python package versions disagree.');
    spec = { kind, package: match[1], version: match[2] || entry.version, args: value.args || [], env: value.env || {} };
  } else throw error('UNSUPPORTED_DISTRIBUTION', 'No supported distribution for this platform. An installed ACP executable can still be configured directly.');
  return { ...spec, manifestSource: url, sourcePage: entry.repository || entry.website };
}

function validateSpec(input) {
  const spec = JSON.parse(JSON.stringify(input));
  if (!['npm', 'python', 'binary'].includes(spec.kind) || !strings(spec.args ?? []) || !environment(spec.env)) {
    throw error('INVALID_BRIDGE', 'Invalid bridge distribution or launch arguments.');
  }
  spec.args ??= []; spec.env ??= {};
  if (spec.kind === 'npm' && !npmName.test(spec.package || '')) throw error('INVALID_BRIDGE', 'Use a registry npm package name.');
  if (spec.kind === 'python' && !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(spec.package || '')) throw error('INVALID_BRIDGE', 'Invalid Python package name.');
  if (spec.kind !== 'npm' && (typeof spec.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(spec.version))) {
    throw error('INVALID_BRIDGE', 'Pin a version for binary and Python bridges.');
  }
  if (spec.bin !== undefined && (typeof spec.bin !== 'string' || !spec.bin || spec.bin.includes('\0'))) throw error('INVALID_BRIDGE', 'Invalid executable name.');
  if (spec.source) spec.source = sourceURL(spec.source);
  if (spec.kind === 'binary') {
    if (!spec.bin || !spec.url) throw error('INVALID_BRIDGE', 'Binary distributions need a URL and relative executable path.');
    spec.url = sourceURL(spec.url);
    if (/\.(?:tar\.bz2|tbz2|msi|dmg|pkg|deb|rpm)$/i.test(new URL(spec.url).pathname)) {
      throw error('UNSUPPORTED_ARCHIVE', 'Use a ZIP, tar.gz or raw binary release, or connect an externally installed bridge.');
    }
    spec.format ??= /\.tar\.gz$|\.tgz$/i.test(new URL(spec.url).pathname) ? 'tar.gz' :
      /\.zip$/i.test(new URL(spec.url).pathname) ? 'zip' : 'file';
  }
  return spec;
}

export class BridgeStore extends BridgeRegistry {
  async install(id, input, { env = process.env, timeoutMs = 3000, installTimeoutMs = 180000,
    offline = false, signal, validate, publish = record => this.publish(record) } = {}) {
    profileName(id);
    let spec = validateSpec(input);
    await mkdir(this.installations, { recursive: true, mode: 0o700 });
    const runnerOptions = { cwd: this.home, env, timeoutMs: installTimeoutMs, signal };
    let npm;
    if (spec.kind === 'npm') {
      npm = await npmRunner(env);
      const requested = spec.version || 'latest';
      if (!exactVersion.test(requested)) {
        if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(requested) || spec.source) throw error('INVALID_BRIDGE', 'Use an exact version or a registry tag.');
        if (offline) throw error('OFFLINE', 'Offline npm installation needs an exact version.');
        const value = await runCommand(npm.command, [...npm.args, 'view', spec.package + '@' + requested, 'version', '--json'], runnerOptions);
        const version = JSON.parse(value);
        if (typeof version !== 'string' || !exactVersion.test(version)) throw error('INVALID_BRIDGE', 'Registry did not resolve an exact package version.');
        spec.version = version;
      } else spec.version = requested;
    }
    const identity = { kind: spec.kind, package: spec.package, version: spec.version, source: spec.source,
      url: spec.url, sha256: spec.sha256, format: spec.format,
      bin: spec.kind === 'binary' ? spec.bin : undefined, platform: process.platform, arch: process.arch,
      node: spec.kind === 'npm' ? process.versions.modules : undefined };
    const installKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const root = inside(this.installations, installKey);
    if (spec.kind === 'python' && process.platform === 'win32' && join(root, 'Scripts/python.exe').length >= 260) {
      throw error('PYTHON_PATH_TOO_LONG', 'This managed Python environment needs a shorter path on Windows. ' +
        'Choose a shorter absolute --home (or AGENTLINK_HOME), or connect an externally installed bridge. ' +
        'The Python executable path would be ' + join(root, 'Scripts/python.exe').length + ' characters.');
    }
    return withLock(join(this.home, 'locks', installKey + '.lock'), async () => {
      let metadata, created = false;
      try {
        try { metadata = await readJson(join(root, 'installation.json')); }
        catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
        if (!metadata) {
          // An unpublished, interrupted installation is never a runnable target.
          try { await stat(root); throw error('INCOMPLETE_INSTALL', 'An interrupted installation remains at ' + root + '. Run agentlink bridge prune after its installer has stopped.'); }
          catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
          await mkdir(root, { recursive: true, mode: 0o700 }); created = true;
          let bins, digest;
          if (spec.kind === 'npm') {
            await writeJson(join(root, 'package.json'), { name: 'agentlink-managed-install', version: '1.0.0', private: true });
            const source = spec.source ? new URL(spec.source) : undefined;
            if (source && (source.username || source.password || !['file:', 'https:'].includes(source.protocol))) throw error('INVALID_SOURCE', 'Use file or HTTPS package sources without embedded credentials.');
            if (offline && source && source.protocol !== 'file:') throw error('OFFLINE', 'Offline installation requires a local package artifact.');
            const target = source ? source.protocol === 'file:' ? fileURLToPath(source) : source.href : spec.package + '@' + spec.version;
            await runCommand(npm.command, [...npm.args, 'install', '--prefix', root, '--cache', join(this.home, 'cache/npm'),
              '--no-audit', '--no-fund', '--omit=dev', '--save-exact', '--install-links', '--loglevel=error',
              ...(offline ? ['--offline'] : []), target], { ...runnerOptions, cwd: root });
            const packageRoot = inside(root, 'node_modules/' + spec.package);
            const pkg = await readJson(join(packageRoot, 'package.json'));
            if (pkg.name !== spec.package || pkg.version !== spec.version) throw error('PACKAGE_MISMATCH', 'Installed package identity differs from the selected bridge.');
            const entries = typeof pkg.bin === 'string' ? { [basename(spec.package)]: pkg.bin } : pkg.bin;
            if (!entries || !Object.keys(entries).length) throw error('EXECUTABLE_MISSING', 'The package exposes no command-line executable.');
            bins = Object.create(null);
            for (const [name, relative] of Object.entries(entries)) {
              const file = inside(packageRoot, relative);
              bins[name] = await fileLaunch(file, root);
            }
          } else if (spec.kind === 'python') {
            const python = await resolveCommand(process.platform === 'win32' ? 'python' : 'python3', [], env);
            await runCommand(python.command, [...python.prefixArgs, '-m', 'venv', root], runnerOptions);
            const interpreter = join(root, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
            let target = spec.package + '==' + spec.version;
            if (spec.source) {
              const url = new URL(spec.source);
              if (url.protocol === 'file:') target = fileURLToPath(url);
              else {
                const bytes = await readArtifact(url.href, { offline, signal });
                target = inside(root, basename(url.pathname));
                await writeFile(target, bytes, { flag: 'wx' });
              }
            }
            await runCommand(interpreter, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--no-compile',
              '--cache-dir', join(this.home, 'cache/pip'),
              ...(offline ? ['--no-index'] : []), target], runnerOptions);
            const script = 'import importlib.metadata,json,sys; d=importlib.metadata.distribution(sys.argv[1]); print(json.dumps({"version":d.version,"bins":[e.name for e in d.entry_points if e.group=="console_scripts"]}))';
            const pkg = JSON.parse(await runCommand(interpreter, ['-c', script, spec.package], runnerOptions));
            if (pkg.version !== spec.version) throw error('PACKAGE_MISMATCH', 'Installed Python version differs from the selected bridge.');
            bins = Object.fromEntries(pkg.bins.map(name => [name, {
              command: inside(root, (process.platform === 'win32' ? 'Scripts/' + name + '.exe' : 'bin/' + name)), prefixArgs: []
            }]));
          } else {
            const bytes = await readArtifact(spec.url, { offline, signal });
            digest = checkDigest(bytes, spec.sha256);
            const file = inside(root, spec.bin);
            if (spec.format === 'file') { await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx', mode: 0o755 }); }
            else await extractArtifact(bytes, root, spec.format);
            await chmod(file, 0o755);
            bins = { [basename(spec.bin)]: await fileLaunch(file, root) };
          }
          metadata = { installKey, bins, digest, createdAt: new Date().toISOString(), identity };
          await writeJson(join(root, 'installation.json'), metadata);
        }
        if (metadata.installKey !== installKey) throw error('INVALID_BRIDGE', 'Installation metadata mismatch.');
        const names = Object.keys(metadata.bins);
        const bin = spec.kind === 'binary' ? basename(spec.bin) : spec.bin || (names.length === 1 ? names[0] : basename(spec.package));
        if (!Object.hasOwn(metadata.bins, bin)) throw error('EXECUTABLE_MISSING', 'Select an executable with --bin. Available: ' + names.join(', '));
        const launch = { ...metadata.bins[bin], acpArgs: spec.args, env: spec.env };
        if (process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(launch.command)) throw error('UNSUPPORTED_LAUNCHER', 'Use a native or Node entry point for this managed bridge.');
        const verification = await inProbeDirectory(cwd => verifyAgent(launch, { cwd, env, timeoutMs, signal }));
        await validate?.(launch);
        signal?.throwIfAborted();
        const record = { schemaVersion: 1, id, installKey, spec, launch, verification, updatedAt: new Date().toISOString() };
        await publish(record);
        return record;
      } catch (cause) {
        if (created) {
          // Never delete an installation that a successful/partially recovered
          // publication may reference. Uncertain metadata is left for pruning.
          const records = await this.list().catch(() => [{ error: true }]);
          if (!records.some(record => record.error || record.installKey === installKey)) {
            inside(this.installations, root); await rm(root, { recursive: true, force: true });
          }
        }
        throw cause;
      }
    }, installTimeoutMs, signal);
  }
  async prune({ cache = false, profiles = [] } = {}) {
    const records = await this.list();
    if (records.some(record => record.error)) throw error('INVALID_BRIDGE', 'Repair unreadable bridge records before pruning installations.');
    const used = new Set(records.map(record => record.installKey));
    for (const profile of profiles) {
      if (profile.bridge) continue; // Managed profiles resolve the active record, not their old snapshot.
      for (const argument of [profile.command, ...profile.prefixArgs]) {
        const key = relative(this.installations, argument).split(sep)[0];
        if (/^[a-f0-9]{64}$/.test(key)) used.add(key);
      }
    }
    let leases = [], installations = [];
    try { leases = await readdir(this.leases); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    for (const name of leases) {
      if (!name.endsWith('.json')) continue;
      const file = inside(this.leases, name), lease = await readJson(file);
      if (!Number.isSafeInteger(lease.pid) || lease.pid < 1) throw error('INVALID_BRIDGE', 'Invalid running-connection lease.');
      let alive = true;
      try { process.kill(lease.pid, 0); } catch (cause) { if (cause.code === 'ESRCH') alive = false; else throw cause; }
      if (alive) used.add(lease.installKey); else await unlink(file);
    }
    try { installations = await readdir(this.installations); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    const removed = [];
    for (const key of installations) {
      if (!/^[a-f0-9]{64}$/.test(key) || used.has(key)) continue;
      const path = inside(this.installations, key);
      inside(await realpath(this.installations), await realpath(path));
      await rm(path, { recursive: true, force: true }); removed.push(key);
    }
    if (cache) {
      const path = inside(this.home, 'cache');
      try {
        inside(await realpath(this.home), await realpath(path));
        await rm(path, { recursive: true, force: true });
      } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    }
    return { removed, ...(cache ? { cacheCleared: true } : {}) };
  }
}
