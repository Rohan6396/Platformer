'use strict';

const CFG = GameConfig;
const W = CFG.WIDTH;
const H = CFG.HEIGHT;
const GROUND = CFG.GROUND_Y;

let scene = 'menu';
let gameMode = 'single';
let selectedStage = 0;
let selectedCharacter = 0;
let selectedPath = 'storm';
let settings = GameStorage.loadSettings();
let progress = GameStorage.loadProgress();
let world = null;
let players = [];
let cameraX = 0;
let gameFrame = 0;
let runTime = 0;
let checkpointX = 120;
let message = '';
let messageTimer = 0;
let particles = [];
let screenShake = 0;
let hitStop = 0;
let pendingChoice = null;
let finishCountdown = -1;
let result = null;
let stageStats = null;
let menuButtons = [];
let choiceButtons = [];
let pauseButtons = [];
let stars = [];
let motes = [];
let lastGamepadPause = false;
let resumeAfterSettings = false;

function setup() {
  const renderer = createCanvas(W, H);
  renderer.parent('canvas-mount');
  renderer.elt.tabIndex = 0;
  renderer.elt.setAttribute('role', 'application');
  renderer.elt.setAttribute('aria-label', 'Skybound Circuit DX game. Use the keyboard, touch controls, or a gamepad.');
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  textFont('monospace');
  frameRate(60);
  GameInput.install();
  installGameEvents();
  selectedStage = progress.selectedStage;
  selectedCharacter = getValidCharacterIndex(progress.selectedCharacter);
  buildMenuButtons();
  buildChoiceButtons();
  buildPauseButtons();
  buildAtmosphere();
  loadPreview();
  showMessage('Choose a stage, pilot, and mode. Then launch.');
}

function installGameEvents() {
  window.addEventListener('game-key-command', (event) => handleSceneCommand(event.detail?.code));
  window.addEventListener('game-settings-changed', (event) => {
    const previousDifficulty = settings.difficulty;
    settings = event.detail;
    if (previousDifficulty !== settings.difficulty) {
      if (scene === 'menu') loadPreview();
      showMessage(`Difficulty set to ${CFG.difficulties[settings.difficulty].label}.`);
    }
  });
  window.addEventListener('game-autopause', (event) => {
    if (scene === 'playing') {
      scene = 'pause';
      resumeAfterSettings = event.detail?.source === 'settings';
      showMessage('Auto-paused.');
    }
  });
  window.addEventListener('game-settings-closed', (event) => {
    const difficultyChanged = Boolean(event.detail?.difficultyChanged);
    if (difficultyChanged && scene !== 'menu') {
      resumeAfterSettings = false;
      startRun();
      showMessage(`${CFG.difficulties[settings.difficulty].label} difficulty applied. Stage restarted.`);
      return;
    }
    if (resumeAfterSettings && scene === 'pause') {
      resumeAfterSettings = false;
      scene = 'playing';
      GameInput.clear();
      GameAudio.start(selectedStage);
      showMessage('Settings applied.');
    }
  });
  window.addEventListener('game-progress-reset', () => {
    progress = GameStorage.loadProgress();
    selectedStage = 0;
    selectedCharacter = 0;
    scene = 'menu';
    loadPreview();
    showMessage('Progress reset. Sunmeadow Launch is ready.');
  });
  window.addEventListener('game-message', (event) => showMessage(String(event.detail || '')));
}

function draw() {
  const step = constrain(deltaTime / (1000 / 60), 0.25, 1.8);
  GameInput.pollGamepads();
  handleGamepadPause();
  GameAudio.updateMusic(selectedStage, scene === 'playing' || scene === 'pause' || scene === 'choice');

  if (scene === 'playing' && hitStop <= 0) updateGame(step);
  else if (hitStop > 0) hitStop -= step;

  updateParticles(step);
  if (messageTimer > 0 && scene !== 'pause' && scene !== 'choice') messageTimer -= step;
  screenShake = max(0, screenShake - 0.55 * step);
  drawGame();
}

function handleGamepadPause() {
  const down = Boolean(navigator.getGamepads && Array.from(navigator.getGamepads()).filter(Boolean).some((pad) => pad.buttons[9]?.pressed));
  if (down && !lastGamepadPause) togglePause();
  lastGamepadPause = down;
}

function buildAtmosphere() {
  randomSeed(9137 + selectedStage * 101);
  stars = Array.from({ length: 90 }, () => ({ x: random(W), y: random(30, 330), s: random(1, 3), phase: random(TWO_PI) }));
  motes = Array.from({ length: 48 }, (_, index) => ({ x: random(W + 160), y: random(H), s: random(1.5, 4), speed: random(0.25, 1.1), phase: index * 0.71 }));
}

function getValidCharacterIndex(requested) {
  const character = CFG.characters[requested] || CFG.characters[0];
  return progress.unlockedStages >= character.unlockStage ? requested : 0;
}

function loadPreview() {
  world = GameLevels.createStage(selectedStage, settings.difficulty);
  players = createPlayers(150);
  cameraX = 0;
  particles = [];
  buildAtmosphere();
}

function startRun() {
  settings = GameInput.getSettings();
  world = GameLevels.createStage(selectedStage, settings.difficulty);
  checkpointX = 120;
  players = createPlayers(checkpointX);
  cameraX = 0;
  gameFrame = 0;
  runTime = 0;
  particles = [];
  screenShake = 0;
  hitStop = 0;
  pendingChoice = null;
  finishCountdown = -1;
  result = null;
  stageStats = { retries: 0, rescuedFinish: false, bossDefeated: false, damageTaken: 0 };
  scene = 'playing';
  GameInput.clear();
  GameAudio.start(selectedStage);
  GameAudio.resetMusic();
  showMessage(`${CFG.stages[selectedStage].name}: ${CFG.stages[selectedStage].story}`);
  document.querySelector('#canvas-mount canvas')?.focus();
}

function createPlayers(spawnX) {
  const character = CFG.characters[selectedCharacter];
  const startingLives = CFG.difficulties[settings.difficulty].startingLives;
  const p1 = createPlayer(0, 0, 'P1', spawnX, character, startingLives, '#ff7892');
  const p2 = createPlayer(1, 1, gameMode === 'single' ? 'P1' : 'P2', spawnX + 52, character, startingLives, '#68b4ff');
  if (gameMode === 'single') {
    p1.active = false;
    p1.alive = false;
    p1.lives = 0;
  }
  return [p1, p2];
}

function createPlayer(id, controlIndex, name, x, character, lives, fallbackColor) {
  return {
    id, controlIndex, name, active: true, alive: true, finished: false,
    x, y: 315, prevY: 315, w: 32, h: 44, vx: 0, vy: 0, facing: 1,
    onGround: false, wasOnGround: false, airborneTimer: 0, crouching: false, big: true,
    lives, maxLives: lives, coins: 0, shards: 0, score: 0,
    coyoteTimer: 0, jumpBufferTimer: 0, jumpHeldPrev: false, attackHeldPrev: false,
    attackCooldown: 0, attackAnim: 0, stormTargets: [], hurtTimer: 0, invincibleTimer: 0,
    rescueTimer: 0, checkpointX: x,
    shotMode: 'blaster',
    powers: { blaster: 0, frost: 0, prism: 0, storm: 0, gale: 0, shield: 0 },
    bodyColor: id === 0 ? fallbackColor : character.body,
    detailColor: character.detail,
    trailColor: character.trail
  };
}

function activePlayers() { return players.filter((player) => player.active); }
function livingPlayers() { return players.filter((player) => player.active && player.alive); }
function runScore() { return activePlayers().reduce((sum, player) => sum + player.score, 0); }

function updateGame(step) {
  gameFrame += step;
  runTime += step / 60;

  updatePlayerInputs(step);
  activePlayers().forEach((player) => updatePlayer(player, step));
  updateCoopLeash();
  updateEnemies(step);
  updateProjectiles(step);
  updateHazards(step);
  collectItems();
  updateCheckpoint();
  updateFinish(step);
  updateCamera(step);
}

function updatePlayerInputs(step) {
  activePlayers().forEach((player) => {
    if (!player.alive || player.finished) return;
    tickPlayerTimers(player, step);
    const left = isPlayerActionDown(player, 'left');
    const right = isPlayerActionDown(player, 'right');
    const down = isPlayerActionDown(player, 'down');
    const jump = isPlayerActionDown(player, 'jump');
    const attack = isPlayerActionDown(player, 'attack');
    const move = (right ? 1 : 0) - (left ? 1 : 0);

    if (jump && !player.jumpHeldPrev) player.jumpBufferTimer = 9;
    if (!jump && player.jumpHeldPrev && player.vy < -4.2) player.vy *= 0.48;
    if (attack && (!player.attackHeldPrev || (player.powers.storm > 0 && player.attackCooldown <= 0))) performAttack(player);

    updatePlayerSize(player, down);
    const maxSpeed = player.crouching ? 2.25 : player.big ? 5.05 : 5.35;
    const acceleration = player.onGround ? 0.31 : 0.17;
    player.vx += (move * maxSpeed - player.vx) * acceleration * step;
    if (move === 0 && player.onGround) player.vx *= Math.pow(0.78, step);
    if (Math.abs(player.vx) < 0.035) player.vx = 0;
    if (move !== 0) player.facing = move;

    player.jumpHeldPrev = jump;
    player.attackHeldPrev = attack;
  });
}

function isPlayerActionDown(player, action) {
  if (gameMode !== 'single') return GameInput.isDown(player.controlIndex, action);
  return GameInput.isDown(0, action) || GameInput.isDown(1, action);
}

function tickPlayerTimers(player, step) {
  ['coyoteTimer', 'jumpBufferTimer', 'attackCooldown', 'attackAnim', 'hurtTimer', 'invincibleTimer'].forEach((key) => {
    player[key] = max(0, player[key] - step);
  });
  Object.keys(player.powers).forEach((key) => { player.powers[key] = max(0, player.powers[key] - step); });
}

function updatePlayerSize(player, down) {
  const targetW = player.big ? 32 : 22;
  const standH = player.big ? 44 : 30;
  const crouchH = player.big ? 25 : 20;
  player.w = targetW;
  const wantsCrouch = down && (player.onGround || player.crouching);
  const targetH = wantsCrouch ? crouchH : standH;
  if (targetH < player.h) {
    const feet = player.y + player.h;
    player.h = targetH;
    player.y = feet - player.h;
    player.crouching = wantsCrouch;
  } else if (targetH > player.h) {
    const next = { x: player.x, y: player.y - (targetH - player.h), w: player.w, h: targetH };
    if (!solidOverlap(next)) {
      player.y -= targetH - player.h;
      player.h = targetH;
      player.crouching = false;
    }
  }
}

