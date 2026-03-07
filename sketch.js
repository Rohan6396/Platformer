let scene = 'start';
let paused = false;
let gameMode = 'single';
let worldWidth = 24000;
let groundY = 440;
let gravity = 0.9;
let cameraX = 0;
let highScore = 0;
let gameTicks = 0;
let levelMessage = '';
let levelMessageTimer = 0;
let players = [];
let solids = [];
let enemies = [];
let coins = [];
let powerUps = [];
let projectiles = [];
let finishFlag = null;
let checkpointX = 120;
let checkpointReached = false;
let checkpointMarkerX = 11850;

let modeButtons = [];
let pauseButtons = [];
let forceChoiceButtons = [];
let pendingForceChoice = null;

let stars = [];
let clouds = [];
let hills = [];

let audioCtx = null;
let audioStarted = false;
let musicIndex = 0;
let bassIndex = 0;
const musicMelody = [523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 880.0, 783.99, 698.46, 659.25];
const musicBass = [130.81, 146.83, 164.81, 146.83, 110.0, 123.47];

let pressedCodes = new Set();

function setup() {
  createCanvas(960, 540);
  textFont('monospace');
  loadHighScore();
  buildBackground();
  buildModeButtons();
  buildPauseButtons();
  buildForceChoiceButtons();
  installInputHandlers();
  resetGame();
}

function draw() {
  drawSky();

  if (scene === 'playing' && !paused && !pendingForceChoice) {
    updateGame();
  }

  updateCamera();

  push();
  translate(-cameraX, 0);
  drawWorld();
  pop();

  drawHUD();

  if (scene === 'start') drawStartScreen();
  else if (pendingForceChoice) drawForceChoiceScreen();
  else if (paused) drawPauseScreen();
  else if (scene === 'gameover') {
    drawOverlay('GAME OVER', checkpointReached ? 'Press R to continue from the checkpoint' : 'Press R to restart from the beginning');
  }
  else if (scene === 'win') drawOverlay('YOU WIN!', 'Press R to start a fresh run from the start');
}

function resetGame() {
  buildLevel();
  players = createPlayers();
  checkpointX = 120;
  checkpointReached = false;
  pendingForceChoice = null;
  paused = false;
  gameTicks = 0;
  cameraX = 0;
  projectiles = [];
  scene = 'start';
  levelMessage = gameMode === 'co-op'
    ? 'Co-op mode ready: work together, bounce off each other, and survive.'
    : 'Single-player mode ready: arrows to move, / to attack.';
  levelMessageTimer = 260;
}

function createPlayers() {
  let p1 = createPlayer(0, 'P1', 120, color(255, 90, 110), color(255, 220, 160), {
    left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS', attack: 'Space', attackLabel: 'SPACE'
  });
  let p2 = createPlayer(1, 'P2', 172, color(90, 170, 255), color(200, 235, 255), {
    left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown', attack: 'Slash', attackLabel: '/ ?'
  });
  if (gameMode === 'single') {
    p1.active = false;
    p1.alive = false;
    p1.lives = 0;
    p2.name = 'P1';
  }
  return [p1, p2];
}

function createPlayer(id, name, x, bodyColor, detailColor, controls) {
  return {
    id, name, active: true, x, y: 280, w: 34, h: 46, vx: 0, vy: 0, prevY: 0,
    onGround: false, crouching: false, downHeld: false, attackHeld: false, forceFiring: false,
    big: true, lives: 2, maxLives: 2, alive: true, finished: false,
    coins: 0, xp: 0, score: 0, hurtTimer: 0, invincibleTimer: 0,
    fireTimer: 0, iceTimer: 0, saberTimer: 0, darkTimer: 0, lightTimer: 0, shieldTimer: 0,
    shotCooldown: 0, saberCooldown: 0, saberSwingTimer: 0, jumpBufferTimer: 0, coyoteTimer: 0,
    jumpHeldPrev: false, attackHeldPrev: false,
    shotMode: 'fire', facing: 1, bodyColor, detailColor, controls, checkpointX: 120
  };
}

function activePlayers() { return players.filter(p => p.active); }
function livingPlayers() { return players.filter(p => p.active && p.alive); }

function buildModeButtons() {
  modeButtons = [
    { mode: 'single', x: width / 2 - 220, y: 392, w: 180, h: 56, label: 'Single Player' },
    { mode: 'co-op', x: width / 2 + 40, y: 392, w: 180, h: 56, label: 'Co-op' }
  ];
}

function buildPauseButtons() {
  pauseButtons = [
    { action: 'resume', x: width / 2 - 300, y: height / 2 + 38, w: 180, h: 54, label: 'Resume' },
    { action: 'restart', x: width / 2 - 90, y: height / 2 + 38, w: 180, h: 54, label: 'Restart level' },
    { action: 'menu', x: width / 2 + 120, y: height / 2 + 38, w: 180, h: 54, label: 'Main Menu' }
  ];
}

function buildForceChoiceButtons() {
  forceChoiceButtons = [
    { side: 'dark', x: width / 2 - 250, y: height / 2 + 18, w: 210, h: 68, label: 'Dark Side' },
    { side: 'light', x: width / 2 + 40, y: height / 2 + 18, w: 210, h: 68, label: 'Light Side' }
  ];
}

function buildBackground() {
  stars = [];
  clouds = [];
  hills = [];
  for (let i = 0; i < 130; i++) stars.push({ x: random(worldWidth), y: random(220), s: random(1, 3) });
  for (let i = 0; i < 36; i++) clouds.push({ x: random(worldWidth), y: random(35, 180), w: random(100, 190), h: random(28, 62) });
  for (let i = 0; i < 60; i++) hills.push({ x: i * 420 + random(-90, 90), w: random(250, 420), h: random(80, 180) });
}

function buildLevel() {
  solids = [];
  enemies = [];
  coins = [];
  powerUps = [];
  projectiles = [];
  solids.push({ x: 0, y: groundY, w: worldWidth, h: height - groundY, style: 'ground' });
  buildMeadowSection(0);
  buildRuinsSection(3800);
  buildCanopySection(7700);
  buildFactorySection(11600);
  buildCanyonSection(15600);
  buildFinalGauntletSection(19700);
  finishFlag = { x: worldWidth - 220, y: 250, w: 28, h: 190 };
}

function buildMeadowSection(base) {
  addStairRun(base + 320, 5, 80, 26, 18, 'platform');
  addObstacle(base + 1080, 70, 54);
  addObstacle(base + 1430, 84, 78);
  addTunnel(base + 1880, 420, 386);
  addPlatform(base + 2600, 350, 150, 22);
  addPlatform(base + 2825, 320, 120, 22);
  addPlatform(base + 3040, 286, 120, 22);
  addPlatform(base + 3260, 320, 160, 22);
  addEnemy('walker', base + 620, groundY - 36, base + 470, base + 930);
  addEnemy('hopper', base + 1220, groundY - 30, base + 1080, base + 1600);
  addEnemy('drone', base + 2130, 300, base + 1900, base + 2350);
  addEnemy('walker', base + 3300, groundY - 36, base + 3200, base + 3560);
  addCoinRow(base + 240, 380, 5, 40);
  addCoinArc(base + 740, 300, 6, 40, 18);
  addCoinRow(base + 1930, 352, 7, 42);
  addCoinArc(base + 2840, 255, 6, 42, 18);
  addPowerUp(base + 2300, 398, 'shield');
}

function buildRuinsSection(base) {
  addLowBeamRun(base + 180, 3, 360, 388);
  addObstacle(base + 320, 70, 60);
  addObstacle(base + 760, 112, 76);
  addObstacle(base + 1340, 80, 82);
  addPlatform(base + 1180, 340, 110, 22);
  addPlatform(base + 1440, 306, 120, 22);
  addPlatform(base + 1700, 274, 130, 22);
  addPlatform(base + 1960, 312, 140, 22);
  addTunnel(base + 2340, 520, 394);
  addPlatform(base + 3060, 310, 120, 22);
  addPlatform(base + 3320, 274, 120, 22);
  addEnemy('walker', base + 500, groundY - 36, base + 240, base + 900);
  addEnemy('hopper', base + 1110, groundY - 30, base + 940, base + 1450);
  addEnemy('drone', base + 1770, 250, base + 1600, base + 2100);
  addEnemy('hopper', base + 2600, groundY - 30, base + 2380, base + 2880);
  addEnemy('walker', base + 3370, groundY - 36, base + 3100, base + 3570);
  addCoinRow(base + 220, 355, 4, 42);
  addCoinRow(base + 1180, 300, 4, 42);
  addCoinArc(base + 1990, 285, 5, 42, 20);
  addCoinRow(base + 2440, 360, 7, 42);
  addCoinArc(base + 3170, 255, 5, 42, 18);
  addPowerUp(base + 3460, 398, 'force');
}

function buildCanopySection(base) {
  addPlatform(base + 220, 362, 150, 22);
  addPlatform(base + 430, 332, 140, 22);
  addPlatform(base + 640, 304, 130, 22);
  addPlatform(base + 850, 278, 120, 22);
  addPlatform(base + 1040, 252, 120, 22);
  addPlatform(base + 1260, 276, 140, 22);
  addPlatform(base + 1490, 308, 130, 22);
  addObstacle(base + 1760, 74, 68);
  addTunnel(base + 2080, 460, 390);
  addPlatform(base + 2720, 334, 160, 22);
  addStairRun(base + 2990, 5, 82, 24, 20, 'platform');
  addPlatform(base + 3550, 258, 190, 22);
  addEnemy('hopper', base + 340, groundY - 30, base + 180, base + 660);
  addEnemy('drone', base + 930, 205, base + 760, base + 1290);
  addEnemy('walker', base + 1870, groundY - 36, base + 1740, base + 2010);
  addEnemy('drone', base + 2270, 280, base + 2100, base + 2510);
  addEnemy('hopper', base + 3120, groundY - 30, base + 2920, base + 3420);
  addEnemy('walker', base + 3610, groundY - 36, base + 3480, base + 3770);
  addCoinArc(base + 260, 330, 4, 40, 18);
  addCoinArc(base + 760, 220, 6, 40, 18);
  addCoinRow(base + 2110, 352, 6, 42);
  addCoinArc(base + 3080, 245, 5, 42, 18);
  addCoinRow(base + 3590, 235, 4, 42);
  addPowerUp(base + 1210, 180, 'fire');
}

