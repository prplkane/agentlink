import { gzipSync } from 'node:zlib';

// Independent fixture producers; no archive implementation is imported.
export function tarGz(entries) {
  const parts = [];
  for (const [name, value, type = '0'] of entries) {
    const data = Buffer.from(value), head = Buffer.alloc(512);
    head.write(name, 0, 100, 'utf8');
    head.write('0000755\0', 100); head.write('0000000\0', 108); head.write('0000000\0', 116);
    head.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    head.write('00000000000\0', 136); head.fill(32, 148, 156); head.write(type, 156);
    head.write('ustar\0', 257); head.write('00', 263);
    const sum = head.reduce((total, byte) => total + byte, 0);
    head.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(head, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

export function zip(entries) {
  const parts = [], directory = [];
  let offset = 0;
  for (const [name, value, mode = 0o100644] of entries) {
    const data = Buffer.from(value), filename = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(3 * 256 + 20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE((mode * 65536) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    parts.push(local, filename, data); directory.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const center = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(center.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, center, end]);
}
