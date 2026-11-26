#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Script } = require('node:vm');
const { execFileSync } = require('node:child_process');
const { parse, pack, hash } = require('../lib/asar.cjs');
const { customFiles, extractLocales } = require('../lib/locales.cjs');
const project = path.resolve(__dirname, '..');
const runtimeNames = ['pm-chinese.js', 'pm-main-cn.js', 'pm-scratchpad-cn.js', 'pm-chinese-data.json', 'pm-main-data.json', 'pm-scratchpad-data.json', 'pm-chinese-langs.json', 'LICENSE.postman-chinese-injector.txt', 'pm-translation-tools.cjs'];

function assertStopped() {
  const output = process.platform === 'win32'
    ? execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
    : execFileSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8' });
  if (process.platform === 'win32' ? /^"Postman(?:[^"\r\n]*)?\.exe"/im.test(output) : /(?:^|\/)Postman(?: Helper[^\n]*)?$/im.test(output)) {
    throw Error('请完全退出 Postman（包括托盘和后台进程）后再操作');
  }
}

function resourcesAt(input) {
  const root = path.resolve(input);
  for (const candidate of [root, path.join(root, 'resources'), path.join(root, 'Contents', 'Resources')]) {
    if (fs.existsSync(path.join(candidate, 'app.asar'))) return candidate;
  }
  if (fs.existsSync(root)) {
    const versions = fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^app-\d+(?:\.\d+){1,3}$/.test(entry.name))
      .sort((a, b) => {
        const left = a.name.slice(4).split('.').map(Number);
        const right = b.name.slice(4).split('.').map(Number);
        for (let i = 0; i < Math.max(left.length, right.length); i++) {
          if ((right[i] || 0) !== (left[i] || 0)) return (right[i] || 0) - (left[i] || 0);
        }
        return 0;
      });
    for (const version of versions) {
      const candidate = path.join(root, version.name, 'resources');
      if (fs.existsSync(path.join(candidate, 'app.asar'))) return candidate;
    }
  }
  throw Error('未找到 app.asar；请用 --path 指定 Postman、app-* 或 resources 目录');
}

