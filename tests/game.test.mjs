import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  assert.match(html, /sketch\.js\?v=2\.2\.3/);
  assert.match(html, /styles\.css\?v=2\.2\.3/);
  assert.match(html, /id="touch-controls"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(html, /id="difficulty-hard"/);
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
    'difficulty-easy': fakeElement({ dataset: { difficulty: 'easy' } }),
    'difficulty-normal': fakeElement({ dataset: { difficulty: 'normal' } }),
    'difficulty-hard': fakeElement({ dataset: { difficulty: 'hard' } }),
    'volume-range': fakeElement(),
    'difficulty-value': fakeElement(),
    'volume-value': fakeElement(),
    'music-status': fakeElement(),
    'music-test': fakeElement(),
    'sfx-status': fakeElement(),
    'sfx-test': fakeElement(),
    'reduced-motion': fakeElement(),
    'high-contrast': fakeElement(),
    'reset-progress': fakeElement()
  };
  const dispatched = [];
  const saved = [];
  const windowListeners = {};
  const context = vm.createContext({
    window: {
      addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
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

  elements['difficulty-hard'].dispatch('click');
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

  elements['settings-dialog'].open = true;
  let controlPrevented = false;
  windowListeners.keydown[0]({
    code: 'ArrowDown', target: { tagName: 'BUTTON' },
    preventDefault() { controlPrevented = true; }
  });
  assert.equal(controlPrevented, false, 'game controls must not block keyboard use of the difficulty buttons');

  elements['settings-dialog'].open = false;
  windowListeners.keydown[0]({ code: 'ArrowRight', repeat: false, preventDefault() {} });
  assert.ok(dispatched.some((event) => event.type === 'game-key-command' && event.detail.code === 'ArrowRight'));
  const commandCount = dispatched.filter((event) => event.type === 'game-key-command').length;
  windowListeners.keydown[0]({ code: 'ArrowRight', repeat: true, preventDefault() {} });
  assert.equal(dispatched.filter((event) => event.type === 'game-key-command').length, commandCount, 'held keys must not repeat scene commands');

  elements['music-test'].dispatch('click');
  assert.ok(dispatched.some((event) => event.type === 'game-audio-test'));
  elements['sfx-test'].dispatch('click');
  assert.ok(dispatched.some((event) => event.type === 'game-sfx-test'));
  windowListeners['game-sfx-played'][0]({ detail: 'zap' });
  assert.equal(elements['sfx-status'].textContent, 'Lightning played');
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

test('dark-side attacks sustain visible branching Force lightning while held', async () => {
  const sketch = await source('sketch.js');
  assert.match(sketch, /player\.powers\.storm > 0 && player\.attackCooldown <= 0/);
  assert.match(sketch, /player\.stormTargets =/);
  assert.match(sketch, /function drawForceEffects\(\)/);
  assert.match(sketch, /function drawLightningBolt\(start, target, boltIndex\)/);
  assert.match(sketch, /GameAudio\.sfx\('zap'\)/);
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

test('Imperial gates unlock and bosses only attack players near their arena', async () => {
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

    world.enemyProjectiles = [];
    players = [{ active: true, alive: true, x: 120, y: 370, w: 32, h: 44 }];
    window.testBoss.attackTimer = 0;
    updateBossAttack(window.testBoss, 1);
    window.offscreenProjectileCount = world.enemyProjectiles.length;
    window.offscreenAttackTimer = window.testBoss.attackTimer;
  `, context);
  assert.equal(context.window.gateLocked, true);
  assert.equal(context.window.gateUnlocked, true);
  assert.ok(context.window.projectileKinds.filter((kind) => kind === 'bolt').length >= 4, JSON.stringify(context.window.projectileKinds));
  assert.equal(context.window.projectileKinds.filter((kind) => kind === 'shockwave').length, 2);
  assert.equal(context.window.offscreenProjectileCount, 0);
  assert.equal(context.window.offscreenAttackTimer, 30, 'off-screen boss timer is held until the player reaches the arena');
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

test('the settings dialog allows native keyboard events for its controls', async () => {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { getElementById: () => ({ open: true }) },
    navigator: {}, console
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings }),
    loadProgress: () => ({ unlockedStages: 1, selectedStage: 0, selectedCharacter: 0 })
  };
  vm.runInContext(await source('sketch.js'), context, { filename: 'sketch.js' });
  assert.equal(vm.runInContext('keyPressed()', context), true);
  assert.equal(vm.runInContext('keyReleased()', context), true);
});

test('Enter on the win screen immediately starts the next unlocked stage', async () => {
  const listeners = {};
  const context = vm.createContext({
    window: { addEventListener: (type, listener) => { listeners[type] = listener; } },
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
    installGameEvents();
    selectedStage = 0;
    progress = { unlockedStages: 2, selectedStage: 1, selectedCharacter: 0 };
    scene = 'win';
    startRun = () => { window.startedStage = selectedStage; };
  `, context);
  listeners['game-key-command']({ detail: { code: 'Enter' } });
  assert.equal(context.window.startedStage, 1);
  assert.equal(context.savedStage, 1);
});

test('arrow keys select either Force path and Enter confirms it', async () => {
  const listeners = {};
  const context = vm.createContext({
    window: { addEventListener: (type, listener) => { listeners[type] = listener; } },
    document: { getElementById: () => null },
    navigator: {}, console,
    min: Math.min, max: Math.max
  });
  vm.runInContext(await source('src/config.js'), context, { filename: 'config.js' });
  context.GameConfig = context.window.GameConfig;
  context.GameStorage = {
    loadSettings: () => ({ ...context.GameConfig.defaultSettings }),
    loadProgress: () => ({ unlockedStages: 1, selectedStage: 0, selectedCharacter: 0 })
  };
  context.GameInput = { clear() {} };
  vm.runInContext(await source('sketch.js'), context, { filename: 'sketch.js' });
  vm.runInContext(`
    installGameEvents();
    scene = 'choice';
    pendingChoice = { playerId: 0, selected: 'storm' };
    players = [{ name: 'P1', lives: 2, maxLives: 3, powers: { storm: 0, gale: 0 } }];
  `, context);
  listeners['game-key-command']({ detail: { code: 'ArrowRight' } });
  assert.equal(vm.runInContext('pendingChoice.selected', context), 'gale');
  listeners['game-key-command']({ detail: { code: 'ArrowLeft' } });
  assert.equal(vm.runInContext('pendingChoice.selected', context), 'storm');
  listeners['game-key-command']({ detail: { code: 'ArrowRight' } });
  listeners['game-key-command']({ detail: { code: 'Enter' } });
  assert.equal(vm.runInContext('scene', context), 'playing');
  assert.ok(vm.runInContext('players[0].powers.gale > 0', context));
});

test('music uses the bundled CC0 MP3 as a recoverable continuous loop', async () => {
  const mediaInstances = [];
  const listeners = {};
  const statuses = [];
  const previewStates = [];
  const playedEffects = [];
  class FakeAudio {
    constructor() {
      this.paused = true;
      this.listeners = {};
      this.playCalls = 0;
      this.currentTime = 0;
      mediaInstances.push(this);
    }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    load() {}
    pause() { this.paused = true; this.listeners.pause?.(); }
    play() {
      this.playCalls++;
      this.paused = false;
      this.listeners.playing?.();
      return Promise.resolve();
    }
  }
  const context = vm.createContext({
    window: {
      Audio: FakeAudio,
      Blob: class FakeBlob { constructor(parts, options) { this.parts = parts; this.type = options.type; } },
      URL: { createObjectURL: () => 'blob:sfx', revokeObjectURL() {} },
      addEventListener: (type, listener) => { listeners[type] = listener; },
      dispatchEvent: (event) => {
        if (event.type === 'game-audio-status') statuses.push(event.detail);
        if (event.type === 'game-music-preview') previewStates.push(event.detail);
        if (event.type === 'game-sfx-played') playedEffects.push(event.detail);
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    GameStorage: { loadSettings: () => ({ muted: false, volume: 0.65 }) },
    console, Promise, Math, Date
  });
  vm.runInContext(await source('src/audio.js'), context, { filename: 'audio.js' });
  const audio = context.window.GameAudio;
  assert.equal(audio.start(2), true);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mediaInstances.length, 1);
  assert.equal(mediaInstances[0].loop, true);
  assert.equal(mediaInstances[0].src, 'assets/audio/platformer-stage1.mp3?v=2.2.3');
  assert.equal(mediaInstances[0].playCalls, 1);
  assert.ok(statuses.includes('Playing'));

  audio.applySettings({ muted: false, volume: 0.5 });
  assert.equal(mediaInstances[0].volume, 0.29);
  mediaInstances[0].paused = true;
  listeners['game-audio-test']();
  await Promise.resolve();
  assert.ok(mediaInstances[0].playCalls >= 2);
  assert.equal(previewStates.at(-1), true);
  listeners['game-audio-test']();
  assert.equal(previewStates.at(-1), false);
  assert.equal(mediaInstances[0].paused, true, 'preview only stops when explicitly toggled off');
  assert.equal(statuses.at(-1), 'Ready');
  assert.doesNotMatch(await source('src/audio.js'), /musicPreviewUntil|4200/);

  listeners['game-sfx-test']();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mediaInstances.length, 4, 'lightning uses a three-voice HTML media pool');
  assert.ok(playedEffects.includes('zap'));
});

test('sound effects resume a suspended browser audio context instead of being dropped', async () => {
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

  assert.equal(context.GameAudio.sfx('menu'), true);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(instances[0].resumeCalls, 1);
  assert.ok(instances[0].oscillatorStarts >= 1);

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

test('bundled soundtrack retains its CC0 source and checksum provenance', async () => {
  const audio = await readFile(resolve(root, 'assets/audio/platformer-stage1.mp3'));
  const provenance = await source('assets/audio/README.md');
  assert.equal(audio[0], 0xff);
  assert.equal(audio[1] & 0xe0, 0xe0, 'file begins with an MPEG audio frame sync');
  assert.ok(audio.length > 500_000);
  assert.equal(createHash('sha256').update(audio).digest('hex'), 'fbba1e82e025ee1b5f9e96d983cadc4ad65a81db4d5c5269de5c63ee8c441e3e');
  assert.match(provenance, /Guy G\. Gamerson/);
  assert.match(provenance, /CC0 1\.0 Universal/);
  assert.match(provenance, /fbba1e82e025ee1b5f9e96d983cadc4ad65a81db4d5c5269de5c63ee8c441e3e/);
});

test('landing effects require a real fall and ignore one-frame ground jitter', async () => {
  const sketch = await source('sketch.js');
  const audio = await source('src/audio.js');
  assert.match(sketch, /airborneTimer >= 5 && impactVelocity >= 3/);
  assert.match(sketch, /if \(player\.onGround\) player\.airborneTimer = 0/);
  assert.match(audio, /land: \{ duration: 0\.07, tones: \[\[240, 165, 'triangle'/);
});
