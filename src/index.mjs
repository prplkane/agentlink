import { join } from 'node:path';
import { AcpClient } from './client.mjs';
import { discoverAgent, validateDiscoveryOptions, inProbeDirectory, verifyAgent } from './discovery.mjs';
import { profileName, error } from './profiles.mjs';
import { AgentRuntime } from './runtime.mjs';
import { BridgeStore, environment, manifestSpec } from './bridges.mjs';
import { withLock } from './storage.mjs';
import { providers } from './providers.mjs';

export { AcpClient } from './client.mjs';
export { providers, planProvider } from './providers.mjs';
export { ProfileStore } from './profiles.mjs';
export { discoverAgent, inspectHelp } from './discovery.mjs';
export { runGateway } from './gateway.mjs';

export class AgentLink extends AgentRuntime {
  constructor(options = {}) {
    super(options);
    this.bridges = new BridgeStore(this.store.home);
  }
  mutate(callback) { return withLock(join(this.home, 'management.lock'), callback, 180000, this.signal); }
  remove(name) { return this.mutate(() => this.store.remove(name)); }
  inspect(options) { return discoverAgent(options); } // Never installs or saves.

  async installBridge(id, spec, options = {}) {
    return this.mutate(() => this.installBridgeUnlocked(id, spec, options));
  }
  async installBridgeUnlocked(id, spec, options) {
    return this.bridges.install(id, spec, { signal: this.signal, ...options,
      publish: options.publish || (record => withLock(join(this.home, 'leases.lock'),
        () => this.bridges.publish(record), 180000, options.signal || this.signal)),
      validate: async launch => {
      for (const profile of await this.list()) {
        if (profile.error) throw error('INVALID_PROFILE', 'Repair unreadable profiles before changing shared bridges.');
        if (profile.bridge?.id !== id) continue;
        const candidate = this.withBridge(profile, { launch });
        await inProbeDirectory(cwd => verifyAgent(candidate, { ...options, cwd }));
      }
      await options.validateNew?.(launch);
    } });
  }
  async updateBridge(id, options = {}) {
    return this.mutate(async () => {
      const record = await this.bridges.get(id);
      let spec = options.spec || record.spec;
      if (!options.spec && (options.manifest || spec.manifestSource)) {
        spec = await manifestSpec(options.manifest || spec.manifestSource, { ...options, distribution: spec.kind });
      } else if (!options.spec && spec.kind === 'npm') {
        spec = { ...spec, version: options.version || 'latest' };
        if (options.version && options.version !== record.spec.version && !options.source) delete spec.source;
      }
      if (options.version) spec.version = options.version;
      if (options.source) spec.source = options.source;
      if (options.bin) spec.bin = options.bin;
      if (options.acpArgs) spec.args = options.acpArgs;
      if (options.launchEnv) spec.env = options.launchEnv;
      return this.installBridgeUnlocked(id, spec, options);
    });
  }
  async removeBridge(id) {
    return this.mutate(async () => {
      const profiles = await this.list();
      if (profiles.some(profile => profile.error)) throw error('INVALID_PROFILE', 'Repair unreadable profiles before removing a bridge.');
      const users = profiles.filter(profile => profile.bridge?.id === id).map(profile => profile.name);
      if (users.length) throw error('BRIDGE_IN_USE', 'Bridge is referenced by: ' + users.join(', ') + '. Remove or change those profiles first.');
      await this.bridges.remove(id);
    });
  }
  pruneBridges(options = {}) { return this.mutate(() => withLock(join(this.home, 'leases.lock'), async () => {
    const profiles = await this.list();
    if (profiles.some(profile => profile.error)) throw error('INVALID_PROFILE', 'Repair unreadable profiles before pruning.');
    return this.bridges.prune({ ...options, profiles });
  }, 180000, this.signal)); }

