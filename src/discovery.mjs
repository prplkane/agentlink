import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { probeAcp } from './probe.mjs';
import { providers } from './providers.mjs';
import { error, strings } from './profiles.mjs';
import { readHelp, resolveCommand } from './process.mjs';

function knownRecipe(provider, executableName) {
  if (provider !== undefined) {
    if (!Object.hasOwn(providers, provider)) throw error('UNKNOWN_PROVIDER', `Unknown recipe "${provider}". Omit --provider to discover a custom CLI.`);
    const recipe = providers[provider];
    if (recipe.kind === 'unavailable') throw error('UNAVAILABLE_PROVIDER', recipe.note);
    if (['codex', 'claude'].includes(executableName)) {
      throw error('ACP_BRIDGE_REQUIRED', `Use the installed ${recipe.executableName} bridge, rather than the interactive ${executableName} CLI.`);
    }
    return [provider, recipe];
  }
  return Object.entries(providers).find(([, recipe]) => !recipe.explicitMatch && recipe.executableName === executableName);
}

// Parse only declared options/command rows. Prose, examples and shell snippets are
// not executable instructions. An unusual interface can use explicit acpArgs.
export function inspectHelp(text) {
  const lines = text.split(/\r?\n/);
  const candidates = [];
  const subcommands = [];
  let stdio = [];
  for (const line of lines) {
    if (/^\s*(?:-\w,\s*)?--stdio(?:\s|$)/.test(line)) stdio = ['--stdio'];
    else if (/^\s*--transport\s+[<[]/.test(line) && /\bstdio\b/i.test(line)) stdio = ['--transport', 'stdio'];
  }
  for (const line of lines) {
    const flag = /^\s*(?:-\w,\s*)?(--(?:experimental-)?acp)(?=\s|$)(.*)$/.exec(line);
    if (flag && !/^\s*[<=]/.test(flag[2]) && !/^\s*\[(?!boolean\b)/i.test(flag[2])) {
      candidates.push([flag[1], ...stdio]);
    }
    const protocol = /^\s*(--(?:protocol|mode))\s+(?:<[^>]+>|\[[^\]]+\])\s+(.+)$/.exec(line);
    if (protocol && /(?:choices?|values?|one of|options?).*\bacp\b/i.test(protocol[2])) {
      candidates.push([protocol[1], 'acp', ...stdio]);
    }
    const row = /^\s{0,8}([a-z][a-z0-9_-]*)(?:\s+(\[[^\]]*\]|<[^>]+>))?\s{2,}(.+)$/.exec(line);
    if (row && (/\bacp\b|agent client protocol/i.test(row[3]) ||
        (/^(serve|server|protocol)$/.test(row[1]) && /protocol|stdio/i.test(row[3]))) && !row[2]?.startsWith('<')) {
      if (row[1] === 'acp' || row[1] === 'acp-server') candidates.push([row[1], ...stdio]);
      else subcommands.push(row[1]);
    }
    // Yargs can print the executable name before a command.
    if (/^\s{0,8}[\w.-]+\s+acp\s{2,}.*(?:ACP|Agent Client Protocol)/i.test(line)) candidates.push(['acp', ...stdio]);
  }
  return { candidates, subcommands: [...new Set(subcommands)].slice(0, 2) };
}

export async function verifyAgent(launch, { cwd, env = process.env, timeoutMs = 3000, signal } = {}) {
  return probeAcp(launch, { cwd, env, timeoutMs, signal });
}

