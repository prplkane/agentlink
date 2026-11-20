import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, setup } from './support.mjs';
import { SessionDefaults } from '../src/session-defaults.mjs';

test('two independent clients inherit a managed profile selection and keep their own session overrides', async t => {
  const c = await setup(t);
  const log = join(c.root, 'options.jsonl');
  await c.manager.add('provider', { spec: { kind: 'binary', version: '1', bin: 'agent.mjs', url: fixture }, offline: true,
    launchEnv: { FIXTURE_MODE: 'session-options', FIXTURE_LOG: log } });
  const run = async args => JSON.parse((await c.command(args)).stdout);
  const offered = await run(['models', 'provider', '--model', 'swift']);
  assert.deepEqual(offered.model.choices.map(choice => choice.id), ['standard', 'swift']);
  assert.deepEqual(offered.effort.choices.map(choice => choice.id), ['low', 'deep']);
  assert.deepEqual(await run(['defaults', 'provider']), { name: 'provider', defaults: {} });
  await run(['defaults', 'provider', '--model', 'swift', '--effort', 'deep']);
  assert.deepEqual((await run(['defaults', 'provider'])).defaults, { model: 'swift', effort: 'deep' });
  assert.ok(!(await readFile(log, 'utf8')).includes('session/prompt'));

  const clients = [];
  for (const version of [1, 2]) {
    const client = await c.client('provider', { cwd: join(c.root, 'project-' + version) });
    clients.push(client);
    await client.initialize(version);
  }
  const sessions = await Promise.all(clients.map(client => client.session(c.root)));
  for (const session of sessions) {
    assert.deepEqual(session.configOptions.map(option => option.currentValue), ['swift', 'deep']);
    assert.equal(session._meta.fixture, 'retained');
  }
  await clients[0].request('session/set_config_option', { sessionId: sessions[0].sessionId, configId: 'depth', value: 'low' });
  const replies = await Promise.all(clients.map((client, i) => client.prompt(sessions[i].sessionId, 'fixture')));
  assert.deepEqual(replies.map(({ model, effort }) => [model, effort]), [['swift', 'low'], ['swift', 'deep']]);

  await assert.rejects(run(['defaults', 'provider', '--effort', 'medium']), /OPTION_UNAVAILABLE/);
  assert.deepEqual((await c.manager.get('provider')).defaults, { model: 'swift', effort: 'deep' });
  await run(['defaults', 'provider', '--model', 'standard', '--clear-effort']);
  for (const client of clients) {
    assert.deepEqual((await client.session(c.root)).configOptions.map(o => o.currentValue), ['standard', 'low']);
  }
  const third = await c.client('provider');
  await third.initialize();
  assert.deepEqual((await third.session(c.root)).configOptions.map(o => o.currentValue), ['standard', 'low']);
  assert.equal((await clients[1].prompt(sessions[1].sessionId, 'again')).model, 'swift');
  await run(['defaults', 'provider', '--clear-model']);
  assert.equal((await c.manager.get('provider')).defaults, undefined);
});

test('an already open connection picks up new pins and clears them for later sessions', async t => {
  const c = await setup(t);
  await c.profile('provider', { FIXTURE_MODE: 'session-options' });
  const client = await c.client('provider');
  await client.initialize();
  const initial = await client.session(c.root);
  await c.manager.setDefaults('provider', { model: 'swift', effort: 'deep' });
  const simultaneous = await Promise.all([client.session(c.root), client.session(c.root)]);
  assert.notEqual(simultaneous[0].sessionId, simultaneous[1].sessionId);
  for (const session of simultaneous) assert.deepEqual(session.configOptions.map(o => o.currentValue), ['swift', 'deep']);
  assert.equal((await client.prompt(initial.sessionId, 'fixture')).model, 'standard');
  await c.manager.setDefaults('provider', { model: null, effort: null });
  assert.deepEqual((await client.session(c.root)).configOptions.map(o => o.currentValue), ['standard', 'low']);
});

test('an unreadable profile fails one session creation and keeps the open connection', async t => {
  const c = await setup(t);
  const log = join(c.root, 'rpc.jsonl');
  await c.profile('provider', { FIXTURE_MODE: 'session-options', FIXTURE_LOG: log }); // No saved defaults.
  const client = await c.client('provider');
  await client.initialize();
  const first = await client.session(c.root);
  const path = c.manager.store.path('provider');
  const saved = await readFile(path, 'utf8');
  await writeFile(path, saved.slice(0, 40)); // A half-finished hand edit.
  await assert.rejects(client.session(c.root), cause =>
    cause.remote?.code === -32603 && cause.remote.data.code === 'INVALID_PROFILE' && /could not prepare/.test(cause.message));
  assert.equal((await client.prompt(first.sessionId, 'still open')).text, 'still open');
  await writeFile(path, saved);
  assert.notEqual((await client.session(c.root)).sessionId, first.sessionId);
  const created = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    .filter(entry => entry.rpc?.method === 'session/new');
  assert.equal(created.length, 2); // The failed creation never reached the bridge.
  assert.match((await client.close()).stderr, /^INVALID_PROFILE: /m); // The reason is also logged.
});

