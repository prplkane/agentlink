import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AgentLink, providers } from './index.mjs';
import { manifestSpec } from './bridges.mjs';
import { doctor } from './doctor.mjs';

const usage = 'AgentLink — shared ACP connections and centrally managed bridges\n\n' +
  '  agentlink [--home PATH] acp <profile>     Standard ACP over stdin/stdout\n' +
  '  agentlink add <profile> --provider codex|claude\n' +
  '  agentlink add <profile> --command <installed-cli>\n' +
  '  agentlink add <profile> --bridge <managed-bridge>\n' +
  '  agentlink add <profile> --manifest <ACP-registry-entry.json-or-URL>\n' +
  '  agentlink inspect --command <installed-cli>\n' +
  '  agentlink update <profile> [launch options]\n' +
  '  agentlink refresh <profile> | check <profile>\n' +
  '  agentlink doctor                       Read-only local health checks\n' +
  '  agentlink list | show <profile> | config <profile> | remove <profile> | providers | where\n\n' +
  '  agentlink bridge install <id> --package <npm-package> [--version <version-or-tag>]\n' +
  '  agentlink bridge install <id> --manifest <file-or-URL>\n' +
  '  agentlink bridge update <id> [--version <version-or-tag>]\n' +
  '  agentlink bridge list | show <id> | remove <id> | prune [--cache]\n\n' +
  'Launch options:\n' +
  '  --command PATH        Installed executable (external management)\n' +
  '  --provider NAME       Known recipe; Codex/Claude bridges are managed by default\n' +
  '  --external            Use the installed provider bridge instead of managing it\n' +
  '  --bridge ID           Reference a centrally managed bridge\n' +
  '  --prefix-args JSON    String array before ACP arguments (e.g. Node entry script)\n' +
  '  --acp-args JSON       Exact ACP arguments; [] for a standalone bridge\n' +
  '  --help-args JSON      Custom help invocation, e.g. ["help"] or ["/?"]\n' +
  '  --env JSON            Explicit non-secret launch settings, saved locally\n' +
  '  --skip-check          Save a direct launch as pending; managed installs are checked\n\n' +
  'Installation options:\n' +
  '  --package NAME        Install a package; --kind npm (default) or python\n' +
  '  --version VERSION    Pin a version; npm defaults to resolving latest once\n' +
  '  --bin NAME            Package executable (needed when ambiguous)\n' +
  '  --source PATH|URL     Explicit package artifact, including local offline fixtures\n' +
  '  --manifest PATH|URL   Individual standard ACP registry entry\n' +
  '  --distribution KIND   Choose binary, npm, or python from a manifest\n' +
  '  --offline             Use offline package-manager mode and local artifacts/cache\n' +
  '  --install-timeout MS  Installer deadline (default 180000)\n\n' +
  'Management options: --home PATH, --json, --timeout MS (probe default 3000), --help/-h\n' +
  'For ACP, put --home BEFORE acp. Arguments after the profile are forwarded unchanged\n' +
  'for standard ACP terminal authentication. Logs and failures go to stderr.\n' +
  'No application SDK, background daemon, prompt storage, or live task is required.\n';

function array(value, name) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new TypeError(name + ' must be an array of strings.');
  return parsed;
}
function positive(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(name + ' must be a positive integer.');
  return parsed;
}
export const printHelp = () => process.stdout.write(usage);

