import '/gar-components/display.mjs';
import '/gar-components/event-log.mjs';
import '/gar-components/pca9685.js';
import '/gar-components/sg90.js';
import '/gar-components/sbc-board.mjs';

const $ = id => document.getElementById(id);
const presets = window.FacePresets;
const expressionById = Object.fromEntries(presets.expressions.map(entry => [entry.id, entry]));
const screen = $('screen');
$('controller-board').ports = ['USB0', 'USB1'];
let current = null;
let connected = false;
let disposed = false;
let commandChain = Promise.resolve();
let commandGeneration = 0;
let commandsPending = 0;
let pollTimer = null;
let scenarioLoaded = false;
let frameLoading = false;
let displayedFrameId = null;
let previousTime = -1;
let observedEvents = new Set();
let reducedMotionRequested = false;
const editingInputs = new Set();
const pwmTransport = new EventTarget();
pwmTransport.state = null;
$('virtual-pwm').transport = pwmTransport;

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
  $('notice').setAttribute('role', error ? 'alert' : 'status');
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) {
      const detail = typeof result.error === 'string' ? result.error : result.error?.message;
      const error = new Error(detail || result.message || `操作を受け付けられませんでした (${response.status})`);
      error.isValidation = response.status >= 400 && response.status < 500;
      throw error;
    }
    return result;
  } finally { clearTimeout(timeout); }
}

function refreshDisabled() {
  document.querySelectorAll('[data-command]').forEach(control => { control.disabled = !connected; });
  if (!current || !connected) return;
  $('step').disabled = !current.paused;
  $('stop').disabled = current.stopped;
  document.querySelectorAll('[data-joint], [data-scenario]').forEach(control => { control.disabled = current.stopped; });
  $('export').disabled = !current.recording?.count;
  $('import').disabled = current.stopped || Boolean(current.recording?.active);
}

function connection(value) {
  const changed = connected !== value;
  connected = value;
  $('connection').className = `connection ${value ? 'online' : 'offline'}`;
  $('connection').textContent = value ? current?.host?.environment === 'virtualbox-linux' ? 'Linux VMに接続中' : '開発サーバーに接続中' : 'サーバーとの接続なし';
  document.body.classList.toggle('offline', !value);
  if (!value) {
    $('run-status').textContent = '表示は最後に受信した状態です';
    if (changed) publishServos(current, true);
  }
  refreshDisabled();
}