function updatePlayer(player, step) {
  if (!player.alive || player.finished) {
    if (!player.alive && gameMode === 'co-op') updateRescue(player, step);
    return;
  }
  player.prevY = player.y;
  player.wasOnGround = player.onGround;
  if (player.onGround) player.airborneTimer = 0;
  else player.airborneTimer += step;
  if (player.onGround) player.coyoteTimer = 8;
  if (player.jumpBufferTimer > 0 && (player.onGround || player.coyoteTimer > 0) && !player.crouching) jumpPlayer(player);

  player.x += player.vx * step;
  collidePlayerWithSolids(player, 'x');
  player.vy = min(17, player.vy + 0.88 * step);
  player.y += player.vy * step;
  const impactVelocity = player.vy;
  player.onGround = false;
  collidePlayerWithSolids(player, 'y');

  if (!player.wasOnGround && player.onGround && player.airborneTimer >= 5 && impactVelocity >= 3) {
    spawnBurst(player.x + player.w / 2, player.y + player.h, player.trailColor, 6, 2.1);
    GameAudio.sfx('land');
  }
  if (player.onGround) player.airborneTimer = 0;
  player.x = constrain(player.x, 0, CFG.STAGE_WIDTH - player.w);
  if (player.y > H + 150) damagePlayer(player, 'fell into the cloudbreak', true);
}

function jumpPlayer(player) {
  player.jumpBufferTimer = 0;
  player.coyoteTimer = 0;
  player.vy = player.big ? -14.4 : -13.5;
  player.onGround = false;
  spawnBurst(player.x + player.w / 2, player.y + player.h, player.trailColor, 5, 1.8);
  GameAudio.sfx('jump');
}

function activeSolid(solid) {
  if (solid.bossGate && world.gateOpen) return false;
  if (solid.arenaGate) {
    return world.enemies.some((enemy) => enemy.alive && enemy.arenaId === solid.arenaGate);
  }
  return true;
}

function collidePlayerWithSolids(player, axis) {
  for (const solid of world.solids) {
    if (!activeSolid(solid) || !rectsOverlap(player, solid)) continue;
    if (axis === 'x') {
      if (player.vx > 0) player.x = solid.x - player.w;
      else if (player.vx < 0) player.x = solid.x + solid.w;
      player.vx = 0;
    } else if (player.vy > 0) {
      player.y = solid.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = solid.y + solid.h;
      player.vy = 0;
    }
  }
}

function solidOverlap(box) {
  return world && world.solids.some((solid) => activeSolid(solid) && rectsOverlap(box, solid));
}

function performAttack(player) {
  if (player.attackCooldown > 0 || !player.alive || player.finished) return;

  const poweredShot = player.shotMode === 'frost' ? player.powers.frost > 0 : player.powers.blaster > 0;
  const fallbackShot = player.powers.blaster > 0 ? 'blaster' : player.powers.frost > 0 ? 'frost' : null;
  const shotType = poweredShot ? player.shotMode : fallbackShot;

  if (player.powers.storm > 0) {
    player.attackCooldown = 10;
    const hitbox = frontHitbox(player, 172, 96);
    const targets = world.enemies.filter((enemy) => enemy.alive && rectsOverlap(hitbox, enemy));
    player.stormTargets = (targets.length ? targets.slice(0, 4).map((enemy) => ({
      x: enemy.x + enemy.w / 2,
      y: enemy.y + enemy.h * 0.42
    })) : [
      { x: player.facing > 0 ? hitbox.x + hitbox.w : hitbox.x, y: hitbox.y + hitbox.h * 0.3 },
      { x: player.facing > 0 ? hitbox.x + hitbox.w * 0.82 : hitbox.x + hitbox.w * 0.18, y: hitbox.y + hitbox.h * 0.72 }
    ]);
    targets.forEach((enemy) => damageEnemy(enemy, 1, player, 'storm'));
    player.attackAnim = 10;
    screenShake = max(screenShake, settings.reducedMotion ? 0 : 2.8);
    spawnBurst(hitbox.x + hitbox.w / 2, hitbox.y + hitbox.h / 2, '#8feaff', 14, 4.2);
    GameAudio.sfx('zap');
    return;
  }

  if (player.powers.gale > 0) {
    player.attackCooldown = 16;
    const hitbox = frontHitbox(player, 195, 112);
    world.enemies.filter((enemy) => enemy.alive && rectsOverlap(hitbox, enemy)).forEach((enemy) => {
      enemy.stunnedTimer = 80;
      enemy.vx = player.facing * (enemy.boss ? 4.4 : 8.5);
      enemy.vy = enemy.boss ? -2 : -4.2;
      if (!enemy.boss) player.score += 12;
    });
    spawnBurst(hitbox.x + hitbox.w / 2, hitbox.y + hitbox.h / 2, '#dffcff', 16, 5.2);
    GameAudio.sfx('push');
    return;
  }

  if (shotType) {
    player.attackCooldown = 14;
    world.projectiles.push({
      ownerId: player.id,
      type: shotType,
      x: player.x + player.w / 2 + player.facing * 22,
      y: player.y + player.h * 0.42,
      vx: player.facing * (shotType === 'frost' ? 8 : 9),
      vy: shotType === 'frost' ? 0 : -0.25,
      radius: shotType === 'frost' ? 9 : 7,
      life: 110
    });
    player.attackAnim = 7;
    GameAudio.sfx('shoot');
    return;
  }

  const prism = player.powers.prism > 0;
  player.attackCooldown = prism ? 15 : 19;
  player.attackAnim = 10;
  const reach = prism ? 128 : 58;
  const hitbox = frontHitbox(player, reach, prism ? 84 : 58);
  let hit = false;
  world.enemies.forEach((enemy) => {
    if (!enemy.alive || !rectsOverlap(hitbox, enemy)) return;
    damageEnemy(enemy, prism ? 2 : 1, player, prism ? 'prism' : 'basic');
    hit = true;
  });
  spawnBurst(player.x + player.w / 2 + player.facing * reach * 0.58, player.y + player.h * 0.48, prism ? '#79ffe0' : player.trailColor, prism ? 12 : 6, 3.3);
  GameAudio.sfx(hit ? 'hit' : 'attack');
}

function frontHitbox(player, reach, heightValue) {
  return {
    x: player.facing > 0 ? player.x + player.w - 4 : player.x - reach + 4,
    y: player.y + player.h / 2 - heightValue / 2,
    w: reach,
    h: heightValue
  };
}

function updateEnemies(step) {
  for (const enemy of world.enemies) {
    if (!enemy.alive) {
      enemy.deathTimer = max(0, enemy.deathTimer - step);
      continue;
    }
    enemy.hurtTimer = max(0, enemy.hurtTimer - step);

    if (enemy.frozenTimer > 0) {
      enemy.frozenTimer = max(0, enemy.frozenTimer - step);
      if (enemy.frozenTimer === 0 && Math.abs(enemy.vx) < 0.05) {
        const direction = enemy.x > (enemy.left + enemy.right) / 2 ? -1 : 1;
        enemy.vx = enemy.baseSpeed * direction;
      }
    } else {
      updateEnemyMovement(enemy, step);
    }

    if (enemy.stunnedTimer > 0) enemy.stunnedTimer = max(0, enemy.stunnedTimer - step);
    if (enemy.boss) updateBossAttack(enemy, step);

    for (const player of livingPlayers()) {
      if (player.finished || !enemy.alive || !rectsOverlap(player, enemy)) continue;
      const previousBottom = player.prevY + player.h;
      const stomp = player.vy > 0 && previousBottom <= enemy.y + 16 && player.x + player.w > enemy.x + 4 && player.x < enemy.x + enemy.w - 4;
      if (stomp) {
        damageEnemy(enemy, 1, player, enemy.frozenTimer > 0 ? 'shatter' : 'stomp');
        player.vy = -11.8;
      } else if (player.powers.shield > 0) {
        damageEnemy(enemy, enemy.boss ? 1 : 2, player, 'shield');
        player.powers.shield = max(0, player.powers.shield - 70);
      } else {
        damagePlayer(player, `was struck by ${enemy.boss ? CFG.stages[selectedStage].bossName : 'a circuit creature'}`);
      }
    }
  }
}

function updateEnemyMovement(enemy, step) {
  const slowed = enemy.stunnedTimer > 0;
  if (slowed) enemy.vx *= Math.pow(0.94, step);
  if (enemy.kind === 'drone') {
    enemy.x += enemy.vx * step;
    if (enemy.x <= enemy.left || enemy.x + enemy.w >= enemy.right) {
      enemy.x = constrain(enemy.x, enemy.left, enemy.right - enemy.w);
      enemy.vx = (enemy.vx >= 0 ? -1 : 1) * enemy.baseSpeed;
    }
    enemy.y = enemy.baseY + sin(gameFrame * 0.045 + enemy.phase) * 28;
    return;
  }

  enemy.x += enemy.vx * step;
  if (enemy.x <= enemy.left || enemy.x + enemy.w >= enemy.right) {
    enemy.x = constrain(enemy.x, enemy.left, enemy.right - enemy.w);
    enemy.vx = (enemy.vx >= 0 ? -1 : 1) * enemy.baseSpeed;
  }
  enemy.hopTimer -= step;
  if ((enemy.kind === 'hopper' || enemy.boss) && enemy.onGround && enemy.hopTimer <= 0) {
    enemy.vy = enemy.boss ? -9.4 : -8.7;
    enemy.onGround = false;
    enemy.hopTimer = enemy.boss ? 86 : 72;
  }
  enemy.vy = min(15, enemy.vy + 0.78 * step);
  enemy.y += enemy.vy * step;
  enemy.onGround = false;
  collideEnemyWithSolids(enemy);
}

function collideEnemyWithSolids(enemy) {
  for (const solid of world.solids) {
    if (!activeSolid(solid) || !rectsOverlap(enemy, solid)) continue;
    if (enemy.vy > 0) {
      enemy.y = solid.y - enemy.h;
      enemy.vy = 0;
      enemy.onGround = true;
    } else if (enemy.vy < 0) {
      enemy.y = solid.y + solid.h;
      enemy.vy = 0;
    }
  }
}

