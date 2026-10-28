#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const args = process.argv.slice(2);
  let base = 'http://127.0.0.1:8773';
  try { base = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.gar/vm/panel.json'), 'utf8')).url; } catch {}
  const urlIndex = args.indexOf('--url');
  if (urlIndex >= 0) { base = args[urlIndex + 1]; args.splice(urlIndex, 2); }
  const origin = new URL(base);
  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)))) throw new Error('接続先にはHTTPSのWebPanel、またはlocalhostの開発用URLを指定してください。');
  const [action = 'state', first, second] = args;
  let command;
  switch (action) {
    case 'state': break;
    case 'expression': case 'scenario': command = { type: action, [action === 'expression' ? 'value' : 'id']: first }; break;
    case 'joint': command = { type: 'joint', id: first, angle: Number(second) }; break;
    case 'sensor': command = { type: 'sensor', [first]: Number(second) }; break;
    case 'pause': case 'play': command = { type: 'pause', value: action === 'pause' }; break;
    case 'blink': case 'stop': case 'reset': command = { type: action }; break;
    case 'step': command = { type: 'step', ms: first === undefined ? 100 : Number(first) }; break;
    case 'record': command = { type: 'record', action: first }; break;
    case 'replay': command = { type: 'replay', recording: JSON.parse(fs.readFileSync(first, 'utf8')) }; break;
    default: throw new Error('state | expression ID | scenario ID | joint ID 角度 | sensor 名前 値 | pause | play | blink | stop | reset | step [ms] | record start/stop | replay FILE');
  }
  const response = await fetch(new URL(command ? '/api/command' : '/api/state', origin), command ? {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin.origin }, body: JSON.stringify(command), signal: AbortSignal.timeout(5000),
  } : { signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || JSON.stringify(data));
  console.log(JSON.stringify(data, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
