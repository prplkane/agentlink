import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setup } from './support.mjs';
import { historyKey, SessionHistory } from '../src/session-history.mjs';

const nativeKey = 'codex.dev/session-history';
const optIn = { _meta: { [historyKey]: { version: 1 }, keep: 'client' } };
const codex = '@agentclientprotocol/codex-acp';
const claude = '@agentclientprotocol/claude-agent-acp';
const status = result => result._meta?.[historyKey]?.status;
const policyError = code => cause => cause.remote?.data?.code === code;

async function harness(t, { name = codex, version = '2.7.0', kind = 'fallback', fault, mode } = {}) {
  const ctx = await setup(t);
  const log = join(ctx.root, 'calls.jsonl');
  const env = { FIXTURE_NAME: name, FIXTURE_VERSION: version, FIXTURE_HISTORY: kind, FIXTURE_LOG: log,
    ...(fault && { FIXTURE_HISTORY_FAULT: fault }), ...(mode && { FIXTURE_MODE: mode }) };
  await ctx.profile('provider', env);
  const client = await ctx.client('provider');
  const init = await client.initialize(1, optIn);
  assert.equal(init.agentCapabilities._meta['fixture/custom'].enabled, true);
  assert.deepEqual(init._meta.receivedClient.clientCapabilities._meta, { keep: 'client', [nativeKey]: { version: 1 } });
  const records = async () => (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const calls = async method => (await records()).map(entry => entry.rpc).filter(call => call?.method === method);
  const fresh = (mode = 'prefer-ephemeral', meta = {}) => client.request('session/new', {
    cwd: ctx.root, mcpServers: [], _meta: { [historyKey]: { mode }, ...meta }
  });
  const close = sessionId => client.request('session/close', { sessionId });
  const offer = init.agentCapabilities._meta[historyKey];
  assert.equal(offer.version, 1);
  return { ctx, env, client, calls, records, fresh, close, strategy: offer.strategy };
}

test('legacy Codex archives exactly its owned session at close after multiple prompts', async t => {
  const h = await harness(t, { fault: 'slow-title' });
  assert.equal(h.strategy, 'archive-on-close');
  await assert.rejects(h.fresh('require-ephemeral'), policyError('SESSION_HISTORY_UNSUPPORTED'));
  await assert.rejects(h.client.request('session/new', { sessionId: 'existing-user-session', _meta: { [historyKey]: { mode: 'prefer-ephemeral' } } }), policyError('INVALID_SESSION_HISTORY'));
  const ordinary = await h.client.session(h.ctx.root);
  assert.equal(status(ordinary), undefined);
  const tmp = await h.fresh();
  assert.equal(status(tmp), 'archive-on-close');
  assert.equal(tmp._meta.fixture, 'retained');
  assert.equal((await h.client.prompt(tmp.sessionId, 'one')).text, 'one');
  assert.equal((await h.client.prompt(tmp.sessionId, 'two')).text, 'two');
  await h.close(ordinary.sessionId);
  await h.close('unrelated-existing-chat');
  assert.deepEqual(await h.calls('session/delete'), []);
  const closed = await h.close(tmp.sessionId);
  assert.equal(status(closed), 'archived');
  assert.equal(closed._meta.fixture, 'closed');
  assert.equal((await h.client.close()).code, 0);
  assert.equal((await h.calls('session/new')).length, 2);
  const ordered = await h.records();
  const title = (await h.calls('session/set_title')).map(call => call.params);
  assert.deepEqual(title, [{ sessionId: tmp.sessionId, title: 'AgentLink session' }]);
  const titled = ordered.findIndex(row => row.titleReady);
  assert.ok(titled >= 0 && titled < ordered.findIndex(row => row.rpc?.method === 'session/prompt'));
  assert.deepEqual((await h.calls('session/delete')).map(call => call.params.sessionId), [tmp.sessionId]);
  assert.deepEqual(await h.calls('session/list'), []);
  assert.ok(!h.client.messages.some(message => String(message.id).startsWith('agentlink-history-')));
});

test('owned fallback cleanup covers disconnect during a new-session response', async t => {
  const h = await harness(t, { fault: 'slow-new' });
  const ordinary = await h.client.session(h.ctx.root);
  const open = h.fresh();
  const finished = h.client.close();
  const tmp = await open;
  assert.notEqual(tmp.sessionId, ordinary.sessionId);
  assert.equal((await finished).code, 0);
  assert.deepEqual((await h.calls('session/delete')).map(call => call.params.sessionId), [tmp.sessionId]);
  assert.deepEqual(await h.calls('session/prompt'), []);
});

test('Claude applies persistSession on the fresh session without changing ordinary ones', async t => {
  const h = await harness(t, { name: claude, version: '0.109.0' });
  assert.equal(h.strategy, 'ephemeral');
  const extra = { claudeCode: { options: { allowedTools: ['Read'], persistSession: true } }, user: 42 };
  await assert.rejects(h.fresh('require-ephemeral', { claudeCode: { options: { resume: 'unrelated' } } }), policyError('INVALID_SESSION_HISTORY'));
  const tmp = await h.fresh('require-ephemeral', extra);
  assert.equal(status(tmp), 'ephemeral');
  const ordinary = await h.client.session(h.ctx.root);
  assert.equal(status(ordinary), undefined);
  assert.equal(status(await h.close(tmp.sessionId)), 'ephemeral');
  assert.equal((await h.client.close()).code, 0);
  const opens = await h.calls('session/new');
  assert.equal(opens.length, 2);
  assert.deepEqual(opens[0].params._meta, { claudeCode: { options: { allowedTools: ['Read'], persistSession: false } }, user: 42 });
  assert.equal(opens[1].params._meta, undefined);
  assert.deepEqual(await h.calls('session/delete'), []);
});

test('native Codex requires an individual positive acknowledgement and keeps ordinary defaults', async t => {
  const h = await harness(t, { kind: 'native', version: 'future' });
  assert.equal(h.strategy, 'ephemeral');
  const normal = await h.client.session(h.ctx.root);
  const tmp = await h.fresh('require-ephemeral', { [nativeKey]: { other: 99 } });
  assert.equal(status(normal), undefined);
  assert.equal(status(tmp), 'ephemeral');
  assert.equal(tmp._meta[nativeKey].ephemeral, true);
  const opens = await h.calls('session/new');
  assert.equal(opens[0].params._meta, undefined);
  assert.deepEqual(opens[1].params._meta, { [nativeKey]: { other: 99, ephemeral: true } });
  assert.equal(status(await h.close(tmp.sessionId)), 'ephemeral');
  assert.equal((await h.client.close()).code, 0);
  assert.deepEqual(await h.calls('session/delete'), []);
  assert.deepEqual(await h.calls('session/set_title'), []);
});

for (const fault of ['missing-ack', 'negative-ack', 'new-error']) test('native creation handles ' + fault + ' before any prompt', async t => {
  const h = await harness(t, { kind: 'native', fault });
  for (const mode of ['prefer-ephemeral', 'require-ephemeral']) {
    await assert.rejects(h.fresh(mode), fault === 'new-error' ? cause => cause.remote.code === -32010 : policyError('SESSION_HISTORY_UNCONFIRMED'));
  }
  assert.equal((await h.client.close()).code, 0);
  assert.deepEqual(await h.calls('session/prompt'), []);
  assert.equal((await h.calls('session/delete')).length, fault === 'new-error' ? 0 : 2);
});

test('unsupported peers report provider control, strict refusal and negotiation are per connection', async t => {
  const h = await harness(t, { name: 'agy', version: '1' });
  assert.equal(h.strategy, 'provider-managed');
  await assert.rejects(h.fresh('require-ephemeral'), policyError('SESSION_HISTORY_UNSUPPORTED'));
  await assert.rejects(h.fresh('typo'), policyError('INVALID_SESSION_HISTORY'));
  const tmp = await h.fresh();
  assert.equal(status(tmp), 'provider-managed');
  assert.equal(status(await h.close(tmp.sessionId)), 'provider-managed');
  const other = await h.ctx.client('provider');
  assert.equal((await other.initialize()).agentCapabilities._meta[historyKey], undefined);
  await assert.rejects(other.request('session/new', { _meta: { [historyKey]: { mode: 'require-ephemeral' } } }), policyError('SESSION_HISTORY_UNSUPPORTED'));
  assert.equal(status(await other.session(h.ctx.root)), undefined);
  assert.equal((await other.close()).code, 0);
  assert.equal((await h.client.close()).code, 0);
  assert.equal((await h.calls('session/new')).length, 2);
  assert.deepEqual(await h.calls('session/delete'), []);
  assert.deepEqual(await h.calls('session/set_title'), []);
});

for (const kind of ['air-index', 'air-archive']) test(kind + ' never hard-deletes', async t => {
  const h = await harness(t, { kind });
  assert.equal(h.strategy, kind === 'air-index' ? 'provider-managed' : 'archive-on-close');
  const tmp = await h.fresh();
  assert.equal(status(await h.close(tmp.sessionId)), kind === 'air-index' ? 'provider-managed' : 'archived');
  assert.equal((await h.client.close()).code, 0);
  assert.equal((await h.calls('_session/archive')).length, kind === 'air-index' ? 0 : 1);
  assert.deepEqual(await h.calls('session/delete'), []);
});

for (const fault of ['archive-error', 'stuck-archive', 'stuck-title', 'close-error']) test('legacy Codex handles ' + fault + ' without losing provider replies', async t => {
  const h = await harness(t, { fault });
  const tmp = await h.fresh();
  assert.equal((await h.client.prompt(tmp.sessionId, 'result')).text, 'result');
  if (fault === 'close-error') {
    await assert.rejects(h.close(tmp.sessionId), cause => cause.remote.code === -32011 && /session\/close/.test(cause.message));
    assert.equal((await h.client.prompt(tmp.sessionId, 'reuse')).text, 'reuse');
    assert.deepEqual(await h.calls('session/delete'), []);
  } else {
    const reply = await h.close(tmp.sessionId);
    assert.equal(status(reply), fault === 'stuck-title' ? 'archived' : 'unconfirmed');
    assert.equal(reply._meta.fixture, 'closed');
  }
  assert.equal((await h.client.close()).code, 0);
  assert.equal((await h.calls('session/delete')).length, ['archive-error', 'stuck-archive'].includes(fault) ? 2 : 1);
});

test('closing a provider output mid-archive returns the held close result with unconfirmed status', async t => {
  const h = await harness(t, { fault: 'exit-archive' });
  const tmp = await h.fresh();
  assert.equal(status(await h.close(tmp.sessionId)), 'unconfirmed');
  assert.equal((await h.client.exit).code, 0);
});

test('renegotiation cannot change the meaning of cleanup and an explicit removal stays removed', async t => {
  const h = await harness(t);
  const session = await h.fresh();
  await assert.rejects(h.client.initialize(1, { _meta: { jetbrains: { air: { capabilities: ['sessionIndex'] } } } }), policyError('INVALID_SESSION_HISTORY'));
  assert.equal(status(await h.client.request('session/delete', { sessionId: session.sessionId })), undefined);
  assert.equal((await h.client.close()).code, 0);
  assert.equal((await h.calls('session/delete')).length, 1);
});

test('a saved model that no longer exists cleans the owned creation before the client receives a session ID', async t => {
  const h = await harness(t, { mode: 'session-options' });
  await h.ctx.manager.setDefaults('provider', { model: 'swift' });
  await h.ctx.manager.update('provider', { launchEnv: { ...h.env, FIXTURE_MODE: 'retired-model' } });
  const client = await h.ctx.client('provider');
  await client.initialize(1, optIn);
  await assert.rejects(client.request('session/new', { cwd: h.ctx.root, mcpServers: [], _meta: { [historyKey]: { mode: 'prefer-ephemeral' } } }), policyError('OPTION_UNAVAILABLE'));
  assert.equal((await client.close()).code, 0);
  await assert.rejects(h.ctx.command(['defaults', 'provider', '--model', 'missing']), cause =>
    /OPTION_UNAVAILABLE/.test(cause.stderr) && !/SESSION_HISTORY_UNCONFIRMED/.test(cause.stderr));
  assert.equal((await h.calls('session/delete')).length, 3); // Successful and failed management probes, plus client creation.
  assert.deepEqual(await h.calls('session/prompt'), []);
});

for (const kind of ['fallback', 'native']) test('management uses read-only options and ' + kind + ' for model-specific inspection', async t => {
  const h = await harness(t, { kind, mode: 'session-options' });
  await h.ctx.command(['check', 'provider']);
  assert.deepEqual(await h.calls('session/new'), []);
  const models = await h.ctx.manager.models('provider');
  assert.equal(models.model.current, 'standard');
  assert.equal((await h.calls('session/options')).length, 1);
  assert.deepEqual(await h.calls('session/new'), []);
  const changed = await h.ctx.manager.models('provider', { model: 'swift' });
  assert.equal(changed.model.current, 'swift');
  const [created] = await h.calls('session/new');
  assert.equal(created.params._meta[nativeKey]?.ephemeral, kind === 'native' ? true : undefined);
  assert.equal((await h.calls('session/delete')).length, kind === 'native' ? 0 : 1);
  assert.deepEqual(await h.calls('session/set_title'), []);
  assert.deepEqual(await h.calls('session/prompt'), []);
});

test('negotiated edits preserve large opaque integers and exact request IDs', async () => {
  const sent = [];
  let closed;
  const output = new Promise(resolve => { closed = resolve; });
  const relay = new SessionHistory({ agentInfo: { name: codex, version: '2.12.0' }, agentCapabilities: {
    sessionCapabilities: { close: {}, delete: {} }
  } }, frame => { sent.push(JSON.parse(frame)); return true; }, closed, 16000);
  const id = '9007199254740993';
  const request = '{"id":' + id + ',"params":{"_meta":{"n":' + id + ',"' + historyKey + '":{"mode":"prefer-ephemeral"}}}}';
  assert.ok(relay.prepare(JSON.parse(request), request).toString().includes('"n":' + id));
  const onAgent = raw => relay.agentMessage(JSON.parse(raw), raw);
  const newReply = '{"id":' + id + ',"result":{"sessionId":"s","_meta":{"n":' + id + '}}}';
  assert.ok(onAgent(newReply).toString().includes('"n":' + id));
  const closing = '{"method":"session/close","id":' + id + ',"params":{"sessionId":"s"}}';
  await relay.beforeClient(JSON.parse(closing), closing);
  assert.equal(onAgent('{"id":' + id + ',"result":{"_meta":{"n":' + id + '}}}'), null);
  assert.equal(sent.length, 1);
  assert.equal(onAgent(JSON.stringify({ id: sent[0].id, result: {} })), null);
  const raw = (await output).toString();
  assert.ok(raw.includes('"id":' + id));
  assert.ok(raw.includes('"n":' + id));
  assert.equal(status(JSON.parse(raw).result), 'archived');
});