function treeHashes(directory) {
  if (!fs.existsSync(directory)) return null;
  const result = {};
  function walk(current, prefix = '') {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + item.name;
      const full = path.join(current, item.name);
      if (item.isSymbolicLink()) throw Error('拒绝 runtime 中的符号链接');
      if (item.isDirectory()) { result[relative + '/'] = 'directory'; walk(full, relative + '/'); }
      else if (item.isFile()) result[relative] = hash(fs.readFileSync(full));
      else throw Error('runtime 包含非普通文件');
    }
  }
  walk(directory);
  return result;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function durableWrite(file, data) {
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function replaceFile(target, data) {
  const temp = target + '.postman-zh-cn.tmp';
  const fd = fs.openSync(temp, 'wx');
  try {
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function buildArchive(original) {
  const archive = parse(original);
  const changes = new Map();
  const targets = {
    'main.js': ['pm-main-cn.js'],
    'preload_desktop.js': ['pm-chinese.js', 'pm-scratchpad-cn.js'],
    'preload.js': ['pm-chinese.js', 'pm-scratchpad-cn.js']
  };
  for (const [name, hooks] of Object.entries(targets)) {
    const matches = archive.entries.filter(file => file.path === name);
    if (matches.length !== 1) throw Error(`入口 ${name} 必须恰好有一个（发现 ${matches.length} 个），拒绝猜测`);
    const file = matches[0];
    const source = file.data.toString('utf8');
    const marker = '/* postman-zh-cn:begin */';
    if (source.includes(marker)) throw Error('已安装本项目补丁；请先 --restore');
    // An upstream/local injection is kept intact. Node caches identical require paths.
    const statements = hooks.map(hook => `require(require('path').join(process.resourcesPath,'postman-zh',${JSON.stringify(hook)}));`).join('\n');
    const injection = `\n${marker}\n${statements}\n/* postman-zh-cn:end */\n`;
    // Keep BOM/hashbang and the directive prologue (including "use strict") intact.
    let position = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    if (source.slice(position, position + 2) === '#!') {
      const newline = source.indexOf('\n', position);
      if (newline < 0) throw Error('入口 hashbang 缺少换行');
      position = newline + 1;
    }
    const prologue = /^(?:(?:\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*;)+/.exec(source.slice(position));
    if (prologue) position += prologue[0].length;
    const patched = source.slice(0, position) + injection + source.slice(position);
    new Script(patched, { filename: file.path });
    changes.set(file.path, Buffer.from(patched));
  }
  const result = pack(archive, changes);
  const verified = parse(result);
  for (const file of verified.entries) {
    const before = archive.entries.find(entry => entry.path === file.path);
    if (!file.data.equals(changes.get(file.path) || before.data)) throw Error('重打包内容校验失败');
  }
  console.log('ASAR 校验通过；修改入口：' + [...changes.keys()].join(', '));
  return result;
}

function run() {
  const args = process.argv.slice(2);
  const options = { dry: false, restore: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') options.dry = true;
    else if (args[i] === '--restore') options.restore = true;
    else if (args[i] === '--extract-only') options.extractOnly = true;
    else if (['--path', '--locale-dir', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = { '--path': 'path', '--locale-dir': 'localeDir', '--output': 'output' }[args[i]];
      options[key] = args[++i];
    }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('node bin/postman-zh-cn.cjs [--path <Postman/app-*/resources目录>] [--dry-run] [--restore] [--extract-only] [--locale-dir <官方英语JSON目录>] [--output <导出目录>]\nWindows 默认按版本号发现 LOCALAPPDATA/Postman 下最新 app-*；其他系统须 --path。');
      return;
    } else throw Error('未知参数或缺少参数值：' + args[i]);
  }
  if (options.restore && options.extractOnly) throw Error('--restore 不能与 --extract-only 同用');
  const defaultRoot = process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Postman') : null;
  if (!options.path && !defaultRoot) throw Error('此环境请指定 --path');
  const resources = fs.realpathSync(resourcesAt(options.path || defaultRoot));
  console.log('安装目标：' + resources);
  // Explicit version paths are allowed, but warn when the launcher has a newer install.
  if (options.path && defaultRoot && fs.existsSync(defaultRoot)) {
    const latestResources = fs.realpathSync(resourcesAt(defaultRoot));
    if (path.dirname(resources).startsWith(fs.realpathSync(defaultRoot) + path.sep) && resources !== latestResources) {
      console.warn('注意：指定的是旧版目录；本机最新版本为 ' + latestResources);
      console.warn('Postman 快捷方式可能启动新版。请去掉 --path 自动选择最新版本，或指定 Postman 根目录。');
    }
  }
  const relative = path.relative(project, resources);
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw Error('禁止将项目目录当作安装目标');
  const asar = path.join(resources, 'app.asar');
  const runtime = path.join(resources, 'postman-zh');
  const backup = path.join(resources, '.postman-zh-cn-backup');
  const lock = path.join(resources, '.postman-zh-cn.lock');
  const staged = path.join(resources, '.postman-zh-cn-stage');
  const previous = path.join(resources, '.postman-zh-cn-previous');
  const archiveTemp = asar + '.postman-zh-cn.tmp';
  for (const leftover of [lock, staged, previous, archiveTemp]) {
    if (fs.existsSync(leftover)) throw Error('Interrupted transaction or active installer detected; preserve files and follow README recovery steps.');
  }
  for (const item of [asar, runtime, backup, lock]) {
    if (fs.existsSync(item) && fs.lstatSync(item).isSymbolicLink()) throw Error('拒绝符号链接目标');
  }
  if (!options.extractOnly) assertStopped();
  const original = fs.readFileSync(asar);
  const originalHash = hash(original);
  const currentRuntime = treeHashes(runtime);
  const version = path.basename(path.dirname(resources)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const output = path.resolve(options.output || path.join(project, 'translations', 'missing', version));
  for (const protectedDirectory of [resources, path.join(project, 'runtime'), path.join(project, 'translations', 'custom'), path.join(project, '.git')]) {
    const relativeOutput = path.relative(protectedDirectory, output);
    const relativeProtected = path.relative(output, protectedDirectory);
    const contains = relative => relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
    if (contains(relativeOutput) || contains(relativeProtected)) throw Error('导出目录不能与安装资源、代码或自定义译文目录重叠');
  }
  const custom = options.restore ? [] : customFiles(project);
  const configText = JSON.stringify({ version, output }, null, 2) + '\n';
  const actual = treeHashes(path.join(project, 'runtime'));
  const desired = { ...actual, 'pm-capture-config.json': hash(Buffer.from(configText)) };
  if (custom.length) {
    desired['custom/'] = 'directory';
    for (const file of custom) desired['custom/' + file.name] = hash(Buffer.from(file.text));
  }
  const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const desiredHashes = sorted(desired);
  if (!options.restore) {
    const expected = JSON.parse(fs.readFileSync(path.join(project, 'runtime-manifest.json'), 'utf8'));
    if (!equal(actual, expected) || !runtimeNames.every(name => actual[name]) || Object.keys(actual).length !== runtimeNames.length) throw Error('项目 runtime hash/文件白名单校验失败');
    extractLocales({ archive: parse(original), localeDir: options.localeDir, output, translations: JSON.parse(fs.readFileSync(path.join(project, 'runtime', 'pm-chinese-data.json'), 'utf8')), custom, dry: options.dry });
    console.log('缺失文案目录：' + output + '\n译文放入 translations/custom/<模块名>.json，保留键名和占位符，再双击 install.bat 更新。');
  }
  if (options.extractOnly) return;
  let manifest;
  let payload;
  let previousManifest = null;
  if (options.restore) {
    manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
    if (manifest.format !== 1) throw Error('不支持的备份格式');
    payload = fs.readFileSync(path.join(backup, 'app.asar'));
    if (hash(payload) !== manifest.originalHash || !equal(treeHashes(path.join(backup, 'runtime')), manifest.originalRuntime)) throw Error('备份 hash 不匹配，拒绝恢复');
    if (![manifest.originalHash, manifest.patchedHash].includes(originalHash)) throw Error('当前 ASAR 已被其他程序修改，拒绝覆盖');
    if (![manifest.originalRuntime, manifest.patchedRuntime, null].some(value => equal(currentRuntime, value))) throw Error('当前 runtime 已被其他程序修改，拒绝覆盖');
  } else {
    if (fs.existsSync(backup)) {
      previousManifest = fs.readFileSync(path.join(backup, 'manifest.json'));
      manifest = JSON.parse(previousManifest.toString('utf8'));
      if (manifest.format !== 1 || originalHash !== manifest.patchedHash || !equal(currentRuntime, manifest.patchedRuntime)) throw Error('当前安装与备份记录不一致；请先恢复或检查修改');
      const baseline = fs.readFileSync(path.join(backup, 'app.asar'));
      if (hash(baseline) !== manifest.originalHash || !equal(treeHashes(path.join(backup, 'runtime')), manifest.originalRuntime)) throw Error('备份校验失败');
      payload = buildArchive(baseline);
      manifest = { ...manifest, patchedHash: hash(payload), patchedRuntime: desiredHashes };
    } else {
      payload = buildArchive(original);
      manifest = { format: 1, originalHash, patchedHash: hash(payload), originalRuntime: currentRuntime, patchedRuntime: desiredHashes };
    }
  }
  console.log(`${options.dry ? 'DRY-RUN' : '执行'} ${options.restore ? '恢复' : '安装'}；当前 SHA256=${originalHash}；目标 SHA256=${hash(payload)}`);
  if (options.dry) { console.log('只读完成：未创建锁、备份或暂存文件，未修改应用。'); return; }
  let lockFd;
  let runtimeMoved = false;
  let runtimeInstalled = false;
  let archiveChanged = false;
  let committed = false;
  let ownsStage = false;
  try {
    lockFd = fs.openSync(lock, 'wx');
    fs.writeFileSync(lockFd, String(process.pid));
    if (fs.existsSync(staged) || fs.existsSync(previous)) throw Error('发现未完成事务目录；保留现场，请按 README 恢复');
    assertStopped();
    if (hash(fs.readFileSync(asar)) !== originalHash || !equal(treeHashes(runtime), currentRuntime)) throw Error('文件在检查后发生变化');
    if (!options.restore && !previousManifest) {
      fs.mkdirSync(backup);
      durableWrite(path.join(backup, 'app.asar'), original);
      if (currentRuntime !== null) fs.cpSync(runtime, path.join(backup, 'runtime'), { recursive: true, errorOnExist: true, force: false });
      if (hash(fs.readFileSync(path.join(backup, 'app.asar'))) !== originalHash || !equal(treeHashes(path.join(backup, 'runtime')), currentRuntime)) throw Error('备份写入校验失败');
      durableWrite(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));
    }
    const desiredRuntime = options.restore ? manifest.originalRuntime : manifest.patchedRuntime;
    if (desiredRuntime !== null) {
      ownsStage = true;
      fs.cpSync(options.restore ? path.join(backup, 'runtime') : path.join(project, 'runtime'), staged, { recursive: true, errorOnExist: true, force: false });
      if (!options.restore) {
        fs.writeFileSync(path.join(staged, 'pm-capture-config.json'), configText, { flag: 'wx' });
        if (custom.length) fs.mkdirSync(path.join(staged, 'custom'));
        for (const file of custom) fs.writeFileSync(path.join(staged, 'custom', file.name), file.text, { flag: 'wx' });
      }
      if (!equal(treeHashes(staged), desiredRuntime)) throw Error('暂存 runtime 校验失败');
    }
    assertStopped();
    if (hash(fs.readFileSync(asar)) !== originalHash || !equal(treeHashes(runtime), currentRuntime)) {
      throw Error('Target changed while preparing transaction; installation stopped.');
    }
    if (currentRuntime !== null) { fs.renameSync(runtime, previous); runtimeMoved = true; }
    if (desiredRuntime !== null) { fs.renameSync(staged, runtime); runtimeInstalled = true; }
    replaceFile(asar, payload);
    archiveChanged = true;
    if (hash(fs.readFileSync(asar)) !== hash(payload) || !equal(treeHashes(runtime), desiredRuntime)) throw Error('安装后 hash 校验失败');
    if (previousManifest) replaceFile(path.join(backup, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
    committed = true;
    if (runtimeMoved) { fs.rmSync(previous, { recursive: true }); runtimeMoved = false; }
    if (options.restore) fs.rmSync(backup, { recursive: true });
    console.log(options.restore ? '已恢复安装前状态。' : '安装成功，已保留安装前备份。');
  } catch (error) {
    if (committed) throw Error('文件替换已成功，但清理未完成：' + error.message + '；请保留备份并按 README 处理。');
    const failures = [];
    try { if (archiveChanged) replaceFile(asar, original); } catch (rollback) { failures.push(rollback.message); }
    try {
      if (runtimeInstalled) fs.rmSync(runtime, { recursive: true });
      if (runtimeMoved && fs.existsSync(previous)) fs.renameSync(previous, runtime);
    } catch (rollback) { failures.push(rollback.message); }
    if (failures.length) throw Error(`${error.message}；自动回滚失败：${failures.join('；')}。备份已保留。`);
    throw error;
  } finally {
    if (lockFd !== undefined) {
      try {
        if (ownsStage && fs.existsSync(staged)) fs.rmSync(staged, { recursive: true });
      } finally {
        try { fs.closeSync(lockFd); }
        finally { fs.unlinkSync(lock); }
      }
    }
  }
}
try { run(); } catch (error) { console.error('错误：' + error.message); process.exitCode = 1; }
