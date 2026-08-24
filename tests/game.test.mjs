import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

async function source(path) {
  return readFile(resolve(root, path), 'utf8');
}

async function gameContext() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  vm.runInContext(await source('src/levels.js'), context, { filename: 'levels.js' });
  return context.window;
}

test('ships six distinct stages with bosses and three shards each', async () => {
  const game = await gameContext();
  assert.equal(game.GameConfig.stages.length, 6);
  assert.equal(new Set(game.GameConfig.stages.map((stage) => stage.id)).size, 6);
  assert.equal(new Set(game.GameConfig.stages.map((stage) => stage.bossName)).size, 6);

  game.GameConfig.stages.forEach((_stage, index) => {
    const world = game.GameLevels.createStage(index, 'normal');
    assert.equal(world.shards.length, 3);
    assert.equal(world.enemies.filter((enemy) => enemy.boss).length, 1);
    assert.ok(world.solids.length >= 12);
    assert.ok(world.hazards.length >= 5);
    assert.ok(world.coins.length >= 20);
  });
});

test('every stage contains two mandatory Imperial combat blockades', async () => {
  const game = await gameContext();
  game.GameConfig.stages.forEach((_stage, index) => {
    const world = game.GameLevels.createStage(index, 'normal');
    const gates = world.solids.filter((solid) => solid.arenaGate);
    const elites = world.enemies.filter((enemy) => enemy.elite);
    assert.equal(gates.length, 2);
    assert.equal(elites.length, 4);
    gates.forEach((gate) => {
      assert.ok(gate.y <= 72, 'combat gates must be too tall to jump over');
      assert.equal(elites.filter((enemy) => enemy.arenaId === gate.arenaGate).length, 2);
    });
  });
});

test('checkpoint spawn corridors are clear of every damaging hazard', async () => {
  const game = await gameContext();
  game.GameConfig.stages.forEach((_stage, index) => {
    const world = game.GameLevels.createStage(index, 'normal');
    const checkpoint = world.checkpoint;
    const spawnLeft = checkpoint.x + 42;
    const spawnRight = checkpoint.x + 138;
    world.hazards.filter((hazard) => hazard.type !== 'vent').forEach((hazard) => {
      const separated = spawnRight + checkpoint.safeRadius < hazard.x ||
        spawnLeft - checkpoint.safeRadius > hazard.x + hazard.w;
      assert.ok(separated, `stage ${index + 1} checkpoint overlaps ${hazard.type} safety radius`);
    });
    world.solids.filter((solid) => solid.arenaGate).forEach((gate) => {
      const separated = spawnRight < gate.x || spawnLeft > gate.x + gate.w;
      assert.ok(separated, `stage ${index + 1} checkpoint spawn overlaps an Imperial gate`);
    });
  });
});

test('difficulty changes the generated challenge', async () => {
  const game = await gameContext();
  const explorer = game.GameLevels.createStage(5, 'easy');
  const overdrive = game.GameLevels.createStage(5, 'hard');
  const easyBoss = explorer.enemies.find((enemy) => enemy.boss);
  const hardBoss = overdrive.enemies.find((enemy) => enemy.boss);
  const earlyEnemy = game.GameLevels.createStage(0, 'normal').enemies.find((enemy) => !enemy.boss && !enemy.elite);
  const lateEnemy = game.GameLevels.createStage(5, 'normal').enemies.find((enemy) => !enemy.boss && !enemy.elite);
  assert.ok(hardBoss.hp > easyBoss.hp);
  assert.ok(Math.abs(hardBoss.baseSpeed) > Math.abs(easyBoss.baseSpeed));
  assert.ok(hardBoss.attackRate > easyBoss.attackRate);
  assert.ok(hardBoss.spreadBonus > easyBoss.spreadBonus);
  assert.ok(lateEnemy.hp > earlyEnemy.hp);
  assert.ok(game.GameConfig.stages.every((stage) => stage.parTime >= 112));
});