function buildFactorySection(base) {
  addLowBeamRun(base + 260, 2, 430, 392);
  addObstacle(base + 360, 82, 70);
  addObstacle(base + 980, 70, 82);
  addObstacle(base + 1480, 98, 82);
  addTunnel(base + 1860, 540, 384);
  addPlatform(base + 2560, 350, 130, 22);
  addPlatform(base + 2800, 315, 130, 22);
  addPlatform(base + 3040, 282, 130, 22);
  addObstacle(base + 3450, 76, 74);
  addTunnel(base + 3740, 420, 392);
  addEnemy('walker', base + 610, groundY - 36, base + 380, base + 910);
  addEnemy('drone', base + 1230, 270, base + 1040, base + 1460);
  addEnemy('hopper', base + 1690, groundY - 30, base + 1530, base + 1810);
  addEnemy('walker', base + 2220, groundY - 36, base + 1900, base + 2380);
  addEnemy('drone', base + 3240, 225, base + 3090, base + 3380);
  addEnemy('hopper', base + 3910, groundY - 30, base + 3780, base + 4120);
  addCoinRow(base + 300, 355, 5, 42);
  addCoinArc(base + 1170, 240, 4, 44, 18);
  addCoinRow(base + 1930, 350, 9, 42);
  addCoinArc(base + 2590, 250, 6, 42, 18);
  addCoinRow(base + 3760, 355, 5, 42);
  addPowerUp(base + 3380, 398, 'saber');
}
function buildCanyonSection(base) {
  addPlatform(base + 240, 362, 130, 22);
  addPlatform(base + 470, 334, 120, 22);
  addPlatform(base + 680, 306, 110, 22);
  addPlatform(base + 890, 278, 110, 22);
  addPlatform(base + 1110, 308, 120, 22);
  addObstacle(base + 1370, 96, 78);
  addTunnel(base + 1760, 460, 386);
  addStairRun(base + 2440, 6, 76, 22, 22, 'platform');
  addObstacle(base + 3250, 84, 76);
  addLowBeamRun(base + 3440, 2, 320, 390);
  addPlatform(base + 3670, 286, 130, 22);
  addPlatform(base + 3850, 250, 140, 22);
  addEnemy('drone', base + 390, 260, base + 240, base + 620);
  addEnemy('hopper', base + 1160, groundY - 30, base + 1000, base + 1320);
  addEnemy('walker', base + 1550, groundY - 36, base + 1410, base + 1670);
  addEnemy('drone', base + 2190, 310, base + 1800, base + 2260);
  addEnemy('hopper', base + 2920, groundY - 30, base + 2520, base + 3140);
  addEnemy('walker', base + 3820, groundY - 36, base + 3760, base + 3990);
  addCoinArc(base + 270, 300, 5, 42, 18);
  addCoinArc(base + 790, 250, 4, 40, 16);
  addCoinRow(base + 1800, 352, 7, 42);
  addCoinArc(base + 2540, 255, 7, 40, 16);
  addCoinRow(base + 3470, 352, 5, 42);
  addPowerUp(base + 2060, 398, 'force');
}

function buildFinalGauntletSection(base) {
  addLowBeamRun(base + 180, 1, 280, 392);
  addObstacle(base + 420, 84, 74);
  addPlatform(base + 760, 334, 150, 22);
  addPlatform(base + 990, 302, 130, 22);
  addPlatform(base + 1190, 274, 120, 22);
  addTunnel(base + 1380, 420, 388);
  addObstacle(base + 2080, 90, 78);
  addPlatform(base + 2360, 334, 130, 22);
  addPlatform(base + 2580, 302, 120, 22);
  addPlatform(base + 2790, 270, 120, 22);
  addPlatform(base + 2990, 240, 120, 22);
  addTunnel(base + 3200, 520, 392);
  addObstacle(base + 3960, 78, 72);
  addEnemy('walker', base + 640, groundY - 36, base + 460, base + 940);
  addEnemy('drone', base + 1160, 240, base + 1060, base + 1320);
  addEnemy('hopper', base + 1700, groundY - 30, base + 1460, base + 1800);
  addEnemy('walker', base + 2290, groundY - 36, base + 2140, base + 2520);
  addEnemy('drone', base + 2940, 180, base + 2800, base + 3020);
  addEnemy('hopper', base + 3510, groundY - 30, base + 3270, base + 3700);
  addEnemy('walker', base + 4120, groundY - 36, base + 3980, base + 4200);
  addCoinRow(base + 220, 355, 4, 42);
  addCoinArc(base + 820, 250, 5, 42, 18);
  addCoinRow(base + 1420, 350, 6, 42);
  addCoinArc(base + 2420, 238, 6, 42, 18);
  addCoinRow(base + 3220, 352, 7, 42);
  addCoinArc(base + 4040, 255, 5, 42, 18);
  addPowerUp(base + 2680, 398, 'ice');
  addPowerUp(base + 3620, 398, 'saber');
}

function addObstacle(x, w, h) {
  h = min(h, 84);
  solids.push({ x, y: groundY - h, w, h, style: 'block' });
}

function addPlatform(x, y, w, h) { solids.push({ x, y, w, h, style: 'platform' }); }

function addTunnel(x, w, roofY) {
  solids.push({ x, y: roofY, w, h: 24, style: 'roof' });
  coins.push({ x: x + w * 0.5, y: roofY - 28, r: 11, collected: false });
}

function addLowBeamRun(startX, count, beamW, roofY) {
  for (let i = 0; i < count; i++) addTunnel(startX + i * (beamW + 110), beamW, roofY);
}

function addStairRun(startX, steps, gap, w, rise, style) {
  for (let i = 0; i < steps; i++) solids.push({ x: startX + i * gap, y: groundY - 34 - i * rise, w, h: 18, style: style || 'platform' });
}

function addEnemy(kind, x, y, left, right) {
  enemies.push({
    id: enemies.length, kind, x, y, w: kind === 'drone' ? 42 : 36, h: kind === 'hopper' ? 30 : 36,
    vx: kind === 'hopper' ? 1.7 : kind === 'drone' ? 2.0 : 1.35, vy: 0, onGround: false,
    left, right, alive: true, baseY: y, phase: random(TWO_PI), hopTimer: int(random(28, 90)),
    frozenTimer: 0, shockedTimer: 0, shockOwnerId: -1, stunnedTimer: 0, pushOwnerId: -1, deadTimer: 0, deathStyle: '', deathAnim: 0, deathFacing: 1
  });
}

function addCoinRow(startX, y, count, gap) { for (let i = 0; i < count; i++) coins.push({ x: startX + i * gap, y, r: 11, collected: false }); }

function addCoinArc(startX, y, count, gap, lift) {
  for (let i = 0; i < count; i++) {
    let middle = (count - 1) * 0.5;
    let curve = abs(i - middle) * lift;
    coins.push({ x: startX + i * gap, y: y - (lift * 1.6 - curve), r: 11, collected: false });
  }
}

function addPowerUp(x, y, type) { powerUps.push({ x, y, w: 30, h: 30, type, collected: false }); }

function updateGame() {
  gameTicks++;
  if (levelMessageTimer > 0) levelMessageTimer--;
  for (let p of activePlayers()) updatePlayerTimers(p);
  handleInputs();
  for (let p of activePlayers()) if (p.jumpBufferTimer > 0) tryJump(p);
  for (let p of activePlayers()) updatePlayer(p);
  updatePlayerInteractions();
  updateEnemies();
  updateForcePowers();
  updateProjectiles();
  collectCoins();
  collectPowerUps();
  updateCheckpoint();
  updateFinish();
  updateMusic();
}

function updatePlayerTimers(p) {
  if (p.hurtTimer > 0) p.hurtTimer--;
  if (p.invincibleTimer > 0) p.invincibleTimer--;
  if (p.fireTimer > 0) p.fireTimer--;
  if (p.iceTimer > 0) p.iceTimer--;
  if (p.darkTimer > 0) { p.darkTimer--; if (p.darkTimer % 38 === 0) playSfx('lightningHum'); }
  if (p.lightTimer > 0) p.lightTimer--;
  if (p.saberTimer > 0) { p.saberTimer--; if (p.saberTimer % 42 === 0) playSfx('saberHum'); if (p.saberTimer === 1) playSfx('saberOff'); }
  if (p.shieldTimer > 0) p.shieldTimer--;
  if (p.shotCooldown > 0) p.shotCooldown--;
  if (p.saberCooldown > 0) p.saberCooldown--;
  if (p.saberSwingTimer > 0) p.saberSwingTimer--;
  if (p.jumpBufferTimer > 0) p.jumpBufferTimer--;
  if (p.coyoteTimer > 0) p.coyoteTimer--;
}

function installInputHandlers() {
  const preventCodes = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Slash', 'KeyA', 'KeyD', 'KeyS', 'KeyW']);
  window.addEventListener('keydown', (event) => {
    pressedCodes.add(event.code);
    if (preventCodes.has(event.code)) event.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', (event) => {
    pressedCodes.delete(event.code);
    if (preventCodes.has(event.code)) event.preventDefault();
  }, { passive: false });
  window.addEventListener('blur', clearPressedCodes);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearPressedCodes();
  });
}

function clearPressedCodes() {
  pressedCodes.clear();
  for (let p of players) {
    if (!p) continue;
    p.downHeld = false;
    p.attackHeld = false;
    p.forceFiring = false;
    p.jumpHeldPrev = false;
    p.attackHeldPrev = false;
  }
}

function isControlDown(code) {
  return pressedCodes.has(code);
}

