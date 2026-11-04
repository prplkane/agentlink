import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { link, mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const error = (code, message) => Object.assign(new Error(message), { code });
export const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string' && !item.includes('\0'));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function profileName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name)) {
    throw error('INVALID_PROFILE', 'Profile names must use 1–64 lowercase letters, digits, underscores or hyphens (no reserved device names).');
  }
  return name;
}

export function validateProfile(profile) {
  if (!object(profile) || profile.schemaVersion !== 1) throw error('INVALID_PROFILE', 'Unsupported profile schema.');
  profileName(profile.name);
  if (typeof profile.command !== 'string' || !isAbsolute(profile.command) || profile.command.includes('\0') ||
      !strings(profile.prefixArgs) || !strings(profile.acpArgs) || ![1, 2].includes(profile.protocolVersion) ||
      !object(profile.discovery) || !['known', 'help', 'manual', 'metadata'].includes(profile.discovery.method) ||
      !object(profile.verification) || !['initialize-passed', 'pending'].includes(profile.verification.status) ||
      typeof profile.createdAt !== 'string' || typeof profile.updatedAt !== 'string') {
    throw error('INVALID_PROFILE', 'Invalid ACP launch profile.');
  }
  if (profile.bridge !== undefined) {
    if (!object(profile.bridge) || typeof profile.bridge.useDefaultArgs !== 'boolean') throw error('INVALID_PROFILE', 'Invalid managed bridge reference.');
    profileName(profile.bridge.id);
  }
  if (profile.env !== undefined && (!object(profile.env) || Object.entries(profile.env).some(([key, value]) =>
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')))) {
    throw error('INVALID_PROFILE', 'Invalid launch environment.');
  }
  if (profile.discovery.helpArgs !== undefined && !strings(profile.discovery.helpArgs)) throw error('INVALID_PROFILE', 'Invalid help arguments.');
  // Return an owned JSON value; profiles never contain executable JavaScript.
  return JSON.parse(JSON.stringify(profile));
}

export class ProfileStore {
  constructor({ home = process.env.AGENTLINK_HOME || join(homedir(), '.agentlink') } = {}) {
    if (typeof home !== 'string' || !isAbsolute(home)) throw new TypeError('AgentLink home must be an absolute path.');
    this.home = resolve(home);
    this.directory = join(this.home, 'profiles');
  }

  path(name) { return join(this.directory, `${profileName(name)}.json`); }

  async get(name) {
    const path = this.path(name);
    try {
      if ((await stat(path)).size > 256 * 1024) throw error('INVALID_PROFILE', 'Profile exceeds 256 KiB.');
      const profile = validateProfile(JSON.parse(await readFile(path, 'utf8')));
      if (profile.name !== name) throw error('INVALID_PROFILE', 'Profile name does not match its filename.');
      return profile;
    } catch (cause) {
      if (cause.code === 'ENOENT') throw error('PROFILE_NOT_FOUND', `No profile named "${name}". Add it once with agentlink add.`);
      if (cause instanceof SyntaxError) throw error('INVALID_PROFILE', `Profile "${name}" is not valid JSON.`);
      throw cause;
    }
  }

  async list() {
    let files;
    try { files = await readdir(this.directory); }
    catch (cause) { if (cause.code === 'ENOENT') return []; throw cause; }
    const result = [];
    for (const file of files.sort()) {
      if (!file.endsWith('.json')) continue;
      const name = file.slice(0, -5);
      try { result.push(await this.get(name)); }
      catch (cause) { result.push({ name, error: { code: cause.code || 'READ_FAILED', message: cause.message } }); }
    }
    return result;
  }

  async save(value, { replace = false } = {}) {
    const profile = validateProfile(value);
    const destination = this.path(profile.name);
    const data = JSON.stringify(profile, null, 2) + '\n';
    if (Buffer.byteLength(data) > 256 * 1024) throw error('INVALID_PROFILE', 'Profile exceeds 256 KiB.');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `.${profile.name}-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(data); await handle.sync(); }
      finally { await handle.close(); }
      // A hard link publishes a complete new file without overwriting another user's
      // concurrent add. Updates use rename so readers see the old or the new JSON.
      if (replace) await rename(temporary, destination);
      else await link(temporary, destination);
    } catch (cause) {
      if (cause.code === 'EEXIST') throw error('PROFILE_EXISTS', `Profile "${profile.name}" already exists. Use update or refresh.`);
      throw cause;
    } finally {
      await unlink(temporary).catch(cause => { if (cause.code !== 'ENOENT') throw cause; });
    }
    return profile;
  }

  async remove(name) {
    try { await unlink(this.path(name)); }
    catch (cause) { if (cause.code === 'ENOENT') throw error('PROFILE_NOT_FOUND', `No profile named "${name}".`); throw cause; }
  }
}