  async discoverForSave(name, options, persist) {
    validateDiscoveryOptions(options);
    if (!environment(options.launchEnv)) throw new TypeError('Invalid profile environment.');
    if (options.bridge !== undefined) profileName(options.bridge);
    let bridgeId = options.bridge;
    let spec = options.spec;
    if (options.manifest) {
      spec = await manifestSpec(options.manifest, options);
      if (options.bin) spec.bin = options.bin;
    }
    const recipe = providers[options.provider];
    if (!options.command && !bridgeId && !options.external && recipe?.package) {
      bridgeId = options.provider;
      if (!spec) {
        try {
          const current = await this.bridges.get(bridgeId);
          if (options.version && options.version !== current.spec.version) {
            spec = { ...current.spec, version: options.version };
            delete spec.source;
          }
        }
        catch (cause) {
          if (cause.code !== 'BRIDGE_NOT_FOUND') throw cause;
          spec = { kind: 'npm', package: recipe.package, version: options.version || 'latest', bin: recipe.executableName, args: recipe.args };
        }
      }
    }
    if (spec) {
      bridgeId ||= name;
      let verification, saved;
      await this.installBridgeUnlocked(bridgeId, spec, { ...options, validateNew: async launch => {
        if (options.acpArgs === undefined && !options.launchEnv) return;
        const candidate = { ...launch, acpArgs: options.acpArgs ?? launch.acpArgs, env: { ...launch.env, ...options.launchEnv } };
        verification = await inProbeDirectory(cwd => verifyAgent(candidate, { ...options, cwd }));
      }, publish: async record => {
        verification ??= record.verification;
        saved = await persist({ ...record.launch, acpArgs: options.acpArgs ?? record.launch.acpArgs,
          provider: options.provider ?? null, protocolVersion: verification.protocolVersion, verification,
          bridge: { id: bridgeId, useDefaultArgs: options.acpArgs === undefined }, env: options.launchEnv || {},
          discovery: { method: 'metadata', ...(options.helpArgs ? { helpArgs: options.helpArgs } : {}) } }, record);
      } });
      return saved;
    }
    if (bridgeId) {
      const record = await this.bridges.get(bridgeId);
      if (!spec && options.version && options.version !== record.spec.version) {
        throw error('VERSION_MISMATCH', 'This bridge uses ' + record.spec.version + '. Change it centrally with agentlink bridge update ' + bridgeId + ' --version ' + options.version + '.');
      }
      const launch = { ...record.launch, acpArgs: options.acpArgs ?? record.launch.acpArgs,
        env: { ...record.launch.env, ...options.launchEnv } };
      const discovered = await discoverAgent({ ...options, ...launch, provider: undefined,
        env: { ...(options.env || process.env), ...launch.env } });
      return persist({ ...discovered, provider: options.provider ?? null,
        bridge: { id: bridgeId, useDefaultArgs: options.acpArgs === undefined },
        env: options.launchEnv || {}, discovery: { ...discovered.discovery, method: 'metadata' } });
    }
    const discovered = await discoverAgent({ ...options, env: { ...(options.env || process.env), ...options.launchEnv } });
    return persist(options.launchEnv ? { ...discovered, env: options.launchEnv } : discovered);
  }

  async saveProfile(profile, existing, record) {
    const save = () => this.store.save(profile, { replace: Boolean(existing) });
    if (!record) return save();
    // Readers of managed profiles share this brief lock. Preparation and ACP
    // verification happen before it, so downloads never block new connections.
    return withLock(join(this.home, 'leases.lock'), async () => {
      const saved = await save();
      try { await this.bridges.publish(record); }
      catch (cause) {
        try {
          if (existing) await this.store.save(existing, { replace: true });
          else await this.store.remove(profile.name);
        } catch (rollback) {
          throw error('ROLLBACK_FAILED', 'Bridge publication failed and profile recovery failed: ' +
            cause.message + '; ' + rollback.message + '. Inspect profile ' + profile.name + ' before retrying.');
        }
        throw cause;
      }
      return saved;
    }, 180000, this.signal);
  }

