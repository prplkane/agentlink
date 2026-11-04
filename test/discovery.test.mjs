import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setup, fixture } from './support.mjs';

for (const mode of ['error-help', 'help-command', 'custom-help']) test('discovery supports ' + mode + ' and saves its recipe locally', async t => {
  const c = await setup(t), log = join(c.root, 'discovery.jsonl');
  const profile = await c.manager.add('new-agent', {
    command: process.execPath, prefixArgs: [fixture], launchEnv: { FIXTURE_MODE: mode, FIXTURE_LOG: log },
    ...(mode === 'custom-help' ? { helpArgs: ['/?'] } : {})
  });
  assert.deepEqual(profile.acpArgs, ['--acp']);
  assert.equal(profile.protocolVersion, 2);
  assert.equal(profile.verification.capabilities.promptCapabilities.image, true);
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
