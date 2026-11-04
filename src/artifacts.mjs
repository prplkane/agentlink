import { createHash } from 'node:crypto';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside } from './storage.mjs';
import { error } from './profiles.mjs';

export async function readArtifact(source, { maxBytes = 256 * 1024 * 1024, timeoutMs = 60000, offline = false, signal } = {}) {
  signal?.throwIfAborted();
  const url = new URL(source);
  if (url.username || url.password || !['file:', 'https:'].includes(url.protocol)) {
    throw error('INVALID_SOURCE', 'Use an HTTPS URL without embedded credentials, or an explicit file URL.');
  }
  if (url.protocol === 'file:') {
    const { stat } = await import('node:fs/promises');
    const path = fileURLToPath(url);
    if ((await stat(path)).size > maxBytes) throw error('DOWNLOAD_LIMIT', 'Artifact exceeds the download limit.');
    return readFile(path, { signal });
  }
  if (offline) throw error('OFFLINE', 'This artifact is not available locally.');
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let response, next = url;
  for (let redirects = 0; ; redirects++) {
    if (next.protocol !== 'https:' || next.username || next.password) {
      throw error('INVALID_SOURCE', 'Artifact redirects must use HTTPS without embedded credentials.');
    }
    response = await fetch(next, { signal: deadline, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || redirects >= 5) throw error('DOWNLOAD_FAILED', 'Invalid or excessive artifact redirects.');
    next = new URL(location, next);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw error('DOWNLOAD_FAILED', 'Artifact download failed (HTTP ' + response.status + ').');
  }
  const parts = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw error('DOWNLOAD_LIMIT', 'Artifact exceeds the download limit.');
    parts.push(chunk);
  }
  return Buffer.concat(parts, bytes);
}

export function checkDigest(bytes, expected) {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (expected !== undefined && (!/^[a-f0-9]{64}$/i.test(expected) || expected.toLowerCase() !== actual)) {
    throw error('INTEGRITY_MISMATCH', 'Downloaded artifact does not match its SHA-256.');
  }
  return actual;
}

