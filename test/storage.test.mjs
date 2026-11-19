import test from 'node:test';
import assert from 'node:assert/strict';
import { open, readdir } from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { withLock } from '../src/storage.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { setup } from './support.mjs';

test('Windows lease acquisition survives a transient EPERM and reports persistent denial', { skip: process.platform !== 'win32' }, async t => {
  const c = await setup(t);
  const path = join(c.home, 'leases.lock');
  const realOpen = fsPromises.open;
  let denials = 2, entered = 0;
  const mock = t.mock.method(fsPromises, 'open', async (file, flags, ...args) => {
    if (file === path && flags === 'wx' && denials-- > 0) {
      throw Object.assign(new Error('Synthetic Windows sharing conflict'), { code: 'EPERM' });
    }
    return realOpen(file, flags, ...args);
  });
  syncBuiltinESMExports();
  try {
    await withLock(path, () => { entered++; });
    assert.equal(entered, 1);
    denials = Infinity;
    await assert.rejects(withLock(path, () => { entered++; }, 100), { code: 'EPERM' });
    assert.equal(entered, 1);
    assert.deepEqual(await readdir(c.home), []);
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

async function records(t, kind) {
  const c = await setup(t), name = 'shared';
  const store = kind === 'profile' ? c.manager.store : c.manager.bridges;
  const original = kind === 'profile' ? {
    schemaVersion: 1, name, command: process.execPath, prefixArgs: [], acpArgs: [],
    protocolVersion: 1, discovery: { method: 'manual' },
    verification: { status: 'initialize-passed' }, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  } : { schemaVersion: 1, id: name, installKey: 'a'.repeat(64) };
  const replacement = kind === 'profile' ? { ...original, acpArgs: ['--acp'] }
    : { ...original, installKey: 'b'.repeat(64) };
  const save = value => kind === 'profile' ? store.save(value, { replace: true }) : store.publish(value);
  await save(original);
  return { store, original, replacement, save, path: store.path(name), get: () => store.get(name) };
}

for (const kind of ['profile', 'bridge']) {
  test(`Windows ${kind} replacement waits for a short-lived reader`, { skip: process.platform !== 'win32', timeout: 10000 }, async t => {
    const c = await records(t, kind), reader = await open(c.path, 'r');
    let settled = false;
    const saving = c.save(c.replacement).finally(() => { settled = true; });
    const saved = assert.doesNotReject(saving);
    // Register the rejection handler before holding the file open.
    saved.catch(() => {});
    try {
      await delay(100);
      assert.equal(settled, false, 'replacement waits while Windows holds the existing file');
      assert.deepEqual(JSON.parse(await reader.readFile('utf8')), c.original);
    } finally { await reader.close(); await saved; }
    assert.deepEqual(await c.get(), c.replacement);
    assert.deepEqual(await readdir(c.store.directory), ['shared.json']);
  });

  test(`Windows ${kind} replacement preserves old data when a reader stays open`, { skip: process.platform !== 'win32', timeout: 10000 }, async t => {
    const c = await records(t, kind), reader = await open(c.path, 'r');
    try {
      await assert.rejects(c.save(c.replacement), cause => ['EACCES', 'EPERM', 'EBUSY'].includes(cause.code));
      assert.deepEqual(JSON.parse(await reader.readFile('utf8')), c.original);
    } finally { await reader.close(); }
    assert.deepEqual(await c.get(), c.original);
    assert.deepEqual(await readdir(c.store.directory), ['shared.json']);
  });
}
