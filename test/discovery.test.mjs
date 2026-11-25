import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, writeFile, access, rmdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setup, fixture } from './support.mjs';
import { inProbeDirectory } from '../src/discovery.mjs';
import { codexAgentName, codexKey, historyKey } from '../src/session-history.mjs';

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
  assert.deepEqual(requests.map(({ rpc }) => [rpc.method, rpc.params.protocolVersion]), [['initialize', 2], ['initialize', 1]]);
  assert.equal(requests[0].rpc.params.info.name, 'agentlink-discovery');
  assert.deepEqual(requests[0].rpc.params.capabilities, {});
  assert.deepEqual(requests[1].rpc.params.clientCapabilities, { _meta: { [codexKey]: { version: 1 } } });
  assert.deepEqual(profile.verification.sessionHistory, { acpV1Strategy: 'provider-managed' });
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
  assert.deepEqual(launches.map(e => e.launch), [args, args, args, args]); // Both ACP versions on add and refresh.
});

const execHelp = 'Usage: codex exec [OPTIONS] [PROMPT]\r\n\r\nOptions:\r\n      --ephemeral\r\n          Run without saving.\r\n';

test('setup and refresh distinguish Codex exec help from the ACP v1 history offered to apps', async t => {
  const c = await setup(t), log = join(c.root, 'history.jsonl');
  const env = { ...process.env, AGENTLINK_HOME: c.home, CODEX_PATH: '', FIXTURE_NAME: codexAgentName, FIXTURE_VERSION: '2.7.0',
    FIXTURE_LOG: log, FIXTURE_HISTORY: 'fallback', FIXTURE_CODEX_EXEC_HELP: execHelp };
  const stock = { acpV1Strategy: 'archive-on-close', codexExecEphemeral: 'advertised' };
  const command = ['--command', process.execPath, '--prefix-args', JSON.stringify([fixture]), '--acp-args', '[]'];
  const inspected = await c.command(['inspect', ...command, '--json'], { env });
  assert.deepEqual(JSON.parse(inspected.stdout).verification.sessionHistory, stock);
  assert.deepEqual(await c.manager.list(), []);
  const pending = await c.manager.inspect({ command: process.execPath, prefixArgs: [fixture], acpArgs: [], verify: false, env });
  assert.deepEqual(pending.verification, { status: 'pending' });

  const added = await c.manager.add('stock', { offline: true, env,
    spec: { kind: 'binary', version: '1', url: fixture, bin: 'codex-acp.mjs' } });
  assert.deepEqual(added.verification.sessionHistory, stock);
  const checked = await c.command(['check', 'stock'], { env });
  assert.match(checked.stdout, /ACP v1 session history: archive-on-close/);
  assert.match(checked.stdout, /Codex exec --ephemeral: advertised/);
  const client = await c.client('stock', { env });
  const init = await client.initialize(1, { _meta: { [historyKey]: { version: 1 } } });
  assert.equal(init.agentCapabilities._meta[historyKey].strategy, stock.acpV1Strategy);
  await assert.rejects(client.request('session/new', { cwd: c.root, mcpServers: [], _meta: { [historyKey]: { mode: 'require-ephemeral' } } }),
    cause => cause.remote?.data?.code === 'SESSION_HISTORY_UNSUPPORTED');
  await client.close();

  env.FIXTURE_HISTORY = 'native';
  env.FIXTURE_CODEX_EXEC_HELP = 'Usage: codex exec [OPTIONS]\n\nOptions:\n  --ephemeral-mode  Another flag.\nExamples:\n  --ephemeral\n';
  const updated = { acpV1Strategy: 'ephemeral', codexExecEphemeral: 'not-advertised' };
  assert.deepEqual((await c.manager.check('stock', { env })).sessionHistory, updated);
  assert.deepEqual((await c.manager.get('stock')).verification.sessionHistory, stock);
  assert.deepEqual((await c.manager.refresh('stock', { env })).verification.sessionHistory, updated);
  assert.deepEqual((await c.manager.get('stock')).verification.sessionHistory, updated);

  env.FIXTURE_MODE = 'v2-only';
  env.FIXTURE_CODEX_EXEC_HELP = 'Example:\n  --ephemeral\n';
  const stale = await c.manager.refresh('stock', { env });
  assert.equal(stale.verification.protocolVersion, 2);
  assert.deepEqual(stale.verification.sessionHistory, { acpV1Strategy: 'unknown', codexExecEphemeral: 'unknown' });
  const events = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(events.filter(e => e.rpc).every(e => e.rpc.method === 'initialize'));
});

test('failed, oversized or unavailable direct help cannot promote or break a working ACP connection', async t => {
  const c = await setup(t);
  const env = { ...process.env, CODEX_PATH: '', FIXTURE_NAME: codexAgentName, FIXTURE_VERSION: '2.7.0',
    FIXTURE_HISTORY: 'fallback', FIXTURE_CODEX_EXEC_HELP: execHelp };
  const options = { command: process.execPath, prefixArgs: [fixture], acpArgs: [] };
  for (const extra of [{ env: { ...env, FIXTURE_MODE: 'error-help' } }, { env, maxHelpBytes: 12 },
    { env: { ...env, CODEX_PATH: join(c.root, 'missing codex') } }]) {
    const { verification } = await c.manager.inspect({ ...options, ...extra });
    assert.deepEqual(verification.sessionHistory, { acpV1Strategy: 'archive-on-close', codexExecEphemeral: 'unknown' });
  }
});

test('Codex help follows the configured executable even when the bundled CLI differs', async t => {
  const c = await setup(t);
  const script = join(c.root, 'custom codex.cjs');
  await writeFile(script, '#!/usr/bin/env node\n' +
    'if (JSON.stringify(process.argv.slice(2)) === \'["exec","--help"]\') process.stdout.write(' + JSON.stringify(execHelp) + ');\n' +
    'else process.exitCode = 2;\n', { mode: 0o700 });
  let executable = script;
  if (process.platform === 'win32') {
    executable = join(c.root, 'custom codex.cmd');
    await writeFile(executable, '@ECHO OFF\r\nSET "_prog=node"\r\n"%_prog%" "%dp0%\\custom codex.cjs" %*\r\n');
  }
  const { verification } = await c.manager.inspect({ command: process.execPath, prefixArgs: [fixture], acpArgs: [],
    env: { ...process.env, CODEX_PATH: executable, FIXTURE_NAME: codexAgentName, FIXTURE_VERSION: '2.7.0',
      FIXTURE_HISTORY: 'fallback', FIXTURE_CODEX_EXEC_HELP: 'Usage: codex exec\nOptions:\n  --other  Another option.\n' } });
  assert.deepEqual(verification.sessionHistory, { acpV1Strategy: 'archive-on-close', codexExecEphemeral: 'advertised' });
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
