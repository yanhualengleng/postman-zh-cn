'use strict';
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function parse(buffer) {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) throw Error('无效 ASAR size pickle');
  const headerSize = buffer.readUInt32LE(4);
  const jsonSize = buffer.readUInt32LE(12);
  if (headerSize < 8 || headerSize % 4 || 8 + headerSize > buffer.length || jsonSize > headerSize - 8 || buffer.readUInt32LE(8) !== headerSize - 4) {
    throw Error('无效 ASAR header pickle');
  }
  const header = JSON.parse(buffer.subarray(16, 16 + jsonSize).toString('utf8'));
  const entries = [];
  function walk(directory, prefix = '') {
    if (!directory.files || typeof directory.files !== 'object') throw Error('无效 ASAR 目录');
    for (const [name, entry] of Object.entries(directory.files)) {
      if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw Error('不安全的 ASAR 路径');
      const relative = prefix + name;
      if (entry.files) walk(entry, relative + '/');
      else if (!entry.link && !entry.unpacked) {
        const offset = Number(entry.offset);
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(entry.size) || entry.size < 0 || 8 + headerSize + offset + entry.size > buffer.length) throw Error('ASAR 文件越界');
        const data = buffer.subarray(8 + headerSize + offset, 8 + headerSize + offset + entry.size);
        if (entry.integrity) verifyIntegrity(data, entry.integrity);
        entries.push({ path: relative, entry, data });
      }
    }
  }
  walk(header);
  return { header, entries };
}

function integrity(data, blockSize = 4 * 1024 * 1024) {
  if (!Number.isSafeInteger(blockSize) || blockSize < 1) throw Error('无效 integrity blockSize');
  const blocks = [];
  for (let i = 0; i < data.length; i += blockSize) blocks.push(hash(data.subarray(i, i + blockSize)));
  if (!data.length) blocks.push(hash(data));
  return { algorithm: 'SHA256', hash: hash(data), blockSize, blocks };
}

function verifyIntegrity(data, expected) {
  if (expected.algorithm !== 'SHA256') throw Error('不支持的 ASAR integrity 算法');
  const actual = integrity(data, expected.blockSize);
  if (actual.hash !== expected.hash || JSON.stringify(actual.blocks) !== JSON.stringify(expected.blocks)) throw Error('ASAR integrity 校验失败');
}

function pack(archive, changes) {
  const chunks = [];
  let offset = 0;
  for (const file of archive.entries) {
    const data = changes.get(file.path) || file.data;
    file.entry.offset = String(offset);
    file.entry.size = data.length;
    if (changes.has(file.path)) file.entry.integrity = integrity(data, file.entry.integrity?.blockSize);
    chunks.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(archive.header));
  const headerSize = 8 + Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(8 + headerSize);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(headerSize, 4);
  prefix.writeUInt32LE(headerSize - 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  return Buffer.concat([prefix, ...chunks]);
}
module.exports = { parse, pack, hash };