function handleInputs() {
  for (let p of activePlayers()) {
    if (!p.alive || p.finished) continue;
    let move = 0;
    let leftDown = isControlDown(p.controls.left);
    let rightDown = isControlDown(p.controls.right);
    let jumpDown = isControlDown(p.controls.jump);
    let attackDown = isControlDown(p.controls.attack);
    if (leftDown) move -= 1;
    if (rightDown) move += 1;
    p.downHeld = isControlDown(p.controls.down);
    p.attackHeld = attackDown;
    p.forceFiring = (p.darkTimer > 0 || p.lightTimer > 0) && attackDown;

    if (jumpDown && !p.jumpHeldPrev) queueJumpForPlayer(p);
    if (attackDown && !p.attackHeldPrev && !(p.darkTimer > 0 || p.lightTimer > 0)) tryAttack(p);

    updatePlayerSize(p);
    let maxSpeed = p.crouching ? 2.2 : 4.8;
    if (!p.big) maxSpeed += 0.4;
    let accel = p.onGround ? 0.32 : 0.18;
    let target = move * maxSpeed;
    p.vx = lerp(p.vx, target, accel);
    if (abs(p.vx) < 0.05) p.vx = 0;
    if (move !== 0) p.facing = move;

    p.jumpHeldPrev = jumpDown;
    p.attackHeldPrev = attackDown;
  }
}

function updatePlayerSize(p) {
  let targetW = p.big ? 34 : 18;
  let standH = p.big ? 46 : 23;
  let crouchH = p.big ? 24 : 14;
  p.w = targetW;
  let wantsCrouch = p.downHeld && (p.onGround || p.crouching);
  let targetH = wantsCrouch ? crouchH : standH;
  if (targetH < p.h) {
    let footY = p.y + p.h;
    p.h = targetH;
    p.y = footY - p.h;
    p.crouching = true;
  } else if (targetH > p.h) {
    let next = { x: p.x, y: p.y - (targetH - p.h), w: p.w, h: targetH };
    if (!solidOverlap(next)) {
      p.y -= (targetH - p.h);
      p.h = targetH;
      p.crouching = false;
    } else {
      let footY = p.y + p.h;
      p.h = crouchH;
      p.y = footY - p.h;
      p.crouching = true;
    }
  } else {
    p.crouching = targetH === crouchH;
  }
}

function updatePlayer(p) {
  if (!p.alive || p.finished) return;
  p.prevY = p.y;
  if (p.onGround) p.coyoteTimer = 8;
  p.x += p.vx;
  collidePlayerSolids(p, 'x');
  if (!p.onGround || p.vy < 0) p.vy += gravity;
  p.vy = min(p.vy, 16);
  p.y += p.vy;
  p.onGround = false;
  collidePlayerSolids(p, 'y');
  if (p.onGround) p.coyoteTimer = 8;
  p.x = constrain(p.x, 0, worldWidth - p.w);
  if (p.y > height + 220) loseLife(p, `${p.name} fell!`, true);
}

function collidePlayerSolids(p, axis) {
  for (let s of solids) {
    if (!rectsOverlap(p, s)) continue;
    if (axis === 'x') {
      if (p.vx > 0) p.x = s.x - p.w;
      if (p.vx < 0) p.x = s.x + s.w;
      p.vx = 0;
    } else {
      if (p.vy > 0) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; }
      else if (p.vy < 0) { p.y = s.y + s.h; p.vy = 0; }
    }
  }
}

function updatePlayerInteractions() {
  let a = players[0], b = players[1];
  if (!a || !b || !a.active || !b.active || !a.alive || !b.alive || a.finished || b.finished) return;
  if (!rectsOverlap(a, b)) return;
  let aPrevBottom = a.prevY + a.h, bPrevBottom = b.prevY + b.h;
  let aBottom = a.y + a.h, bBottom = b.y + b.h;
  let aStomped = a.vy >= -0.5 && aPrevBottom <= b.y + 14 && aBottom >= b.y;
  let bStomped = b.vy >= -0.5 && bPrevBottom <= a.y + 14 && bBottom >= a.y;
  if (aStomped && !bStomped) {
    a.y = b.y - a.h; a.vy = -10.5; a.onGround = false; b.vy = max(b.vy, 1.5); playSfx('boing'); showMessage('P1 bounced off P2!'); return;
  }
  if (bStomped && !aStomped) {
    b.y = a.y - b.h; b.vy = -10.5; b.onGround = false; a.vy = max(a.vy, 1.5); playSfx('boing'); showMessage('P2 bounced off P1!'); return;
  }
  let overlapX = min(a.x + a.w, b.x + b.w) - max(a.x, b.x);
  if (overlapX > 0) {
    let push = overlapX * 0.5 + 0.5;
    if (a.x < b.x) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
    a.vx *= 0.7; b.vx *= 0.7;
  }
}
function updateEnemies() {
  for (let e of enemies) {
    if (!e.alive) {
      if (e.deadTimer > 0) { e.deadTimer--; e.deathAnim++; }
      continue;
    }

    if (e.shockedTimer > 0) {
      e.shockedTimer--;
      if (e.shockedTimer === 0) {
        let owner = players[e.shockOwnerId] || null;
        defeatEnemy(e, owner, 70, 18, `${owner ? owner.name : 'A player'} electrocuted an enemy!`, 'lightning');
        playSfx('lightningZap');
      }
      continue;
    }

    if (e.stunnedTimer > 0) {
      e.stunnedTimer--;
      e.x += e.vx;
      if (e.x <= e.left || e.x + e.w >= e.right) {
        e.x = constrain(e.x, e.left, e.right - e.w);
        e.vx *= -0.18;
      }
      if (!e.onGround || abs(e.vy) > 0.05) {
        e.vy += gravity * 0.88;
        e.vy = min(e.vy, 14);
        e.y += e.vy;
        e.onGround = false;
        collideEnemySolids(e);
      }
      if (e.onGround) {
        e.vx = lerp(e.vx, 0, 0.24);
        if (abs(e.vx) < 0.08) e.vx = 0;
      }
      if (e.stunnedTimer === 0) {
        let baseSpeed = e.kind === 'hopper' ? 1.7 : e.kind === 'drone' ? 2.0 : 1.35;
        let dir = e.x + e.w * 0.5 > (e.left + e.right) * 0.5 ? -1 : 1;
        e.vx = baseSpeed * dir;
        e.vy = 0;
        e.onGround = e.kind !== 'drone';
      }
      continue;
    }

    if (e.frozenTimer > 0) {
      e.frozenTimer--;
    } else if (e.kind === 'drone') {
      e.x += e.vx;
      if (e.x <= e.left || e.x + e.w >= e.right) { e.vx *= -1; e.x = constrain(e.x, e.left, e.right - e.w); }
      e.y = e.baseY + sin(frameCount * 0.05 + e.phase) * 24;
    } else {
      e.x += e.vx;
      if (e.x <= e.left || e.x + e.w >= e.right) { e.vx *= -1; e.x = constrain(e.x, e.left, e.right - e.w); }
      e.vy += gravity * 0.75;
      if (e.kind === 'hopper') {
        e.hopTimer--;
        if (e.onGround && e.hopTimer <= 0) { e.vy = -8.9; e.onGround = false; e.hopTimer = 78; }
      }
      e.y += e.vy;
      e.onGround = false;
      collideEnemySolids(e);
    }

    for (let p of activePlayers()) {
      if (!p.alive || p.finished || !e.alive) continue;
      if (!rectsOverlap(p, e)) continue;
      let prevBottom = p.prevY + p.h;
      let currBottom = p.y + p.h;
      let centerX = p.x + p.w * 0.5;
      let stomped = p.vy >= -0.5 && prevBottom <= e.y + 16 && currBottom >= e.y && centerX >= e.x - 6 && centerX <= e.x + e.w + 6;
      if (e.frozenTimer > 0) {
        if (stomped) { defeatEnemy(e, p, 55, 16, `${p.name} smashed a frozen enemy!`, 'iceBreak'); p.vy = -11.4; playSfx('ice'); }
        continue;
      }
      if (p.shieldTimer > 0 || p.invincibleTimer > 0) {
        if (p.shieldTimer > 0) { defeatEnemy(e, p, 35, 8, `${p.name} shield smashed an enemy!`, 'stomp'); playSfx('stomp'); }
        continue;
      }
      if (stomped) {
        defeatEnemy(e, p, 60, 20, `${p.name} stomped an enemy!`, 'stomp');
        p.vy = -12.3;
        playSfx('stomp');
      } else {
        loseLife(p, `${p.name} got hit by an enemy!`, false);
      }
    }
  }
}

function collideEnemySolids(e) {
  for (let s of solids) {
    if (!rectsOverlap(e, s)) continue;
    if (e.vy > 0) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; }
    else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
  }
}

function updateForcePowers() {
  for (let p of activePlayers()) {
    if (!p.alive || p.finished || !p.forceFiring) continue;
    if (p.darkTimer > 0) {
      if (p.shotCooldown <= 0) { p.shotCooldown = 5; playSfx('lightningShot'); }
      let beam = getDarkBeam(p);
      for (let e of enemies) {
        if (!e.alive || e.shockedTimer > 0 || e.frozenTimer > 0) continue;
        if (rectsOverlap(beam.hitbox, e)) { e.shockedTimer = 30; e.shockOwnerId = p.id; e.vx = 0; e.vy = 0; }
      }
    } else if (p.lightTimer > 0) {
      if (p.shotCooldown <= 0) { p.shotCooldown = 10; playSfx('forcePush'); }
      let wave = getLightPushWave(p);
      for (let e of enemies) {
        if (!e.alive || e.shockedTimer > 0 || e.stunnedTimer > 0 || e.frozenTimer > 0) continue;
        if (rectsOverlap(wave.hitbox, e)) {
          let pushStrength = e.kind === 'drone' ? 8.6 : e.kind === 'hopper' ? 7.4 : 6.8;
          e.stunnedTimer = 95;
          e.pushOwnerId = p.id;
          e.vx = p.facing * pushStrength;
          e.x += p.facing * (e.kind === 'drone' ? 10 : 8);
          if (e.kind === 'drone') {
            e.vy = max(e.vy, 5.6);
            e.y += 4;
          } else {
            e.vy = -2.4;
            e.onGround = false;
          }
          showMessage(`${p.name} blasted an enemy away with the Force!`);
        }
      }
    }
  }
}