test('page exposes responsive, touch, settings, and accessible controls', async () => {
  const html = await source('index.html');
  const css = await source('styles.css');
  const input = await source('src/input.js');
  const sketch = await source('sketch.js');
  assert.match(html, /p5@2\.3\.1/);
  assert.match(html, /sketch\.js\?v=2\.1\.1/);
  assert.match(html, /styles\.css\?v=2\.1\.1/);
  assert.match(html, /id="touch-controls"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(css, /pointer: coarse/);
  assert.match(input, /navigator\.getGamepads/);
  assert.match(input, /requestFullscreen/);
  assert.match(sketch, /runTime \+= step \/ 60/);
});

test('difficulty and volume controls update settings, labels, and audio preview', async () => {
  function fakeElement(initial = {}) {
    const listeners = {};
    return {
      value: '', checked: false, textContent: '', dataset: {}, open: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
      dispatch(type) { (listeners[type] || []).forEach((listener) => listener({ preventDefault() {} })); },
      setAttribute() {}, showModal() { this.open = true; }, close() { this.open = false; this.dispatch('close'); },
      ...initial
    };
  }

  const elements = {
    'settings-dialog': fakeElement(),
    'settings-button': fakeElement(),
    'mute-button': fakeElement(),
    'fullscreen-button': fakeElement(),
    'difficulty-select': fakeElement(),
    'volume-range': fakeElement(),
    'difficulty-value': fakeElement(),
    'volume-value': fakeElement(),
    'reduced-motion': fakeElement(),
    'high-contrast': fakeElement(),
    'reset-progress': fakeElement()
  };
  const dispatched = [];
  const saved = [];
  const context = vm.createContext({
    window: {
      addEventListener() {},
      dispatchEvent: (event) => { dispatched.push(event); }
    },
    document: {
      body: { classList: { toggle() {} } },
      addEventListener() {},
      getElementById: (id) => elements[id],
      querySelectorAll: () => [],
      querySelector: () => null,
      fullscreenElement: null
    },
    navigator: { getGamepads: () => [] },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    console
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings, muted: true }),
    saveSettings: (settings) => { saved.push(JSON.parse(JSON.stringify(settings))); },
    resetProgress() {}
  };
  vm.runInContext(await source('src/input.js'), context, { filename: 'input.js' });
  context.window.GameInput.install();

  elements['difficulty-select'].value = 'hard';
  elements['difficulty-select'].dispatch('change');
  const difficultyEvent = dispatched.find((event) => event.type === 'game-settings-changed');
  assert.equal(context.window.GameInput.getSettings().difficulty, 'hard');
  assert.equal(elements['difficulty-value'].textContent, 'Overdrive');

  elements['volume-range'].value = '0.25';
  elements['volume-range'].dispatch('input');
  assert.equal(context.window.GameInput.getSettings().volume, 0.25);
  assert.equal(context.window.GameInput.getSettings().muted, false);
  assert.equal(elements['volume-value'].textContent, '25%');
  assert.equal(elements['mute-button'].textContent, 'Sound on');
  assert.ok(dispatched.some((event) => event.type === 'game-audio-preview'));
  assert.equal(difficultyEvent.detail.volume, 0.65, 'settings events should be immutable snapshots');
  assert.equal(saved.at(-1).volume, 0.25);
});

test('public-facing copy restores its Star Wars fan identity and disclaimer', async () => {
  const combined = await Promise.all([
    'index.html', 'sketch.js', 'src/config.js', 'src/levels.js'
  ].map(source)).then((parts) => parts.join('\n'));
  assert.match(combined, /Skybound Circuit DX/i);
  assert.match(combined, /Star Wars/i);
  assert.match(combined, /lightsaber/i);
  assert.match(combined, /dark side/i);
  assert.match(combined, /light side/i);
  assert.match(combined, /Force/i);
  assert.match(combined, /unofficial/i);
  assert.match(combined, /not affiliated/i);
});

test('taking damage does not leave the player permanently crouched', async () => {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: {},
    navigator: {},
    console
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings }),
    loadProgress: () => ({ unlockedStages: 1, selectedStage: 0, selectedCharacter: 0 })
  };
  vm.runInContext(await source('sketch.js'), context, { filename: 'sketch.js' });

  context.damagedPlayer = {
    big: false,
    x: 100,
    y: 100,
    w: 32,
    h: 44,
    onGround: true,
    crouching: false
  };
  vm.runInContext('updatePlayerSize(damagedPlayer, false)', context);
  assert.equal(context.damagedPlayer.h, 30);
  assert.equal(context.damagedPlayer.y, 114);
  assert.equal(context.damagedPlayer.crouching, false);

  context.crouchingPlayer = {
    big: true,
    x: 100,
    y: 100,
    w: 32,
    h: 44,
    onGround: true,
    crouching: false
  };
  vm.runInContext('updatePlayerSize(crouchingPlayer, true)', context);
  assert.equal(context.crouchingPlayer.crouching, true);
});

