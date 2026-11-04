// An independent ACP caller. No AgentLink library import.
// Usage from a project directory: node /path/to/examples/acp-check.mjs PROFILE
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!name) throw new Error('Usage: node examples/acp-check.mjs PROFILE');
const child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'acp', name], {
  cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit']
});
const reader = createInterface({ input: child.stdout });
let answered = false;
const timer = setTimeout(() => { console.error('Initialization timed out.'); process.exitCode = 1; child.stdin.end(); }, 15000);
child.stdin.on('error', () => {});
child.once('error', cause => { console.error(cause.message); process.exitCode = 1; clearTimeout(timer); });
child.once('exit', code => {
  clearTimeout(timer);
  if (!answered || code) process.exitCode = 1;
});
reader.on('line', line => {
  try {
    const message = JSON.parse(line);
    if (message.id !== 1 || message.method) return;
    answered = true; clearTimeout(timer);
    console.log(JSON.stringify(message.error || message.result, null, 2));
    if (message.error) process.exitCode = 1;
    child.stdin.end();
  } catch (cause) { console.error(cause.message); process.exitCode = 1; child.stdin.end(); }
});
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: 2, clientCapabilities: {}, clientInfo: { name: 'independent-acp-check', version: '1' }
} }) + '\n');