function getDarkBeam(p) {
  let beamW = 150, beamH = 84;
  let bx = p.facing > 0 ? p.x + p.w - 4 : p.x - beamW + 4;
  let by = p.y + p.h * 0.1;
  return { x1: p.x + p.w * 0.5 + p.facing * (p.w * 0.38), y1: p.y + p.h * 0.36, x2: p.x + p.w * 0.5 + p.facing * (beamW + p.w * 0.2), y2: p.y + p.h * 0.36, hitbox: { x: bx, y: by, w: beamW, h: beamH } };
}

function getLightPushWave(p) {
  let waveW = 170, waveH = 102;
  let bx = p.facing > 0 ? p.x + p.w - 8 : p.x - waveW + 8;
  let by = p.y + p.h * 0.02;
  return { hitbox: { x: bx, y: by, w: waveW, h: waveH } };
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    let pr = projectiles[i];
    pr.life--;
    pr.x += pr.vx;
    pr.y += pr.vy;
    let hitSolid = false;
    for (let s of solids) {
      if (s.y >= groundY) continue;
      if (circleRectOverlap(pr.x, pr.y, pr.r, s)) { hitSolid = true; break; }
    }
    let hitEnemy = false;
    for (let e of enemies) {
      if (!e.alive) continue;
      if (!circleRectOverlap(pr.x, pr.y, pr.r, e)) continue;
      hitEnemy = true;
      let owner = players[pr.ownerId];
      if (pr.type === 'ice') {
        e.frozenTimer = 240;
        e.vx = 0;
        e.vy = 0;
        if (owner) { owner.score += 28; owner.xp += 10; showMessage(`${owner.name} froze an enemy into a block!`); }
        playSfx('ice');
      } else if (pr.type === 'fire') {
        defeatEnemy(e, owner, 50, 15, `${owner.name} set an enemy on fire!`, 'fire');
        playSfx('shootHit');
      }
      break;
    }
    let remove = pr.life <= 0 || pr.x < 0 || pr.x > worldWidth || pr.y < 0 || pr.y > height || hitSolid || hitEnemy;
    if (remove) projectiles.splice(i, 1);
  }
}

function collectCoins() {
  for (let c of coins) {
    if (c.collected) continue;
    for (let p of activePlayers()) {
      if (!p.alive) continue;
      let dx = p.x + p.w * 0.5 - c.x;
      let dy = p.y + p.h * 0.5 - c.y;
      if (dx * dx + dy * dy < (c.r + 18) * (c.r + 18)) { c.collected = true; p.coins++; p.xp += 5; p.score += 10; playSfx('coin'); break; }
    }
  }
}

function collectPowerUps() {
  for (let pUp of powerUps) {
    if (pUp.collected) continue;
    for (let p of activePlayers()) {
      if (!p.alive || !rectsOverlap(p, pUp)) continue;
      pUp.collected = true;
      playSfx('power');
      if (pUp.type === 'force') {
        pendingForceChoice = { playerId: p.id };
        paused = true;
        p.score += 60;
        showMessage(`${p.name} found a Force power. Choose the dark side or the light side.`);
      } else if (pUp.type === 'fire') {
        p.fireTimer = 60 * 14; p.shotMode = 'fire'; p.score += 60;
        showMessage(`${p.name} got Fire: ${p.controls.attackLabel} launches fireballs that ignite enemies.`);
      } else if (pUp.type === 'ice') {
        p.iceTimer = 60 * 14; p.shotMode = 'ice'; p.score += 60;
        showMessage(`${p.name} got Ice: ${p.controls.attackLabel} freezes enemies into ice blocks.`);
      } else if (pUp.type === 'saber') {
        p.saberTimer = 60 * 10; p.saberCooldown = 0; p.score += 70;
        showMessage(`${p.name} got Lightsaber: ${p.controls.attackLabel} now swings a long chopping slash for 10 seconds.`);
        playSfx('saberOn');
      } else if (pUp.type === 'shield') {
        p.shieldTimer = 60 * 8; p.invincibleTimer = 60 * 8; p.score += 40;
        showMessage(`${p.name} got Shield: temporary invincibility.`);
      }
      break;
    }
  }
}

function updateCheckpoint() {
  if (!checkpointReached) {
    for (let p of activePlayers()) {
      if (p.alive && p.x > checkpointMarkerX) {
        checkpointReached = true;
        checkpointX = checkpointMarkerX;
        for (let pl of players) pl.checkpointX = checkpointX;
        playSfx('checkpoint');
        showMessage(gameMode === 'co-op' ? 'Team checkpoint reached!' : 'Checkpoint reached!');
        break;
      }
    }
  }
}

function updateFinish() {
  for (let p of activePlayers()) {
    if (!p.alive || p.finished) continue;
    if (p.x + p.w > finishFlag.x && p.y + p.h > finishFlag.y) {
      p.finished = true;
      scene = 'win';
      paused = false;
      let bonus = floor(max(0, 1800 - gameTicks / 9));
      p.score += 240 + bonus;
      highScore = max(highScore, runScore());
      saveHighScore();
      playSfx('win');
      showMessage(`${p.name} reached the finish!`);
      break;
    }
  }
}

function saberCanHit(p, e) {
  let reach = 154;
  let frontCheck = p.facing > 0 ? e.x < p.x + p.w + reach && e.x + e.w > p.x + p.w - 12 : e.x + e.w > p.x - reach && e.x < p.x + 12;
  let sameLane = abs((e.y + e.h * 0.5) - (p.y + p.h * 0.5)) < 62;
  return frontCheck && sameLane;
}

function performSaberSlash(p) {
  if (p.saberCooldown > 0 || p.saberTimer <= 0) return;
  p.saberCooldown = 18;
  p.saberSwingTimer = 10;
  playSfx('saberSlash');
  let hitAny = false;
  for (let e of enemies) {
    if (!e.alive) continue;
    if (!saberCanHit(p, e)) continue;
    defeatEnemy(e, p, 85, 24, `${p.name} sliced through an enemy!`, 'saber');
    hitAny = true;
  }
  if (!hitAny) showMessage(`${p.name} swung the lightsaber!`);
}

function defeatEnemy(enemy, owner, scoreGain, xpGain, msg, style) {
  if (!enemy || !enemy.alive) return;
  enemy.alive = false;
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.deathStyle = style || 'pop';
  enemy.deathAnim = 0;
  enemy.deathFacing = owner ? owner.facing : 1;
  enemy.deadTimer = enemy.deathStyle === 'fire' ? 40 : enemy.deathStyle === 'lightning' ? 30 : enemy.deathStyle === 'saber' ? 34 : enemy.deathStyle === 'iceBreak' ? 22 : enemy.deathStyle === 'stomp' ? 16 : 14;
  if (owner) { owner.score += scoreGain || 0; owner.xp += xpGain || 0; }
  if (msg) showMessage(msg);
}

function loseLife(p, msg, respawnFromCheckpoint) {
  if (!p.alive || p.hurtTimer > 0 || p.invincibleTimer > 0) return;
  if (p.big) {
    p.big = false;
    p.lives = max(1, p.lives - 1);
    p.hurtTimer = 90;
    p.invincibleTimer = 140;
    p.crouching = false;
    updatePlayerSize(p);
    p.vx = -p.facing * 3.8;
    p.vy = -7.5;
    if (respawnFromCheckpoint) { respawnPlayer(p); showMessage(msg + ' They respawned small at the checkpoint.'); }
    else showMessage(msg + ' They shrank instead of respawning.');
    playSfx('hurt');
    return;
  }
  if (p.lives > 1) {
    p.lives--;
    p.hurtTimer = 90;
    p.invincibleTimer = 150;
    respawnPlayer(p);
    playSfx('hurt');
    showMessage(msg + ` ${p.name} used a reserve life and respawned.`);
    return;
  }
  p.lives = 0;
  p.alive = false;
  p.hurtTimer = 90;
  p.vx = 0;
  p.vy = 0;
  playSfx('hurt');
  if (livingPlayers().length === 0) {
    scene = 'gameover'; paused = false; highScore = max(highScore, runScore()); saveHighScore();
  }
  showMessage(msg + ` ${p.name} is knocked out.`);
}

function respawnPlayer(p) {
  let respawnX = checkpointReached ? max(checkpointX, p.checkpointX || 120) : 120;
  p.checkpointX = respawnX;
  p.x = respawnX + p.id * 44;
  p.y = 280;
  p.vx = 0;
  p.vy = 0;
}

function updateCamera() {
  let active = activePlayers().filter(p => p.alive || p.finished);
  if (active.length === 0) return;
  let midX = active.reduce((sum, p) => sum + p.x + p.w * 0.5, 0) / active.length;
  cameraX = constrain(midX - width * 0.45, 0, worldWidth - width);
}

function isWorldRectVisible(x, y, w, h, pad = 140) {
  return x + w >= cameraX - pad && x <= cameraX + width + pad && y + h >= -pad && y <= height + pad;
}

function isWorldCircleVisible(x, y, r, pad = 140) {
  return x + r >= cameraX - pad && x - r <= cameraX + width + pad && y + r >= -pad && y - r <= height + pad;
}

function drawShadow(cx, cy, w, h, alpha = 46) {
  noStroke();
  fill(25, 30, 45, alpha);
  ellipse(cx, cy, w, h);
}

function drawGlassPanel(x, y, w, h, radius, tint) {
  noStroke();
  fill(0, 0, 0, 55);
  rect(x + 4, y + 6, w, h, radius + 2);
  let c = tint || color(22, 30, 42, 210);
  fill(c);
  rect(x, y, w, h, radius);
  stroke(255, 255, 255, 28);
  strokeWeight(1.5);
  noFill();
  rect(x + 1, y + 1, w - 2, h - 2, max(4, radius - 2));
  noStroke();
}

