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
  assert.match(html, /sketch\.js\?v=2\.0\.1/);
  assert.match(html, /styles\.css\?v=2\.0\.1/);
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