function send(command) {
  if (!connected) return Promise.resolve(false);
  commandsPending += 1;
  commandGeneration += 1;
  const work = commandChain.then(async () => {
    if (disposed) return false;
    try {
      const state = await request('/api/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      });
      connection(true);
      render(state);
      return true;
    } catch (error) {
      if (!error.isValidation) connection(false);
      notice(error.isValidation ? `操作を反映できませんでした：${error.message}` : 'サーバーとの接続が切れました。自動で再接続を試しています。', true);
      return false;
    } finally { commandsPending -= 1; }
  });
  commandChain = work.catch(() => false);
  return work;
}

function setControl(id, value, display = value) {
  const element = $(id);
  if (!editingInputs.has(element)) {
    element.value = String(value);
    const output = $(`${id}-value`);
    if (output) output.textContent = String(display);
  }
}

function publishServos(state, disconnected = false) {
  if (!state) return;
  if (state.io?.backend === 'linux-dev') {
    if (disconnected || !state.io.pwm || !state.io.bridgeReady) return;
    const pwm = { ...state.io.pwm, type:'pca9685', device:'virtual-pwm' };
    pwmTransport.state = { i2c: { pca9685: pwm } };
    pwmTransport.dispatchEvent(new CustomEvent('message', { detail:pwm }));
    return;
  }
  const channels = Array.from({ length: 16 }, (_, channel) => {
    const joint = state.joints[channel];
    const angle = joint ? Math.max(0, Math.min(180, joint.angle + 90)) : 90;
    const pulseUs = 500 + angle / 180 * 2000;
    return { channel, on: 0, off: Math.round(pulseUs * 4096 * 50 / 1e6), fullOn: false, fullOff: !joint || disconnected || state.stopped };
  });
  const pwm = { type: 'pca9685', device: 'virtual-pwm', address: 64, frequencyHz: 50, channels };
  pwmTransport.state = { i2c: { pca9685: pwm } };
  pwmTransport.dispatchEvent(new CustomEvent('message', { detail: pwm }));
}

function formatClock(ms) {
  const tenths = Math.floor(ms / 100);
  return `${String(Math.floor(tenths / 600)).padStart(2, '0')}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

async function drawDriverFrame(io) {
  if (!io.displayReady || frameLoading || io.frameId === displayedFrameId) return;
  frameLoading = true;
  try {
    const response = await fetch('/api/io/frame', { cache:'no-store', signal:AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('仮想ドライバのフレームを取得できません');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== 115200) throw new Error('フレームサイズが不正です');
    screen.writeFrame(bytes, { littleEndian:false });
    displayedFrameId = io.frameId;
  } catch(error) { $('io-status').textContent = error.message; }
  finally { frameLoading = false; }
}

function render(state) {
  current = state;
  $('connection').textContent = state.host?.environment === 'virtualbox-linux' ? 'Linux VMに接続中' : '開発サーバーに接続中';
  const expression = expressionById[state.expression];
  if (state.io?.backend === 'linux-dev') {
    drawDriverFrame(state.io);
    $('io-status').textContent = state.io.error ? `ドライバ確認: ${state.io.error}` : `/dev → GAR仮想ドライバ → Bridge · ${state.io.frames}フレーム出力`;
  } else {
    window.FaceRenderer.draw(screen.displayContext, state.pose, state.effects);
    $('io-status').textContent = '開発用のロジック試験表示（/dev経路はLinux VMで確認）';
  }
  screen.setAttribute('label', `GC9A01：${expression?.label || state.expression}の顔`);
  $('expression-name').textContent = expression?.label || state.expression;
  $('clock').textContent = formatClock(state.timeMs);
  $('pause').textContent = state.paused ? '再生' : '一時停止';
  $('run-status').textContent = state.stopped ? '停止中 ·「初期状態へ」で解除' : state.paused ? '一時停止中' : '仮想の部品を実行中';
  document.body.classList.toggle('stopped', state.stopped);
  document.querySelectorAll('[data-expression]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.expression === state.expression)));
  $('auto-blink').checked = state.motion.autoBlink;
  $('talk').checked = state.motion.talk;
  setControl('gaze-x', state.motion.gazeX);
  setControl('gaze-y', state.motion.gazeY);
  setControl('pitch', state.sensors.pitch, `${Math.round(state.sensors.pitch)}°`);
  setControl('roll', state.sensors.roll, `${Math.round(state.sensors.roll)}°`);
  setControl('distance', state.sensors.distanceMm, `${Math.round(state.sensors.distanceMm)} mm`);
  setControl('battery', state.sensors.batteryV, `${state.sensors.batteryV.toFixed(2)} V`);
  state.joints.forEach(joint => {
    const slider = $(`joint-${joint.id}`);
    if (!slider) return;
    slider.min = joint.min;
    slider.max = joint.max;
    setControl(`joint-${joint.id}`, joint.target, `${joint.angle.toFixed(0)}°`);
  });
  publishServos(state);
  const scenarioButton = document.querySelector(`[data-scenario="${state.scenario.id}"]`);
  $('scenario-status').textContent = state.scenario.running ? `${scenarioButton?.dataset.label || state.scenario.id}を実行中` : 'シナリオ停止中';
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(state.scenario.running && button.dataset.scenario === state.scenario.id)));
  const metrics = state.metrics;
  $('frame-bytes').textContent = `${(metrics.frameBytes / 1024).toFixed(1)} KiB`;
  $('double-buffer').textContent = `${(metrics.doubleBufferBytes / 1024).toFixed(1)} KiB`;
  $('target-fps').textContent = `${metrics.targetFps} fps`;
  $('transfer-time').textContent = `${metrics.theoreticalTransferMs.toFixed(1)} ms`;
  $('spi-speed').textContent = `${(metrics.spiClockHz / 1e6).toFixed(0)} MHz（仮定）`;
  $('host-memory').textContent = Number.isFinite(metrics.hostRssBytes) ? `${(metrics.hostRssBytes / 1024 / 1024).toFixed(1)} MiB` : '—';
  $('host-memory-label').textContent = state.host?.environment === 'virtualbox-linux' ? 'VM内Node.jsの使用量（RSS）' : '開発用Node.jsの使用量（RSS）';
  $('record').textContent = state.recording.active ? '■ 記録を終える' : '● 記録を始める';
  document.querySelector('.record-panel').classList.toggle('recording', state.recording.active);
  $('recording-status').textContent = state.replay?.running ? '保存した操作を再生中' : state.recording.active ? `記録中 · ${state.recording.count}操作` : state.recording.count ? `${state.recording.count}操作を記録しています` : '記録はまだありません';
  if (state.timeMs < previousTime) { $('events').clear(); observedEvents = new Set(); }
  const eventKeys = new Set();
  for (const event of state.events) {
    const key = JSON.stringify([event.timeMs, event.kind, event.message]);
    eventKeys.add(key);
    if (!observedEvents.has(key)) $('events').append(`${formatClock(event.timeMs)}  ${event.message}`);
  }
  observedEvents = eventKeys;
  previousTime = state.timeMs;
  refreshDisabled();
}

async function loadScenarios() {
  const entries = await request('/api/scenarios');
  const container = $('scenarios');
  container.replaceChildren();
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'scenario-button'; button.dataset.scenario = entry.id;
    button.dataset.label = entry.label; button.dataset.command = ''; button.setAttribute('aria-pressed', 'false');
    const title = document.createElement('span'); title.textContent = entry.label;
    const description = document.createElement('small'); description.textContent = entry.description;
    title.append(description); button.append(title);
    button.addEventListener('click', () => send({ type: 'scenario', id: entry.id }));
    container.append(button);
  }
  scenarioLoaded = true;
  refreshDisabled();
}

async function poll() {
  const generation = commandGeneration;
  try {
    if (!commandsPending) {
      const state = await request('/api/state');
      if (generation === commandGeneration && !disposed) {
        const wasConnected = connected;
        connection(true);
        render(state);
        if (!wasConnected) notice('');
        if (!scenarioLoaded) await loadScenarios();
        if (!reducedMotionRequested && matchMedia('(prefers-reduced-motion: reduce)').matches) {
          reducedMotionRequested = true;
          await send({ type: 'pause', value: true });
          notice('動きを減らす設定に合わせて、一時停止で開きました。「再生」で動かせます。');
        }
      }
    }
  } catch {
    if (!disposed) { connection(false); notice('実行サーバーを確認してください。画面は自動で再接続します。', true); }
  } finally {
    if (!disposed) pollTimer = setTimeout(poll, connected ? document.hidden ? 1000 : current?.paused ? 150 : 50 : 1200);
  }
}

for (const entry of presets.expressions) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'expression'; button.dataset.expression = entry.id; button.dataset.command = ''; button.disabled = true;
  button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', entry.label);
  const thumb = document.createElement('canvas'); thumb.width = 72; thumb.height = 72; thumb.setAttribute('aria-hidden', 'true');
  window.FaceRenderer.draw(thumb.getContext('2d'), entry.pose);
  const label = document.createElement('span'); label.textContent = entry.label;
  button.append(thumb, label); button.addEventListener('click', () => send({ type: 'expression', value: entry.id }));
  $('expressions').append(button);
}
$('pause').addEventListener('click', () => send({ type: 'pause', value: !current.paused }));
$('step').addEventListener('click', () => send({ type: 'step', ms: 100 }));
$('stop').addEventListener('click', () => send({ type: 'stop' }));
$('reset').addEventListener('click', () => { notice(''); send({ type: 'reset' }); });
$('blink').addEventListener('click', () => send({ type: 'blink' }));
$('auto-blink').addEventListener('change', event => send({ type: 'motion', autoBlink: event.target.checked }));
$('talk').addEventListener('change', event => send({ type: 'motion', talk: event.target.checked }));
for (const [id, property] of [['gaze-x', 'gazeX'], ['gaze-y', 'gazeY']]) {
  $(id).addEventListener('input', event => { $(`${id}-value`).textContent = event.target.value; });
  $(id).addEventListener('change', event => send({ type: 'motion', [property]: Number(event.target.value) }));
}
for (const slider of document.querySelectorAll('[data-sensor]')) {
  const suffix = slider.id === 'battery' ? ' V' : slider.id === 'distance' ? ' mm' : '°';
  slider.addEventListener('input', () => { $(`${slider.id}-value`).textContent = slider.value + suffix; });
  slider.addEventListener('change', () => send({ type: 'sensor', [slider.dataset.sensor]: Number(slider.value) }));
}
for (const slider of document.querySelectorAll('[data-joint]')) {
  slider.addEventListener('input', () => { $(`${slider.id}-value`).textContent = slider.value + '°'; });
  slider.addEventListener('change', () => send({ type: 'joint', id: slider.dataset.joint, angle: Number(slider.value) }));
}
for (const slider of document.querySelectorAll('input[type=range]')) {
  slider.addEventListener('pointerdown', () => editingInputs.add(slider));
  slider.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) editingInputs.add(slider); });
  slider.addEventListener('keyup', () => editingInputs.delete(slider));
  slider.addEventListener('blur', () => editingInputs.delete(slider));
}
window.addEventListener('pointerup', () => editingInputs.clear());
window.addEventListener('pointercancel', () => editingInputs.clear());
$('record').addEventListener('click', () => send({ type: 'record', action: current.recording.active ? 'stop' : 'start' }));
$('export').addEventListener('click', async () => {
  try {
    await commandChain;
    const recording = await request('/api/recording');
    const blob = new Blob([JSON.stringify(recording, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'robot-face-recording.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('操作の記録を保存しました。「読み込み・再生」で同じ動きを試せます。');
  } catch (error) { notice(`保存できませんでした：${error.message}`, true); }
});
$('import').addEventListener('click', () => $('recording-file').click());
$('recording-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) { notice('記録ファイルは1 MiB以下にしてください。', true); return; }
  try {
    const recording = JSON.parse(await file.text());
    if (await send({ type: 'replay', recording })) notice('記録を読み込みました。保存した初期状態から再生しています。');
  } catch { notice('記録ファイルを読めませんでした。保存したJSONファイルを選んでください。', true); }
});

window.addEventListener('pagehide', () => { disposed = true; clearTimeout(pollTimer); });
poll();
