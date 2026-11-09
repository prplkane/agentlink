import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, access, rmdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setup, fixture } from './support.mjs';
import { inProbeDirectory } from '../src/discovery.mjs';

for (const mode of ['error-help', 'help-command', 'custom-help']) test('discovery supports ' + mode + ' and saves its recipe locally', async t => {
  const c = await setup(t), log = join(c.root, 'discovery.jsonl');
  const profile = await c.manager.add('new-agent', {
    command: process.execPath, prefixArgs: [fixture], launchEnv: { FIXTURE_MODE: mode, FIXTURE_LOG: log },
    ...(mode === 'custom-help' ? { helpArgs: ['/?'] } : {})
  });
  assert.deepEqual(profile.acpArgs, ['--acp']);
  assert.equal(profile.protocolVersion, 2);
  assert.deepEqual(profile.verification.capabilities.session.prompt.image, {});
  const events = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(events.filter(event => event.rpc).every(event => event.rpc.method === 'initialize'));
  if (mode === 'custom-help') {
    assert.deepEqual(profile.discovery.helpArgs, ['/?']);
    assert.deepEqual(events[0].launch, ['/?']);
    await c.manager.refresh('new-agent');
  }
});

test('explicit standalone ACP command works without any help convention', async t => {
  const c = await setup(t);
  const profile = await c.profile();
  assert.equal(profile.discovery.method, 'manual');
  assert.equal(profile.protocolVersion, 2);
  assert.equal(profile.verification.status, 'initialize-passed');
});

test('discovery uses the v2 initialization fields and retains v2 metadata without prompting', async t => {
  const c = await setup(t), log = join(c.root, 'strict-init.jsonl');
  const profile = await c.profile('strict', { FIXTURE_MODE: 'strict-init', FIXTURE_LOG: log });
  assert.equal(profile.verification.agentInfo.name, 'offline-agent');
  assert.deepEqual(profile.verification.capabilities.session.prompt.image, {});
  const requests = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse).filter(e => e.rpc);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].rpc.method, 'initialize');
  assert.equal(requests[0].rpc.params.info.name, 'agentlink-discovery');
  assert.deepEqual(requests[0].rpc.params.capabilities, {});
});

test('refresh retains explicit and managed launch arguments instead of replacing them with help defaults', async t => {
  const c = await setup(t), log = join(c.root, 'refresh.jsonl');
  const args = ['acp', '--synthetic-isolation'];
  await c.manager.add('explicit', { command: process.execPath, prefixArgs: [fixture], acpArgs: args,
    launchEnv: { FIXTURE_LOG: log } });
  const refreshed = await c.manager.refresh('explicit');
  assert.deepEqual(refreshed.acpArgs, args);
  assert.deepEqual((await c.manager.get('explicit')).acpArgs, args);
  await c.manager.add('managed', { spec: { kind: 'binary', version: '1', url: fixture, bin: 'agent.mjs', args }, offline: true });
  assert.deepEqual((await c.manager.refresh('managed')).acpArgs, args);
  const launches = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse).filter(e => e.launch);
  assert.deepEqual(launches.map(e => e.launch), [args, args]);
});

test('cancelling initialization stops discovery and saves no profile', async t => {
  const c = await setup(t), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  const started = Date.now();
  try {
    await assert.rejects(c.manager.add('cancelled', { command: process.execPath, prefixArgs: [fixture], acpArgs: [],
      launchEnv: { FIXTURE_MODE: 'silent' }, timeoutMs: 30000, signal: controller.signal }),
    cause => cause.code === 'CANCELLED' || cause.name === 'AbortError');
  } finally { clearTimeout(timer); }
  assert.ok(Date.now() - started < 5000);
  assert.deepEqual(await c.manager.list(), []);
});

test('temporary Windows directory contention does not replace a probe result or error', { skip: process.platform !== 'win32' }, async t => {
  for (const failure of [false, true]) {
    let directory, child;
    t.after(async () => {
      if (child && child.exitCode === null) { const exit = once(child, 'close'); child.kill(); await exit; }
      if (directory) await rmdir(directory).catch(e => { if (e.code !== 'ENOENT') throw e; });
    });
    const probe = inProbeDirectory(async cwd => {
      directory = cwd;
      // Windows holds a process's cwd briefly even after its launcher finishes.
      child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setTimeout(() => process.exit(), 350)'],
        { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      await once(child.stdout, 'data');
      if (failure) throw Object.assign(new Error('Synthetic probe failure'), { code: 'PROBE_FAILED' });
      return 'initialized';
    });
    if (failure) await assert.rejects(probe, { code: 'PROBE_FAILED' });
    else assert.equal(await probe, 'initialized');
    await assert.rejects(access(directory), { code: 'ENOENT' });
  }
});
