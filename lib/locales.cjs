'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { safeName, validateTree, processModule } = require('../runtime/pm-translation-tools.cjs');
const moduleName = filename => filename.replace(/\.json$/i, '').replace(/-[0-9a-f]{8,}$/i, '');
function customFiles(project) {
  const directory = path.join(project, 'translations', 'custom');
  const files = [];
  if (!fs.existsSync(directory)) return files;
  if (fs.lstatSync(directory).isSymbolicLink()) throw Error('拒绝 custom 符号链接目录');
  for (const name of fs.readdirSync(directory).sort()) {
    if (!name.endsWith('.json')) continue;
    if (!safeName(name)) throw Error('不安全的自定义模块名称：' + name);
    const file = path.join(directory, name);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw Error('自定义翻译必须是普通 JSON 文件');
    const text = fs.readFileSync(file, 'utf8');
    const value = JSON.parse(text);
    validateTree(value);
    files.push({ name, text, value });
  }
  return files;
}
function extractLocales({ archive, localeDir, output, translations, custom, dry }) {
  const sources = new Map();
  for (const entry of archive.entries) {
    if (/(?:^|\/)locales\/en(?:[-_]US)?\/[^/]+\.json$/i.test(entry.path)) {
      sources.set(moduleName(path.posix.basename(entry.path)), JSON.parse(entry.data.toString('utf8')));
    }
  }
  if (localeDir) {
    const root = fs.realpathSync(localeDir);
    function visit(directory) {
      for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const file = path.join(directory, item.name);
        if (item.isDirectory()) visit(file);
        else if (item.isFile() && item.name.endsWith('.json')) sources.set(moduleName(item.name), JSON.parse(fs.readFileSync(file, 'utf8')));
      }
    }
    visit(root);
  }
  let missing = 0;
  let invalid = 0;
  const customMap = Object.fromEntries(custom.map(file => [moduleName(file.name), file.value]));
  for (const [name, source] of sources) {
    const result = processModule(name, source, translations[name], customMap[name], dry ? null : output);
    missing += result.missing;
    invalid += result.invalid;
  }
  console.log('英文模块扫描：' + sources.size + '；待翻译／未修改英文：' + missing + '；无效自定义项：' + invalid);
  if (!sources.size) console.log('本地归档没有英文模块；启动 Postman 浏览页面后，将自动提取已加载的官方英语语言包。');
  return { modules: sources.size, missing, invalid };
}
module.exports = { customFiles, extractLocales };