test('a creation beyond the pending limit is refused while the pending ones complete', async t => {
  const c = await setup(t);
  await c.profile('provider', { FIXTURE_MODE: 'session-options' });
  await c.manager.setDefaults('provider', { model: 'swift' });
  await c.manager.update('provider', { launchEnv: { FIXTURE_MODE: 'hold-sessions' } });
  const client = await c.client('provider');
  await client.initialize();
  const pending = Array.from({ length: 256 }, () => client.session(c.root));
  await assert.rejects(client.session(c.root), cause =>
    cause.remote?.code === -32603 && cause.remote.data.code === 'MESSAGE_LIMIT');
  await client.request('_fixture/release');
  const sessions = await Promise.all(pending);
  assert.equal(new Set(sessions.map(session => session.sessionId)).size, 256);
  assert.ok(sessions.every(session => session.configOptions[0].currentValue === 'swift'));
});

test('unsupported and unconfirmed selections fail without replacing saved data', async t => {
  const c = await setup(t);
  await c.profile('plain');
  assert.equal((await c.manager.models('plain')).model, null);
  await assert.rejects(c.manager.setDefaults('plain', { model: 'missing' }), { code: 'OPTION_UNAVAILABLE' });
  await c.profile('ignored', { FIXTURE_MODE: 'ignore-selection' });
  const previous = await c.manager.get('ignored');
  await assert.rejects(c.manager.setDefaults('ignored', { model: 'swift', effort: 'deep' }), { code: 'OPTION_UNCONFIRMED' });
  assert.deepEqual(await c.manager.get('ignored'), previous);
  await assert.rejects(c.command(['defaults', 'ignored', '--effort', 'low', '--clear-effort']), /Choose --effort or --clear-effort/);
});

test('a retired saved model rejects session creation and raw inspection still lists replacements', async t => {
  const c = await setup(t);
  await c.profile('provider', { FIXTURE_MODE: 'session-options' });
  await c.manager.setDefaults('provider', { model: 'swift' });
  await c.manager.update('provider', { launchEnv: { FIXTURE_MODE: 'retired-model' } });
  await c.manager.refresh('provider');
  const client = await c.client('provider');
  await client.initialize();
  await assert.rejects(client.session(c.root), cause => cause.remote.data.code === 'OPTION_UNAVAILABLE');
  const offered = await c.manager.models('provider');
  assert.deepEqual(offered.model.choices.map(row => row.id), ['standard', 'new-model']);
  assert.deepEqual(offered.defaults, { model: 'swift' });
  await c.manager.setDefaults('provider', { model: 'new-model' });
  const legacy = await c.manager.connect('provider', { cwd: c.root });
  try { assert.equal((await legacy.prompt('fixture')).model, 'new-model'); }
  finally { await legacy.close(); }
});

test('pending configuration preserves exact IDs, extensions and the order of session notifications', () => {
  const sent = [];
  const relay = new SessionDefaults(frame => sent.push(frame), 10000);
  const id = '9007199254740993';
  const request = '{"id":' + id + ',"method":"session/new"}';
  relay.expectSession(JSON.parse(request), request, { model: 'b' }, 1);
  const options = '[{"id":"model","type":"select","currentValue":"a","options":[{"value":"a"},{"value":"b"}]}]';
  const original = '{"jsonrpc":"2.0","id":' + id + ',"result":{"sessionId":"s","_meta":{"n":' + id + '},"configOptions":' + options + '}}';
  const agent = source => relay.agentMessage(JSON.parse(source), source);
  assert.equal(agent(original), null);
  assert.ok(sent[0].includes('"id":' + id));
  const update = '{"method":"session/update","params":{"sessionId":"s","update":{"sessionUpdate":"available_commands_update"}}}';
  assert.equal(agent(update), null);
  const updated = options.replace('"currentValue":"a"', '"currentValue":"b"');
  const completed = agent('{"id":' + id + ',"result":{"configOptions":' + updated + '}}');
  assert.equal(completed.toString(), original.replace(options, updated) + '\n' + update);
});