function updateBossAttack(boss, step) {
  const target = livingPlayers().sort((a, b) => Math.abs(a.x - boss.x) - Math.abs(b.x - boss.x))[0];
  if (!target) return;
  const horizontalDistance = Math.abs((target.x + target.w / 2) - (boss.x + boss.w / 2));
  if (horizontalDistance > W * 0.78) {
    boss.attackTimer = max(30, boss.attackTimer);
    return;
  }
  boss.attackTimer -= step;
  if (boss.attackTimer > 0 || boss.frozenTimer > 0) return;
  const dx = target.x + target.w / 2 - (boss.x + boss.w / 2);
  const dy = target.y + target.h / 2 - (boss.y + boss.h / 2);
  const baseAngle = Math.atan2(dy, dx);
  const speed = 5 + selectedStage * 0.28;
  const shotCount = 1 + Math.floor(selectedStage / 2) + (boss.spreadBonus || 0);
  const spread = 0.18;
  for (let index = 0; index < shotCount; index++) {
    const offset = (index - (shotCount - 1) / 2) * spread;
    launchBossProjectile(boss, baseAngle + offset, speed, 9 + selectedStage * 0.75, 'bolt');
  }
  if (boss.attackCycle % 3 === 2) {
    const waveSpeed = 5.8 + selectedStage * 0.3;
    world.enemyProjectiles.push({ x: boss.x + boss.w / 2, y: GROUND - 14, vx: -waveSpeed, vy: 0, radius: 14, life: 210, kind: 'shockwave' });
    world.enemyProjectiles.push({ x: boss.x + boss.w / 2, y: GROUND - 14, vx: waveSpeed, vy: 0, radius: 14, life: 210, kind: 'shockwave' });
  }
  boss.attackCycle++;
  boss.attackTimer = max(36, (94 - selectedStage * 6) / (boss.attackRate || 1));
  spawnBurst(boss.x + boss.w / 2, boss.y + boss.h / 2, CFG.stages[selectedStage].palette.hazard, 16, 4.8);
  GameAudio.sfx('boss');
}

function launchBossProjectile(boss, angle, speed, radius, kind) {
  world.enemyProjectiles.push({
    x: boss.x + boss.w / 2,
    y: boss.y + boss.h / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    life: 190,
    kind
  });
}

function damageEnemy(enemy, amount, owner, style) {
  if (!enemy.alive || enemy.hurtTimer > 0) return;
  enemy.hp -= amount;
  enemy.hurtTimer = enemy.boss ? 11 : 5;
  enemy.vx += owner ? owner.facing * (enemy.boss ? 1.8 : 3.5) : 0;
  spawnBurst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, style === 'frost' || style === 'shatter' ? '#aeeeff' : CFG.stages[selectedStage].palette.accent, enemy.boss ? 18 : 9, 4.6);
  if (enemy.boss) {
    screenShake = max(screenShake, 5);
    hitStop = max(hitStop, 3.5);
    GameAudio.sfx('bossHit');
  }
  if (enemy.hp > 0) return;
  enemy.alive = false;
  enemy.deathTimer = enemy.boss ? 90 : 28;
  enemy.vx = 0;
  enemy.vy = 0;
  if (owner) owner.score += enemy.boss ? 800 : enemy.elite ? 180 : style === 'basic' ? 75 : 95;
  if (enemy.arenaId && !world.enemies.some((other) => other.alive && other.arenaId === enemy.arenaId)) {
    const gateNumber = Number(enemy.arenaId.split('-').pop());
    GameAudio.sfx('gate');
    showMessage(`Imperial blockade ${gateNumber} cleared. The energy gate is down!`);
  }
  if (enemy.boss) {
    world.gateOpen = true;
    stageStats.bossDefeated = true;
    screenShake = 13;
    hitStop = 10;
    GameAudio.sfx('gate');
    showMessage(`${CFG.stages[selectedStage].bossName} defeated. The exit gate is open!`);
  }
}

function updateProjectiles(step) {
  for (let index = world.projectiles.length - 1; index >= 0; index--) {
    const projectile = world.projectiles[index];
    projectile.life -= step;
    projectile.x += projectile.vx * step;
    projectile.y += projectile.vy * step;
    let remove = projectile.life <= 0 || projectile.x < 0 || projectile.x > CFG.STAGE_WIDTH;
    for (const solid of world.solids) {
      if (!activeSolid(solid) || solid.kind === 'ground') continue;
      if (circleRectOverlap(projectile.x, projectile.y, projectile.radius, solid)) { remove = true; break; }
    }
    if (!remove) {
      for (const enemy of world.enemies) {
        if (!enemy.alive || !circleRectOverlap(projectile.x, projectile.y, projectile.radius, enemy)) continue;
        const owner = players[projectile.ownerId];
        if (projectile.type === 'frost') {
          enemy.frozenTimer = enemy.boss ? 75 : 220;
          damageEnemy(enemy, 1, owner, 'frost');
          if (enemy.alive) {
            enemy.vx = 0;
            enemy.vy = 0;
          }
        } else damageEnemy(enemy, 1, owner, 'blaster');
        remove = true;
        GameAudio.sfx('hit');
        break;
      }
    }
    if (remove) world.projectiles.splice(index, 1);
  }

  for (let index = world.enemyProjectiles.length - 1; index >= 0; index--) {
    const projectile = world.enemyProjectiles[index];
    projectile.life -= step;
    projectile.x += projectile.vx * step;
    projectile.y += projectile.vy * step;
    let remove = projectile.life <= 0 || projectile.x < 0 || projectile.x > CFG.STAGE_WIDTH || projectile.y < 0 || projectile.y > H;
    for (const solid of world.solids) {
      const travelsAlongGround = projectile.kind === 'shockwave' && solid.kind === 'ground';
      if (!remove && !travelsAlongGround && activeSolid(solid) && circleRectOverlap(projectile.x, projectile.y, projectile.radius, solid)) {
        remove = true;
      }
    }
    for (const player of livingPlayers()) {
      if (!remove && circleRectOverlap(projectile.x, projectile.y, projectile.radius, player)) {
        damagePlayer(player, `was tagged by ${CFG.stages[selectedStage].bossName}`);
        remove = true;
      }
    }
    if (remove) world.enemyProjectiles.splice(index, 1);
  }
}

function updateHazards(step) {
  for (const hazard of world.hazards) {
    const active = isHazardActive(hazard);
    if (!active) continue;
    for (const player of livingPlayers()) {
      if (!rectsOverlap(player, hazard)) continue;
      if (hazard.type === 'vent') {
        player.vy = -16.8;
        player.onGround = false;
        spawnBurst(hazard.x + hazard.w / 2, GROUND - 5, '#ffd07a', 12, 4.8);
      } else damagePlayer(player, `hit a ${hazardLabel(hazard.type)}`);
    }
  }
}

function isHazardActive(hazard) {
  if (hazard.type !== 'laser') return true;
  return (gameFrame + hazard.phase) % hazard.period < hazard.period * 0.54;
}

function hazardLabel(type) {
  return ({ thorn: 'thorn patch', spike: 'vault spike', spore: 'shock spore', lava: 'molten channel', crystal: 'crystal fault', storm: 'storm coil', laser: 'pulse beam' })[type] || type;
}

function damagePlayer(player, reason, forceRespawn = false) {
  if (!player.alive || player.invincibleTimer > 0) return;
  if (player.powers.shield > 0) {
    player.powers.shield = 0;
    player.invincibleTimer = 80;
    showMessage(`${player.name}'s shield absorbed the hit.`);
    GameAudio.sfx('hit');
    return;
  }
  player.lives--;
  player.big = false;
  player.invincibleTimer = 125;
  player.hurtTimer = 55;
  player.attackAnim = 0;
  stageStats.damageTaken++;
  screenShake = max(screenShake, 8);
  spawnBurst(player.x + player.w / 2, player.y + player.h / 2, '#ff7790', 16, 5.2);
  GameAudio.sfx('hurt');

  if (player.lives <= 0) {
    player.alive = false;
    player.vx = 0;
    player.vy = 0;
    player.rescueTimer = gameMode === 'co-op' ? 240 : 0;
    if (livingPlayers().length === 0) {
      scene = 'gameover';
      showMessage('The circuit went dark. Retry from the checkpoint.');
    } else showMessage(`${player.name} is down. Survive until the rescue timer completes!`);
    return;
  }

  if (forceRespawn || reason.includes('laser') || reason.includes('channel') || reason.includes('fault')) respawnPlayer(player);
  else {
    player.vx = -player.facing * 4.2;
    player.vy = -8;
  }
  showMessage(`${player.name} ${reason}. ${player.lives} energy remaining.`);
}

function respawnPlayer(player) {
  player.x = checkpointX + player.id * 46;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.wasOnGround = false;
  player.airborneTimer = 0;
  player.crouching = false;
  player.invincibleTimer = max(player.invincibleTimer, 135);
}

function updateRescue(player, step) {
  if (livingPlayers().length === 0) return;
  player.rescueTimer -= step;
  if (player.rescueTimer > 0) return;
  const partner = livingPlayers()[0];
  player.alive = true;
  player.lives = 1;
  player.big = false;
  player.x = partner.x - partner.facing * 62;
  player.y = max(150, partner.y - 70);
  player.invincibleTimer = 180;
  player.vx = partner.vx;
  player.vy = -4;
  showMessage(`${player.name} rejoined in a rescue bubble.`);
  spawnBurst(player.x, player.y, '#dffcff', 18, 5);
}

function updateCoopLeash() {
  if (gameMode !== 'co-op') return;
  const living = livingPlayers().filter((player) => !player.finished);
  if (living.length !== 2) return;
  const [a, b] = living;
  if (Math.abs(a.x - b.x) < 760) return;
  const leader = a.x > b.x ? a : b;
  const trailing = leader === a ? b : a;
  trailing.x = leader.x - 180;
  trailing.y = max(120, leader.y - 80);
  trailing.vx = leader.vx;
  trailing.vy = -4;
  trailing.invincibleTimer = max(trailing.invincibleTimer, 150);
  screenShake = max(screenShake, 3);
  showMessage(`${trailing.name} was pulled back into co-op range.`);
}

function collectItems() {
  world.coins.forEach((coin) => {
    if (coin.collected) return;
    for (const player of livingPlayers()) {
      if (distanceSquared(player.x + player.w / 2, player.y + player.h / 2, coin.x, coin.y) < 31 * 31) {
        coin.collected = true;
        player.coins++;
        player.score += 10;
        spawnBurst(coin.x, coin.y, CFG.stages[selectedStage].palette.accent, 7, 2.8);
        GameAudio.sfx('coin');
        break;
      }
    }
  });

  world.shards.forEach((shard) => {
    if (shard.collected) return;
    for (const player of livingPlayers()) {
      if (distanceSquared(player.x + player.w / 2, player.y + player.h / 2, shard.x, shard.y) < 36 * 36) {
        shard.collected = true;
        player.shards++;
        player.score += 175;
        spawnBurst(shard.x, shard.y, '#ffffff', 22, 5.2);
        screenShake = max(screenShake, 3);
        GameAudio.sfx('shard');
        showMessage(`${player.name} found a hidden circuit shard (${collectedShardCount()}/3).`);
        break;
      }
    }
  });

  world.powerUps.forEach((powerUp) => {
    if (powerUp.collected) return;
    for (const player of livingPlayers()) {
      if (!rectsOverlap(player, powerUp)) continue;
      powerUp.collected = true;
      applyPowerUp(player, powerUp.type);
      player.score += 80;
      GameAudio.sfx('power');
      spawnBurst(powerUp.x + 15, powerUp.y + 15, powerColor(powerUp.type), 18, 4.6);
      break;
    }
  });
}

