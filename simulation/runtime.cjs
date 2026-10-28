'use strict';

const presets = require('../shared/expressions.json');
const defaultProfile = require('../config/orangepi-zero2w.json');
const clone = value => JSON.parse(JSON.stringify(value));
const byId = Object.fromEntries(presets.expressions.map(entry => [entry.id, entry]));
const jointDefinitions = [
  ['leftHip', '左・股関節', -60, 60], ['leftKnee', '左・膝', 0, 90],
  ['leftAnkle', '左・足首', -60, 60], ['rightHip', '右・股関節', -60, 60],
  ['rightKnee', '右・膝', 0, 90], ['rightAnkle', '右・足首', -60, 60],
].map(([id, label, min, max]) => ({ id, label, min, max }));
const scenarios = [
  { id: 'greeting', label: 'ごあいさつ', description: '笑顔・口パクと、小さなおじぎ。関節の動きは仮の演出です。', duration: 3600, steps: [
    [0, { type: 'expression', value: 'happy' }], [0, { type: 'motion', talk: true }],
    [500, { type: 'joint', id: 'leftHip', angle: 18 }], [500, { type: 'joint', id: 'rightHip', angle: 18 }],
    [1400, { type: 'joint', id: 'leftHip', angle: 0 }], [1400, { type: 'joint', id: 'rightHip', angle: 0 }],
    [2500, { type: 'motion', talk: false }], [3000, { type: 'blink' }],
  ] },
  { id: 'curious', label: '何か見つけた', description: '距離センサーの模擬入力で驚き、視線を動かします。', duration: 4000, steps: [
    [0, { type: 'sensor', distanceMm: 80 }], [500, { type: 'motion', gazeX: 8, gazeY: -3 }],
    [1600, { type: 'motion', gazeX: -8, gazeY: -3 }], [2800, { type: 'sensor', distanceMm: 600 }],
    [2800, { type: 'motion', gazeX: 0, gazeY: 0 }], [3000, { type: 'expression', value: 'happy' }],
  ] },
  { id: 'low-battery', label: '電池が少ない', description: '仮の1セル電池電圧を下げ、眠い表情への反応を確認します。', duration: 3000, steps: [
    [0, { type: 'sensor', batteryV: 4 }], [1000, { type: 'sensor', batteryV: 3.3 }], [1600, { type: 'motion', talk: false }],
  ] },
  { id: 'balance', label: '傾きで停止', description: '模擬IMUを35°に傾け、関節停止と停止状態の保持を確認します。歩行物理計算ではありません。', duration: 3000, steps: [
    [0, { type: 'joint', id: 'leftKnee', angle: 25 }], [0, { type: 'joint', id: 'rightKnee', angle: 25 }],
    [500, { type: 'sensor', pitch: 15 }], [1500, { type: 'sensor', pitch: 35 }],
  ] },
];
const scenarioById = Object.fromEntries(scenarios.map(scenario => [scenario.id, scenario]));
class ValidationError extends Error { constructor(message, status = 400) { super(message); this.name = 'ValidationError'; this.status = status; } }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} はオブジェクトで指定してください。`); }
function fields(value, allowed, required = []) {
  object(value, '入力');
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ValidationError('未対応のフィールドがあります。');
  if (required.some(key => !Object.hasOwn(value, key))) throw new ValidationError('必要なフィールドがありません。');
}
function number(value, min, max, label) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${label} は ${min}〜${max} の数値で指定してください。`); }
function bool(value, label) { if (typeof value !== 'boolean') throw new ValidationError(`${label} は true / false で指定してください。`); }
function named(value, choices, label) { if (typeof value !== 'string' || !choices.includes(value)) throw new ValidationError(`${label} が不明です。`); }
const commandFields = {
  expression: ['value', 'durationMs'], motion: ['talk', 'autoBlink', 'gazeX', 'gazeY'], blink: [],
  joint: ['id', 'angle'], sensor: ['pitch', 'roll', 'distanceMm', 'batteryV'], scenario: ['id'],
  pause: ['value'], step: ['ms'], stop: [], reset: [], record: ['action'], replay: ['recording'],
};
function validateCommand(command, { allowReplay = true } = {}) {
  object(command, 'コマンド');
  if (!Object.hasOwn(commandFields, command.type)) throw new ValidationError('未対応のコマンドです。');
  fields(command, ['type', ...commandFields[command.type]], ['type']);
  switch (command.type) {
    case 'expression': named(command.value, Object.keys(byId), '表情'); if (Object.hasOwn(command, 'durationMs')) number(command.durationMs, 0, 5000, '変化時間'); break;
    case 'motion':
      if (Object.keys(command).length < 2) throw new ValidationError('変更する動きを指定してください。');
      for (const key of ['talk', 'autoBlink']) if (Object.hasOwn(command, key)) bool(command[key], key);
      for (const key of ['gazeX', 'gazeY']) if (Object.hasOwn(command, key)) number(command[key], -8, 8, key);
      break;
    case 'joint': {
      const joint = jointDefinitions.find(item => item.id === command.id);
      if (!joint) throw new ValidationError('関節が不明です。');
      number(command.angle, joint.min, joint.max, '関節角度'); break;
    }
    case 'sensor':
      if (Object.keys(command).length < 2) throw new ValidationError('模擬入力を指定してください。');
      for (const key of ['pitch', 'roll']) if (Object.hasOwn(command, key)) number(command[key], -90, 90, key);
      if (Object.hasOwn(command, 'distanceMm')) number(command.distanceMm, 30, 2000, '距離');
      if (Object.hasOwn(command, 'batteryV')) number(command.batteryV, 3, 4.2, '電池電圧');
      break;
    case 'scenario': named(command.id, scenarios.map(s => s.id), 'シナリオ'); break;
    case 'pause': bool(command.value, '一時停止'); break;
    case 'step': number(command.ms, 1, 1000, 'ステップ時間'); break;
    case 'record': named(command.action, ['start', 'stop'], '記録操作'); break;
    case 'replay': if (!allowReplay) throw new ValidationError('記録内に再生操作を入れることはできません。'); validateRecording(command.recording); break;
    default: break;
  }
}
function validatePose(pose) {
  const poseFields = Object.keys(presets.expressions[0].pose);
  fields(pose, poseFields, poseFields);
  for (const key of poseFields) {
    const values = presets.expressions.map(e => e.pose[key]);
    number(pose[key], Math.min(...values), Math.max(...values), `顔の ${key}`);
  }
}
function validateSnapshot(snapshot) {
  const keys = ['timeMs', 'paused', 'stopped', 'expression', 'pose', 'transition', 'motion', 'joints', 'sensors', 'blinkAt', 'nextBlink', 'scenario'];
  fields(snapshot, keys, keys);
  number(snapshot.timeMs, 0, Number.MAX_SAFE_INTEGER, '時刻'); bool(snapshot.paused, '一時停止'); bool(snapshot.stopped, '停止');
  named(snapshot.expression, Object.keys(byId), '表情'); validatePose(snapshot.pose);
  fields(snapshot.transition, ['from', 'to', 'start', 'duration'], ['from', 'to', 'start', 'duration']);
  validatePose(snapshot.transition.from); validatePose(snapshot.transition.to);
  number(snapshot.transition.start, 0, snapshot.timeMs, '表情開始時刻'); number(snapshot.transition.duration, 0, 5000, '表情変化時間');
  fields(snapshot.motion, ['talk', 'autoBlink', 'gazeX', 'gazeY'], ['talk', 'autoBlink', 'gazeX', 'gazeY']);
  validateCommand({ type: 'motion', ...snapshot.motion });
  if (!Array.isArray(snapshot.joints) || snapshot.joints.length !== jointDefinitions.length) throw new ValidationError('関節状態の形式が違います。');
  snapshot.joints.forEach((joint, index) => {
    fields(joint, ['id', 'angle', 'target'], ['id', 'angle', 'target']);
    if (joint.id !== jointDefinitions[index].id) throw new ValidationError('関節の並びが違います。');
    validateCommand({ type: 'joint', id: joint.id, angle: joint.angle }); validateCommand({ type: 'joint', id: joint.id, angle: joint.target });
  });
  fields(snapshot.sensors, ['pitch', 'roll', 'distanceMm', 'batteryV'], ['pitch', 'roll', 'distanceMm', 'batteryV']);
  validateCommand({ type: 'sensor', ...snapshot.sensors });
  number(snapshot.blinkAt, -10000, snapshot.timeMs, 'まばたき時刻'); number(snapshot.nextBlink, snapshot.timeMs, Number.MAX_SAFE_INTEGER, '次のまばたき');
  fields(snapshot.scenario, ['id', 'running', 'index', 'startedAt'], ['id', 'running', 'index', 'startedAt']);
  const scenario = snapshot.scenario;
  if (scenario.id !== null) named(scenario.id, scenarios.map(s => s.id), 'シナリオ');
  bool(scenario.running, 'シナリオ実行中'); number(scenario.startedAt, 0, snapshot.timeMs, 'シナリオ開始');
  number(scenario.index, 0, scenario.id ? scenarioById[scenario.id].steps.length : 0, 'シナリオ位置');
  if (!Number.isInteger(scenario.index) || (scenario.running && (scenario.id === null || snapshot.stopped))) throw new ValidationError('シナリオ状態が不正です。');
  if (snapshot.stopped && snapshot.joints.some(j => j.angle !== j.target)) throw new ValidationError('停止中の関節に移動指示があります。');
  if (!snapshot.stopped && Math.max(Math.abs(snapshot.sensors.pitch), Math.abs(snapshot.sensors.roll)) > defaultProfile.limits.tiltStopDegrees) throw new ValidationError('傾きが停止閾値を超えた記録に停止状態がありません。');
}
function validateRecording(recording) {
  fields(recording, ['schemaVersion', 'profileId', 'initial', 'durationMs', 'commands'], ['schemaVersion', 'profileId', 'initial', 'durationMs', 'commands']);
  if (recording.schemaVersion !== 1 || recording.profileId !== defaultProfile.id) throw new ValidationError('このロボット用の記録ではありません。');
  validateSnapshot(recording.initial); number(recording.durationMs, 0, 3600000, '記録時間');
  if (!Array.isArray(recording.commands) || recording.commands.length > 5000) throw new ValidationError('記録は最大5000操作です。');
  let previous = 0;
  for (const entry of recording.commands) {
    fields(entry, ['atMs', 'command'], ['atMs', 'command']); number(entry.atMs, previous, recording.durationMs, '操作時刻'); previous = entry.atMs;
    if (['replay', 'record', 'reset'].includes(entry.command?.type)) throw new ValidationError('記録に未対応の操作が含まれています。');
    validateCommand(entry.command, { allowReplay: false });
  }
  // Validate command preconditions in a disposable runtime before touching the live one.
  const probe = new RobotRuntime({ validateReplay: false });
  probe._restore(recording.initial);
  let elapsed = 0;
  for (const entry of recording.commands) { probe.advance(entry.atMs - elapsed); elapsed = entry.atMs; probe.command(entry.command); }
  probe.advance(recording.durationMs - elapsed);
}

