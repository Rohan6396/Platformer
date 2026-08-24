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

test('difficulty changes the generated challenge', async () => {
  const game = await gameContext();
  const explorer = game.GameLevels.createStage(5, 'easy');
  const overdrive = game.GameLevels.createStage(5, 'hard');
  const easyBoss = explorer.enemies.find((enemy) => enemy.boss);
  const hardBoss = overdrive.enemies.find((enemy) => enemy.boss);
  assert.ok(hardBoss.hp > easyBoss.hp);
  assert.ok(Math.abs(hardBoss.baseSpeed) > Math.abs(easyBoss.baseSpeed));
});

test('page exposes responsive, touch, settings, and accessible controls', async () => {
  const html = await source('index.html');
  const css = await source('styles.css');
  const input = await source('src/input.js');
  assert.match(html, /p5@2\.3\.1/);
  assert.match(html, /sketch\.js\?v=2\.0\.3/);
  assert.match(html, /styles\.css\?v=2\.0\.3/);
  assert.match(html, /id="touch-controls"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(css, /pointer: coarse/);
  assert.match(input, /navigator\.getGamepads/);
  assert.match(input, /requestFullscreen/);
});

test('public-facing copy uses the original Skybound Circuit identity', async () => {
  const combined = await Promise.all([
    'index.html', 'sketch.js', 'src/config.js', 'src/levels.js'
  ].map(source)).then((parts) => parts.join('\n'));
  assert.doesNotMatch(combined, /Star Wars|lightsaber|dark side|light side|the Force/i);
  assert.match(combined, /Skybound Circuit DX/i);
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
  const parameter = () => ({
    cancelScheduledValues() {},
    setTargetAtTime() {},
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
    createGain() { return { gain: parameter(), connect() {} }; }
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

  instances[0].state = 'suspended';
  listeners.pointerdown();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(instances[0].resumeCalls, 2);
});