function drawUIButton(btn, hover, selected, baseColor, accentColor) {
  let base = baseColor || color(70, 90, 115);
  let accent = accentColor || color(120, 220, 160);
  noStroke();
  fill(0, 0, 0, hover ? 65 : 42);
  rect(btn.x + 4, btn.y + 5, btn.w, btn.h, 14);
  fill(red(accent), green(accent), blue(accent), hover ? 70 : 28);
  rect(btn.x - 4, btn.y - 4, btn.w + 8, btn.h + 8, 16);
  stroke(selected ? accent : color(125, 145, 170));
  strokeWeight(selected ? 3 : 1.5);
  fill(hover ? lerpColor(base, color(255), 0.12) : base);
  rect(btn.x, btn.y, btn.w, btn.h, 12);
  noStroke();
  fill(255);
  textSize(24);
  text(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 - 1);
}

function drawStatusChip(x, y, label, fillCol) {
  noStroke();
  fill(0, 0, 0, 45);
  rect(x + 2, y + 3, textWidth(label) + 22, 22, 10);
  fill(fillCol);
  rect(x, y, textWidth(label) + 22, 22, 10);
  fill(20, 25, 35);
  textAlign(LEFT, CENTER);
  textSize(13);
  text(label, x + 11, y + 11);
}

function drawLifePips(p, x, y) {
  for (let i = 0; i < p.maxLives; i++) {
    let filled = i < p.lives;
    fill(filled ? color(255, 110, 130) : color(70, 80, 95));
    stroke(filled ? color(255, 190, 205) : color(110, 120, 135));
    strokeWeight(1.2);
    circle(x + i * 18, y, 12);
  }
  noStroke();
}
function drawWorld() {
  drawParallax();
  drawGround();
  drawSolids();
  drawCoins();
  drawPowerUps();
  drawEnemies();
  drawProjectiles();
  drawForcePowers();
  drawFinishFlag();
  drawCheckpointSign();
  drawPlayers();
}

function drawSky() {
  let sunset = activePlayers().some(p => p.darkTimer > 0);
  noStroke();
  for (let y = 0; y < height; y += 6) {
    let t = map(y, 0, height, 0, 1);
    let topCol = sunset ? color(95, 72, 150) : color(95, 175, 255);
    let bottomCol = sunset ? color(255, 160, 100) : color(190, 235, 255);
    fill(lerpColor(topCol, bottomCol, t));
    rect(0, y, width, 6);
  }
  fill(sunset ? color(255, 175, 105, 55) : color(255, 250, 210, 42));
  rect(0, height * 0.58, width, height * 0.22);
  for (let s of stars) {
    let sx = (s.x - cameraX * 0.08 + width * 3) % (width + 60);
    fill(255, 255, 255, sunset ? 95 : 65);
    circle(sx, s.y, s.s);
  }
  fill(sunset ? color(255, 170, 90) : color(255, 240, 120));
  circle(width - 120, sunset ? 150 : 90, sunset ? 82 : 90);
  fill(255, 255, 255, sunset ? 22 : 28);
  circle(width - 120, sunset ? 150 : 90, sunset ? 108 : 118);
}

function drawParallax() {
  for (let c of clouds) {
    let cx = c.x - cameraX * 0.24;
    if (cx < -260 || cx > width + 260) continue;
    drawCloud(cx, c.y, c.w, c.h);
  }
  noStroke();
  fill(130, 180, 120);
  for (let h of hills) {
    let hx = h.x - cameraX * 0.16;
    if (hx < -h.w || hx > width + h.w) continue;
    ellipse(hx, groundY + 20, h.w, h.h);
  }
  fill(95, 145, 105);
  for (let i = -1; i < 12; i++) ellipse(i * 180 - (cameraX * 0.3 % 180), groundY + 40, 250, 120);
}

function drawCloud(x, y, w, h) {
  fill(255, 255, 255, 220);
  ellipse(x, y, w * 0.45, h * 0.75);
  ellipse(x + w * 0.2, y - h * 0.15, w * 0.4, h * 0.7);
  ellipse(x + w * 0.4, y, w * 0.48, h * 0.82);
}

function drawGround() {
  noStroke();
  fill(82, 178, 88);
  rect(0, groundY, worldWidth, height - groundY);
  fill(105, 88, 56);
  rect(0, groundY + 18, worldWidth, height - groundY);
  fill(125, 205, 118, 90);
  rect(0, groundY, worldWidth, 8);
  fill(255, 255, 255, 18);
  for (let x = floor(cameraX / 44) * 44; x < cameraX + width + 80; x += 44) rect(x, groundY + 6, 24, 2, 2);
}

function drawSolids() {
  rectMode(CORNER);
  noStroke();
  for (let s of solids) {
    if (s.style === 'ground') continue;
    if (!isWorldRectVisible(s.x, s.y, s.w, s.h, 180)) continue;
    drawShadow(s.x + s.w * 0.5, s.y + s.h + 6, min(s.w * 0.9, 120), 12, 18);
    if (s.style === 'roof') {
      fill(90, 70, 100); rect(s.x, s.y, s.w, s.h, 5);
      fill(130, 105, 145); rect(s.x, s.y + s.h - 6, s.w, 6, 0, 0, 5, 5);
      fill(255, 255, 255, 16); rect(s.x + 6, s.y + 4, s.w - 12, 3, 3);
    } else if (s.style === 'platform') {
      fill(140, 100, 160); rect(s.x, s.y, s.w, s.h, 6);
      fill(190, 145, 210); rect(s.x, s.y, s.w, 8, 6, 6, 0, 0);
      fill(90, 60, 110, 24); rect(s.x + 6, s.y + 10, s.w - 12, s.h - 12, 4);
    } else {
      fill(185, 110, 70); rect(s.x, s.y, s.w, s.h, 6);
      fill(220, 150, 90); rect(s.x, s.y, s.w, 10, 6, 6, 0, 0);
      fill(145, 90, 56, 28); rect(s.x + 6, s.y + 12, s.w - 12, s.h - 18, 4);
    }
  }
}

function drawCoins() {
  textAlign(CENTER, CENTER);
  strokeWeight(2);
  for (let c of coins) {
    if (c.collected || !isWorldCircleVisible(c.x, c.y, c.r, 120)) continue;
    let bob = sin(frameCount * 0.1 + c.x * 0.02) * 3;
    drawShadow(c.x, c.y + c.r + 13, c.r * 1.7, 8, 24);
    fill(255, 225, 60); stroke(210, 160, 20); circle(c.x, c.y + bob, c.r * 2);
    noStroke(); fill(255, 245, 180); circle(c.x, c.y + bob, c.r);
    fill(255, 255, 255, 60); ellipse(c.x - 3, c.y + bob - 4, c.r * 0.55, c.r * 0.35);
    strokeWeight(2);
  }
  noStroke();
}

function drawPowerUps() {
  rectMode(CORNER);
  textAlign(CENTER, CENTER);
  for (let p of powerUps) {
    if (p.collected) continue;
    let bob = sin(frameCount * 0.08 + p.x * 0.02) * 4;
    if (!isWorldRectVisible(p.x, p.y + bob, p.w, p.h, 120)) continue;
    drawShadow(p.x + p.w * 0.5, p.y + p.h + 14, 28, 9, 24);
    let y = p.y + bob;
    if (p.type === 'force') { fill(170, 120, 255); rect(p.x, y, p.w, p.h, 8); fill(40, 20, 90); textSize(18); text('?', p.x + p.w / 2, y + p.h / 2 + 1); }
    else if (p.type === 'fire') { fill(255, 125, 70); rect(p.x, y, p.w, p.h, 8); fill(255, 245, 210); textSize(18); text('F', p.x + p.w / 2, y + p.h / 2 + 1); }
    else if (p.type === 'ice') { fill(135, 230, 255); rect(p.x, y, p.w, p.h, 8); fill(245); textSize(18); text('I', p.x + p.w / 2, y + p.h / 2 + 1); }
    else if (p.type === 'saber') { fill(110, 255, 200); rect(p.x, y, p.w, p.h, 8); fill(20, 90, 70); textSize(18); text('L', p.x + p.w / 2, y + p.h / 2 + 1); }
    else { fill(100, 240, 255); rect(p.x, y, p.w, p.h, 8); fill(20, 80, 120); textSize(18); text('S', p.x + p.w / 2, y + p.h / 2 + 1); }
    fill(255, 255, 255, 24); rect(p.x + 4, y + 4, p.w - 8, 5, 4);
  }
}

function drawEnemies() {
  rectMode(CORNER);
  for (let e of enemies) {
    if ((!e.alive && e.deadTimer <= 0) || !isWorldRectVisible(e.x, e.y, e.w, e.h, 180)) continue;
    if (!e.alive) { drawEnemyDeath(e); continue; }
    drawShadow(e.x + e.w * 0.5, min(groundY + 8, e.y + e.h + 8), e.kind === 'drone' ? 26 : 30, e.kind === 'drone' ? 8 : 10, 26);
    if (e.frozenTimer > 0) {
      fill(170, 235, 255, 220); rect(e.x - 2, e.y - 2, e.w + 4, e.h + 4, 8);
      fill(220, 250, 255, 140); rect(e.x + 4, e.y + 4, e.w * 0.28, e.h * 0.7, 5);
      fill(120, 170, 210, 120); rect(e.x + 6, e.y + 7, e.w - 12, e.h - 14, 6);
      continue;
    }
    if (e.kind === 'walker') {
      fill(155, 70, 180); rect(e.x, e.y, e.w, e.h, 8);
      fill(190, 105, 220); rect(e.x + 4, e.y + 4, e.w - 8, 8, 5);
      fill(255); circle(e.x + 10, e.y + 12, 7); circle(e.x + 24, e.y + 12, 7);
      fill(20); circle(e.x + 10, e.y + 12, 3); circle(e.x + 24, e.y + 12, 3);
      stroke(20); line(e.x + 9, e.y + 24, e.x + 25, e.y + 24); noStroke();
    } else if (e.kind === 'hopper') {
      fill(90, 200, 90); triangle(e.x + e.w * 0.5, e.y, e.x, e.y + e.h, e.x + e.w, e.y + e.h);
      fill(130, 235, 120); triangle(e.x + e.w * 0.5, e.y + 6, e.x + 8, e.y + e.h - 4, e.x + e.w - 8, e.y + e.h - 4);
      fill(255); circle(e.x + 12, e.y + 16, 7); circle(e.x + 24, e.y + 16, 7);
      fill(20); circle(e.x + 12, e.y + 16, 3); circle(e.x + 24, e.y + 16, 3);
    } else {
      fill(70, 120, 255); ellipse(e.x + e.w * 0.5, e.y + e.h * 0.5, e.w * 0.75, e.h * 0.7);
      fill(110, 160, 255, 190); ellipse(e.x + 8, e.y + 14, 18, 12); ellipse(e.x + e.w - 8, e.y + 14, 18, 12);
      fill(255); circle(e.x + 14, e.y + 18, 6); circle(e.x + 28, e.y + 18, 6);
      fill(10); circle(e.x + 14, e.y + 18, 2.5); circle(e.x + 28, e.y + 18, 2.5);
    }
    if (e.shockedTimer > 0) drawEnemyShock(e);
    if (e.stunnedTimer > 0) drawEnemyStun(e);
  }
}