function applyPowerUp(player, type) {
  if (type === 'shield') {
    player.powers.shield = 60 * 10;
    showMessage(`${player.name} activated a ten-second deflector shield.`);
  } else if (type === 'blaster') {
    player.powers.blaster = 60 * 16;
    player.shotMode = 'blaster';
    showMessage(`${player.name} equipped a rapid-fire blaster.`);
  } else if (type === 'frost') {
    player.powers.frost = 60 * 16;
    player.shotMode = 'frost';
    showMessage(`${player.name} equipped a carbonite pulse.`);
  } else if (type === 'prism') {
    player.powers.prism = 60 * 14;
    showMessage(`${player.name} ignited a lightsaber.`);
  } else if (type === 'aspect') {
    pendingChoice = { playerId: player.id, selected: selectedPath };
    scene = 'choice';
    GameInput.clear();
    showMessage(`${player.name} found a Force holocron. Choose the dark side or light side.`);
  }
}

function chooseAspect(path) {
  if (!pendingChoice) return;
  const player = players[pendingChoice.playerId];
  selectedPath = path;
  player.powers.storm = path === 'storm' ? 60 * 15 : 0;
  player.powers.gale = path === 'gale' ? 60 * 15 : 0;
  if (path === 'gale') {
    player.lives = min(player.maxLives + 1, player.lives + 1);
    player.maxLives = max(player.maxLives, player.lives);
  }
  pendingChoice = null;
  scene = 'playing';
  GameInput.clear();
  showMessage(path === 'storm' ? `${player.name} chose the dark side: rapid Force lightning.` : `${player.name} chose the light side: Force push and bonus energy.`);
}

function powerColor(type) {
  return ({ shield: '#7ce8ff', blaster: '#ff9a5c', frost: '#a9ecff', prism: '#75ffd5', aspect: '#d4b0ff' })[type] || '#ffffff';
}

function collectedShardCount() { return world.shards.filter((shard) => shard.collected).length; }

function updateCheckpoint() {
  if (world.checkpoint.reached) return;
  if (!livingPlayers().some((player) => player.x + player.w > world.checkpoint.x)) return;
  world.checkpoint.reached = true;
  checkpointX = world.checkpoint.x + 48;
  activePlayers().forEach((player) => { player.checkpointX = checkpointX; });
  GameAudio.sfx('checkpoint');
  showMessage('Checkpoint synchronized. Retries restart here.');
}

function updateFinish(step) {
  if (!world.gateOpen) return;
  activePlayers().forEach((player) => {
    if (!player.alive || player.finished) return;
    if (rectsOverlap(player, world.finish)) {
      player.finished = true;
      player.vx = 0;
      player.vy = 0;
      player.score += 300;
      if (gameMode === 'co-op' && finishCountdown < 0) {
        finishCountdown = 8 * 60;
        showMessage(`${player.name} reached the relay. Partner has 8 seconds to join!`);
      }
    }
  });

  const allFinished = activePlayers().every((player) => player.finished);
  if (allFinished) return completeStage();

  if (gameMode === 'co-op' && finishCountdown >= 0) {
    finishCountdown -= step;
    if (finishCountdown <= 0) {
      activePlayers().forEach((player) => { if (!player.finished) player.finished = true; });
      stageStats.rescuedFinish = true;
      completeStage();
    }
  }
}

function completeStage() {
  if (scene === 'win') return;
  scene = 'win';
  finishCountdown = -1;
  const shardCount = collectedShardCount();
  const timeBonus = max(0, Math.floor((CFG.stages[selectedStage].parTime * 1.5 - runTime) * 12));
  const score = Math.floor((runScore() + timeBonus + shardCount * 200) * CFG.difficulties[settings.difficulty].score);
  const grade = calculateGrade(runTime, shardCount, stageStats);
  result = { score, time: runTime, shards: shardCount, grade, newBest: false };
  const stageId = CFG.stages[selectedStage].id;
  const oldScore = progress.bestScores[stageId] || 0;
  const oldTime = progress.bestTimes[stageId] || Infinity;
  result.newBest = score > oldScore || runTime < oldTime;
  progress.bestScores[stageId] = max(oldScore, score);
  progress.bestTimes[stageId] = min(oldTime, runTime);
  progress.bestGrades[stageId] = betterGrade(progress.bestGrades[stageId], grade);
  progress.shards[stageId] = max(progress.shards[stageId] || 0, shardCount);
  progress.unlockedStages = min(CFG.stages.length, max(progress.unlockedStages, selectedStage + 2));
  progress.selectedStage = min(progress.unlockedStages - 1, selectedStage + 1);
  progress.selectedCharacter = selectedCharacter;
  progress.totalWins = (progress.totalWins || 0) + 1;
  GameStorage.saveProgress(progress);
  GameAudio.sfx('win');
  screenShake = 10;
  spawnBurst(world.finish.x, GROUND - 90, CFG.stages[selectedStage].palette.accent, 40, 7);
  showMessage(`${CFG.stages[selectedStage].name} cleared with grade ${grade}!`);
}

function calculateGrade(time, shards, stats) {
  const ratio = time / CFG.stages[selectedStage].parTime;
  let points = ratio <= 1 ? 4 : ratio <= 1.18 ? 3 : ratio <= 1.45 ? 2 : 1;
  if (shards === 3) points++;
  if (stats.damageTaken === 0) points++;
  if (stats.retries > 0 || stats.rescuedFinish) points--;
  return points >= 6 ? 'S' : points >= 5 ? 'A' : points >= 3 ? 'B' : 'C';
}

function betterGrade(previous, next) {
  const order = ['C', 'B', 'A', 'S'];
  return order.indexOf(next) > order.indexOf(previous || 'C') ? next : previous || next;
}

function retryFromCheckpoint() {
  const hadCheckpoint = world?.checkpoint?.reached;
  world = GameLevels.createStage(selectedStage, settings.difficulty);
  world.checkpoint.reached = Boolean(hadCheckpoint);
  checkpointX = hadCheckpoint ? world.checkpoint.x + 48 : 120;
  players = createPlayers(checkpointX);
  cameraX = max(0, checkpointX - 220);
  finishCountdown = -1;
  pendingChoice = null;
  stageStats.retries++;
  runTime += hadCheckpoint ? 8 : 0;
  scene = 'playing';
  GameInput.clear();
  showMessage(hadCheckpoint ? 'Checkpoint retry: eight-second grade penalty applied.' : 'Stage restarted from launch.');
}

function returnToMenu(nextStage = false) {
  if (nextStage) selectedStage = min(progress.unlockedStages - 1, selectedStage + 1);
  progress.selectedStage = selectedStage;
  progress.selectedCharacter = selectedCharacter;
  GameStorage.saveProgress(progress);
  scene = 'menu';
  result = null;
  pendingChoice = null;
  finishCountdown = -1;
  GameInput.clear();
  loadPreview();
  showMessage('Choose the next circuit.');
}

function advanceAfterWin() {
  if (selectedStage >= CFG.stages.length - 1) {
    returnToMenu();
    return;
  }
  selectedStage = min(progress.unlockedStages - 1, selectedStage + 1);
  progress.selectedStage = selectedStage;
  GameStorage.saveProgress(progress);
  startRun();
}

function updateCamera(step) {
  const targets = activePlayers().filter((player) => player.alive && !player.finished);
  if (targets.length === 0) return;
  const midpoint = targets.reduce((sum, player) => sum + player.x + player.w / 2, 0) / targets.length;
  const target = constrain(midpoint - W * 0.42, 0, CFG.STAGE_WIDTH - W);
  cameraX += (target - cameraX) * min(1, 0.085 * step);
}

function togglePause() {
  if (scene === 'playing') {
    scene = 'pause';
    GameInput.clear();
  } else if (scene === 'pause') {
    scene = 'playing';
    GameInput.clear();
    showMessage('Back in the circuit.');
  }
}

function showMessage(textValue) {
  message = textValue;
  messageTimer = 230;
  const status = document.getElementById('game-status');
  if (status) status.textContent = textValue;
}

function updateParticles(step) {
  if (settings.reducedMotion) {
    particles.length = 0;
    return;
  }
  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    particle.life -= step;
    particle.x += particle.vx * step;
    particle.y += particle.vy * step;
    particle.vy += particle.gravity * step;
    particle.vx *= Math.pow(0.985, step);
    if (particle.life <= 0) particles.splice(index, 1);
  }
}

