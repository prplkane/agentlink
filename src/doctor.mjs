import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { readJson } from './storage.mjs';

// Read-only inspection. In particular, never start an agent, download a bridge,
// clear a lock, or infer authentication success from files on disk.
export async function doctor(runtime) {
  const checks = [];
  const check = async (scope, name, callback) => {
    try { await callback(); checks.push({ scope, name, status: 'ok' }); }
    catch (cause) { checks.push({ scope, name, status: 'error', code: cause.code || 'INVALID_METADATA', message: cause.message }); }
  };
  const launchFiles = async launch => {
    if (!(await stat(launch.command)).isFile()) throw new Error('Configured command is not a file: ' + launch.command);
    if (process.platform !== 'win32') await access(launch.command, constants.X_OK);
    const script = launch.prefixArgs?.[0];
    if (/^node(?:\.exe)?$/i.test(basename(launch.command)) && isAbsolute(script || '')) {
      if (!(await stat(script)).isFile()) throw new Error('Configured Node entry script is not a file: ' + script);
    }
  };
  for (const profile of await runtime.list()) {
    await check('profile', profile.name, async () => {
      if (profile.error) throw profile.error;
      await launchFiles(await runtime.resolveProfile(profile));
    });
  }
  for (const record of await runtime.bridges.list()) {
    await check('bridge', record.id, async () => {
      if (record.error) throw record.error;
      const root = join(runtime.bridges.installations, record.installKey);
      const metadata = await readJson(join(root, 'installation.json'));
      if (metadata.installKey !== record.installKey) throw new Error('Installation metadata does not match the active bridge.');
      await launchFiles(record.launch);
    });
  }
  const lockFiles = [join(runtime.home, 'management.lock'), join(runtime.home, 'leases.lock')];
  try {
    for (const name of await readdir(join(runtime.home, 'locks'))) {
      if (name.endsWith('.lock')) lockFiles.push(join(runtime.home, 'locks', name));
    }
  } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  for (const path of lockFiles) {
    let owner;
    try { owner = await readJson(path); }
    catch (cause) {
      if (cause.code !== 'ENOENT') checks.push({ scope: 'lock', name: path, status: 'error',
        code: 'INVALID_LOCK', message: 'Cannot read lock owner; inspect it before recovery.' });
      continue;
    }
    if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) {
      checks.push({ scope: 'lock', name: path, status: 'error', code: 'INVALID_LOCK', message: 'Lock has no valid process owner.' });
      continue;
    }
    let stopped = false;
    try { process.kill(owner.pid, 0); } catch (cause) { stopped = cause.code === 'ESRCH'; }
    checks.push({ scope: 'lock', name: path, status: stopped ? 'error' : 'busy', pid: owner.pid,
      code: stopped ? 'STALE_LOCK' : 'LOCK_HELD',
      message: stopped ? 'Recorded process has stopped. After confirming no operation is running, remove this lock and retry.' :
        'An operation may still be running. Do not remove this lock while its owner is active.' });
  }
  return { ok: !checks.some(check => check.status === 'error'), home: runtime.home, checks };
}