test('Imperial gates unlock after their guards fall and bosses launch shockwaves', async () => {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: {},
    navigator: {},
    console,
    max: Math.max
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings }),
    loadProgress: () => ({ unlockedStages: 1, selectedStage: 0, selectedCharacter: 0 })
  };
  vm.runInContext(await source('sketch.js'), context, { filename: 'sketch.js' });
  vm.runInContext(`
    world = {
      gateOpen: false,
      enemies: [{ alive: true, arenaId: 'blockade-1' }],
      enemyProjectiles: []
    };
    window.testGate = { kind: 'gate', arenaGate: 'blockade-1' };
    window.gateLocked = activeSolid(window.testGate);
    world.enemies[0].alive = false;
    window.gateUnlocked = !activeSolid(window.testGate);

    selectedStage = 5;
    players = [{ active: true, alive: true, x: 3500, y: 370, w: 32, h: 44 }];
    spawnBurst = () => {};
    GameAudio = { sfx() {} };
    window.testBoss = {
      x: 3740, y: 360, w: 78, h: 78, frozenTimer: 0,
      attackTimer: 0, attackCycle: 2, attackRate: 1.4, spreadBonus: 1
    };
    updateBossAttack(window.testBoss, 1);
    window.projectileKinds = world.enemyProjectiles.map((projectile) => projectile.kind);
  `, context);
  assert.equal(context.window.gateLocked, true);
  assert.equal(context.window.gateUnlocked, true);
  assert.ok(context.window.projectileKinds.filter((kind) => kind === 'bolt').length >= 4, JSON.stringify(context.window.projectileKinds));
  assert.equal(context.window.projectileKinds.filter((kind) => kind === 'shockwave').length, 2);
});

test('closing settings applies a new difficulty by restarting the active stage', async () => {
  const listeners = {};
  const context = vm.createContext({
    window: { addEventListener: (type, listener) => { listeners[type] = listener; } },
    document: { getElementById: () => null }, navigator: {}, console
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings }),
    loadProgress: () => ({ unlockedStages: 1, selectedStage: 0, selectedCharacter: 0 })
  };
  vm.runInContext(await source('sketch.js'), context, { filename: 'sketch.js' });
  vm.runInContext(`
    installGameEvents();
    scene = 'pause';
    resumeAfterSettings = true;
    startRun = () => { window.restartedOnDifficulty = settings.difficulty; };
  `, context);
  listeners['game-settings-changed']({ detail: { ...context.GameConfig.defaultSettings, difficulty: 'hard' } });
  listeners['game-settings-closed']({ detail: { difficultyChanged: true } });
  assert.equal(context.window.restartedOnDifficulty, 'hard');
});

test('Enter on the win screen immediately starts the next unlocked stage', async () => {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { getElementById: () => null },
    navigator: {},
    console,
    min: Math.min,
    ENTER: 13,
    key: '',
    keyCode: 13
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings }),
    loadProgress: () => ({ unlockedStages: 1, selectedStage: 0, selectedCharacter: 0 }),
    saveProgress: (progress) => { context.savedStage = progress.selectedStage; }
  };
  vm.runInContext(await source('sketch.js'), context, { filename: 'sketch.js' });
  vm.runInContext(`
    selectedStage = 0;
    progress = { unlockedStages: 2, selectedStage: 1, selectedCharacter: 0 };
    scene = 'win';
    startRun = () => { window.startedStage = selectedStage; };
    keyPressed();
  `, context);
  assert.equal(context.window.startedStage, 1);
  assert.equal(context.savedStage, 1);
});

test('music resumes from a suspended browser audio context and schedules notes', async () => {
  const instances = [];
  const gainNodes = [];
  const parameter = () => ({
    targets: [],
    cancelScheduledValues() {},
    setTargetAtTime(value, time, constant) { this.targets.push({ value, time, constant }); },
    setValueAtTime() {},
    exponentialRampToValueAtTime() {}
  });
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.resumeCalls = 0;
      this.oscillatorStarts = 0;
      this.destination = {};
      instances.push(this);
    }
    createGain() {
      const node = { gain: parameter(), connect() {} };
      gainNodes.push(node);
      return node;
    }
    createOscillator() {
      return {
        frequency: parameter(),
        connect() {},
        start: () => { this.oscillatorStarts++; },
        stop() {}
      };
    }
    resume() {
      this.resumeCalls++;
      this.state = 'running';
      return Promise.resolve();
    }
  }

  const listeners = {};
  const context = vm.createContext({
    window: {
      AudioContext: FakeAudioContext,
      addEventListener: (type, listener) => { listeners[type] = listener; }
    },
    GameStorage: {
      loadSettings: () => ({ muted: false, volume: 0.65 })
    },
    console,
    Promise,
    Math
  });
  vm.runInContext(await source('src/audio.js'), context, { filename: 'audio.js' });
  context.GameAudio = context.window.GameAudio;

  assert.equal(context.GameAudio.start(), true);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  context.GameAudio.updateMusic(0, true);
  assert.equal(instances[0].resumeCalls, 1);
  assert.ok(instances[0].oscillatorStarts >= 2);

  context.GameAudio.applySettings({ muted: false, volume: 0.2 });
  assert.equal(gainNodes[0].gain.targets.at(-1).value, 0.2);
  const startsBeforePreview = instances[0].oscillatorStarts;
  listeners['game-audio-preview']();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(instances[0].oscillatorStarts > startsBeforePreview);

  instances[0].state = 'suspended';
  listeners.pointerdown();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(instances[0].resumeCalls, 2);
});
