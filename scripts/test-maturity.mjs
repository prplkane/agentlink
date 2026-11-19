// Explicit operational qualification. The routine suite covers protocol and
// fault-injection regressions. This run spends longer on actual process churn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setup, fixture } from '../test/support.mjs';

test('400 overlapping managed sessions inherit central settings and release every lease', { timeout: 240000 }, async t => {
  const c = await setup(t);
  await c.manager.add('shared', { spec: { kind: 'binary', version: '1', bin: 'agent.mjs', url: fixture },
    offline: true, launchEnv: { FIXTURE_MODE: 'session-options' } });
  const elapsed = [];
  for (let batch = 0; batch < 50; batch++) {
    const model = batch < 25 ? 'swift' : 'standard';
    const effort = batch < 25 ? 'deep' : 'medium';
    if (batch === 0 || batch === 25) await c.manager.setDefaults('shared', { model, effort });
    const started = performance.now();
    const clients = await Promise.all(Array.from({ length: 8 }, (_, i) => c.client('shared', { cwd: join(c.root, 'project-' + i) })));
    try {
      const calls = await Promise.allSettled(clients.map(async (client, i) => {
        await client.initialize(i % 2 + 1);
        const { sessionId } = await client.session(join(c.root, 'project-' + i));
        const marker = 'batch-' + batch + '-project-' + i;
        const reply = await client.prompt(sessionId, marker);
        assert.deepEqual([reply.model, reply.effort, reply.text], [model, effort, marker]);
      }));
      for (const call of calls) if (call.status === 'rejected') throw call.reason;
      assert.equal((await readdir(c.manager.bridges.leases)).length, clients.length);
      elapsed.push(performance.now() - started);
    } finally {
      const exits = await Promise.all(clients.map(client => client.close()));
      assert.ok(exits.every(exit => exit?.code === 0));
    }
    assert.deepEqual(await readdir(c.manager.bridges.leases), []);
  }
  elapsed.sort((a, b) => a - b);
  t.diagnostic('Eight-process batch through the last synthetic prompt: median ' +
    Math.round(elapsed[24]) + ' ms, p95 ' + Math.round(elapsed[47]) + ' ms.');
});