  async add(name, options) {
    return this.mutate(async () => {
      profileName(name);
      try { await this.get(name); throw error('PROFILE_EXISTS', 'Profile "' + name + '" already exists. Use update or refresh.'); }
      catch (cause) { if (cause.code !== 'PROFILE_NOT_FOUND') throw cause; }
      return this.discoverForSave(name, options, (discovered, record) => {
        const now = new Date().toISOString();
        return this.saveProfile({ schemaVersion: 1, name, ...discovered, createdAt: now, updatedAt: now }, undefined, record);
      });
    });
  }

  async update(name, options = {}) {
    return this.mutate(async () => {
      const existing = await this.get(name);
      const changedLaunch = ['command', 'prefixArgs', 'provider', 'bridge', 'spec', 'manifest', 'external'].some(key => Object.hasOwn(options, key));
      let defaults;
      if (!changedLaunch && existing.bridge) {
        defaults = { bridge: existing.bridge.id, provider: existing.provider ?? undefined,
          acpArgs: existing.bridge.useDefaultArgs ? undefined : existing.acpArgs };
      } else if (changedLaunch) {
        defaults = { command: options.provider === undefined && !options.bridge && !options.spec && !options.manifest ? existing.command : undefined,
          prefixArgs: options.command === undefined && options.provider === undefined && !options.bridge && !options.spec && !options.manifest ? existing.prefixArgs : [] };
      } else defaults = { command: existing.command, prefixArgs: existing.prefixArgs, acpArgs: existing.acpArgs, provider: existing.provider ?? undefined };
      return this.discoverForSave(name, {
        helpArgs: existing.discovery.helpArgs, launchEnv: existing.env, ...defaults, ...options
      }, (discovered, record) => {
        const { bridge, env, ...previous } = existing;
        return this.saveProfile({ ...previous, ...discovered, updatedAt: new Date().toISOString() }, existing, record);
      });
    });
  }

  async refresh(name, options = {}) {
    return this.mutate(async () => {
      const existing = await this.get(name), current = await this.resolveProfile(existing);
      // Exact user argv and managed bridge recipes remain authoritative. Only
      // help/known external profiles need command discovery again on refresh.
      const keepArgs = existing.bridge || existing.discovery.method === 'manual';
      const discovered = await discoverAgent({ command: current.command, prefixArgs: current.prefixArgs,
        provider: existing.provider ?? undefined, helpArgs: existing.discovery.helpArgs,
        acpArgs: keepArgs ? current.acpArgs : undefined, ...options,
        env: { ...(options.env || process.env), ...current.env } });
      const bridge = existing.bridge ? { ...existing.bridge,
        useDefaultArgs: JSON.stringify(discovered.acpArgs) === JSON.stringify((await this.bridges.get(existing.bridge.id)).launch.acpArgs) } : undefined;
      return this.store.save({ ...existing, ...discovered, ...(bridge ? { bridge } : {}), updatedAt: new Date().toISOString() }, { replace: true });
    });
  }

  async check(name, options = {}) {
    const { launch, release } = await this.acquire(name);
    try { return await inProbeDirectory(cwd => verifyAgent(launch, { ...options, cwd })); }
    finally { await release(); }
  }

  // Compatibility API for the original text-only ACP v1 prototype. New
  // applications use the standard ACP gateway instead of depending on this SDK.
  async connect(name, { cwd = process.cwd(), env = process.env, timeoutMs = 10000,
    authMethodId, onUpdate, onPermission, ...limits } = {}) {
    const { launch, release } = await this.acquire(name);
    let client;
    try {
      client = new AcpClient({ ...limits, command: launch.command, args: [...launch.prefixArgs, ...launch.acpArgs],
        cwd, env: { ...env, ...launch.env }, onUpdate, onPermission });
      const close = client.close.bind(client);
      client.close = async () => { try { await close(); } finally { await release(); } };
      await client.initialize({ timeoutMs });
      if (authMethodId !== undefined) await client.authenticate(authMethodId, { timeoutMs });
      await client.newSession({ timeoutMs });
      return client;
    } catch (cause) { if (client) await client.close(); else await release(); throw cause; }
  }
}

export const createAgentLink = options => new AgentLink(options);
export const agentlink = new AgentLink();