function drawEnemyShock(e) {
  noFill(); stroke(120, 220, 255, 220); strokeWeight(2); rect(e.x - 2, e.y - 2, e.w + 4, e.h + 4, 8);
  for (let i = 0; i < 6; i++) { let sx = e.x + random(2, e.w - 2); let sy = e.y + random(2, e.h - 2); line(sx, sy, sx + random(-10, 10), sy + random(-10, 10)); }
  noStroke();
}

function drawEnemyStun(e) {
  let alpha = map(e.stunnedTimer, 0, 95, 40, 200, true);
  fill(255, 245, 160, alpha);
  for (let i = 0; i < 3; i++) {
    let ang = frameCount * 0.08 + i * TWO_PI / 3;
    let sx = e.x + e.w * 0.5 + cos(ang) * (e.w * 0.45);
    let sy = e.y - 6 + sin(ang) * 8;
    circle(sx, sy, 7);
  }
}

function drawEnemyDeath(e) {
  let t = e.deathAnim, alpha = map(e.deadTimer, 0, 40, 0, 255, true);
  if (e.deathStyle === 'stomp') { fill(110, 60, 130, alpha); rect(e.x, e.y + e.h * 0.55, e.w, e.h * 0.3, 8); return; }
  if (e.deathStyle === 'fire') { fill(90, 50, 50, alpha); rect(e.x, e.y, e.w, e.h, 8); for (let i = 0; i < 4; i++) { let fx = e.x + 8 + i * 8; let fy = e.y + e.h - 6 - sin((frameCount + i * 7) * 0.25) * 10; fill(255, 120 + i * 20, 60, alpha); triangle(fx, fy, fx - 6, fy + 14, fx + 6, fy + 14); fill(255, 240, 120, alpha * 0.85); triangle(fx, fy + 4, fx - 3, fy + 12, fx + 3, fy + 12); } return; }
  if (e.deathStyle === 'lightning') { push(); translate(random(-2, 2), random(-2, 2)); fill(70, 120, 200, alpha); rect(e.x, e.y, e.w, e.h, 8); stroke(130, 220, 255, alpha); strokeWeight(2); for (let i = 0; i < 8; i++) { let sx = e.x + random(3, e.w - 3); let sy = e.y + random(3, e.h - 3); line(sx, sy, sx + random(-10, 10), sy + random(-10, 10)); } noStroke(); pop(); return; }
  if (e.deathStyle === 'saber') { let split = min(14, t * 0.8); fill(155, 70, 180, alpha); rect(e.x - split * 0.35, e.y + 2, e.w * 0.48, e.h - 4, 6); rect(e.x + e.w * 0.52 + split * 0.35, e.y + 2, e.w * 0.48, e.h - 4, 6); fill(90, 200, 90, alpha * 0.9); rect(e.x + e.w * 0.22 + min(18, t * 0.9), e.y + e.h * 0.22, 8, 12, 4); stroke(120, 255, 200, alpha); strokeWeight(3); line(e.x + e.w * 0.48, e.y - 4, e.x + e.w * 0.48, e.y + e.h + 4); noStroke(); return; }
  if (e.deathStyle === 'iceBreak') { fill(190, 240, 255, alpha); for (let i = 0; i < 5; i++) rect(e.x + i * 7 + random(-1, 1), e.y + 10 + random(-4, 8), 10, 10, 3); return; }
  fill(120, 120, 120, alpha); rect(e.x + 4, e.y + 6, e.w - 8, e.h - 12, 6);
}

function drawProjectiles() {
  noFill();
  strokeWeight(4);
  for (let p of projectiles) {
    if (!isWorldCircleVisible(p.x, p.y, p.r, 90)) continue;
    drawShadow(p.x, p.y + p.r + 10, p.r * 1.4, 6, 20);
    if (p.type === 'fire') {
      noStroke(); fill(255, 120, 70); circle(p.x, p.y, p.r * 2.2); fill(255, 240, 140); circle(p.x, p.y, p.r * 1.2);
    } else {
      noStroke(); fill(140, 230, 255); circle(p.x, p.y, p.r * 2.2); fill(240, 255, 255); circle(p.x, p.y, p.r * 1.2);
    }
  }
  noStroke();
}

function drawForcePowers() {
  for (let p of activePlayers()) {
    if (!p.alive || !p.forceFiring) continue;
    if (p.darkTimer > 0) {
      let beam = getDarkBeam(p); strokeWeight(4);
      for (let i = 0; i < 4; i++) {
        stroke(i % 2 === 0 ? color(150, 205, 255, 220) : color(255, 245, 160, 175));
        let prevX = beam.x1, prevY = beam.y1 + random(-6, 6);
        for (let step = 1; step <= 7; step++) {
          let t = step / 7, nx = lerp(beam.x1, beam.x2, t), ny = beam.y2 + random(-20, 20);
          line(prevX, prevY, nx, ny); prevX = nx; prevY = ny;
        }
      }
      noStroke();
    } else if (p.lightTimer > 0) {
      let wave = getLightPushWave(p); push(); noFill(); strokeWeight(5); stroke(210, 245, 255, 170);
      let cx = p.facing > 0 ? wave.hitbox.x + 24 : wave.hitbox.x + wave.hitbox.w - 24;
      let baseAngle = p.facing > 0 ? -PI * 0.34 : PI * 0.66;
      for (let i = 0; i < 3; i++) arc(cx, p.y + p.h * 0.5, 70 + i * 34, 60 + i * 28, baseAngle, baseAngle + PI * 0.68);
      pop();
    }
  }
}

function drawFinishFlag() { stroke(70); strokeWeight(4); line(finishFlag.x, finishFlag.y, finishFlag.x, finishFlag.y + finishFlag.h); noStroke(); fill(255, 70, 90); triangle(finishFlag.x, finishFlag.y, finishFlag.x + 46, finishFlag.y + 18, finishFlag.x, finishFlag.y + 36); }
function drawCheckpointSign() {
  let x = checkpointMarkerX;
  if (!isWorldRectVisible(x - 24, groundY - 110, 48, 110, 200)) return;
  stroke(90, 60, 40);
  strokeWeight(4);
  line(x, groundY - 10, x, groundY - 70);
  noStroke();
  fill(checkpointReached ? color(80, 230, 120) : color(250, 220, 90));
  rect(x - 18, groundY - 100, 36, 24, 6);
  fill(20, 25, 30, checkpointReached ? 220 : 120);
  textAlign(CENTER, CENTER);
  textSize(12);
  text('CP', x, groundY - 88);
}

function drawPlayers() {
  let drawOrder = activePlayers().slice().sort((a, b) => a.y - b.y);
  for (let p of drawOrder) drawPlayer(p);
}

function drawPlayer(p) {
  if (!p.alive && scene !== 'win') return;
  let blink = p.hurtTimer > 0 && frameCount % 10 < 5;
  if (blink || !isWorldRectVisible(p.x, p.y, p.w, p.h, 180)) return;
  drawShadow(p.x + p.w * 0.5, p.y + p.h + 8, p.big ? 28 : 18, 10, 34);
  push();
  translate(p.x + p.w / 2, p.y + p.h / 2);
  scale(p.facing, 1);
  if (p.shieldTimer > 0) { noFill(); stroke(100, 240, 255, 180); strokeWeight(3); ellipse(0, 0, p.w + 18, p.h + 18); }
  if (p.darkTimer > 0) { stroke(150, 215, 255, 190); strokeWeight(2); line(-p.w * 0.35, -p.h * 0.35, -p.w * 0.62, -p.h * 0.72); line(p.w * 0.2, -p.h * 0.45, p.w * 0.58, -p.h * 0.78); }
  if (p.lightTimer > 0) { noFill(); stroke(215, 245, 255, 170); strokeWeight(3); ellipse(0, 0, p.w + 12, p.h + 12); }
  if (p.saberTimer > 0) {
    stroke(120, 255, 200); strokeWeight(5);
    let bladeX = p.w * 0.65;
    line(bladeX, 2, bladeX + 42, -8 + sin(frameCount * 0.3) * 2);
    stroke(255, 255, 255, 140); strokeWeight(2);
    line(bladeX + 2, 2, bladeX + 39, -7 + sin(frameCount * 0.3) * 2);
    if (p.saberSwingTimer > 0) {
      noFill(); stroke(120, 255, 200, 170); strokeWeight(6);
      let arcSize = 94 + p.saberSwingTimer * 3;
      arc(p.w * 0.92, -6, arcSize, arcSize, -PI * 0.44, PI * 0.5);
      stroke(255, 255, 255, 120); strokeWeight(2);
      arc(p.w * 0.92, -6, arcSize - 12, arcSize - 12, -PI * 0.44, PI * 0.5);
    }
  }
  rectMode(CENTER);
  noStroke();
  fill(p.big ? p.bodyColor : lerpColor(p.bodyColor, color(255), 0.35));
  rect(0, 0, p.w, p.h, 8);
  fill(255, 255, 255, 18);
  rect(0, -p.h * 0.3, p.w * 0.74, max(8, p.h * 0.16), 4);
  fill(p.detailColor);
  rect(0, -p.h * 0.1, p.w * 0.58, max(12, p.h * 0.34), 4);
  fill(30);
  circle(p.w * 0.12, -p.h * 0.1, 4);
  fill(70, 40, 20);
  rect(-p.w * 0.2, p.h * 0.42, 10, 8, 3);
  rect(p.w * 0.2, p.h * 0.42, 10, 8, 3);
  pop();
}

