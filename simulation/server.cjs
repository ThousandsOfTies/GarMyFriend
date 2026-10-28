'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { RobotRuntime, ValidationError, scenarios } = require('./runtime.cjs');
const { LinuxDevices } = require('./linux-devices.cjs');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function parsePublicOrigin(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value !== value.trim()) throw new Error('ROBOT_PANEL_ORIGIN は単一の HTTPS origin で指定してください。');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('ROBOT_PANEL_ORIGIN のURLを読み取れません。'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('ROBOT_PANEL_ORIGIN はパス・認証情報・クエリーのない HTTPS origin で指定してください。');
  }
  return parsed.origin;
}
function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function createSimulatorServer({ root = path.resolve(__dirname, '..'), buildId = 'local-development', instanceId = 'standalone', runtime = new RobotRuntime(), autoAdvance = true, publicOrigin = process.env.ROBOT_PANEL_ORIGIN, environment = process.env.GAR_SIM_ENVIRONMENT || 'local-host' } = {}) {
  root = fs.realpathSync(root);
  const configuredOrigin = parsePublicOrigin(publicOrigin);
  const configuredHost = configuredOrigin ? new URL(configuredOrigin).host : null;
  const host = Object.freeze({ environment, platform: process.platform, arch: process.arch, hostname: os.hostname() });
  const devices = process.env.ROBOT_IO_BACKEND === 'linux-dev' ? new LinuxDevices(root) : null;
  const state = () => ({ ...runtime.state(), host, io: devices ? devices.status() : { backend:'browser-preview',live:false,source:'開発用ロジック試験（/dev未使用）' } });
  let timer = null;
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port;
    const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const hosts = configuredHost ? [...localHosts, configuredHost] : localHosts;
    const origins = [...localHosts.map(hostname => `http://${hostname}`), ...(configuredOrigin ? [configuredOrigin] : [])];
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    try {
      if (!hosts.includes(req.headers.host)) throw new ValidationError('localhost または設定済みの公開ホストから接続してください。', 403);
      let pathname;
      try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { throw new ValidationError('不正なURLです。'); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) throw new ValidationError('公開範囲外のパスです。', 403);
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (pathname === '/health') return json(200, { ok: !devices || devices.status().displayReady, product: 'orange-pi-face-lab', runtime: 'node', buildId, instanceId, pid: process.pid, mode: 'simulation', host, io:state().io, metrics: runtime.state().metrics });
        if (pathname === '/api/io/frame') {
          if (!devices?.status().displayReady) return json(503,{error:'仮想ディスプレイドライバのフレーム待ちです。'});
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':devices.frame.length});res.end(devices.frame);return;
        }
        if (pathname === '/api/state') return json(200, state());
        if (pathname === '/api/scenarios') return json(200, scenarios);
        if (pathname === '/api/recording') return json(200, runtime.exportRecording());
        let relative, publicDirectory;
        if (pathname === '/') { relative = 'index.html'; publicDirectory = 'simulator'; }
        else if (pathname.startsWith('/simulator/')) { relative = pathname.slice('/simulator/'.length); publicDirectory = 'simulator'; }
        else if (pathname.startsWith('/gar-components/')) {
          relative = pathname.slice('/gar-components/'.length);
          publicDirectory = 'sources/gar-tools/web-simulator/components';
        }
        else if (['/preview/face.js', '/preview/presets.js'].includes(pathname)) { relative = pathname.slice('/preview/'.length); publicDirectory = 'preview'; }
        else throw new ValidationError('見つかりません。', 404);
        let allowedRoot, real;
        try {
          allowedRoot = fs.realpathSync(path.join(root, publicDirectory));
          real = fs.realpathSync(path.resolve(allowedRoot, relative));
        } catch { throw new ValidationError('見つかりません。', 404); }
        if (!isInside(root, allowedRoot) || !isInside(allowedRoot, real) || !fs.statSync(real).isFile()) throw new ValidationError('公開範囲外のパスです。', 403);
        const type = contentTypes[path.extname(real)];
        if (!type) throw new ValidationError('公開対象外のファイルです。', 404);
        const data = fs.readFileSync(real);
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length }); res.end(req.method === 'HEAD' ? undefined : data); return;
      }
      if (req.method !== 'POST' || pathname !== '/api/command') throw new ValidationError('未対応の操作です。', 405);
      if (req.headers.origin && !origins.includes(req.headers.origin)) throw new ValidationError('別のサイトから操作できません。', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new ValidationError('別のサイトから操作できません。', 403);
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ValidationError('JSONで送信してください。', 415);
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 1024 * 1024) throw new ValidationError('入力が大きすぎます（最大1MiB）。', 413); chunks.push(chunk); }
      let command;
      try { command = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ValidationError('JSONを読み取れません。'); }
      runtime.command(command);
      devices?.submit(runtime.state());
      return json(200, state());
    } catch (error) {
      if (!res.headersSent) json(error instanceof ValidationError ? error.status : 500, { error: error instanceof ValidationError ? error.message : 'シミュレーター内でエラーが発生しました。' });
      else res.end();
      if (!(error instanceof ValidationError)) console.error(error);
    }
  });
  server.runtime = runtime;
  server.on('listening', () => {
    if (!autoAdvance) return;
    let previous = performance.now();
    timer = setInterval(() => { const now = performance.now(); runtime.advance(Math.min(250, Math.max(0, now - previous))); previous = now; devices?.submit(runtime.state()); }, 50);
    timer.unref();
  });
  server.on('close', () => { if (timer) clearInterval(timer); devices?.close(); });
  return server;
}
function parseArguments(argv) {
  const result = { port: 8773, buildId: 'local-development', instanceId: 'standalone' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (value === undefined) throw new Error(`${key} の値が必要です。`);
    if (key === '--port') { if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('port は1〜65535です。'); result.port = Number(value); }
    else if (key === '--build-id') result.buildId = value;
    else if (key === '--instance-id') result.instanceId = value;
    else if (key === '--mode') { if (value !== 'simulation') throw new Error('実機I/Oは未実装です。--mode simulation のみ利用できます。'); }
    else throw new Error(`未対応の引数: ${key}`);
  }
  return result;
}
if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const server = createSimulatorServer(options);
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `ポート${options.port}は使用中です。既存プロセスは停止しません。` : error.message); process.exitCode = 1; });
    server.listen(options.port, '127.0.0.1', () => console.log(`Robot Face simulator: http://127.0.0.1:${options.port}/ (simulation only${process.env.ROBOT_PANEL_ORIGIN ? ', HTTPS reverse proxy configured' : ''})`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createSimulatorServer, parseArguments, parsePublicOrigin };