class RobotRuntime {
  constructor({ profile = defaultProfile, validateReplay = true } = {}) {
    this.profile = clone(profile); this._validateReplay = validateReplay;
    this.wallMs = 0; this.events = []; this.record = null; this.replay = null; this._reset();
  }
  _reset() {
    this.timeMs = 0; this.paused = false; this.stopped = false; this.expression = 'neutral';
    this.pose = clone(byId.neutral.pose); this.transition = { from: clone(this.pose), to: clone(this.pose), start: 0, duration: 0 };
    this.motion = { talk: false, autoBlink: true, gazeX: 0, gazeY: 0 };
    this.joints = jointDefinitions.map(j => ({ ...j, angle: 0, target: 0 }));
    this.sensors = { pitch: 0, roll: 0, distanceMm: 600, batteryV: 4 };
    this.blinkAt = -10000; this.nextBlink = 2400;
    this.scenario = { id: null, running: false, index: 0, startedAt: 0 };
  }
  _log(kind, message) { this.events.push({ timeMs: this.timeMs, kind, message }); if (this.events.length > 100) this.events.shift(); }
  _capture() {
    return clone({ timeMs: this.timeMs, paused: this.paused, stopped: this.stopped, expression: this.expression, pose: this.pose,
      transition: this.transition, motion: this.motion, joints: this.joints.map(({ id, angle, target }) => ({ id, angle, target })),
      sensors: this.sensors, blinkAt: this.blinkAt, nextBlink: Math.max(this.timeMs, this.nextBlink), scenario: this.scenario });
  }
  _restore(snapshot) {
    this._reset();
    const copy = clone(snapshot);
    for (const key of Object.keys(copy)) if (key !== 'joints') this[key] = copy[key];
    this.joints = jointDefinitions.map((def, i) => ({ ...def, ...copy.joints[i] }));
  }
  _setExpression(id, duration = 450) {
    this.expression = id; this.transition = { from: clone(this.pose), to: clone(byId[id].pose), start: this.timeMs, duration };
    if (!duration) this.pose = clone(byId[id].pose);
  }
  _halt(message) {
    this.stopped = true; this.scenario.running = false;
    for (const joint of this.joints) joint.target = joint.angle;
    this._log('stop', message);
  }
  _checkPrecondition(command) {
    if (this.stopped && ['joint', 'scenario', 'replay'].includes(command.type)) throw new ValidationError('停止中です。リセットしてから関節を操作してください。', 409);
    if (command.type === 'step' && !this.paused) throw new ValidationError('ステップ実行は一時停止中に使えます。', 409);
  }
  command(command) {
    validateCommand(command); this._checkPrecondition(command);
    if (command.type !== 'replay' && this.replay) { this.replay = null; this._log('replay', '手動操作で再生を終了'); }
    if (this.record?.active && !['record', 'replay', 'reset'].includes(command.type)) {
      this.record.commands.push({ atMs: this.wallMs - this.record.startedWall, command: clone(command) });
      if (this.record.commands.length >= 5000) {
        this.record.active = false; this.record.endedWall = this.wallMs;
        this._log('record', '5000操作の上限に達したため、記録を保存して停止');
      }
    }
    if (command.type === 'joint' && this.scenario.running) { this.scenario.running = false; this._log('scenario', '手動操作でシナリオを終了'); }
    this._apply(command); return this.state();
  }
  _apply(command) {
    switch (command.type) {
      case 'expression': this._setExpression(command.value, command.durationMs ?? 450); this._log('expression', `表情: ${byId[command.value].label}`); break;
      case 'motion':
        for (const key of ['talk', 'autoBlink', 'gazeX', 'gazeY']) if (Object.hasOwn(command, key)) this.motion[key] = command[key];
        if (command.autoBlink === true) this.nextBlink = this.timeMs + 2400;
        if (command.autoBlink === false) this.blinkAt = -10000;
        this._log('motion', '目・口の動きを更新'); break;
      case 'blink': this.blinkAt = this.timeMs; this.nextBlink = this.timeMs + 3000; this._log('motion', 'まばたき'); break;
      case 'joint': this.joints.find(j => j.id === command.id).target = command.angle; this._log('joint', `${jointDefinitions.find(j => j.id === command.id).label}: ${command.angle}°`); break;
      case 'sensor':
        for (const key of ['pitch', 'roll', 'distanceMm', 'batteryV']) if (Object.hasOwn(command, key)) this.sensors[key] = command[key];
        this._log('sensor', '模擬センサー値を更新');
        if (Math.max(Math.abs(this.sensors.pitch), Math.abs(this.sensors.roll)) > this.profile.limits.tiltStopDegrees) { this._setExpression('surprised'); this._halt('模擬IMU: 傾きが30°を超えたため関節停止'); }
        else if (this.sensors.batteryV < this.profile.limits.lowBatteryVolts) this._setExpression('sleepy');
        else if (this.sensors.distanceMm < this.profile.limits.nearDistanceMm) this._setExpression('surprised');
        break;
      case 'scenario':
        this.scenario = { id: command.id, running: true, index: 0, startedAt: this.timeMs };
        this._log('scenario', `${scenarioById[command.id].label} を開始`); this._runDueScenario(); break;
      case 'pause': this.paused = command.value; this._log('clock', this.paused ? '一時停止' : '再開'); break;
      case 'step': this._advanceSim(command.ms); this._log('clock', `${command.ms} ms進めた`); break;
      case 'stop': this._halt('停止ボタン: 関節を停止。解除はリセット。'); break;
      case 'reset': this._reset(); this.record = null; this.replay = null; this.events = []; this._log('reset', '初期状態にリセット'); break;
      case 'record':
        if (command.action === 'start') { this.record = { active: true, startedWall: this.wallMs, endedWall: this.wallMs, initial: this._capture(), commands: [] }; this._log('record', '操作の記録を開始'); }
        else if (this.record) { this.record.active = false; this.record.endedWall = this.wallMs; this._log('record', '操作の記録を停止'); }
        break;
      case 'replay':
        this._restore(command.recording.initial); this.record = null; this.events = [];
        this.replay = { data: clone(command.recording), startedWall: this.wallMs, index: 0 };
        this._log('replay', '記録を再生'); this._runDueReplay(); break;
      default: throw new ValidationError('未対応のコマンドです。');
    }
  }
  _runDueScenario() {
    const current = this.scenario;
    if (!current.running) return;
    const definition = scenarioById[current.id];
    while (current.running && current.index < definition.steps.length && current.startedAt + definition.steps[current.index][0] <= this.timeMs) {
      const command = definition.steps[current.index++][1]; this._apply(command);
    }
    if (current.running && this.timeMs >= current.startedAt + definition.duration) { current.running = false; this._log('scenario', 'シナリオ完了'); }
  }
  _updateTo(time) {
    const delta = time - this.timeMs;
    if (!this.stopped) for (const joint of this.joints) {
      const distance = joint.target - joint.angle, step = this.profile.limits.jointSpeedDegPerSec * delta / 1000;
      joint.angle += Math.sign(distance) * Math.min(Math.abs(distance), step);
    }
    this.timeMs = time;
    const transition = this.transition;
    const t = transition.duration ? Math.min(1, Math.max(0, (time - transition.start) / transition.duration)) : 1;
    const smooth = t * t * (3 - 2 * t);
    this.pose = Object.fromEntries(Object.keys(transition.from).map(key => [key, transition.from[key] + (transition.to[key] - transition.from[key]) * smooth]));
    if (this.motion.autoBlink && this.nextBlink <= time) {
      this.blinkAt = this.nextBlink + Math.floor((time - this.nextBlink) / 3000) * 3000; this.nextBlink = this.blinkAt + 3000;
    }
  }
  _advanceSim(ms) {
    const end = this.timeMs + ms;
    while (this.scenario.running) {
      const s = this.scenario, definition = scenarioById[s.id];
      const next = s.startedAt + (definition.steps[s.index]?.[0] ?? definition.duration);
      if (next > end) break;
      this._updateTo(Math.max(this.timeMs, next)); this._runDueScenario();
    }
    this._updateTo(end);
  }
  _runDueReplay() {
    const playback = this.replay;
    if (!playback) return;
    // Compare the same absolute timestamps used by advance(). Subtracting the
    // start time here can round a boundary down and leave the scheduler stuck.
    while (playback.index < playback.data.commands.length && playback.startedWall + playback.data.commands[playback.index].atMs <= this.wallMs) {
      const command = playback.data.commands[playback.index++].command;
      if (command.type === 'joint' && this.scenario.running) this.scenario.running = false;
      this._apply(command);
    }
    if (this.wallMs >= playback.startedWall + playback.data.durationMs && playback.index === playback.data.commands.length) { this.replay = null; this._log('replay', '記録の再生完了'); }
  }
  advance(ms) {
    number(ms, 0, 3600000, '経過時間');
    const end = this.wallMs + ms;
    while (this.replay) {
      const replay = this.replay;
      const next = replay.startedWall + (replay.data.commands[replay.index]?.atMs ?? replay.data.durationMs);
      if (next > end) break;
      const step = Math.max(0, next - this.wallMs);
      if (!this.paused) this._advanceSim(step);
      this.wallMs = Math.max(this.wallMs, next); this._runDueReplay();
    }
    const rest = end - this.wallMs;
    if (!this.paused) this._advanceSim(rest);
    this.wallMs = end;
    if (this.record?.active && this.wallMs - this.record.startedWall >= 3600000) {
      this.record.active = false;
      this.record.endedWall = this.record.startedWall + 3600000;
      this._log('record', '1時間の上限に達したため、記録を保存して停止');
    }
  }
  exportRecording() {
    if (!this.record) return { schemaVersion: 1, profileId: this.profile.id, initial: this._capture(), durationMs: 0, commands: [] };
    return clone({ schemaVersion: 1, profileId: this.profile.id, initial: this.record.initial,
      durationMs: (this.record.active ? this.wallMs : this.record.endedWall) - this.record.startedWall, commands: this.record.commands });
  }
  state() {
    const elapsed = this.timeMs - this.blinkAt;
    const blink = elapsed >= 0 && elapsed < 180 ? Math.sin(Math.PI * elapsed / 180) : 0;
    const talk = this.motion.talk ? (Math.sin(this.timeMs / 98) * .5 + .5) * (Math.sin(this.timeMs / 263) * .3 + .7) * 17 : 0;
    const display = this.profile.display, frameBytes = display.width * display.height * 2;
    return clone({ mode: 'simulation', timeMs: this.timeMs, paused: this.paused, stopped: this.stopped, expression: this.expression,
      pose: this.pose, effects: { blink, talk, gazeX: this.motion.gazeX, gazeY: this.motion.gazeY }, motion: this.motion,
      joints: this.joints, sensors: this.sensors, scenario: { id: this.scenario.id, running: this.scenario.running },
      profile: this.profile, events: this.events,
      metrics: { frameBytes, doubleBufferBytes: frameBytes * 2, targetFps: display.targetFps, spiClockHz: display.spiClockHz,
        theoreticalTransferMs: frameBytes * 8 / display.spiClockHz * 1000, hostRssBytes: process.memoryUsage().rss },
      recording: { active: Boolean(this.record?.active), count: this.record?.commands.length ?? 0 },
      replay: { running: Boolean(this.replay), index: this.replay?.index ?? 0 },
    });
  }
}
module.exports = { RobotRuntime, ValidationError, validateCommand, validateRecording, scenarios: scenarios.map(({ id, label, description }) => ({ id, label, description })), jointDefinitions };