function drawHUD() {
  rectMode(CORNER);
  let playerPanelW = gameMode === 'co-op' ? 500 : 278;
  drawGlassPanel(16, 14, playerPanelW, 132, 14, color(20, 30, 40, 205));
  drawGlassPanel(width - 388, 14, 372, 132, 14, color(20, 30, 40, 205));
  if (gameMode === 'co-op') {
    if (players[0] && players[0].active) drawPlayerHUD(players[0], 28, 24, 208);
    if (players[1] && players[1].active) drawPlayerHUD(players[1], 270, 24, 208);
  } else {
    if (players[1] && players[1].active) drawPlayerHUD(players[1], 28, 24, 236);
  }
  fill(255);
  textAlign(LEFT, TOP);
  textSize(18);
  text(`High score: ${highScore}`, width - 370, 26);
  text(`Mode: ${gameMode === 'co-op' ? 'co-op' : 'single player'}`, width - 370, 52);
  text(`Checkpoint: ${checkpointReached ? 'reached' : 'not yet'}`, width - 370, 78);
  text(`Pause: P   Restart after end: R`, width - 370, 104);
  if (levelMessageTimer > 0) {
    let alpha = map(levelMessageTimer, 0, 180, 0, 1, true);
    let boxW = min(620, max(320, textWidth(levelMessage) + 46));
    drawGlassPanel(width / 2 - boxW / 2, 18, boxW, 44, 11, color(20, 30, 40, 150 + 45 * alpha));
    fill(255, 255, 255, 235 * alpha);
    textAlign(CENTER, CENTER);
    textSize(18);
    text(levelMessage, width / 2, 39);
  }
}

function drawPlayerHUD(p, x, y, blockW) {
  let headerCol = p.id === 0 ? color(255, 120, 145) : color(110, 180, 255);
  fill(255);
  textAlign(LEFT, TOP);
  textSize(18);
  text(`${p.name}${p.alive ? '' : ' KO'}`, x, y);
  fill(headerCol);
  rect(x, y + 24, blockW - 22, 4, 3);
  drawLifePips(p, x + 8, y + 44);
  fill(255);
  textSize(16);
  text(`Coins ${p.coins}`, x + 74, y + 33);
  text(`XP ${p.xp}`, x + 154, y + 33);
  text(`Score ${p.score}`, x, y + 56);
  text(`Size ${p.big ? 'big' : 'small'}`, x + 112, y + 56);
  let attackMode = p.darkTimer > 0 ? 'dark' : p.lightTimer > 0 ? 'light' : p.saberTimer > 0 ? 'saber' : getCurrentShotType(p) || 'basic';
  text(`Attack ${attackMode}`, x, y + 78);
  let chipX = x + 110, chipY = y + 76;
  textSize(13);
  if (p.darkTimer > 0) { drawStatusChip(chipX, chipY, `Dark ${ceil(p.darkTimer / 60)}s`, color(175, 220, 255)); chipY += 26; }
  if (p.lightTimer > 0) { drawStatusChip(chipX, chipY, `Light ${ceil(p.lightTimer / 60)}s`, color(220, 245, 255)); chipY += 26; }
  if (p.fireTimer > 0) { drawStatusChip(chipX, chipY, `Fire ${ceil(p.fireTimer / 60)}s`, color(255, 180, 110)); chipY += 26; }
  if (p.iceTimer > 0) { drawStatusChip(chipX, chipY, `Ice ${ceil(p.iceTimer / 60)}s`, color(160, 232, 255)); chipY += 26; }
  if (p.saberTimer > 0) { drawStatusChip(chipX, chipY, `Saber ${ceil(p.saberTimer / 60)}s`, color(120, 255, 200)); chipY += 26; }
  if (p.shieldTimer > 0) { drawStatusChip(chipX, chipY, `Shield ${ceil(p.shieldTimer / 60)}s`, color(100, 240, 255)); }
}

function drawStartScreen() {
  drawGlassPanel(width / 2 - 380, 42, 760, 454, 22, color(20, 30, 40, 175));
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(40);
  text('Tiny Platformer Quest DX', width / 2, 100);
  fill(210, 225, 240);
  textSize(19);
  text('Choose a mode to begin your demo run', width / 2, 140);
  fill(255);
  text('Single player: arrows move • Up jump • Down crouch • / ? attack', width / 2, 186);
  text('Co-op P1: A/D move • W jump • S crouch • SPACE attack', width / 2, 216);
  text('Co-op P2: arrows move • Up jump • Down crouch • / ? attack', width / 2, 246);
  text('Fire and Ice are separate powers • lightsaber attacks are manual slashes', width / 2, 284);
  text('Force power asks light side or dark side • pause menu has restart + main menu', width / 2, 314);
  fill(255, 230, 150);
  text(`High score: ${highScore}`, width / 2, 348);
  for (let btn of modeButtons) {
    let selected = gameMode === btn.mode;
    let hover = mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h;
    drawUIButton(btn, hover, selected, color(70, 90, 115), hover ? color(120, 220, 160) : color(255, 210, 120));
  }
  fill(220, 230, 240);
  textSize(18);
  text(gameMode === 'co-op' ? 'Co-op: players can bounce on each other and share the same run score.' : 'Single player: only the arrow-key hero is active.', width / 2, 456);
  fill(170, 190, 210);
  textSize(16);
  text('Tip: use 1 / 2 to switch modes, or click a button to start immediately.', width / 2, 482);
}

function drawForceChoiceScreen() {
  fill(10, 15, 20, 185);
  rect(0, 0, width, height);
  drawGlassPanel(width / 2 - 310, height / 2 - 150, 620, 250, 22, color(18, 24, 32, 205));
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(42);
  let chooser = pendingForceChoice ? players[pendingForceChoice.playerId] : null;
  text(`${chooser ? chooser.name : 'Player'}, choose your path`, width / 2, height / 2 - 86);
  textSize(20);
  text('Click one of the two sides below', width / 2, height / 2 - 40);
  for (let btn of forceChoiceButtons) {
    let hover = mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h;
    let baseCol = btn.side === 'dark' ? color(120, 38, 46) : color(45, 78, 132);
    let glowCol = btn.side === 'dark' ? color(255, 70, 70) : color(80, 150, 255);
    drawUIButton(btn, hover, false, baseCol, glowCol);
  }
}

function drawPauseScreen() {
  fill(10, 15, 20, 175);
  rect(0, 0, width, height);
  drawGlassPanel(width / 2 - 360, height / 2 - 112, 720, 250, 22, color(18, 24, 32, 210));
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(50);
  text('PAUSED', width / 2, height / 2 - 52);
  textSize(22);
  text('Press P to continue or use the buttons below', width / 2, height / 2 - 10);
  textSize(18);
  fill(210, 225, 240);
  text('Restart level resets the run • Main Menu returns to mode select', width / 2, height / 2 + 16);
  for (let btn of pauseButtons) {
    let hover = mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h;
    let accent = btn.action === 'menu' ? color(255, 185, 120) : btn.action === 'restart' ? color(255, 120, 145) : color(120, 220, 160);
    drawUIButton(btn, hover, false, color(70, 90, 115), accent);
  }
  fill(255);
  textSize(20);
  text(`Run score: ${runScore()}   |   High score: ${highScore}`, width / 2, height / 2 + 126);
}

function drawOverlay(titleText, subtitle) {
  fill(10, 15, 20, 170);
  rect(0, 0, width, height);
  drawGlassPanel(width / 2 - 300, height / 2 - 102, 600, 190, 22, color(18, 24, 32, 210));
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(50);
  text(titleText, width / 2, height / 2 - 36);
  textSize(24);
  text(subtitle, width / 2, height / 2 + 12);
  fill(215, 225, 240);
  textSize(20);
  text(`Run score: ${runScore()}   |   High score: ${highScore}`, width / 2, height / 2 + 56);
}


function showMessage(msg) { levelMessage = msg; levelMessageTimer = 180; }
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function solidOverlap(box) { for (let s of solids) if (rectsOverlap(box, s)) return true; return false; }
function circleRectOverlap(cx, cy, r, rectObj) {
  let closestX = constrain(cx, rectObj.x, rectObj.x + rectObj.w);
  let closestY = constrain(cy, rectObj.y, rectObj.y + rectObj.h);
  let dx = cx - closestX, dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

function keyPressed() {
  if (pendingForceChoice) {
    return false;
  }
  if (scene === 'start') {
    if (key === '1') { gameMode = 'single'; resetGame(); return false; }
    if (key === '2') { gameMode = 'co-op'; resetGame(); return false; }
    if (keyCode === ENTER) { startGame(); return false; }
  }
  if (scene === 'playing' && (key === 'p' || key === 'P')) { paused = !paused; showMessage(paused ? 'Paused' : 'Back in action!'); return false; }
  if (scene === 'playing' && paused) return false;
  if (scene === 'playing') {
    return false;
  }
  if ((scene === 'gameover' || scene === 'win') && (key === 'r' || key === 'R')) {
    if (scene === 'gameover' && checkpointReached) continueFromCheckpointAfterGameOver();
    else restartFromScratch();
    return false;
  }
}

function keyReleased() {
  return false;
}

function mousePressed() {
  if (pendingForceChoice) {
    for (let btn of forceChoiceButtons) if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) { chooseForceSide(btn.side); return false; }
    return false;
  }
  if (scene === 'playing' && paused) {
    for (let btn of pauseButtons) {
      if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) {
        if (btn.action === 'resume') { paused = false; showMessage('Back in action!'); }
        else if (btn.action === 'restart') restartLevelFromPause();
        else if (btn.action === 'menu') returnToMainMenu();
        return false;
      }
    }
    return false;
  }
  if (scene === 'start') {
    for (let btn of modeButtons) {
      if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) {
        gameMode = btn.mode;
        resetGame();
        startGame();
        return false;
      }
    }
    return false;
  }
}

