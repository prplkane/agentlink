import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { doctor } from '../src/doctor.mjs';
import { AgentLink } from '../src/index.mjs';
import { setup, fixture, execute } from './support.mjs';

test('doctor reports missing launch files and stale locks without running agents or changing files', async t => {
  const c = await setup(t), log = join(c.root, 'never-started.jsonl');
  await c.manager.add('agent', { command: process.execPath, prefixArgs: [fixture], acpArgs: [],
    verify: false, launchEnv: { FIXTURE_LOG: log } });
  const profile = await c.manager.get('agent');
  await c.manager.store.save({ ...profile, name: 'broken', command: join(c.root, 'missing.exe') });
  const deadPid = Number((await execute(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'],
    { windowsHide: true })).stdout);
  const lock = join(c.home, 'management.lock'), contents = JSON.stringify({ pid: deadPid });
  await writeFile(lock, contents);
  const report = await doctor(c.manager);
  assert.equal(report.ok, false);
  assert.ok(report.checks.some(check => check.name === 'agent' && check.status === 'ok'));
  assert.ok(report.checks.some(check => check.name === 'broken' && check.status === 'error'));
  assert.ok(report.checks.some(check => check.code === 'STALE_LOCK' && check.pid === deadPid));
  assert.equal(await readFile(lock, 'utf8'), contents);
  await assert.rejects(readFile(log), { code: 'ENOENT' });
  await assert.rejects(c.command(['doctor', '--json']), cause => JSON.parse(cause.stdout).ok === false);
  await unlink(lock);
  await c.manager.remove('broken');
  assert.equal(JSON.parse((await c.command(['doctor', '--json'])).stdout).ok, true);
});

test('doctor detects a missing managed installation and leaves a live lock alone', async t => {
  const c = await setup(t);
  const bridge = await c.manager.installBridge('engine', { kind: 'binary', version: '1', url: fixture, bin: 'agent.mjs' }, { offline: true });
  await unlink(join(c.manager.bridges.installations, bridge.installKey, 'installation.json'));
  await writeFile(join(c.home, 'leases.lock'), JSON.stringify({ pid: process.pid }));
  const report = await doctor(c.manager);
  assert.equal(report.ok, false);
  assert.ok(report.checks.some(check => check.scope === 'bridge' && check.status === 'error'));
  assert.ok(report.checks.some(check => check.code === 'LOCK_HELD' && check.status === 'busy'));
  assert.equal(JSON.parse(await readFile(join(c.home, 'leases.lock'), 'utf8')).pid, process.pid);
});

test('deep Windows Python paths fail before invoking an installer or activating a bridge',
  { skip: process.platform !== 'win32' }, async t => {
    const c = await setup(t), manager = new AgentLink({ home: join(c.root, 'nested-'.repeat(25)) });
    await assert.rejects(manager.installBridge('python', { kind: 'python', package: 'fixture', version: '1' },
      { offline: true }), cause => cause.code === 'PYTHON_PATH_TOO_LONG' && /shorter absolute --home/.test(cause.message));
    assert.deepEqual(await manager.bridges.list(), []);
    assert.deepEqual(await readdir(manager.bridges.installations), []);
  });
