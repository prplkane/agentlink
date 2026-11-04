import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';

const [mode, log, ...args] = process.argv.slice(2);
const record = value => appendFileSync(log, JSON.stringify(value) + '\n');
record({ type: 'launch', args, cwd: process.cwd(), pid: process.pid });
const help = args.includes('--help') || args.includes('-h');
if (help) {
  if (mode === 'stall-help') setInterval(() => {}, 1000);
  else if (mode === 'huge-help') process.stdout.write('x'.repeat(10000));
  else if (mode === 'short-help' && args.includes('--help')) process.exitCode = 2;
  else if (mode === 'unsupported') process.stdout.write('This tool can discuss ACP.\nExample: some-tool --acp\nOptions:\n  --prompt <text>  Send a prompt\n');
  else if (mode === 'subcommand') process.stdout.write('Commands:\n  acp [options]  Start the Agent Client Protocol server\n');
  else if (mode === 'nested' && args[0] !== 'serve') process.stdout.write('Commands:\n  serve [options]  Serve ACP clients\n');
  else if (mode === 'nested') process.stdout.write('Options:\n  --protocol <name>  Protocol choices: acp, other\n');
  else process.stdout.write('Options:\n  --acp  Start the Agent Client Protocol server over stdio\n');
} else {
  const expected = mode === 'direct' ? [] : mode === 'subcommand' ? ['acp'] : mode === 'nested' ? ['serve', '--protocol', 'acp'] : ['--acp'];
  if (JSON.stringify(args) !== JSON.stringify(expected)) process.exit(2);
  if (mode === 'fake') { process.stdout.write('This is not ACP\n'); process.exit(0); }
  const send = message => process.stdout.write(JSON.stringify(message) + '\n');
  let authenticated = mode !== 'auth';
  let sessionId;
  let promptId;
  const finish = stopReason => {
    if (promptId !== undefined) send({ jsonrpc: '2.0', id: promptId, result: { stopReason } });
    promptId = undefined;
  };
  const reader = createInterface({ input: process.stdin });
  reader.on('line', line => {
    const message = JSON.parse(line);
    record({ type: 'rpc', message });
    const reply = result => send({ jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize') reply({ protocolVersion: mode === 'v2' ? 2 : 1,
      agentInfo: { name: 'fixture-' + mode, version: '1.2.3' }, agentCapabilities: {},
      authMethods: mode === 'auth' ? [{ id: 'login', name: 'Fixture login' }] : [] });
    else if (message.method === 'authenticate') { authenticated = true; reply({}); }
    else if (message.method === 'session/new') {
      if (!authenticated) send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Authenticate the fixture first.' } });
      else { sessionId = basename(message.params.cwd); reply({ sessionId }); }
    } else if (message.method === 'session/prompt') {
      promptId = message.id;
      const text = message.params.prompt[0].text;
      if (text === 'permission') send({ jsonrpc: '2.0', id: 'approval', method: 'session/request_permission', params: {
        sessionId, toolCall: { toolCallId: 'tool', title: 'Fixture edit' },
        options: [{ optionId: 'yes', name: 'Allow once', kind: 'allow_once' }, { optionId: 'no', name: 'Reject once', kind: 'reject_once' }] } });
      else {
        send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: mode + ':' + text } } } });
        finish('end_turn');
      }
    } else if (message.method === 'session/cancel') finish('cancelled');
    else if (message.id === 'approval') finish('end_turn');
  });
  reader.on('close', () => process.exit(0));
}