function chooseForceSide(side) {
  if (!pendingForceChoice) return;
  clearPressedCodes();
  let p = players[pendingForceChoice.playerId];
  if (!p) { pendingForceChoice = null; paused = false; return; }
  if (side === 'dark') { p.darkTimer = 60 * 12; p.lightTimer = 0; p.forceFiring = false; showMessage(`${p.name} joined the dark side: hold ${p.controls.attackLabel} for Force lightning.`); }
  else { p.lightTimer = 60 * 12; p.darkTimer = 0; p.forceFiring = false; p.maxLives = 3; p.lives = min(3, p.lives + 1); p.invincibleTimer = max(p.invincibleTimer, 45); showMessage(`${p.name} chose the light side: hold ${p.controls.attackLabel} to push enemies away and gained an extra life.`); }
  pendingForceChoice = null; paused = false;
}

function startGame() { clearPressedCodes(); startAudio(); scene = 'playing'; paused = false; showMessage(gameMode === 'co-op' ? 'Co-op run started!' : 'Single-player run started!'); }
function returnToMainMenu() { clearPressedCodes(); paused = false; pendingForceChoice = null; resetGame(); showMessage('Back at the main menu. Choose single player or co-op.'); }
function queueJumpForPlayer(p) { if (scene !== 'playing' || paused || !p || !p.alive) return; p.jumpBufferTimer = 10; }
function tryJump(p) { if (paused || !p.alive || p.crouching) return; if (!(p.onGround || p.coyoteTimer > 0)) return; p.jumpBufferTimer = 0; p.coyoteTimer = 0; p.vy = p.big ? -14.2 : -13.1; p.onGround = false; playSfx('jump'); }
function getCurrentShotType(p) { if (p.shotMode === 'fire' && p.fireTimer > 0) return 'fire'; if (p.shotMode === 'ice' && p.iceTimer > 0) return 'ice'; if (p.fireTimer > 0) return 'fire'; if (p.iceTimer > 0) return 'ice'; return null; }
function tryAttack(p) {
  if (paused || !p || !p.active || !p.alive) return;
  if (p.darkTimer > 0 || p.lightTimer > 0) return;
  if (p.saberTimer > 0) { performSaberSlash(p); return; }
  if (p.shotCooldown > 0) return;
  let mode = getCurrentShotType(p);
  if (mode) { let speed = mode === 'fire' ? 8.5 : 7.5; projectiles.push({ ownerId: p.id, x: p.x + p.w * 0.5 + p.facing * (p.w * 0.55), y: p.y + p.h * 0.42, vx: speed * p.facing, vy: mode === 'fire' ? -0.4 : 0, r: mode === 'fire' ? 8 : 9, life: 110, type: mode }); p.shotCooldown = 16; playSfx('shoot'); }
}
function restartLevelFromPause() { clearPressedCodes(); buildBackground(); buildLevel(); players = createPlayers(); checkpointX = 120; checkpointReached = false; gameTicks = 0; cameraX = 0; projectiles = []; pendingForceChoice = null; paused = false; scene = 'playing'; showMessage('Level restarted from the beginning.'); }
function restartFromScratch() { clearPressedCodes(); buildBackground(); pendingForceChoice = null; resetGame(); startAudio(); scene = 'playing'; paused = false; showMessage(gameMode === 'co-op' ? 'Fresh co-op run from the very beginning!' : 'Fresh single-player run from the very beginning!'); }
function continueFromCheckpointAfterGameOver() {
  clearPressedCodes();
  pendingForceChoice = null;
  paused = false;
  scene = 'playing';
  projectiles = [];

  for (let p of activePlayers()) {
    p.alive = true;
    p.finished = false;
    p.big = true;
    p.lives = max(2, p.maxLives);
    p.hurtTimer = 0;
    p.invincibleTimer = 120;
    p.crouching = false;
    p.downHeld = false;
    p.attackHeld = false;
    p.forceFiring = false;
    p.vx = 0;
    p.vy = 0;
    p.shotCooldown = 0;
    p.saberCooldown = 0;
    p.saberSwingTimer = 0;
    p.jumpBufferTimer = 0;
    p.coyoteTimer = 0;
    updatePlayerSize(p);
    respawnPlayer(p);
  }

  cameraX = max(0, checkpointX - width * 0.35);
  showMessage('Continuing from the checkpoint.');
}
function runScore() { return activePlayers().reduce((sum, p) => sum + p.score, 0); }
function loadHighScore() { let stored = localStorage.getItem('tinyPlatformerCoopHighScore'); highScore = stored ? int(stored) : 0; }
function saveHighScore() { localStorage.setItem('tinyPlatformerCoopHighScore', String(highScore)); }
function startAudio() { if (!audioCtx) { let Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return; audioCtx = new Ctx(); } if (audioCtx.state === 'suspended') audioCtx.resume(); audioStarted = true; }

function playSfx(type) {
  if (!audioCtx || !audioStarted) return;
  if (type === 'coin') simpleBeep(880, 0.06, 0.03, 'square');
  if (type === 'jump') simpleBeep(420, 0.1, 0.04, 'triangle', 620);
  if (type === 'stomp') simpleBeep(180, 0.12, 0.07, 'square');
  if (type === 'hurt') simpleBeep(160, 0.2, 0.09, 'sawtooth', 90);
  if (type === 'power') simpleBeep(520, 0.18, 0.06, 'triangle', 820);
  if (type === 'checkpoint') simpleBeep(660, 0.15, 0.04, 'square', 980);
  if (type === 'shoot') simpleBeep(700, 0.09, 0.04, 'square', 340);
  if (type === 'shootHit') simpleBeep(240, 0.16, 0.06, 'sawtooth', 120);
  if (type === 'ice') simpleBeep(500, 0.12, 0.04, 'triangle', 260);
  if (type === 'boing') simpleBeep(250, 0.14, 0.05, 'triangle', 420);
  if (type === 'lightningShot') dualBeep(640, 0.14, 0.03, 'sawtooth', 1240, 0.028, 'square');
  if (type === 'lightningZap') dualBeep(220, 0.12, 0.05, 'sawtooth', 640, 0.03, 'square');
  if (type === 'lightningHum') dualBeep(180, 0.08, 0.008, 'sawtooth', 300, 0.006, 'triangle');
  if (type === 'forcePush') dualBeep(170, 0.16, 0.03, 'triangle', 440, 0.02, 'sine');
  if (type === 'saberOn') dualBeep(90, 0.24, 0.025, 'sawtooth', 180, 0.018, 'triangle');
  if (type === 'saberHum') dualBeep(92, 0.12, 0.01, 'sawtooth', 138, 0.007, 'triangle');
  if (type === 'saberSlash') playSaberSwingSound();
  if (type === 'saberOff') simpleBeep(180, 0.18, 0.02, 'triangle', 70);
  if (type === 'win') { simpleBeep(523.25, 0.1, 0.05, 'triangle'); simpleBeep(659.25, 0.15, 0.05, 'triangle'); simpleBeep(783.99, 0.2, 0.05, 'triangle'); }
}
function simpleBeep(freq, duration, volume, wave, endFreq) { let now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = wave || 'sine'; osc.frequency.setValueAtTime(freq, now); if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + duration + 0.02); }
function dualBeep(freqA, duration, volA, waveA, freqB, volB, waveB) { simpleBeep(freqA, duration, volA, waveA, freqA * 1.2); simpleBeep(freqB, duration, volB, waveB, freqB * 0.92); }
function playSaberSwingSound() {
  let now = audioCtx.currentTime, master = audioCtx.createGain(); master.gain.setValueAtTime(0.0001, now); master.gain.exponentialRampToValueAtTime(0.05, now + 0.01); master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22); master.connect(audioCtx.destination);
  let hum = audioCtx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.setValueAtTime(130, now); hum.frequency.exponentialRampToValueAtTime(175, now + 0.06); hum.frequency.exponentialRampToValueAtTime(120, now + 0.22); hum.connect(master); hum.start(now); hum.stop(now + 0.24);
  let swing = audioCtx.createOscillator(); swing.type = 'sawtooth'; swing.frequency.setValueAtTime(220, now); swing.frequency.exponentialRampToValueAtTime(780, now + 0.08); swing.frequency.exponentialRampToValueAtTime(170, now + 0.22); swing.connect(master); swing.start(now); swing.stop(now + 0.24);
  let shimmerGain = audioCtx.createGain(); shimmerGain.gain.setValueAtTime(0.0001, now); shimmerGain.gain.exponentialRampToValueAtTime(0.012, now + 0.02); shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18); shimmerGain.connect(audioCtx.destination);
  let shimmer = audioCtx.createOscillator(); shimmer.type = 'triangle'; shimmer.frequency.setValueAtTime(480, now); shimmer.frequency.exponentialRampToValueAtTime(1240, now + 0.06); shimmer.frequency.exponentialRampToValueAtTime(320, now + 0.18); shimmer.connect(shimmerGain); shimmer.start(now); shimmer.stop(now + 0.2);
}
function updateMusic() { if (!audioCtx || !audioStarted) return; if (frameCount % 18 !== 0) return; let note = musicMelody[musicIndex % musicMelody.length], bass = musicBass[bassIndex % musicBass.length]; playMusicNote(note, 0.16, 0.025, 'triangle'); if (musicIndex % 2 === 0) { playMusicNote(bass, 0.22, 0.02, 'sine'); bassIndex++; } musicIndex++; }
function playMusicNote(freq, duration, volume, wave) { let now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = wave || 'triangle'; osc.frequency.setValueAtTime(freq, now); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + duration + 0.03); }
