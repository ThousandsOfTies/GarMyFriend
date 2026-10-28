#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.simulator');
const sessionFile = path.join(cache, 'session.json');
const product = 'orange-pi-face-lab';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function readSession() { try { return JSON.parse(fs.readFileSync(sessionFile, 'utf8')); } catch { return null; } }
function probe(url) {
  return new Promise(resolve => {
    const request = http.get(new URL('/health', url), { timeout: 800 }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; if (text.length > 65536) request.destroy(); });
      response.on('end', () => { try { resolve(response.statusCode === 200 ? JSON.parse(text) : null); } catch { resolve(null); } });
    });
    request.on('timeout', () => request.destroy()); request.on('error', () => resolve(null));
  });
}
async function owned(session) {
  if (!session || session.root !== root || !Number.isInteger(session.port) || session.port < 1024 || session.port > 65535) return null;
  const health = await probe(`http://127.0.0.1:${session.port}`);
  return health?.product === product && health.ok === true && health.pid === session.pid &&
    health.instanceId === session.instanceId && health.buildId === session.buildId ? health : null;
}
function walk(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return [];
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`シンボリックリンクは配布対象にできません: ${relative}`);
  return stat.isDirectory() ? fs.readdirSync(full).sort().flatMap(name => walk(path.join(relative, name))) : [relative];
}
function sourceId() {
  const hash = crypto.createHash('sha256');
  for (const file of ['simulation', 'config', 'simulator', 'shared/expressions.json', 'preview/face.js', 'preview/presets.js', 'sources/gar-tools/web-simulator/components'].flatMap(walk)) {
    hash.update(file.replaceAll('\\', '/')); hash.update(fs.readFileSync(path.join(root, file)));
  }
  return hash.digest('hex').slice(0, 16);
}
function available(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
function openBrowser(url) {
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : process.platform === 'darwin' ? [url] : [url];
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`ブラウザーで開いてください: ${url}`)); child.unref();
}
async function stop() {
  const session = readSession();
  if (!await owned(session)) { console.log('この作業フォルダーが起動したシミュレーターは動いていません。'); return; }
  process.kill(session.pid, 'SIGTERM');
  for (let i = 0; i < 30; i++) { if (!await owned(session)) break; await sleep(100); }
  if (await owned(session)) throw new Error('終了を確認できませんでした。別のプロセスは停止していません。');
  if (readSession()?.instanceId === session.instanceId) fs.unlinkSync(sessionFile);
  console.log('シミュレーターを終了しました。');
}
async function start() {
  const previous = readSession();
  if (await owned(previous)) {
    console.log(`起動済み: ${previous.url}`);
    if (previous.buildId !== sourceId()) console.log('ソースが更新されています。npm run dev:restart で反映できます。');
    if (process.argv.includes('--open')) openBrowser(previous.url);
    return;
  }
  fs.mkdirSync(cache, { recursive: true });
  const option = process.argv.indexOf('--port');
  let port = option < 0 ? 8773 : Number(process.argv[option + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65515) throw new Error('ポート番号は1024〜65515で指定してください。');
  const first = port;
  while (!await available(port)) { if (option >= 0 || ++port > first + 19) throw new Error('指定ポートが使用中です。--port で別の番号を指定してください。'); }
  const instanceId = crypto.randomUUID(), buildId = sourceId();
  const logfile = path.join(cache, 'server.log');
  const fd = fs.openSync(logfile, 'a');
  const child = spawn(process.execPath, [path.join(root, 'simulation', 'server.cjs'), '--port', String(port), '--build-id', buildId, '--instance-id', instanceId], {
    cwd: root, detached: true, windowsHide: true, stdio: ['ignore', fd, fd],
  });
  fs.closeSync(fd);
  let spawnError;
  child.on('error', error => { spawnError = error; }); child.unref();
  const session = { product, root, pid: child.pid, port, url: `http://127.0.0.1:${port}/`, instanceId, buildId, startedAt: new Date().toISOString() };
  for (let i = 0; i < 60; i++) {
    if (spawnError) throw spawnError;
    if (await owned(session)) {
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2) + '\n');
      console.log(`起動しました: ${session.url}`);
      console.log('PCシミュレーションです。Orange PiやCOM7には接続しません。');
      if (process.argv.includes('--open')) openBrowser(session.url);
      return;
    }
    await sleep(100);
  }
  throw new Error(`起動を確認できませんでした。ログ: ${logfile}`);
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18以降が必要です。');
  const command = process.argv[2] || 'start';
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'restart') { await stop(); await start(); }
  else if (command === 'status') { const session = readSession(); console.log(JSON.stringify({ running: Boolean(await owned(session)), session }, null, 2)); }
  else throw new Error('使い方: node tools/simulator.cjs start [--open] [--port 8773] | status | stop | restart');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