export async function inProbeDirectory(callback) {
  const base = resolve(tmpdir());
  const directory = await mkdtemp(join(base, 'agentlink-probe-'));
  try { return await callback(directory); }
  finally {
    if (dirname(directory) !== base || !basename(directory).startsWith('agentlink-probe-')) throw error('INVALID_PATH', 'Unexpected probe directory.');
    // Windows may retain a just-stopped descendant's cwd for a short time.
    // Retry only transient filesystem errors; do not replace the probe outcome
    // with a one-off EBUSY, and still surface a persistent cleanup failure.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export function validateDiscoveryOptions({ command, prefixArgs = [], acpArgs, provider, helpArgs,
  verify = true, timeoutMs = 3000, maxHelpBytes = 65536 } = {}) {
  if (typeof verify !== 'boolean' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('Invalid discovery options.');
  if (!Number.isSafeInteger(maxHelpBytes) || maxHelpBytes < 1) throw new TypeError('Invalid help output limit.');
  if (command !== undefined && (typeof command !== 'string' || !command || command.includes('\0'))) throw new TypeError('Invalid command.');
  if (!strings(prefixArgs)) throw new TypeError('prefixArgs must be an array of strings.');
  if (provider !== undefined && !Object.hasOwn(providers, provider)) throw error('UNKNOWN_PROVIDER', `Unknown recipe "${provider}".`);
  if (acpArgs !== undefined && !strings(acpArgs)) throw new TypeError('acpArgs must be an array of strings.');
  if (helpArgs !== undefined && (!strings(helpArgs) || !helpArgs.length)) throw new TypeError('helpArgs must be a nonempty argument array.');
}

export async function discoverAgent({ command, prefixArgs = [], acpArgs, provider, helpArgs,
  env = process.env, verify = true, timeoutMs = 3000, maxHelpBytes = 65536, signal } = {}) {
  validateDiscoveryOptions({ command, prefixArgs, acpArgs, provider, helpArgs, verify, timeoutMs, maxHelpBytes });
  command ??= providers[provider]?.executableName;
  const resolved = await resolveCommand(command, prefixArgs, env);
  const known = acpArgs === undefined ? knownRecipe(provider, resolved.executableName) : undefined;
  const base = { command: resolved.command, prefixArgs: resolved.prefixArgs, provider: provider ?? known?.[0] ?? null, protocolVersion: 1 };
  const diagnostics = [];
  const attempted = new Set();
  return inProbeDirectory(async cwd => {
    const attempt = async (args, method, help) => {
      signal?.throwIfAborted();
      const key = JSON.stringify(args);
      if (attempted.has(key) || attempted.size >= 5) return;
      attempted.add(key);
      const candidate = { ...base, acpArgs: [...args], discovery: { method } };
      if (helpArgs) candidate.discovery.helpArgs = [...helpArgs];
      if (help) candidate.discovery.helpSha256 = createHash('sha256').update(help).digest('hex');
      try {
        candidate.verification = verify ? await verifyAgent(candidate, { cwd, env, timeoutMs, signal }) : { status: 'pending' };
        candidate.protocolVersion = candidate.verification.protocolVersion || 1;
        return candidate;
      } catch (cause) {
        if (signal?.aborted) throw cause;
        diagnostics.push({ stage: 'initialize', args, code: cause.code || 'PROBE_FAILED', message: cause.message });
      }
    };
    if (acpArgs !== undefined) {
      const result = await attempt(acpArgs, 'manual');
      if (result) return result;
      throw Object.assign(error('ACP_VERIFICATION_FAILED', 'The supplied ACP command did not complete initialization.'), { diagnostics });
    }
    if (known) {
      const result = await attempt(known[1].args, 'known');
      if (result) return result;
    }
    const helpCalls = new Set();
    const help = async args => {
      signal?.throwIfAborted();
      const key = JSON.stringify(args);
      if (helpCalls.has(key) || helpCalls.size >= 8) return '';
      helpCalls.add(key);
      try {
        const result = await readHelp({ command: base.command, args: [...base.prefixArgs, ...args], cwd, env, timeoutMs, maxBytes: maxHelpBytes, signal });
        if (result.code !== 0) {
          diagnostics.push({ stage: 'help', args, code: 'HELP_EXIT', message: `Help exited with ${result.code}.` });
        }
        return result.text;
      } catch (cause) {
        if (signal?.aborted) throw cause;
        diagnostics.push({ stage: 'help', args, code: cause.code || 'HELP_FAILED', message: cause.message });
        return '';
      }
    };
    const queue = helpArgs ? [[...helpArgs]] : [['--help'], ['-h']];
    for (let index = 0; index < queue.length && helpCalls.size < 8; index++) {
      const text = await help(queue[index]);
      const parsed = inspectHelp(text);
      for (const args of parsed.candidates) {
        const result = await attempt(args, 'help', text);
        if (result) return result;
      }
      for (const subcommand of parsed.subcommands) {
        const routes = [[subcommand, '--help']];
        if (/^\s{0,8}help(?:\s+\[[^\]]+\])?\s{2,}/m.test(text)) routes.push(['help', subcommand]);
        for (const route of routes) {
          const nested = await help(route);
          for (const args of inspectHelp(nested).candidates) {
            const result = await attempt([subcommand, ...args], 'help', text + '\n' + nested);
            if (result) return result;
          }
        }
      }
      // Only follow alternative forms advertised as actual command/option rows.
      // A custom convention can always be supplied explicitly with helpArgs.
      if (/^\s{0,8}help(?:\s+\[[^\]]+\])?\s{2,}/m.test(text)) queue.push(['help']);
      for (const alias of ['/?', '-?', '/h']) {
        if (text.split(/\r?\n/).some(line => line.trimStart().startsWith(alias + '  '))) queue.push([alias]);
      }
    }
    const bridge = ['codex', 'claude'].includes(resolved.executableName) ? providers[resolved.executableName].executableName : undefined;
    const message = bridge ? `This CLI needs an installed ${bridge} ACP bridge.` :
      'Automatic ACP discovery was inconclusive. Supply --help-args or exact --acp-args for an installed agent or bridge.';
    throw Object.assign(error(bridge ? 'ACP_BRIDGE_REQUIRED' : 'DISCOVERY_INCONCLUSIVE', message), { diagnostics });
  });
}
