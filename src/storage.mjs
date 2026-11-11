import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { error } from './profiles.mjs';
import { replaceFile } from './replace-file.mjs';

export function inside(root, path) {
  const target = resolve(root, path);
  const part = relative(resolve(root), target);
  if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) {
    throw error('INVALID_PATH', 'Path must stay inside its installation directory.');
  }
  return target;
}

export async function readJson(path, limit = 1024 * 1024) {
  if ((await stat(path)).size > limit) throw error('FILE_LIMIT', 'Metadata file is too large.');
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path, value, { durable = true } = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + '\n');
      if (durable) await handle.sync();
    }
    finally { await handle.close(); }
    await replaceFile(temporary, path);
  } finally { await unlink(temporary).catch(cause => { if (cause.code !== 'ENOENT') throw cause; }); }
}

export async function withLock(path, callback, timeoutMs = 180000, signal) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + timeoutMs;
  let handle;
  while (!handle) {
    signal?.throwIfAborted();
    try { handle = await open(path, 'wx', 0o600); }
    catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;
      try {
        const owner = JSON.parse(await readFile(path, 'utf8'));
        if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); }
          catch (problem) {
            if (problem.code === 'ESRCH') throw error('STALE_LOCK', 'Interrupted operation: process ' + owner.pid +
              ' no longer holds ' + path + '. Remove this stale lock file and retry.');
          }
        }
      } catch (problem) { if (problem.code === 'STALE_LOCK') throw problem; }
      if (Date.now() >= deadline) throw error('MANAGEMENT_BUSY', 'Another operation holds ' + path + '. If interrupted, remove this lock only after its recorded process has stopped.');
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    signal?.throwIfAborted();
    return await callback();
  } finally { await handle.close(); await unlink(path); }
}
