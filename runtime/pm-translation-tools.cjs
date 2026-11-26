'use strict';
// Only official locale JSON is inspected; never inspect DOM text or request data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const safeKey = key => !['__proto__', 'constructor', 'prototype'].includes(key);
const safeName = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(value) && !value.includes('..');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validateTree(value) {
  if (typeof value === 'string') return;
  if (!object(value)) throw Error('Translation values must be strings or key trees.');
  for (const key of Object.keys(value)) {
    if (!safeKey(key)) throw Error('Unsafe translation key: ' + key);
    validateTree(value[key]);
  }
}
function signature(text) {
  // Conservative placeholder/tag checks. ICU syntax must still be reviewed by the translator.
  return [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}|\{\s*([\w.]+)\s*[,}]|<\/?([A-Za-z][\w-]*)\b[^>]*>/g)]
    .map(match => match[1] ? 'double:' + match[1] : match[2] ? 'arg:' + match[2] : 'tag:' + match[3]).sort();
}
function validateText(source, translated) {
  return typeof translated === 'string' && translated.trim().length > 0 &&
    JSON.stringify(signature(source)) === JSON.stringify(signature(translated));
}
function readObject(file) {
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); validateTree(value); return value; }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function collect(source, bundled, custom, missing, stats) {
  const result = {};
  for (const key of Object.keys(source)) {
    if (!safeKey(key)) continue;
    const value = source[key];
    if (object(value)) {
      const childMissing = {};
      result[key] = collect(value, object(bundled?.[key]) ? bundled[key] : {}, object(custom?.[key]) ? custom[key] : {}, childMissing, stats);
      if (Object.keys(childMissing).length) missing[key] = childMissing;
    } else if (typeof value === 'string') {
      const hasCustom = own(custom, key);
      const validCustom = hasCustom && validateText(value, custom[key]);
      if (hasCustom && !validCustom) stats.invalid++;
      const candidate = validCustom ? custom[key] : bundled?.[key];
      result[key] = typeof candidate === 'string' ? candidate : value;
      if (typeof candidate !== 'string' || candidate === value || (hasCustom && !validCustom)) { missing[key] = value; stats.missing++; }
    } else { result[key] = value; }
  }
  return result;
}
function processModule(moduleName, source, bundled, custom, output) {
  if (!safeName(moduleName) || !object(source)) throw Error('Unsupported locale module name or shape.');
  validateTree(source);
  const missing = {};
  const stats = { missing: 0, invalid: 0 };
  const translated = collect(source, bundled || {}, custom || {}, missing, stats);
  if (output) {
    writeJson(path.join(output, 'modules', moduleName + '.json'), missing);
    writeJson(path.join(output, 'sources', moduleName + '.json'), source);
    writeJson(path.join(output, 'status', moduleName + '.json'), { module: moduleName, sourceHash: digest(source), ...stats });
  }
  return { translated, ...stats };
}
function createRuntime(directory) {
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(directory, 'pm-capture-config.json'), 'utf8')); }
  catch { return null; }
  if (!path.isAbsolute(config.output || '') || !safeName(config.version || '')) return null;
  const seen = new Map();
  return function (moduleName, source, bundled, locale) {
    if (!safeName(moduleName)) return null;
    // Japanese structure can use custom translations, but is never exported as English.
    let custom = {};
    try { custom = readObject(path.join(directory, 'custom', moduleName + '.json')); }
    catch (error) { console.warn('[pm-chinese] Invalid custom translation:', moduleName, error.message); }
    const key = locale + '/' + moduleName;
    const sourceHash = digest(source);
    const output = /^en(?:[-_]US)?$/i.test(locale) && seen.get(key) !== sourceHash ? config.output : null;
    let result;
    try { result = processModule(moduleName, source, bundled, custom, output); }
    catch (error) {
      console.warn('[pm-chinese] Locale export failed:', moduleName, error.message);
      result = processModule(moduleName, source, bundled, custom, null);
    }
    seen.set(key, sourceHash);
    return result.translated;
  };
}
module.exports = { safeName, validateTree, validateText, processModule, createRuntime };
