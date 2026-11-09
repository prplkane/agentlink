import { randomUUID } from 'node:crypto';
import { readdir, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { ProfileStore, profileName, error } from './profiles.mjs';
import { readJson, withLock, writeJson } from './storage.mjs';

// Connection startup needs only saved records and leases, never installers,
// discovery, provider recipes or the legacy application client.
export class BridgeRegistry {
  constructor(home) {
    this.home = home; this.directory = join(home, 'bridges');
    this.installations = join(home, 'installations'); this.leases = join(home, 'leases');
  }
  path(id) { return join(this.directory, profileName(id) + '.json'); }
  async get(id) {
    try {
      const value = await readJson(this.path(id));
      if (value.schemaVersion !== 1 || value.id !== id || !/^[a-f0-9]{64}$/.test(value.installKey || '')) {
        throw error('INVALID_BRIDGE', 'Invalid managed bridge record.');
      }
      return value;
    } catch (cause) {
      if (cause.code === 'ENOENT') throw error('BRIDGE_NOT_FOUND', 'No managed bridge named "' + id + '".');
      throw cause;
    }
  }
  async list() {
    let names;
    try { names = await readdir(this.directory); } catch (cause) { if (cause.code === 'ENOENT') return []; throw cause; }
    return Promise.all(names.filter(name => name.endsWith('.json')).sort().map(async name => {
      const id = name.slice(0, -5);
      try { return await this.get(id); } catch (cause) { return { id, error: { code: cause.code, message: cause.message } }; }
    }));
  }
  publish(record) { return writeJson(this.path(record.id), record); }
  async lease(record) {
    const file = join(this.leases, process.pid + '-' + randomUUID() + '.json');
    // Publish atomically for concurrent readers. A lease only protects a live
    // process, so it does not need a disk flush to survive a machine restart.
    await writeJson(file, { pid: process.pid, installKey: record.installKey }, { durable: false });
    return () => unlink(file).catch(cause => { if (cause.code !== 'ENOENT') throw cause; });
  }
  async remove(id) { await this.get(id); await unlink(this.path(id)); }
  referencedInstallations(profile) {
    return [...new Set([profile.command, ...profile.prefixArgs].filter(isAbsolute).map(path =>
      relative(this.installations, path).split(sep)[0])
      .map(key => process.platform === 'win32' ? key.toLowerCase() : key)
      .filter(key => /^[a-f0-9]{64}$/.test(key)))];
  }
}

export class AgentRuntime {
  constructor(options = {}) {
    this.store = new ProfileStore(options);
    this.bridges = new BridgeRegistry(this.store.home);
    this.signal = options.signal;
  }
  get home() { return this.store.home; }
  list() { return this.store.list(); }
  get(name) { return this.store.get(name); }
  withBridge(profile, record) {
    return { ...profile, ...record.launch,
      acpArgs: profile.bridge.useDefaultArgs ? record.launch.acpArgs : profile.acpArgs,
      env: { ...record.launch.env, ...profile.env } };
  }
  async resolveProfile(profile) {
    return profile.bridge ? this.withBridge(profile, await this.bridges.get(profile.bridge.id)) : profile;
  }
  async acquire(name) {
    const snapshot = await this.get(name);
    // Truly external commands have nothing for AgentLink to prune. They need
    // neither a writable home nor a lock on another project's startup.
    if (!snapshot.bridge && !this.bridges.referencedInstallations(snapshot).length) {
      return { launch: snapshot, release: async () => {} };
    }
    return withLock(join(this.home, 'leases.lock'), async () => {
      const profile = await this.get(name), releases = [];
      try {
        const record = profile.bridge ? await this.bridges.get(profile.bridge.id) : undefined;
        const keys = record ? [record.installKey] : this.bridges.referencedInstallations(profile);
        for (const installKey of keys) releases.push(await this.bridges.lease({ installKey }));
        return { launch: record ? this.withBridge(profile, record) : profile,
          release: async () => { await Promise.all(releases.map(release => release())); } };
      } catch (cause) { await Promise.all(releases.map(release => release())); throw cause; }
    }, 180000, this.signal);
  }
}
