#!/usr/bin/env node
import { AgentRuntime } from './runtime.mjs';
import { runGateway } from './gateway.mjs';
import { profileName } from './profiles.mjs';
import { version } from './version.mjs';

function gatewayInvocation(argv) {
  let index = 0, home;
  if (argv[index] === '--home') { home = argv[index + 1]; index += 2; }
  else if (argv[index]?.startsWith('--home=')) { home = argv[index].slice(7); index++; }
  if (argv[index] !== 'acp') return;
  const name = argv[index + 1];
  if (name === '--help' || name === '-h') return { help: true };
  profileName(name);
  return { home, name, extraArgs: argv.slice(index + 2) };
}

const abort = new AbortController();
const interrupt = () => abort.abort();
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
try {
  const ownVersion = process.argv.length === 3 && ['--version', '-V'].includes(process.argv[2]);
  const gateway = ownVersion ? undefined : gatewayInvocation(process.argv.slice(2));
  if (ownVersion) process.stdout.write(version + '\n');
  else if (gateway?.help) (await import('./management-cli.mjs')).printHelp();
  else if (gateway) {
    const runtime = new AgentRuntime({ ...(gateway.home ? { home: gateway.home } : {}), signal: abort.signal });
    const { launch, release } = await runtime.acquire(gateway.name);
    try {
      process.exitCode = (await runGateway(launch, { extraArgs: gateway.extraArgs, signal: abort.signal })).exitCode;
    } finally { await release(); }
  } else {
    await (await import('./management-cli.mjs')).runManagement(process.argv.slice(2), { signal: abort.signal, cliURL: import.meta.url });
  }
} catch (cause) {
  process.stderr.write((cause.code || 'INVALID_ARGUMENT') + ': ' + cause.message + '\n');
  process.exitCode = abort.signal.aborted ? 130 : 1;
} finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