// Small archive reader for ordinary binary releases. Links, devices, traversal,
// duplicate paths, ZIP64 and unsupported formats fail before publication.
export async function extractArtifact(bytes, root, format, { maxBytes = 512 * 1024 * 1024, maxFiles = 10000 } = {}) {
  let total = 0, count = 0;
  const account = size => {
    if (++count > maxFiles || (total += size) > maxBytes) throw error('EXTRACT_LIMIT', 'Archive exceeds the extraction limit.');
  };
  const reserve = (name, size, directory) => {
    account(size);
    if (directory && size) throw error('INVALID_ARCHIVE', 'Archive directories must not contain data.');
    if (name === '.' || name === './') {
      if (!directory) throw error('INVALID_ARCHIVE', 'The archive root must be an empty directory.');
      return;
    }
    if (!name || /[\\:\0-\x1f]/.test(name) || name.startsWith('/') || name.split('/').includes('..') ||
        name.split('/').some(part => /[. ]$/.test(part) && part !== '.') ||
        name.split('/').some(part => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw error('INVALID_ARCHIVE', 'Archive contains an unsafe path.');
    }
    return inside(root, name);
  };
  const put = async (path, data, directory) => {
    if (path === undefined) return;
    if (directory) await mkdir(path, { recursive: true });
    else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data, { flag: 'wx', mode: 0o644 });
    }
  };
  if (format === 'tar.gz' || format === 'tgz') {
    const tar = gunzipSync(bytes, { maxOutputLength: maxBytes + maxFiles * 1024 });
    const str = value => new TextDecoder('utf-8', { fatal: true }).decode(value).split('\0')[0];
    const octal = value => {
      const text = str(value).trim();
      if (!/^[0-7]*$/.test(text)) throw error('INVALID_ARCHIVE', 'Unsupported tar number.');
      return text ? parseInt(text, 8) : 0;
    };
    let nextName;
    for (let offset = 0; offset + 512 <= tar.length;) {
      const head = tar.subarray(offset, offset + 512);
      if (head.every(byte => byte === 0)) break;
      const checksum = head.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
      if (checksum !== octal(head.subarray(148, 156))) throw error('INVALID_ARCHIVE', 'Invalid tar checksum.');
      const size = octal(head.subarray(124, 136));
      const type = head[156];
      const prefix = str(head.subarray(345, 500));
      const name = nextName || (prefix ? prefix + '/' : '') + str(head.subarray(0, 100));
      nextName = undefined;
      if (size > maxBytes || offset + 512 + size > tar.length) throw error('INVALID_ARCHIVE', 'Truncated or oversized tar entry.');
      const data = tar.subarray(offset + 512, offset + 512 + size);
      offset += 512 + Math.ceil(size / 512) * 512;
      if (type === 76) { account(size); nextName = str(data); continue; } // GNU long filename
      if (type === 120 || type === 103) { // POSIX extended metadata
        account(size);
        for (let cursor = 0; cursor < data.length;) {
          const space = data.indexOf(32, cursor);
          const length = Number(data.subarray(cursor, space).toString('ascii'));
          if (space < cursor || !Number.isSafeInteger(length) || length <= space - cursor + 1 || cursor + length > data.length) {
            throw error('INVALID_ARCHIVE', 'Invalid tar extended metadata.');
          }
          const entry = data.subarray(space + 1, cursor + length - 1).toString('utf8');
          if (entry.startsWith('path=')) {
            if (type === 103) throw error('INVALID_ARCHIVE', 'Global tar paths are unsupported.');
            nextName = entry.slice(5);
          }
          if (/^(linkpath|GNU\.sparse\.)/.test(entry)) throw error('INVALID_ARCHIVE', 'Tar links and sparse files are unsupported.');
          cursor += length;
        }
        continue;
      }
      if (![0, 48, 53].includes(type)) throw error('INVALID_ARCHIVE', 'Only regular files and directories are supported in tar archives.');
      await put(reserve(name, size, type === 53), data, type === 53);
    }
  } else if (format === 'zip') {
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
    }
    if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw error('INVALID_ARCHIVE', 'Invalid or multi-disk ZIP.');
    const entries = bytes.readUInt16LE(end + 10);
    let offset = bytes.readUInt32LE(end + 16);
    if (entries === 65535 || entries > maxFiles) throw error('INVALID_ARCHIVE', 'ZIP64 or excessive ZIP entries are unsupported.');
    for (let index = 0; index < entries; index++) {
      if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw error('INVALID_ARCHIVE', 'Invalid ZIP directory.');
      const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
      const compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
      const nameSize = bytes.readUInt16LE(offset + 28), extraSize = bytes.readUInt16LE(offset + 30), commentSize = bytes.readUInt16LE(offset + 32);
      const mode = bytes.readUInt32LE(offset + 38) >>> 16, local = bytes.readUInt32LE(offset + 42);
      if (flags & 1 || ![0, 8].includes(method) || (mode & 0xf000) === 0xa000 ||
          local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50 ||
          offset + 46 + nameSize + extraSize + commentSize > end) {
        throw error('INVALID_ARCHIVE', 'Unsupported or oversized ZIP entry.');
      }
      const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameSize));
      const directory = name.endsWith('/') || (mode & 0xf000) === 0x4000;
      // Reserve advertised expanded bytes before allocating or decompressing,
      // including root and directory entries that will not be written.
      const path = reserve(name, size, directory);
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      if (start + compressed > bytes.length) throw error('INVALID_ARCHIVE', 'Truncated ZIP entry.');
      const packed = bytes.subarray(start, start + compressed);
      const data = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: Math.max(1, size) });
      if (data.length !== size || crc32(data) !== bytes.readUInt32LE(offset + 16)) throw error('INVALID_ARCHIVE', 'Invalid ZIP contents.');
      await put(path, data, directory);
      offset += 46 + nameSize + extraSize + commentSize;
    }
  } else throw error('UNSUPPORTED_ARCHIVE', 'Managed binary releases support raw files, ZIP and tar.gz archives.');
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
