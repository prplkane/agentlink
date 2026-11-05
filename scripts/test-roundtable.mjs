// Explicit cross-repository verification. No vendor account or external package.
// Usage: node scripts/test-roundtable.mjs /absolute/path/to/roundtable
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentLink } from '../src/index.mjs';

if (!process.argv[2]) throw new Error('Usage: node scripts/test-roundtable.mjs /absolute/path/to/roundtable');
const roundtable = resolve(process.argv[2]);
const fixture = join(roundtable, 'test/fixtures/fake-acp.mjs');
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const portNumber = async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
};

test('Roundtable uses centrally managed AgentLink bridges over standard ACP', { timeout: 120000 }, async (t) => {
  await readFile(join(roundtable, 'src/adapters/acp.js'));
  await readFile(fixture);
  const root = await mkdtemp(join(tmpdir(), 'agentlink-roundtable-'));
  const home = join(root, 'agentlink'), data = join(root, 'reviews'), wire = join(root, 'wire.jsonl');
  const user = join(root, 'synthetic-user');
  await mkdir(user);
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit'); child.kill(); await exit;
    }
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'agentlink-roundtable-')));
    await rm(root, { recursive: true, force: true });
  });
  const manager = new AgentLink({ home });
  const spec = (version) => ({ kind: 'binary', url: fixture, bin: 'fake-acp.mjs', version });
  const original = await manager.installBridge('offline-review', spec('1'), { offline: true });
  for (const [name, stance] of [['risk', 'opt-1'], ['cost', 'opt-2']]) {
    await manager.add(name, { bridge: 'offline-review', launchEnv: { ACP_FIXTURE_LOG: wire, ACP_FIXTURE_STANCE: stance } });
  }
  await manager.add('waiting', { bridge: 'offline-review', launchEnv: { ACP_FIXTURE_LOG: wire, ACP_FIXTURE_MODE: 'wait' } });
  await manager.add('unknown-usage', { bridge: 'offline-review', launchEnv: { ACP_FIXTURE_LOG: wire, ACP_FIXTURE_MODE: 'no-usage' } });
  const port = await portNumber();
  child = spawn(process.execPath, [join(roundtable, 'src/server.js')], {
    cwd: roundtable, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: '', HOME: user, USERPROFILE: user, APPDATA: user, LOCALAPPDATA: user,
      XDG_DATA_HOME: user, XDG_CONFIG_HOME: user, CODEX_HOME: user, CLAUDE_CONFIG_DIR: user,
      PORT: String(port), ROUNDTABLE_DEBATES_DIR: data, ROUNDTABLE_AGENTLINK_CLI: cli,
      AGENTLINK_HOME: home, ROUNDTABLE_API_BILLING: '0' },
  });
  let output = '';
  const token = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Offline Roundtable server did not start.')), 15000);
    const inspect = (chunk) => {
      output += chunk;
      const match = /token ([0-9a-f]{32})/.exec(output);
      if (match) { clearTimeout(timer); done(match[1]); }
    };
    child.stdout.on('data', inspect); child.stderr.on('data', inspect);
    child.once('error', (e) => { clearTimeout(timer); fail(e); });
    child.once('exit', (code) => { clearTimeout(timer); fail(new Error(`Offline Roundtable exited (${code}) before startup.`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const request = async (route, body) => {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-roundtable-token': token },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    assert.equal(response.status, 200, `Unexpected response: ${JSON.stringify(result)}`);
    return result;
  };
  const readEvents = async (id, onEvent) => {
    const response = await fetch(`${base}/api/debates/${id}/events`, { signal: AbortSignal.timeout(30000) });
    const reader = response.body.getReader(), decoder = new TextDecoder(), events = [];
    let pending = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Review stream ended before done.');
        pending += decoder.decode(value, { stream: true });
        let at;
        while ((at = pending.indexOf('\n\n')) >= 0) {
          const block = pending.slice(0, at); pending = pending.slice(at + 2);
          const line = block.split('\n').find((entry) => entry.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)); events.push(event);
          await onEvent?.(event);
          if (event.type === 'done') return events;
        }
      }
    } finally { await reader.cancel(); }
  };
  const wireEvents = async () => (await readFile(wire, 'utf8')).trim().split('\n').map(JSON.parse);
  const body = {
    fieldNotes: { decision: 'Synthetic offline rollout review', options: ['Trial', 'Wait'] },
    seats: [{ vendor: 'acp', account: 'risk', lens: 'risk' }, { vendor: 'acp', account: 'cost', lens: 'cost' }],
    chairman: { vendor: 'acp', account: 'risk' },
    options: { memory: 'stateless', critiqueRounds: 1, unattended: true, allowLimitedIsolation: true },
  };
  let firstLaunch;
  async function review() {
    const offset = (await wireEvents()).length;
    const { slug } = await request('/api/debates', body);
    const events = await readEvents(slug);
    assert.equal(events.at(-1).synthesis, 'done');
    assert.equal(events.filter((e) => e.type === 'round-start').length, 2);
    const verdict = events.find((e) => e.type === 'verdict');
    assert.equal(verdict.failed, false);
    assert.match(verdict.text, /^RECOMMENDATION: opt-1/);
    const state = await request(`/api/debates/${slug}/state`);
    assert.equal(state.status, 'done'); assert.equal(state.verdict.status, 'ready');
    const trace = (await wireEvents()).slice(offset);
    const starts = trace.filter((e) => e.start);
    assert.equal(starts.length, 5, 'two rounds of two seats, then the chairman');
    assert.equal(new Set(starts.map((e) => e.cwd)).size, 3, 'two seat directories and a chairman directory');
    assert.equal(trace.filter((e) => e.rpc?.method === 'session/new').length, 5);
    assert.ok(trace.filter((e) => e.rpc?.method === 'initialize').every((e) => e.rpc.params.protocolVersion === 1));
    assert.equal(trace.filter((e) => e.exit).length, 5, 'every fixture process finished');
    assert.deepEqual(await readdir(manager.bridges.leases), [], 'completed reviews release installation leases');
    return starts[0].script;
  }
  await t.test('a full review streams two rounds and a ready chairman verdict through the real gateway', async () => {
    firstLaunch = await review();
  });
  await t.test('a central bridge update reaches the next review without changing Roundtable configuration', async () => {
    const updated = await manager.updateBridge('offline-review', { spec: spec('2'), offline: true });
    assert.notEqual(updated.installKey, original.installKey);
    assert.notEqual(await review(), firstLaunch);
  });
  await t.test('Stop cancels the live ACP seats without starting a chairman', async () => {
    const offset = (await wireEvents()).length;
    const waiting = { ...body, seats: body.seats.map((s) => ({ ...s, account: 'waiting' })) };
    const { slug } = await request('/api/debates', waiting);
    let stopped = false;
    const events = await readEvents(slug, async (e) => {
      if (!stopped && e.type === 'round-start') {
        stopped = true;
        // Stop only after both local fixture prompts are actually waiting.
        const deadline = Date.now() + 10000;
        while ((await wireEvents()).slice(offset).filter((row) => row.rpc?.method === 'session/prompt').length < 2) {
          assert.ok(Date.now() < deadline, 'both fixture seats reached their prompts');
          await new Promise((done) => setTimeout(done, 25));
        }
        await request(`/api/debates/${slug}/stop`, {});
      }
    });
    assert.equal(events.at(-1).cancelled, true);
    assert.ok(!events.some((e) => e.type === 'attempt' && e.kind === 'verdict'));
    const trace = (await wireEvents()).slice(offset);
    assert.ok(trace.some((e) => e.rpc?.method === 'session/cancel'));
    assert.equal(trace.filter((e) => e.start).length, trace.filter((e) => e.exit).length);
    assert.deepEqual(await readdir(manager.bridges.leases), [], 'Stop releases managed installation leases');
  });
  await t.test('a bridge without token usage cannot silently bypass Roundtable seat caps', async () => {
    const noUsage = { ...body, seats: body.seats.map((s) => ({ ...s, account: 'unknown-usage' })),
      options: { ...body.options, unattended: false, autoContinueMs: 100, questionWaitMs: 100 } };
    const { slug } = await request('/api/debates', noUsage);
    const events = await readEvents(slug, (e) => e.type === 'gate' && e.round === 0
      ? request(`/api/debates/${slug}/continue`, { message: 'Synthetic correction: revisit cost.' }) : undefined);
    assert.ok(events.some((e) => e.type === 'budget' && e.kind === 'seat-tokens-unknown'));
    assert.equal(events.filter((e) => e.type === 'attempt' && e.kind !== 'verdict').length, 2);
  });
});