export async function runManagement(argv, { signal, cliURL } = {}) {
  let json = false;
  try {
    const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
      command: { type: 'string' }, provider: { type: 'string' }, bridge: { type: 'string' },
      'prefix-args': { type: 'string' }, 'acp-args': { type: 'string' }, 'help-args': { type: 'string' },
      env: { type: 'string' }, external: { type: 'boolean' }, 'skip-check': { type: 'boolean' },
      package: { type: 'string' }, version: { type: 'string' }, bin: { type: 'string' }, source: { type: 'string' },
      kind: { type: 'string' }, manifest: { type: 'string' }, distribution: { type: 'string' },
      offline: { type: 'boolean' }, cache: { type: 'boolean' }, 'install-timeout': { type: 'string' },
      timeout: { type: 'string' }, home: { type: 'string' }, json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    } });
    json = Boolean(v.json);
    const [action = 'help', first, second, ...rest] = positionals;
    if (v.help || action === 'help') process.stdout.write(usage);
    else {
      const manager = new AgentLink({ ...(v.home ? { home: v.home } : {}), signal: signal });
      const launchFlags = ['command', 'provider', 'bridge', 'prefix-args', 'acp-args', 'help-args', 'env', 'external', 'skip-check'];
      const installFlags = ['package', 'version', 'bin', 'source', 'kind', 'manifest', 'distribution', 'offline', 'install-timeout'];
      const allowed = {
        add: [...launchFlags, ...installFlags], update: [...launchFlags, ...installFlags],
        inspect: ['command', 'provider', 'prefix-args', 'acp-args', 'help-args', 'skip-check'],
        refresh: [], check: [], list: [], show: [], config: [], remove: [], providers: [], where: [], doctor: [],
        bridge: [...installFlags, 'acp-args', 'env', 'cache']
      };
      if (!Object.hasOwn(allowed, action)) throw new TypeError('Unknown command. Run agentlink --help.');
      for (const key of Object.keys(v)) {
        if (!['home', 'json', 'help', 'timeout', ...allowed[action]].includes(key)) throw new TypeError('--' + key + ' is not supported by ' + action + '.');
      }
      const options = { signal: signal };
      for (const key of ['command', 'provider', 'bridge', 'external', 'manifest', 'distribution', 'version', 'source', 'bin', 'offline']) {
        if (v[key] !== undefined) options[key] = v[key];
      }
      for (const [flag, key] of [['prefix-args', 'prefixArgs'], ['acp-args', 'acpArgs'], ['help-args', 'helpArgs']]) {
        if (v[flag] !== undefined) options[key] = array(v[flag], '--' + flag);
      }
      if (v.env !== undefined) options.launchEnv = JSON.parse(v.env);
      if (v['skip-check']) options.verify = false;
      if (v.timeout) options.timeoutMs = positive(v.timeout, '--timeout');
      if (v['install-timeout']) options.installTimeoutMs = positive(v['install-timeout'], '--install-timeout');
      if (v.package) options.spec = { kind: v.kind || 'npm', package: v.package, version: v.version,
        bin: v.bin, source: v.source, args: options.acpArgs || [], env: options.launchEnv || {} };
      if (v.package && v.manifest) throw new TypeError('Choose --package or --manifest.');
      if (v.command && (v.package || v.manifest || v.bridge)) throw new TypeError('Choose an installed command or a managed bridge.');
      if (v.external && (v.package || v.manifest || v.bridge)) throw new TypeError('--external cannot select a managed distribution.');
      let result;
      if (action === 'bridge') {
        const operation = first, id = second;
        const named = ['install', 'update', 'show', 'remove'].includes(operation);
        if (!['install', 'update', 'show', 'remove', 'list', 'prune'].includes(operation) || rest.length || (named ? !id : id !== undefined)) {
          throw new TypeError('Invalid bridge command. Run agentlink --help.');
        }
        const flags = ['install', 'update'].includes(operation) ? [...installFlags, 'acp-args', 'env'] : operation === 'prune' ? ['cache'] : [];
        for (const key of Object.keys(v)) {
          if (!['home', 'json', 'help', 'timeout', ...flags].includes(key)) throw new TypeError('--' + key + ' is not supported by bridge ' + operation + '.');
        }
        if (operation === 'install') {
          const spec = v.manifest ? await manifestSpec(v.manifest, options) : options.spec;
          if (!spec) throw new TypeError('Bridge install requires --package or --manifest.');
          result = await manager.installBridge(id, { ...spec, args: options.acpArgs ?? spec.args,
            env: options.launchEnv ?? spec.env, bin: options.bin ?? spec.bin }, options);
        } else if (operation === 'update') result = await manager.updateBridge(id, options);
        else if (operation === 'show') result = await manager.bridges.get(id);
        else if (operation === 'list') result = await manager.bridges.list();
        else if (operation === 'prune') result = await manager.pruneBridges({ cache: Boolean(v.cache) });
        else { await manager.removeBridge(id); result = { removed: id, note: 'Unused files can be removed with bridge prune.' }; }
      } else {
        const named = ['add', 'update', 'refresh', 'check', 'show', 'config', 'remove'].includes(action);
        if (second !== undefined || rest.length || (named ? !first : first !== undefined)) throw new TypeError('Invalid arguments for ' + action + '.');
        switch (action) {
          case 'add': result = await manager.add(first, options); break;
          case 'update': result = await manager.update(first, options); break;
          case 'inspect': result = await manager.inspect(options); break;
          case 'refresh': result = await manager.refresh(first, options); break;
          case 'check': result = { name: first, verification: await manager.check(first, options) }; break;
          case 'show': {
            const profile = await manager.get(first);
            result = { ...profile, resolvedLaunch: await manager.resolveProfile(profile) }; break;
          }
          case 'list': result = await manager.list(); break;
          case 'config':
            await manager.get(first);
            result = { command: process.execPath, args: [fileURLToPath(cliURL), '--home', manager.home, 'acp', first] };
            break;
          case 'remove': await manager.remove(first); result = { removed: first }; break;
          case 'providers': result = providers; break;
          case 'where': result = { home: manager.home, profiles: manager.store.directory, bridges: manager.bridges.directory }; break;
          case 'doctor': result = await doctor(manager); if (!result.ok) process.exitCode = 1; break;
        }
      }
      if (json || action === 'bridge' || ['show', 'config', 'inspect', 'providers'].includes(action)) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else if (action === 'list') process.stdout.write(result.length ? result.map(profile =>
        profile.name + '\t' + (profile.error ? profile.error.message : profile.verification.status + '\t' +
          (profile.bridge ? 'managed:' + profile.bridge.id : profile.command))).join('\n') + '\n' : 'No saved profiles.\n');
      else if (action === 'where') process.stdout.write(result.home + '\n');
      else if (action === 'doctor') process.stdout.write((result.ok ? 'Local files look healthy.' : 'Local issues found.') + '\n' +
        result.checks.map(check => check.status + '\t' + check.scope + ' ' + check.name +
          (check.message ? ': ' + check.message : '')).join('\n') + '\n');
      else if (action === 'remove') process.stdout.write('Removed ' + first + '.\n');
      else process.stdout.write((result.name || first) + ': ' + result.verification.status +
        (action === 'check' ? '\n' : '\nSaved ' + manager.store.path(result.name) + '\n'));
    }
  } catch (cause) {
    const detail = { code: cause.code || 'INVALID_ARGUMENT', message: cause.message };
    if (cause.diagnostics?.length) detail.diagnostics = cause.diagnostics;
    process.stderr.write(json ? JSON.stringify({ error: detail }, null, 2) + '\n' : detail.code + ': ' + detail.message + '\n');
    process.exitCode = signal?.aborted ? 130 : 1;
  }
}