function spawnBurst(x, y, colour, count, speed) {
  if (settings.reducedMotion) return;
  for (let index = 0; index < count; index++) {
    const angle = random(TWO_PI);
    const velocity = random(speed * 0.35, speed);
    particles.push({ x, y, vx: cos(angle) * velocity, vy: sin(angle) * velocity - 0.6, gravity: 0.08, life: random(18, 42), maxLife: 42, size: random(2, 6), colour });
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectOverlap(cx, cy, radius, rectValue) {
  const closestX = constrain(cx, rectValue.x, rectValue.x + rectValue.w);
  const closestY = constrain(cy, rectValue.y, rectValue.y + rectValue.h);
  return distanceSquared(cx, cy, closestX, closestY) <= radius * radius;
}

function distanceSquared(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

function drawGame() {
  const theme = CFG.stages[selectedStage];
  drawSky(theme);
  drawBackdrop(theme);

  const shakeAmount = settings.reducedMotion ? 0 : screenShake;
  const shakeX = shakeAmount > 0 ? random(-shakeAmount, shakeAmount) : 0;
  const shakeY = shakeAmount > 0 ? random(-shakeAmount * 0.45, shakeAmount * 0.45) : 0;

  push();
  translate(-cameraX + shakeX, shakeY);
  drawWorld(theme);
  pop();

  if (scene === 'menu') drawMenu(theme);
  else {
    drawHUD(theme);
    if (scene === 'pause') drawPauseOverlay();
    else if (scene === 'choice') drawChoiceOverlay();
    else if (scene === 'gameover') drawGameOverOverlay();
    else if (scene === 'win') drawWinOverlay();
  }
}

function drawSky(theme) {
  noStroke();
  const top = color(theme.palette.skyTop);
  const bottom = color(theme.palette.skyBottom);
  for (let y = 0; y < H; y += 7) {
    fill(lerpColor(top, bottom, y / H));
    rect(0, y, W, 8);
  }
  fill(color(theme.palette.sun));
  circle(W - 112, selectedStage % 2 ? 108 : 84, selectedStage === 1 ? 64 : 82);
  fill(255, 255, 255, 34);
  circle(W - 112, selectedStage % 2 ? 108 : 84, selectedStage === 1 ? 88 : 112);

  if (theme.weather === 'stars' || theme.weather === 'rain') {
    stars.forEach((star) => {
      const alpha = 120 + sin(frameCount * 0.025 + star.phase) * 80;
      fill(255, 255, 255, alpha);
      circle(star.x, star.y, star.s);
    });
  }
}

function drawBackdrop(theme) {
  push();
  noStroke();
  const farOffset = -(cameraX * 0.11) % 520;
  const nearOffset = -(cameraX * 0.22) % 310;
  fill(color(theme.palette.far));

  if (selectedStage === 0) {
    for (let index = -1; index < 5; index++) ellipse(farOffset + index * 520, GROUND + 30, 620, 260);
    fill(color(theme.palette.near));
    for (let index = -1; index < 7; index++) ellipse(nearOffset + index * 310, GROUND + 48, 380, 155);
  } else if (selectedStage === 1) {
    for (let index = -1; index < 8; index++) {
      const x = farOffset + index * 260;
      rect(x, 230 + (index % 3) * 28, 88, 230);
      rect(x - 24, 222 + (index % 3) * 28, 136, 16, 4);
    }
    fill(color(theme.palette.near));
    for (let index = -1; index < 8; index++) rect(nearOffset + index * 230, 330 - (index % 2) * 45, 58, 155);
  } else if (selectedStage === 2) {
    for (let index = -1; index < 7; index++) {
      const x = farOffset + index * 300;
      rect(x, 180, 62, 310, 32);
      ellipse(x + 30, 170, 250, 145);
    }
    fill(color(theme.palette.near));
    for (let index = -1; index < 9; index++) ellipse(nearOffset + index * 220, 355, 280, 190);
  } else if (selectedStage === 3) {
    for (let index = -1; index < 7; index++) {
      const x = farOffset + index * 320;
      rect(x, 240, 190, 230);
      rect(x + 28, 160, 44, 120);
      rect(x + 115, 205, 34, 80);
      fill(255, 180, 100, 35);
      for (let windowIndex = 0; windowIndex < 4; windowIndex++) rect(x + 25 + windowIndex * 38, 286, 18, 48);
      fill(color(theme.palette.far));
    }
    fill(color(theme.palette.near));
    for (let index = -1; index < 9; index++) rect(nearOffset + index * 210, 350, 160, 120, 8);
  } else if (selectedStage === 4) {
    for (let index = -1; index < 8; index++) {
      const x = farOffset + index * 260;
      triangle(x, GROUND + 30, x + 110, 155 + (index % 3) * 35, x + 230, GROUND + 30);
    }
    fill(color(theme.palette.near));
    for (let index = -1; index < 10; index++) {
      const x = nearOffset + index * 190;
      triangle(x, GROUND + 30, x + 75, 285 - (index % 2) * 42, x + 145, GROUND + 30);
    }
  } else {
    for (let index = -1; index < 7; index++) {
      const x = farOffset + index * 340;
      rect(x, 210, 170, 260);
      triangle(x - 20, 210, x + 85, 110, x + 190, 210);
      rect(x + 58, 130, 54, 90);
    }
    fill(color(theme.palette.near));
    for (let index = -1; index < 9; index++) rect(nearOffset + index * 220, 320, 175, 150, 14);
  }

  drawWeather(theme);
  pop();
}

function drawWeather(theme) {
  if (settings.reducedMotion) return;
  noStroke();
  motes.forEach((mote, index) => {
    const x = (mote.x + frameCount * mote.speed + index * 13) % (W + 120) - 60;
    const y = (mote.y + sin(frameCount * 0.018 + mote.phase) * 26 + H) % H;
    if (theme.weather === 'rain') {
      stroke(150, 220, 255, 95);
      strokeWeight(1.5);
      line(x, y, x - 7, y + 21);
      noStroke();
    } else if (theme.weather === 'embers') {
      fill(255, 175, 80, 115);
      circle(x, H - y, mote.s + 1);
    } else if (theme.weather === 'spores') {
      fill(210, 255, 155, 85);
      circle(x, y, mote.s + 2);
    } else if (theme.weather === 'petals') {
      fill(255, 225, 238, 95);
      ellipse(x, y, mote.s * 2.2, mote.s);
    } else if (theme.weather === 'shards') {
      fill(190, 240, 255, 70);
      quad(x, y - mote.s, x + mote.s, y, x, y + mote.s, x - mote.s, y);
    }
  });
}

function drawWorld(theme) {
  drawGround(theme);
  drawSolids(theme);
  drawHazards(theme);
  drawCoins(theme);
  drawShards(theme);
  drawPowerUps();
  drawCheckpoint(theme);
  drawFinish(theme);
  drawEnemies(theme);
  drawProjectiles(theme);
  drawPlayers();
  drawForceEffects();
  drawParticles();
}

function drawGround(theme) {
  noStroke();
  fill(color(theme.palette.ground));
  rect(0, GROUND, CFG.STAGE_WIDTH, H - GROUND);
  fill(color(theme.palette.soil));
  rect(0, GROUND + 16, CFG.STAGE_WIDTH, H - GROUND - 16);
  fill(255, 255, 255, 26);
  rect(0, GROUND, CFG.STAGE_WIDTH, 7);
  for (let x = floor(cameraX / 48) * 48; x < cameraX + W + 100; x += 48) {
    fill(255, 255, 255, 14);
    rect(x, GROUND + 30, 25, 3, 2);
  }
}

function drawSolids(theme) {
  for (const solid of world.solids) {
    if (!activeSolid(solid) || solid.kind === 'ground' || !worldRectVisible(solid)) continue;
    if (solid.kind === 'gate') {
      drawGate(solid, theme);
      continue;
    }
    noStroke();
    fill(color(theme.palette.platform));
    rect(solid.x, solid.y, solid.w, solid.h, 7);
    fill(255, 255, 255, solid.kind === 'ancient' ? 66 : 38);
    rect(solid.x + 6, solid.y + 4, max(0, solid.w - 12), 4, 3);
    fill(0, 0, 0, 22);
    rect(solid.x + 9, solid.y + solid.h - 5, max(0, solid.w - 18), 4, 2);
    if (solid.kind === 'ancient') {
      stroke(color(theme.palette.accent));
      strokeWeight(1.5);
      for (let x = solid.x + 18; x < solid.x + solid.w - 8; x += 28) line(x, solid.y + 8, x + 7, solid.y + 13);
      noStroke();
    }
  }
}

function drawGate(gate, theme) {
  noStroke();
  fill(8, 17, 31, 225);
  rect(gate.x, gate.y, gate.w, gate.h, 8);
  fill(color(theme.palette.hazard));
  for (let y = gate.y + 12; y < gate.y + gate.h - 8; y += 28) rect(gate.x + 5, y, gate.w - 10, 11, 4);
  fill(255, 255, 255, 170);
  circle(gate.x + gate.w / 2, gate.y + 22, 7);
  if (gate.arenaGate) {
    fill(255, 255, 255, 185);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(9);
    push();
    translate(gate.x + gate.w / 2, gate.y + gate.h / 2);
    rotate(-HALF_PI);
    text('IMPERIAL LOCK', 0, 0);
    pop();
    textStyle(NORMAL);
  }
}

function drawHazards(theme) {
  const hazardColour = settings.highContrast ? color('#ff1744') : color(theme.palette.hazard);
  for (const hazard of world.hazards) {
    if (!worldRectVisible(hazard, 80)) continue;
    const active = isHazardActive(hazard);
    if (hazard.type === 'laser') {
      stroke(active ? hazardColour : color(130, 170, 190, 55));
      strokeWeight(active ? (settings.highContrast ? 7 : 4) : 2);
      line(hazard.x + hazard.w / 2, hazard.y, hazard.x + hazard.w / 2, hazard.y + hazard.h);
      noStroke();
      fill(active ? hazardColour : color(110, 130, 160));
      rect(hazard.x - 7, hazard.y - 8, hazard.w + 14, 16, 5);
      rect(hazard.x - 7, hazard.y + hazard.h - 8, hazard.w + 14, 16, 5);
      continue;
    }
    if (hazard.type === 'vent') {
      fill(45, 42, 48);
      rect(hazard.x, GROUND - 12, hazard.w, 12, 4);
      fill(255, 190, 92, 145 + sin(gameFrame * 0.1) * 70);
      for (let x = hazard.x + 8; x < hazard.x + hazard.w; x += 18) triangle(x, GROUND - 12, x + 7, GROUND - 12, x + 3, GROUND - 48 - sin(gameFrame * 0.11 + x) * 12);
      continue;
    }
    fill(hazardColour);
    if (hazard.type === 'lava') {
      rect(hazard.x, hazard.y, hazard.w, hazard.h, 7, 7, 0, 0);
      fill(255, 220, 110, 130);
      for (let x = hazard.x + 8; x < hazard.x + hazard.w; x += 20) circle(x, hazard.y + sin(gameFrame * 0.08 + x) * 3, 7);
    } else {
      const spikeCount = max(2, floor(hazard.w / 16));
      for (let index = 0; index < spikeCount; index++) {
        const x = hazard.x + index * (hazard.w / spikeCount);
        triangle(x, hazard.y + hazard.h, x + hazard.w / spikeCount / 2, hazard.y, x + hazard.w / spikeCount, hazard.y + hazard.h);
      }
    }
  }
}

function drawCoins(theme) {
  for (const coin of world.coins) {
    if (coin.collected || !worldCircleVisible(coin.x, coin.y, coin.radius)) continue;
    const bob = settings.reducedMotion ? 0 : sin(gameFrame * 0.09 + coin.x * 0.02) * 3;
    noStroke();
    fill(0, 0, 0, 35);
    ellipse(coin.x, coin.y + 15, 20, 6);
    fill(color(theme.palette.accent));
    circle(coin.x, coin.y + bob, coin.radius * 2);
    fill(255, 255, 255, 125);
    circle(coin.x - 3, coin.y - 3 + bob, 5);
  }
}

function drawShards(theme) {
  for (const shard of world.shards) {
    if (shard.collected || !worldCircleVisible(shard.x, shard.y, shard.radius, 90)) continue;
    const rotation = settings.reducedMotion ? 0.2 : gameFrame * 0.035 + shard.id;
    push();
    translate(shard.x, shard.y + sin(gameFrame * 0.08 + shard.id) * 5);
    rotate(rotation);
    noStroke();
    fill(255, 255, 255, 42);
    circle(0, 0, 36);
    fill(color(theme.palette.accent));
    quad(0, -15, 10, 0, 0, 15, -10, 0);
    fill(255, 255, 255, 180);
    triangle(0, -12, 6, 0, 0, 2);
    pop();
  }
}

function drawPowerUps() {
  const labels = { shield: 'S', blaster: 'B', frost: 'C', prism: 'L', aspect: 'F' };
  for (const powerUp of world.powerUps) {
    if (powerUp.collected || !worldRectVisible(powerUp, 90)) continue;
    const bob = settings.reducedMotion ? 0 : sin(gameFrame * 0.07 + powerUp.x) * 5;
    noStroke();
    fill(0, 0, 0, 35);
    ellipse(powerUp.x + 15, powerUp.y + 34, 28, 7);
    fill(color(powerColor(powerUp.type)));
    rect(powerUp.x, powerUp.y + bob, powerUp.w, powerUp.h, 9);
    fill(255);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(16);
    text(labels[powerUp.type], powerUp.x + 15, powerUp.y + 15 + bob);
    textStyle(NORMAL);
  }
}

function drawCheckpoint(theme) {
  const checkpoint = world.checkpoint;
  if (!worldRectVisible(checkpoint, 100)) return;
  stroke(checkpoint.reached ? color(theme.palette.accent) : color(170, 190, 210));
  strokeWeight(4);
  line(checkpoint.x, checkpoint.y, checkpoint.x, GROUND);
  noStroke();
  fill(checkpoint.reached ? color(theme.palette.accent) : color(80, 100, 120));
  triangle(checkpoint.x, checkpoint.y, checkpoint.x + 45, checkpoint.y + 15, checkpoint.x, checkpoint.y + 30);
  fill(255);
  circle(checkpoint.x, checkpoint.y, 8);
}

function drawFinish(theme) {
  const finish = world.finish;
  if (!worldRectVisible(finish, 120)) return;
  const gateGlow = world.gateOpen ? 180 + sin(gameFrame * 0.08) * 60 : 45;
  noFill();
  stroke(color(theme.palette.accent));
  strokeWeight(world.gateOpen ? 6 : 2);
  drawingContext.globalAlpha = gateGlow / 255;
  ellipse(finish.x + 12, finish.y + 70, 66, 138);
  drawingContext.globalAlpha = 1;
  stroke(235);
  strokeWeight(4);
  line(finish.x + 12, finish.y, finish.x + 12, GROUND);
  noStroke();
  fill(world.gateOpen ? color(theme.palette.accent) : color(90));
  triangle(finish.x + 13, finish.y + 8, finish.x + 72, finish.y + 28, finish.x + 13, finish.y + 48);
}

function drawEnemies(theme) {
  for (const enemy of world.enemies) {
    if (!enemy.alive && enemy.deathTimer <= 0) continue;
    if (!worldRectVisible(enemy, 110)) continue;
    push();
    translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    if (!enemy.alive) {
      const scaleValue = max(0.05, enemy.deathTimer / (enemy.boss ? 90 : 28));
      scale(1 + (1 - scaleValue) * 0.8, scaleValue);
      drawingContext.globalAlpha = scaleValue;
    }
    if (enemy.elite && enemy.alive) {
      noFill();
      stroke(color(theme.palette.accent));
      strokeWeight(2.5);
      circle(0, 0, max(enemy.w, enemy.h) + 13 + sin(gameFrame * 0.1 + enemy.phase) * 3);
    }
    noStroke();
    if (enemy.frozenTimer > 0) fill('#a9ecff');
    else if (enemy.boss) fill(color(theme.palette.hazard));
    else if (enemy.kind === 'drone') fill('#ffe170');
    else if (enemy.kind === 'hopper') fill('#ff86c8');
    else fill('#a974e8');

    if (enemy.boss) {
      rectMode(CENTER);
      rect(0, 0, enemy.w, enemy.h, 18);
      fill(255, 255, 255, 28);
      rect(0, -enemy.h * 0.25, enemy.w * 0.72, 12, 5);
      fill(24, 22, 40);
      circle(-16, -4, 11);
      circle(16, -4, 11);
      fill(color(theme.palette.accent));
      circle(-16, -4, 4);
      circle(16, -4, 4);
      stroke(color(theme.palette.accent));
      strokeWeight(4);
      line(-30, -enemy.h / 2, -42, -enemy.h / 2 - 18);
      line(30, -enemy.h / 2, 42, -enemy.h / 2 - 18);
    } else if (enemy.kind === 'drone') {
      ellipse(0, 0, enemy.w, enemy.h * 0.72);
      fill(255, 255, 255, 65);
      ellipse(0, -5, enemy.w * 0.6, 8);
      fill(35);
      circle(-9, 2, 6);
      circle(9, 2, 6);
      stroke(255, 255, 255, 90);
      strokeWeight(3);
      line(-enemy.w / 2, 0, -enemy.w / 2 - 10, sin(gameFrame * 0.25) * 7);
      line(enemy.w / 2, 0, enemy.w / 2 + 10, -sin(gameFrame * 0.25) * 7);
    } else if (enemy.kind === 'hopper') {
      ellipse(0, 2, enemy.w, enemy.h);
      fill(35);
      circle(-8, -2, 5);
      circle(8, -2, 5);
      stroke(255, 255, 255, 85);
      strokeWeight(3);
      line(-10, enemy.h / 2 - 2, -16, enemy.h / 2 + 8);
      line(10, enemy.h / 2 - 2, 16, enemy.h / 2 + 8);
    } else {
      rectMode(CENTER);
      rect(0, 0, enemy.w, enemy.h, 10);
      fill(35);
      circle(-8, -5, 5);
      circle(8, -5, 5);
      rect(0, 8, 15, 4, 2);
    }
    drawingContext.globalAlpha = 1;
    pop();

    if (enemy.alive && enemy.maxHp > 1) {
      const barW = enemy.boss ? 86 : enemy.w + 10;
      noStroke();
      fill(0, 0, 0, 155);
      rect(enemy.x + enemy.w / 2 - barW / 2, enemy.y - 18, barW, 8, 4);
      fill(enemy.elite ? color(theme.palette.accent) : color(theme.palette.hazard));
      rect(enemy.x + enemy.w / 2 - barW / 2, enemy.y - 18, barW * enemy.hp / enemy.maxHp, 8, 4);
    }
  }
}

function drawProjectiles(theme) {
  noStroke();
  world.projectiles.forEach((projectile) => {
    fill(projectile.type === 'frost' ? '#b8f1ff' : '#ff9c5c');
    circle(projectile.x, projectile.y, projectile.radius * 2);
    fill(255, 255, 255, 135);
    circle(projectile.x - projectile.vx * 0.35, projectile.y, projectile.radius);
  });
  world.enemyProjectiles.forEach((projectile) => {
    fill(color(theme.palette.hazard));
    if (projectile.kind === 'shockwave') {
      ellipse(projectile.x, projectile.y, projectile.radius * 2.5, projectile.radius * 1.25);
    } else circle(projectile.x, projectile.y, projectile.radius * 2);
    noFill();
    stroke(255, 255, 255, 115);
    strokeWeight(2);
    circle(projectile.x, projectile.y, projectile.radius * 2.8);
    noStroke();
  });
}

function drawPlayers() {
  activePlayers().forEach((player) => {
    if (!player.alive && gameMode !== 'co-op') return;
    if (!player.alive) {
      drawRescueBubble(player);
      return;
    }
    if (player.invincibleTimer > 0 && floor(player.invincibleTimer / 5) % 2 === 0) return;
    push();
    translate(player.x + player.w / 2, player.y + player.h / 2);
    const stretch = settings.reducedMotion ? 0 : constrain(-player.vy * 0.018, -0.16, 0.17);
    scale(player.facing, 1);
    scale(1 - stretch * 0.45, 1 + stretch);
    if (player.powers.shield > 0) {
      noFill();
      stroke('#79e9ff');
      strokeWeight(3);
      ellipse(0, 0, player.w + 19, player.h + 19);
    }
    if (player.powers.storm > 0) {
      stroke('#8feaff');
      strokeWeight(2);
      line(-10, -player.h / 2, -18, -player.h / 2 - 10);
      line(10, -player.h / 2, 18, -player.h / 2 - 12);
    }
    if (player.powers.gale > 0) {
      noFill();
      stroke(225, 255, 255, 130);
      strokeWeight(2);
      arc(0, 0, player.w + 26, player.h + 18, -HALF_PI, HALF_PI);
    }
    rectMode(CENTER);
    noStroke();
    fill(color(player.bodyColor));
    rect(0, 0, player.w, player.h, 9);
    fill(255, 255, 255, 28);
    rect(0, -player.h * 0.28, player.w * 0.72, 8, 4);
    fill(color(player.detailColor));
    rect(0, -2, player.w * 0.58, player.h * 0.31, 4);
    fill(22, 30, 40);
    circle(8, -4, 5);
    fill('#202838');
    rect(-8, player.h / 2 - 1, 9, 8, 3);
    rect(8, player.h / 2 - 1, 9, 8, 3);

    if (player.attackAnim > 0) {
      noFill();
      stroke(player.powers.prism > 0 ? '#77ffd8' : color(player.trailColor));
      strokeWeight(player.powers.prism > 0 ? 7 : 4);
      const size = player.powers.prism > 0 ? 122 : 66;
      arc(player.w * 0.7, 0, size, size, -PI * 0.46, PI * 0.48);
    }
    pop();

    if (Math.abs(player.vx) > 2.8 && player.onGround && !settings.reducedMotion && frameCount % 5 === 0) {
      spawnBurst(player.x + player.w / 2 - player.facing * 12, player.y + player.h - 2, player.trailColor, 1, 1.5);
    }
  });
}

function drawForceEffects() {
  activePlayers().forEach((player) => {
    if (!player.alive || player.powers.storm <= 0 || player.attackAnim <= 0) return;
    const start = {
      x: player.x + player.w / 2 + player.facing * player.w * 0.42,
      y: player.y + player.h * 0.4
    };
    const targets = player.stormTargets?.length ? player.stormTargets : [{
      x: start.x + player.facing * 168,
      y: start.y
    }];
    push();
    noFill();
    strokeCap(ROUND);
    targets.forEach((target, index) => drawLightningBolt(start, target, index));
    noStroke();
    fill(205, 244, 255, 220);
    circle(start.x, start.y, 13 + sin(gameFrame * 1.7) * 3);
    fill(255, 255, 255, 235);
    circle(start.x, start.y, 5);
    pop();
  });
}

function drawLightningBolt(start, target, boltIndex) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const length = max(1, sqrt(dx * dx + dy * dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const amplitude = settings.reducedMotion ? 5 : 15;
  const points = [];
  const segments = 10;
  for (let index = 0; index <= segments; index++) {
    const amount = index / segments;
    const edgeFade = sin(amount * PI);
    const phase = gameFrame * 1.9 + index * 2.63 + boltIndex * 4.17;
    const jitter = (sin(phase) + cos(phase * 1.71)) * amplitude * 0.5 * edgeFade;
    points.push({
      x: lerp(start.x, target.x, amount) + normalX * jitter,
      y: lerp(start.y, target.y, amount) + normalY * jitter
    });
  }

  stroke(68, 154, 255, 72);
  strokeWeight(11);
  beginShape();
  points.forEach((point) => vertex(point.x, point.y));
  endShape();
  stroke(116, 218, 255, 235);
  strokeWeight(4.5);
  beginShape();
  points.forEach((point) => vertex(point.x, point.y));
  endShape();
  stroke(255, 255, 255, 245);
  strokeWeight(1.5);
  beginShape();
  points.forEach((point) => vertex(point.x, point.y));
  endShape();

  [3, 6, 8].forEach((index, branchIndex) => {
    const point = points[index];
    const branchLength = 18 + branchIndex * 6;
    stroke(branchIndex % 2 ? 255 : 135, branchIndex % 2 ? 235 : 220, 255, 190);
    strokeWeight(1.8);
    line(point.x, point.y, point.x + normalX * branchLength + dx / length * 9, point.y + normalY * branchLength + dy / length * 9);
  });
  noStroke();
  fill(132, 225, 255, 170);
  circle(target.x, target.y, 18 + sin(gameFrame * 1.4 + boltIndex) * 5);
  fill(255, 250, 195, 235);
  circle(target.x, target.y, 6);
}

function drawRescueBubble(player) {
  const partner = livingPlayers()[0];
  if (!partner) return;
  const progressValue = constrain(1 - player.rescueTimer / 240, 0, 1);
  const x = partner.x + (player.id === 0 ? -72 : 72);
  const y = max(90, partner.y - 70 + sin(gameFrame * 0.06) * 8);
  noFill();
  stroke('#dffcff');
  strokeWeight(3);
  circle(x, y, 44);
  arc(x, y, 54, 54, -HALF_PI, -HALF_PI + TWO_PI * progressValue);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(13);
  text(player.name, x, y);
}

function drawParticles() {
  noStroke();
  particles.forEach((particle) => {
    const alpha = constrain(particle.life / particle.maxLife, 0, 1) * 230;
    const particleColour = color(particle.colour);
    particleColour.setAlpha(alpha);
    fill(particleColour);
    circle(particle.x, particle.y, particle.size);
  });
}

function drawHUD(theme) {
  const active = activePlayers();
  if (gameMode === 'co-op') {
    drawPlayerPanel(active[0], 14, 12, 248, theme);
    drawPlayerPanel(active[1], 270, 12, 248, theme);
  } else drawPlayerPanel(active[0], 14, 12, 292, theme);

  drawPanel(W - 350, 12, 336, 105, 14, color(6, 16, 30, 210));
  fill(255);
  textAlign(LEFT, TOP);
  textSize(16);
  text(`${selectedStage + 1}. ${theme.shortName}`, W - 334, 25);
  fill(color(theme.palette.accent));
  text(`Time ${formatTime(runTime)}  ·  Par ${formatTime(theme.parTime)}`, W - 334, 49);
  fill(220, 232, 244);
  text(`Shards ${collectedShardCount()}/3  ·  Score ${runScore()}`, W - 334, 73);
  const lockedBlockades = world.solids.filter((solid) => solid.arenaGate && activeSolid(solid)).length;
  fill(world.gateOpen ? color(theme.palette.accent) : color(theme.palette.hazard));
  text(lockedBlockades > 0 ? `Imperial locks: ${2 - lockedBlockades}/2` : world.gateOpen ? 'EXIT OPEN' : `Boss: ${theme.bossName}`, W - 334, 95);

  const boss = world.enemies.find((enemy) => enemy.boss && enemy.alive);
  if (boss && boss.x < cameraX + W + 250 && boss.x > cameraX - 250) drawBossBar(boss, theme);

  if (messageTimer > 0 && message) {
    const alpha = min(1, messageTimer / 35);
    const panelW = min(740, max(320, textWidth(message) + 44));
    drawPanel(W / 2 - panelW / 2, 128, panelW, 42, 12, color(5, 14, 28, 180 * alpha));
    fill(255, 255, 255, 240 * alpha);
    textAlign(CENTER, CENTER);
    textSize(15);
    text(message, W / 2, 149);
  }

  if (gameMode === 'co-op' && finishCountdown > 0) {
    fill(color(theme.palette.accent));
    textAlign(CENTER, CENTER);
    textSize(22);
    text(`PARTNER RELAY: ${ceil(finishCountdown / 60)}s`, W / 2, 193);
  }
}

function drawPlayerPanel(player, x, y, panelW, theme) {
  drawPanel(x, y, panelW, 105, 14, color(6, 16, 30, 210));
  fill(255);
  textAlign(LEFT, TOP);
  textSize(17);
  text(`${player.name}${player.alive ? '' : ' · RESCUE'}`, x + 14, y + 12);
  fill(color(player.bodyColor));
  rect(x + 14, y + 36, panelW - 28, 4, 3);
  for (let index = 0; index < player.maxLives; index++) {
    fill(index < player.lives ? color(theme.palette.hazard) : color(65, 78, 94));
    circle(x + 20 + index * 20, y + 56, 11);
  }
  fill(225, 235, 245);
  textSize(14);
  text(`Coins ${player.coins}  ·  Score ${player.score}`, x + 14, y + 72);
  const power = currentPowerLabel(player);
  fill(power === 'Vibroblade' ? color(190, 205, 220) : color(theme.palette.accent));
  text(power, x + 14, y + 91);
}

function currentPowerLabel(player) {
  if (player.powers.storm > 0) return `Dark Side · Lightning ${ceil(player.powers.storm / 60)}s`;
  if (player.powers.gale > 0) return `Light Side · Force Push ${ceil(player.powers.gale / 60)}s`;
  if (player.powers.prism > 0) return `Lightsaber ${ceil(player.powers.prism / 60)}s`;
  if (player.shotMode === 'frost' && player.powers.frost > 0) return `Carbonite Pulse ${ceil(player.powers.frost / 60)}s`;
  if (player.powers.blaster > 0) return `Blaster ${ceil(player.powers.blaster / 60)}s`;
  if (player.powers.frost > 0) return `Carbonite Pulse ${ceil(player.powers.frost / 60)}s`;
  return 'Vibroblade';
}

function drawBossBar(boss, theme) {
  const barW = 430;
  drawPanel(W / 2 - barW / 2, H - 42, barW, 27, 10, color(7, 12, 24, 220));
  noStroke();
  fill(color(theme.palette.hazard));
  rect(W / 2 - barW / 2 + 8, H - 34, (barW - 16) * boss.hp / boss.maxHp, 11, 5);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text(theme.bossName, W / 2, H - 28);
}

function buildMenuButtons() {
  menuButtons = [
    { action: 'prevStage', x: 82, y: 176, w: 58, h: 58, label: '‹' },
    { action: 'nextStage', x: W - 140, y: 176, w: 58, h: 58, label: '›' },
    { action: 'single', x: 190, y: 338, w: 250, h: 50, label: 'SINGLE PLAYER' },
    { action: 'co-op', x: 520, y: 338, w: 250, h: 50, label: 'LOCAL CO-OP' },
    { action: 'character', x: 190, y: 405, w: 250, h: 55, label: '' },
    { action: 'start', x: 520, y: 405, w: 250, h: 55, label: 'LAUNCH' }
  ];
}

function buildChoiceButtons() {
  choiceButtons = [
    { action: 'storm', x: 190, y: 310, w: 250, h: 92, label: 'DARK SIDE' },
    { action: 'gale', x: 520, y: 310, w: 250, h: 92, label: 'LIGHT SIDE' }
  ];
}

function buildPauseButtons() {
  pauseButtons = [
    { action: 'resume', x: 160, y: 330, w: 190, h: 56, label: 'RESUME' },
    { action: 'retry', x: 385, y: 330, w: 190, h: 56, label: 'RETRY' },
    { action: 'menu', x: 610, y: 330, w: 190, h: 56, label: 'STAGE MENU' }
  ];
}

function drawMenu(theme) {
  fill(3, 9, 18, 118);
  rect(0, 0, W, H);
  drawPanel(48, 26, W - 96, H - 52, 24, color(5, 15, 29, 222));

  fill(color(theme.palette.accent));
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(38);
  text('SKYBOUND CIRCUIT DX', W / 2, 48);
  textStyle(NORMAL);
  fill(190, 211, 229);
  textSize(14);
  text('Six worlds · choose your Force path · unofficial fan project', W / 2, 94);

  fill(255);
  textStyle(BOLD);
  textSize(27);
  text(`${selectedStage + 1}. ${theme.name.toUpperCase()}`, W / 2, 138);
  textStyle(NORMAL);
  fill(195, 213, 229);
  textSize(14);
  text(theme.story, W / 2, 178);

  drawMiniStagePreview(theme);
  menuButtons.forEach((button) => drawMenuButton(button, theme));

  const character = CFG.characters[selectedCharacter];
  fill(color(character.body));
  circle(222, 433, 24);
  fill(255);
  textAlign(LEFT, CENTER);
  textSize(15);
  text(`PILOT: ${character.name.toUpperCase()}`, 247, 433);

  const stageId = theme.id;
  const best = progress.bestScores[stageId] || 0;
  const bestTime = progress.bestTimes[stageId];
  const grade = progress.bestGrades[stageId] || '—';
  fill(180, 199, 216);
  textAlign(CENTER, CENTER);
  textSize(13);
  text(`BEST ${best}  ·  ${bestTime ? formatTime(bestTime) : '--:--'}  ·  GRADE ${grade}  ·  SHARDS ${progress.shards[stageId] || 0}/3`, W / 2, 475);
  fill(130, 155, 177);
  text('Q / E stage  ·  1 / 2 mode  ·  C pilot  ·  Enter launch', W / 2, 505);
}

function drawMiniStagePreview(theme) {
  const x = 170;
  const y = 208;
  const widthValue = 620;
  const heightValue = 105;
  noStroke();
  fill(color(theme.palette.skyBottom));
  rect(x, y, widthValue, heightValue, 16);
  fill(color(theme.palette.far));
  for (let index = 0; index < 5; index++) ellipse(x + index * 160, y + heightValue, 240, 95);
  fill(color(theme.palette.ground));
  rect(x, y + 78, widthValue, 27, 0, 0, 16, 16);
  fill(color(theme.palette.platform));
  rect(x + 110, y + 62, 75, 12, 5);
  rect(x + 255, y + 45, 70, 12, 5);
  rect(x + 405, y + 60, 78, 12, 5);
  fill(color(theme.palette.hazard));
  rect(x + 530, y + 48, 42, 30, 9);
  fill(color(theme.palette.accent));
  circle(x + 150, y + 40, 12);
  circle(x + 290, y + 25, 12);
  circle(x + 445, y + 38, 12);

  const dotY = y + heightValue + 12;
  for (let index = 0; index < CFG.stages.length; index++) {
    fill(index === selectedStage ? color(theme.palette.accent) : index < progress.unlockedStages ? color(115, 145, 170) : color(48, 61, 74));
    circle(W / 2 - 50 + index * 20, dotY, index === selectedStage ? 10 : 7);
  }
}

function drawMenuButton(button, theme) {
  const hover = pointInButton(mouseX, mouseY, button);
  let selected = false;
  if (button.action === 'single') selected = gameMode === 'single';
  if (button.action === 'co-op') selected = gameMode === 'co-op';
  const disabled = (button.action === 'prevStage' && selectedStage === 0) || (button.action === 'nextStage' && selectedStage >= progress.unlockedStages - 1);
  drawButton(button, hover, selected, disabled, theme);
}

function drawButton(button, hover, selected, disabled, theme) {
  noStroke();
  if (disabled) fill(34, 47, 60, 165);
  else if (selected) fill(color(theme.palette.near));
  else if (hover) fill(35, 84, 112, 245);
  else fill(20, 43, 65, 232);
  rect(button.x, button.y, button.w, button.h, 12);
  noFill();
  stroke(disabled ? color(75, 88, 101) : selected || hover ? color(theme.palette.accent) : color(100, 145, 177));
  strokeWeight(selected || hover ? 2.5 : 1.5);
  rect(button.x, button.y, button.w, button.h, 12);
  noStroke();
  fill(disabled ? color(95, 105, 115) : color(245));
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(button.w < 80 ? 34 : 16);
  text(button.label, button.x + button.w / 2, button.y + button.h / 2);
  textStyle(NORMAL);
}

function drawPauseOverlay() {
  drawOverlayBase('CIRCUIT PAUSED', 'P / Escape resumes · Settings can remap every control');
  const theme = CFG.stages[selectedStage];
  pauseButtons.forEach((button) => drawButton(button, pointInButton(mouseX, mouseY, button), false, false, theme));
  fill(190, 210, 226);
  textAlign(CENTER, CENTER);
  textSize(14);
  text(`Time ${formatTime(runTime)}  ·  Score ${runScore()}  ·  Shards ${collectedShardCount()}/3`, W / 2, 416);
}

function drawChoiceOverlay() {
  const player = players[pendingChoice.playerId];
  drawOverlayBase('CHOOSE YOUR FORCE PATH', `${player.name} found a holocron. Use ← / → and Enter, or tap a path.`);
  const theme = CFG.stages[selectedStage];
  choiceButtons.forEach((button) => {
    const selected = pendingChoice.selected === button.action;
    drawButton(button, pointInButton(mouseX, mouseY, button), selected, false, theme);
    fill(190, 214, 230);
    textAlign(CENTER, TOP);
    textSize(13);
    const description = button.action === 'storm' ? 'Force lightning · aggressive score play' : 'Force push · bonus energy';
    text(description, button.x + button.w / 2, button.y + button.h + 10);
  });
}

function drawGameOverOverlay() {
  drawOverlayBase('THE FORCE FADES', world.checkpoint.reached ? 'R retries from the checkpoint · M returns to stages' : 'R restarts the stage · M returns to stages');
  fill(220);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(`Time ${formatTime(runTime)}  ·  Score ${runScore()}  ·  Damage ${stageStats.damageTaken}`, W / 2, 350);
}

function drawWinOverlay() {
  const theme = CFG.stages[selectedStage];
  fill(3, 9, 18, 185);
  rect(0, 0, W, H);
  drawPanel(145, 55, 670, 430, 24, color(5, 15, 29, 235));
  fill(color(theme.palette.accent));
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(54);
  text(`GRADE ${result.grade}`, W / 2, 82);
  textStyle(NORMAL);
  fill(255);
  textSize(25);
  text(`${theme.name.toUpperCase()} CLEARED`, W / 2, 153);
  fill(190, 211, 229);
  textSize(16);
  text(`Time ${formatTime(result.time)}  ·  Score ${result.score}  ·  Shards ${result.shards}/3`, W / 2, 206);
  text(`Boss defeated  ·  Damage ${stageStats.damageTaken}  ·  Retries ${stageStats.retries}`, W / 2, 239);
  if (result.newBest) {
    fill(color(theme.palette.accent));
    textStyle(BOLD);
    text('NEW PERSONAL BEST', W / 2, 277);
    textStyle(NORMAL);
  }

  const unlocked = CFG.characters.find((character) => character.unlockStage === progress.unlockedStages);
  if (unlocked && selectedStage + 2 === unlocked.unlockStage) {
    fill('#d9b5ff');
    text(`Pilot unlocked: ${unlocked.name}`, W / 2, 310);
  }
  fill(225);
  textSize(16);
  text(selectedStage < CFG.stages.length - 1 ? 'Enter: next stage  ·  R: replay  ·  M: stage menu' : 'Enter: stage menu  ·  R: replay the finale', W / 2, 377);
  fill(135, 158, 179);
  textSize(13);
  text('S grade: beat par, collect every shard, and take no damage.', W / 2, 424);
}

function drawOverlayBase(titleValue, subtitle) {
  fill(3, 9, 18, 176);
  rect(0, 0, W, H);
  drawPanel(120, 105, 720, 340, 24, color(5, 15, 29, 235));
  fill(255);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(40);
  text(titleValue, W / 2, 145);
  textStyle(NORMAL);
  fill(190, 211, 229);
  textSize(15);
  text(subtitle, W / 2, 205);
}

function drawPanel(x, y, widthValue, heightValue, radius, panelColor) {
  noStroke();
  fill(panelColor);
  rect(x, y, widthValue, heightValue, radius);
  noFill();
  stroke(145, 205, 240, 44);
  strokeWeight(1.5);
  rect(x + 1, y + 1, widthValue - 2, heightValue - 2, radius);
  noStroke();
}

function worldRectVisible(rectValue, padding = 140) {
  return rectValue.x + rectValue.w > cameraX - padding && rectValue.x < cameraX + W + padding;
}

function worldCircleVisible(x, _y, radius, padding = 140) {
  return x + radius > cameraX - padding && x - radius < cameraX + W + padding;
}

function pointInButton(x, y, button) {
  return x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const minutes = floor(seconds / 60);
  const remainder = floor(seconds % 60);
  const tenths = floor((seconds % 1) * 10);
  return `${minutes}:${String(remainder).padStart(2, '0')}.${tenths}`;
}

function changeStage(direction) {
  const next = constrain(selectedStage + direction, 0, progress.unlockedStages - 1);
  if (next === selectedStage) return;
  selectedStage = next;
  progress.selectedStage = selectedStage;
  GameStorage.saveProgress(progress);
  loadPreview();
  GameAudio.sfx('menu');
}

function cycleCharacter() {
  const available = CFG.characters.map((character, index) => ({ character, index })).filter(({ character }) => progress.unlockedStages >= character.unlockStage);
  const currentPosition = max(0, available.findIndex(({ index }) => index === selectedCharacter));
  selectedCharacter = available[(currentPosition + 1) % available.length].index;
  progress.selectedCharacter = selectedCharacter;
  GameStorage.saveProgress(progress);
  loadPreview();
  GameAudio.sfx('menu');
}

function mousePressed() {
  if (scene === 'menu') {
    const button = menuButtons.find((item) => pointInButton(mouseX, mouseY, item));
    if (!button) return false;
    if (button.action === 'prevStage') changeStage(-1);
    else if (button.action === 'nextStage') changeStage(1);
    else if (button.action === 'single' || button.action === 'co-op') { gameMode = button.action; loadPreview(); GameAudio.sfx('menu'); }
    else if (button.action === 'character') cycleCharacter();
    else if (button.action === 'start') startRun();
    return false;
  }
  if (scene === 'choice') {
    const button = choiceButtons.find((item) => pointInButton(mouseX, mouseY, item));
    if (button) chooseAspect(button.action);
    return false;
  }
  if (scene === 'pause') {
    const button = pauseButtons.find((item) => pointInButton(mouseX, mouseY, item));
    if (!button) return false;
    if (button.action === 'resume') togglePause();
    else if (button.action === 'retry') retryFromCheckpoint();
    else if (button.action === 'menu') returnToMenu();
    return false;
  }
  return false;
}

function handleSceneCommand(code) {
  if (scene === 'menu') {
    if (code === 'Digit1') { gameMode = 'single'; loadPreview(); }
    else if (code === 'Digit2') { gameMode = 'co-op'; loadPreview(); }
    else if (code === 'KeyQ' || code === 'ArrowLeft') changeStage(-1);
    else if (code === 'KeyE' || code === 'ArrowRight') changeStage(1);
    else if (code === 'KeyC') cycleCharacter();
    else if (code === 'Enter') startRun();
    return;
  }
  if (scene === 'playing') {
    if (code === 'KeyP' || code === 'Escape') togglePause();
    return;
  }
  if (scene === 'pause') {
    if (code === 'KeyP' || code === 'Escape') togglePause();
    else if (code === 'KeyR') retryFromCheckpoint();
    else if (code === 'KeyM') returnToMenu();
    return;
  }
  if (scene === 'choice') {
    if (code === 'ArrowLeft' || code === 'KeyA') pendingChoice.selected = 'storm';
    else if (code === 'ArrowRight' || code === 'KeyD') pendingChoice.selected = 'gale';
    else if (code === 'Enter' || code === 'Space') chooseAspect(pendingChoice.selected);
    return;
  }
  if (scene === 'gameover') {
    if (code === 'KeyR' || code === 'Enter') retryFromCheckpoint();
    else if (code === 'KeyM') returnToMenu();
    return;
  }
  if (scene === 'win') {
    if (code === 'KeyR') startRun();
    else if (code === 'KeyM') returnToMenu();
    else if (code === 'Enter') advanceAfterWin();
  }
}

function keyPressed() {
  if (document.getElementById('settings-dialog')?.open) return true;
  return false;
}

function keyReleased() { return document.getElementById('settings-dialog')?.open ? true : false; }
