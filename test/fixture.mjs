import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [mode, log] = process.argv.slice(2);
const record = data => { if (log) appendFileSync(log, JSON.stringify(data) + '\n'); };
const send = data => process.stdout.write(JSON.stringify(data) + '\n');
let promptId;
const children = [];
record({ pid: process.pid });
if (mode === 'tree') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  children.push(child);
  record({ descendantPid: child.pid });
}
const reader = createInterface({ input: process.stdin });
reader.on('line', line => {
  const message = JSON.parse(line);
  record(message);
  const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
  if (message.method === 'initialize') {
    if (mode === 'init-stall') return;
    reply({ protocolVersion: mode === 'v2-only' ? 2 : 1, agentCapabilities: {}, authMethods: [] });
  } else if (message.method === 'session/new') {
    if (mode === 'session-error') return send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Synthetic authentication required' } });
    reply({ sessionId: 'fixture-session' });
    if (mode === 'early-update') send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'fixture-session', update: { sessionUpdate: 'available_commands_update', availableCommands: [] } } });
  } else if (message.method === 'session/prompt') {
    promptId = message.id;
    if (mode === 'crash') return process.exit(7);
    if (['stall', 'ignore-cancel', 'tree'].includes(mode)) return;
    if (mode === 'malformed') return process.stdout.write('{invalid\n');
    if (mode === 'invalid-utf8') return process.stdout.write(Buffer.from([0xff, 10]));
    if (mode === 'oversize') return process.stdout.write('X'.repeat(2048));
    if (mode === 'wrong-id') return send({ jsonrpc: '2.0', id: 999, result: {} });
    if (mode === 'wrong-session') return send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'other', update: { sessionUpdate: 'agent_message_chunk' } } });
    if (mode === 'permissions') return send({ jsonrpc: '2.0', id: 'permission-1', method: 'session/request_permission', params: { sessionId: 'fixture-session', toolCall: { toolCallId: 'tool-1', title: 'Synthetic tool' }, options: [{ optionId: 'allow', kind: 'allow_once', name: 'Allow' }] } });
    if (mode === 'unsupported') return send({ jsonrpc: '2.0', id: 'tool-1', method: 'fs/read_text_file', params: { sessionId: 'fixture-session', path: '/no-file' } });
    if (mode === 'stderr') process.stderr.write('E'.repeat(50000));
    const update = { jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'fixture-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Synthetic reply 🪶' } } } };
    if (mode === 'output-limit') {
      for (let i = 0; i < 30; i++) send(update);
      return;
    }
    const wire = Buffer.from(JSON.stringify(update) + '\n');
    const split = wire.indexOf(Buffer.from('🪶')) + 1;
    process.stdout.write(wire.subarray(0, split));
    setTimeout(() => { process.stdout.write(wire.subarray(split)); reply({ stopReason: 'end_turn' }); }, 10);
  } else if (message.method === 'session/cancel') {
    if (mode !== 'ignore-cancel') send({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'cancelled' } });
  } else if (message.id === 'permission-1' || message.id === 'tool-1') {
    send({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'end_turn' } });
  }
});
reader.on('close', () => { for (const child of children) child.kill(); process.exit(0); });
