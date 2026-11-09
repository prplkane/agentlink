import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const record = value => { if (process.env.FIXTURE_LOG) appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(value) + '\n'); };
record({ launch: args, pid: process.pid, cwd: process.cwd() });
let version = '1.0.0';
try { version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version; } catch {}
const mode = process.env.FIXTURE_MODE || 'normal';
if (args.includes('--login') || process.env.FIXTURE_LOGIN === 'env-only') {
  console.log(JSON.stringify({ login: args, env: process.env.FIXTURE_LOGIN }));
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h') || args[0] === 'help' || args.includes('/?')) {
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
  const sessions = new Map(), waiting = new Map();
  let nextSession = 0;
  const reader = createInterface({ input: process.stdin });
  reader.on('line', line => {
    const message = JSON.parse(line);
    record({ rpc: message });
    const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize') {
      const v2 = message.params.protocolVersion === 2;
      if (mode === 'strict-init' && (v2 ? !message.params.info : !message.params.clientInfo)) {
        return send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Missing implementation info' } });
      }
      reply({ protocolVersion: message.params.protocolVersion,
      [v2 ? 'info' : 'agentInfo']: { name: process.env.FIXTURE_NAME || 'offline-agent', version },
      [v2 ? 'capabilities' : 'agentCapabilities']: v2
        ? { session: { prompt: { image: {} } }, _meta: { 'fixture/custom': { enabled: true } } }
        : { loadSession: true, promptCapabilities: { image: true }, _meta: { 'fixture/custom': { enabled: true } } },
      authMethods: [{ id: 'terminal-login', name: 'Fixture login', type: 'terminal',
        args: mode === 'env-auth' ? [] : ['--login'], env: { FIXTURE_LOGIN: mode === 'env-auth' ? 'env-only' : 'yes' } }],
      _meta: { receivedClient: message.params } });
    }
    else if (message.method === 'session/new') {
      const sessionId = 'session-' + ++nextSession;
      sessions.set(sessionId, message.params);
      reply({ sessionId, configOptions: [{ id: 'fixture-style', name: 'Style', type: 'select',
        currentValue: 'plain', options: [{ value: 'plain', name: 'Plain' }] }] });
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
        reply({ stopReason: 'end_turn', version, cwd: sessions.get(sessionId)?.cwd, text });
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
    else if (message.method) send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported by fixture', data: { method: message.method } } });
  });
  reader.on('close', () => {
    if (mode === 'ignore-eof') setInterval(() => {}, 1000);
    else process.exit(0);
  });
}
