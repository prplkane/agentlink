import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const record = value => { if (process.env.FIXTURE_LOG) appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(value) + '\n'); };
record({ launch: args, pid: process.pid, cwd: process.cwd() });
let version = '1.0.0';
try { version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version; } catch {}
const mode = process.env.FIXTURE_MODE || 'normal';
const history = process.env.FIXTURE_HISTORY;
const historyFault = process.env.FIXTURE_HISTORY_FAULT;
const codexHistory = 'codex.dev/session-history';
function historyCapabilities(params) {
  if (!history) return {};
  const v2 = params.protocolVersion === 2;
  const offered = (v2 ? params.capabilities : params.clientCapabilities)?._meta?.[codexHistory]?.version === 1;
  const ext = history === 'native' && offered ? { [codexHistory]: { version: 1, ephemeral: true } } : {};
  return { [v2 ? 'session' : 'sessionCapabilities']: { close: {}, delete: {}, title: {}, ...(offersModels && { options: {} }) },
    _meta: { 'fixture/custom': { enabled: true }, ...ext } };
}
const offersModels = ['session-options', 'retired-model', 'ignore-selection', 'hold-sessions'].includes(mode);
if (args.includes('--login') || process.env.FIXTURE_LOGIN === 'env-only') {
  console.log(JSON.stringify({ login: args, env: process.env.FIXTURE_LOGIN }));
  process.exit(0);
}
if (args.join(' ') === 'cli exec --help') {
  process.stdout.write(process.env.FIXTURE_CODEX_EXEC_HELP || '');
  if (mode === 'error-help') process.exitCode = 2;
} else if (args.includes('--help') || args.includes('-h') || args[0] === 'help' || args.includes('/?')) {
  if (mode === 'custom-help' && args[0] !== '/?') process.exit(2);
  if (mode === 'help-command' && args[0] !== 'help') console.log('Commands:\n  help [command]  Display command help');
  else console.log('Options:\n  --acp  Start ACP over stdio');
  if (mode === 'error-help') process.exitCode = 2;
} else if (mode === 'bad-install') {
  console.log('Not a protocol');
} else if (mode === 'silent') {
  setInterval(() => {}, 1000);
} else {
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const sessions = new Map(), waiting = new Map(), held = [];
  let protocolVersion;
  function configOptions(session) {
    const idField = protocolVersion === 2 ? 'configId' : 'id';
    const values = ids => ids.map(value => ({ value, name: value }));
    const models = mode === 'retired-model' ? ['standard', 'new-model'] : ['standard', 'swift'];
    const efforts = session.model === 'swift' ? ['low', 'deep'] : ['low', 'medium'];
    return [
      { [idField]: 'engine', type: 'select', category: 'model', currentValue: session.model,
        options: [{ group: 'available', name: 'Available', options: values(models) }] },
      { [idField]: 'depth', type: 'select', category: 'thought_level', currentValue: session.effort, options: values(efforts) }
    ];
  }
  let nextSession = 0;
  const reader = createInterface({ input: process.stdin });
  reader.on('line', line => {
    const message = JSON.parse(line);
    record({ rpc: message });
    const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize') {
      protocolVersion = message.params.protocolVersion;
      const v2 = message.params.protocolVersion === 2;
      if (!v2 && mode === 'v2-only') return send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Requires v2' } });
      if (mode === 'strict-init' && (v2 ? !message.params.info : !message.params.clientInfo)) {
        return send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Missing implementation info' } });
      }
      reply({ protocolVersion: message.params.protocolVersion,
      [v2 ? 'info' : 'agentInfo']: { name: process.env.FIXTURE_NAME || 'offline-agent', version: process.env.FIXTURE_VERSION || version },
      [v2 ? 'capabilities' : 'agentCapabilities']: v2
        ? { session: { prompt: { image: {} } }, _meta: { 'fixture/custom': { enabled: true } }, ...historyCapabilities(message.params) }
        : { loadSession: true, promptCapabilities: { image: true }, _meta: { 'fixture/custom': { enabled: true } }, ...historyCapabilities(message.params) },
      authMethods: [{ id: 'terminal-login', name: 'Fixture login', type: 'terminal',
        args: mode === 'env-auth' ? [] : ['--login'], env: { FIXTURE_LOGIN: mode === 'env-auth' ? 'env-only' : 'yes' } }],
      _meta: { receivedClient: message.params, ...(history?.startsWith('air') && { jetbrains: { air: { version: 1,
        capabilities: history === 'air-archive' ? ['sessionIndex', 'sessionArchive'] : ['sessionIndex'] } } }) } });
    }
    else if (history && offersModels && message.method === 'session/options') reply({ configOptions: configOptions({ model: 'standard', effort: 'low' }) });
    else if (message.method === 'session/new') {
      const sessionId = 'session-' + ++nextSession;
      if (historyFault === 'new-error') return send({ jsonrpc: '2.0', id: message.id, error: { code: -32010, message: 'Provider setup failed' } });
      const meta = { fixture: 'retained' };
      if (history === 'native' && message.params._meta?.[codexHistory]?.ephemeral === true && historyFault !== 'missing-ack') {
        meta[codexHistory] = { ephemeral: historyFault !== 'negative-ack' };
      }
      if (offersModels) {
        const session = { ...message.params, model: 'standard', effort: 'low' };
        sessions.set(sessionId, session);
        const answer = () => reply({ sessionId, configOptions: configOptions(session), _meta: meta });
        return mode === 'hold-sessions' ? held.push(answer) : answer(); // Held until _fixture/release.
      }
      sessions.set(sessionId, message.params);
      const created = { sessionId, configOptions: [{ id: 'fixture-style', name: 'Style', type: 'select',
        currentValue: 'plain', options: [{ value: 'plain', name: 'Plain' }] }] };
      if (history) created._meta = meta;
      return historyFault === 'slow-new' ? setTimeout(() => reply(created), 125) : reply(created);
    } else if (history && ['session/close', 'session/set_title', 'session/delete', '_session/archive'].includes(message.method)) {
      if (message.method === 'session/close' && historyFault === 'slow-close') return setTimeout(() => {
        record({ closeReady: message.params.sessionId }); reply({});
      }, 125);
      if (message.method === 'session/delete' && historyFault === 'exit-archive') return process.exit(0);
      if (message.method === 'session/set_title' && historyFault === 'slow-title') return setTimeout(() => { record({ titleReady: message.params.sessionId }); reply({}); }, 100);
      if ((message.method === 'session/delete' && historyFault === 'stuck-archive') || (message.method === 'session/set_title' && historyFault === 'stuck-title')) return;
      if ((message.method === 'session/delete' && historyFault === 'archive-error') || (message.method === 'session/close' && historyFault === 'close-error')) {
        return send({ jsonrpc: '2.0', id: message.id, error: { code: -32011, message: 'Provider refused ' + message.method } });
      }
      return reply({ _meta: { fixture: 'closed' } });
    } else if (offersModels && message.method === 'session/set_config_option') {
      const { sessionId, configId, value } = message.params;
      if (protocolVersion === 2 && message.params.type !== 'id') {
        return send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Missing v2 select value type' } });
      }
      const session = sessions.get(sessionId);
      if (configId === 'engine' && mode !== 'ignore-selection') { session.model = value; session.effort = 'low'; }
      if (configId === 'depth') session.effort = value;
      const options = configOptions(session);
      send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId,
        update: { sessionUpdate: 'config_option_update', configOptions: options } } });
      return reply({ configOptions: options });
    } else if (message.method === 'session/prompt') {
      const text = message.params.prompt[0].text;
      const sessionId = message.params.sessionId;
      if (text === 'crash') process.exit(23);
      else if (text === 'malformed') process.stdout.write('bad json\n');
      else if (text === 'spawn') {
        const descendant = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
        record({ descendant: descendant.pid });
        reply({ stopReason: 'end_turn', descendant: descendant.pid });
      } else if (text === 'wait') waiting.set(sessionId, message.id);
      else if (text === 'permission') {
        waiting.set('approval', message.id);
        send({ jsonrpc: '2.0', id: 'approval', method: 'session/request_permission',
          params: { sessionId, toolCall: { toolCallId: 'tool-1', title: 'Fixture edit' },
            options: [{ optionId: 'allow', kind: 'allow_once', name: 'Allow' }, { optionId: 'deny', kind: 'reject_once', name: 'Deny' }] } });
      } else if (text === 'client-tool') {
        waiting.set('file-read', message.id);
        send({ jsonrpc: '2.0', id: 'file-read', method: 'fs/read_text_file', params: { sessionId, path: 'example.txt', _meta: { future: true } } });
      } else {
        send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }, _meta: { opaque: true } } });
        const session = sessions.get(sessionId);
        reply({ stopReason: 'end_turn', version, cwd: session?.cwd, model: session?.model, effort: session?.effort, text });
      }
    } else if (message.method === 'session/cancel') {
      const id = waiting.get(message.params.sessionId);
      if (id !== undefined) { waiting.delete(message.params.sessionId); send({ jsonrpc: '2.0', id, result: { stopReason: 'cancelled' } }); }
    } else if (!message.method && waiting.has(message.id)) {
      const id = waiting.get(message.id);
      waiting.delete(message.id);
      send({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn', clientReply: message.result || message.error } });
    } else if (message.method === '_fixture/final') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id,
        result: { text: 'x'.repeat(1024 * 1024) } }) + '\n', () => process.exit(0));
    } else if (message.method === '_fixture/echo') reply(message.params);
    else if (message.method === '_fixture/release') { for (const answer of held.splice(0)) answer(); reply({ released: true }); }
    else if (message.method) send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported by fixture', data: { method: message.method } } });
  });
  reader.on('close', () => {
    if (mode === 'ignore-eof') setInterval(() => {}, 1000);
    else if (mode === 'slow-exit') setTimeout(() => process.stderr.write('Bridge cleanup complete\n'), 2000);
    else process.exit(0);
  });
}
