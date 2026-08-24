(function () {
  'use strict';

  const { GROUND_Y, STAGE_WIDTH } = GameConfig;

  const layouts = [
    {
      platforms: [[330,388,130],[560,350,120],[780,310,120],[1080,372,150],[1330,330,130],[1570,292,120],[1830,340,170],[2220,370,140],[2470,326,130],[2700,282,120],[2980,348,170],[3260,308,130],[3470,266,125]],
      hazards: [['thorn',930,82],['thorn',1740,70],['thorn',2070,96],['thorn',2860,84],['thorn',3370,72]],
      enemies: [['walker',650,500,930],['hopper',1180,1040,1500],['drone',1490,1320,1770],['walker',2300,2160,2550],['hopper',2770,2630,3060],['drone',3290,3100,3520]],
      powers: [['shield',1260,394],['blaster',2550,282],['aspect',3430,220]],
      shards: [[850,250],[1940,270],[3090,272]]
    },
    {
      platforms: [[260,370,150],[510,326,125],[760,280,120],[1030,342,180],[1320,302,130],[1540,258,110],[1780,326,160],[2130,372,130],[2360,320,120],[2590,270,120],[2830,224,120],[3100,300,160],[3370,252,120]],
      hazards: [['laser',930,18,210,228],['spike',1220,92],['laser',2010,18,240,198],['spike',2740,90],['laser',3250,18,180,258]],
      enemies: [['walker',440,300,720],['drone',910,760,1110],['hopper',1410,1240,1690],['walker',1900,1750,2090],['drone',2450,2250,2710],['hopper',3170,3010,3410]],
      powers: [['shield',1120,298],['frost',2670,226],['aspect',3410,208]],
      shards: [[820,215],[1880,250],[2870,170]]
    },
    {
      platforms: [[250,380,125],[460,338,115],[650,294,110],[850,248,110],[1060,202,120],[1320,270,140],[1560,328,145],[1840,286,110],[2100,366,140],[2330,312,120],[2530,260,110],[2750,208,120],[3030,284,150],[3300,235,130],[3510,310,120]],
      hazards: [['spore',1180,80],['spore',1730,86],['spore',2210,74],['spore',2920,96],['spore',3430,76]],
      enemies: [['hopper',540,390,780],['drone',960,780,1220],['walker',1450,1270,1700],['drone',1950,1780,2200],['hopper',2410,2250,2680],['drone',3160,2960,3400]],
      powers: [['blaster',1110,158],['shield',2140,322],['prism',3370,191]],
      shards: [[900,170],[1790,220],[2810,142]]
    },
    {
      platforms: [[300,372,140],[560,320,120],[820,270,120],[1110,350,160],[1380,300,120],[1610,250,120],[1900,340,150],[2170,290,120],[2410,240,120],[2680,350,150],[2950,300,125],[3190,250,125],[3440,200,130]],
      hazards: [['lava',720,90],['vent',1010,65],['lava',1280,86],['vent',1810,65],['lava',2270,90],['vent',2830,65],['lava',3330,86]],
      enemies: [['walker',460,280,690],['drone',930,770,1140],['hopper',1500,1320,1740],['walker',2040,1880,2240],['drone',2560,2350,2760],['hopper',3150,2970,3370]],
      powers: [['shield',1190,306],['blaster',2460,196],['prism',3490,156]],
      shards: [[890,205],[1970,270],[3250,185]]
    },
    {
      platforms: [[240,370,115],[440,325,105],[630,280,100],[820,235,100],[1050,300,130],[1280,356,140],[1540,305,110],[1760,252,110],[1980,200,110],[2260,275,140],[2510,330,130],[2750,280,115],[2970,230,115],[3220,180,120],[3470,260,135]],
      hazards: [['crystal',930,72],['crystal',1450,82],['crystal',2150,78],['crystal',2650,76],['crystal',3370,72]],
      enemies: [['drone',520,350,780],['hopper',1130,980,1370],['walker',1640,1480,1840],['drone',2130,1900,2320],['hopper',2840,2700,3070],['drone',3330,3120,3520]],
      powers: [['frost',880,191],['shield',2320,231],['aspect',3520,216]],
      shards: [[680,215],[2040,140],[3270,120]]
    },
    {
      platforms: [[260,372,130],[500,325,115],[710,276,110],[930,226,110],[1180,320,150],[1440,270,120],[1680,220,115],[1940,340,150],[2210,292,120],[2450,244,115],[2700,194,115],[2980,285,145],[3240,232,120],[3470,180,120]],
      hazards: [['laser',410,18,190,248],['storm',1040,84],['laser',1360,18,225,213],['storm',1850,92],['laser',2570,18,170,268],['storm',3120,88],['laser',3390,18,210,228]],
      enemies: [['walker',600,430,820],['drone',1030,860,1250],['hopper',1530,1370,1780],['drone',2050,1880,2300],['walker',2810,2640,3020],['drone',3300,3100,3490]],
      powers: [['blaster',1250,276],['frost',2500,200],['prism',3520,136]],
      shards: [[760,212],[1730,162],[3030,220]]
    }
  ];

  const encounterGatePositions = [
    [1710, 3190],
    [1710, 2980],
    [1820, 3220],
    [1765, 3130],
    [1905, 3130],
    [1810, 3215]
  ];

  const checkpointPreferences = [2550, 2200, 2050, 2050, 2350, 2300];

  function coinLine(coins, x, y, count, gap = 42) {
    for (let i = 0; i < count; i++) coins.push({ x: x + i * gap, y, radius: 10, collected: false });
  }

  function coinArc(coins, x, y, count, gap = 42, lift = 24) {
    const middle = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const distance = Math.abs(i - middle);
      coins.push({ x: x + i * gap, y: y + distance * lift - middle * lift, radius: 10, collected: false });
    }
  }

  function enemy(kind, x, left, right, difficulty, index, stageIndex, options = {}) {
    const flying = kind === 'drone';
    const speed = (kind === 'hopper' ? 1.7 : flying ? 1.9 : 1.28) * difficulty.enemySpeed;
    const stageHp = 1 + Math.floor(stageIndex / 2);
    const hp = Math.max(1, Math.ceil((stageHp + (options.elite ? 1 : 0)) * difficulty.enemyHp));
    return {
      id: options.id || `enemy-${index}`,
      kind,
      x,
      y: flying ? 300 : GROUND_Y - (kind === 'hopper' ? 30 : 36),
      baseY: flying ? 300 : 0,
      w: flying ? 42 : 36,
      h: kind === 'hopper' ? 30 : 36,
      vx: speed,
      baseSpeed: speed,
      vy: 0,
      left,
      right,
      phase: index * 0.83,
      hopTimer: 45 + (index * 17) % 55,
      hp,
      maxHp: hp,
      alive: true,
      onGround: false,
      frozenTimer: 0,
      stunnedTimer: 0,
      hurtTimer: 0,
      deathTimer: 0,
      boss: false,
      elite: Boolean(options.elite),
      arenaId: options.arenaId || null
    };
  }

  function checkpointIsSafe(x, hazards, margin = 90) {
    const spawnLeft = x + 42;
    const spawnRight = x + 138;
    return hazards.every((hazard) => {
      if (hazard.type === 'vent') return true;
      return spawnRight + margin < hazard.x || spawnLeft - margin > hazard.x + hazard.w;
    });
  }

  function safeCheckpointX(stageIndex, hazards) {
    const preferred = checkpointPreferences[stageIndex];
    const candidates = [preferred, preferred - 100, preferred + 100, preferred - 200, preferred + 200, 1750, 2350, 2550];
    return candidates.find((x) => checkpointIsSafe(x, hazards)) || 2500;
  }

  function createStage(stageIndex, difficultyKey) {
    const layout = layouts[stageIndex];
    const difficulty = GameConfig.difficulties[difficultyKey] || GameConfig.difficulties.normal;
    const solids = [
      { x: 0, y: GROUND_Y, w: STAGE_WIDTH, h: GameConfig.HEIGHT - GROUND_Y, kind: 'ground' }
    ];
    const coins = [];

    layout.platforms.forEach(([x, y, w], index) => {
      solids.push({ x, y, w, h: 20, kind: index % 4 === 0 ? 'ancient' : 'platform' });
      if (index % 2 === 0) coinLine(coins, x + 18, y - 28, Math.max(2, Math.floor((w - 20) / 40)));
    });

    coinLine(coins, 150, GROUND_Y - 38, 5);
    coinArc(coins, 1200, GROUND_Y - 85, 6);
    coinArc(coins, 2850, GROUND_Y - 90, 7);
    coinLine(coins, 3600, GROUND_Y - 40, 4);

    const enemies = layout.enemies.map((item, index) => enemy(item[0], item[1], item[2], item[3], difficulty, index, stageIndex));
    encounterGatePositions[stageIndex].forEach((gateX, arenaIndex) => {
      const arenaId = `blockade-${arenaIndex + 1}`;
      solids.push({ x: gateX, y: 72, w: 30, h: GROUND_Y - 72, kind: 'gate', arenaGate: arenaId });
      enemies.push(enemy('hopper', gateX - 235, gateX - 410, gateX - 48, difficulty, enemies.length, stageIndex, {
        id: `${arenaId}-guard`, elite: true, arenaId
      }));
      enemies.push(enemy('drone', gateX - 120, gateX - 390, gateX - 42, difficulty, enemies.length, stageIndex, {
        id: `${arenaId}-drone`, elite: true, arenaId
      }));
    });
    const bossHp = Math.max(3, Math.ceil((4 + stageIndex) * difficulty.bossHp));
    const boss = {
      id: 'stage-boss', kind: 'boss', x: 3740, y: GROUND_Y - 78, baseY: GROUND_Y - 78,
      w: 78, h: 78, vx: (1.15 + stageIndex * 0.08) * difficulty.enemySpeed,
      baseSpeed: (1.15 + stageIndex * 0.08) * difficulty.enemySpeed,
      vy: 0, left: 3560, right: 4020, phase: 0, hopTimer: 85,
      hp: bossHp, maxHp: bossHp, alive: true, onGround: false, frozenTimer: 0,
      stunnedTimer: 0, hurtTimer: 0, deathTimer: 0, boss: true,
      attackTimer: 95 - stageIndex * 5, attackCycle: 0,
      attackRate: difficulty.bossRate, spreadBonus: difficulty.bossSpread, stageIndex
    };
    enemies.push(boss);

    solids.push({ x: 4050, y: 188, w: 26, h: GROUND_Y - 188, kind: 'gate', bossGate: true });

    const hazards = layout.hazards.map((item, index) => {
      const [type, x, w, y, h] = item;
      return {
        id: `hazard-${index}`,
        type,
        x,
        y: typeof y === 'number' ? y : GROUND_Y - (type === 'laser' ? 210 : 18),
        w,
        h: typeof h === 'number' ? h : (type === 'laser' ? 210 : 18),
        phase: index * 39 + stageIndex * 17,
        period: type === 'laser' ? 170 : 0
      };
    });

    const powerUps = layout.powers.map(([type, x, y]) => ({ type, x, y, w: 30, h: 30, collected: false }));
    const shards = layout.shards.map(([x, y], index) => ({ id: index, x, y, radius: 13, collected: false }));
    const checkpointX = safeCheckpointX(stageIndex, hazards);

    return {
      stageIndex,
      solids,
      enemies,
      coins,
      hazards,
      powerUps,
      shards,
      projectiles: [],
      enemyProjectiles: [],
      finish: { x: 4120, y: 258, w: 28, h: GROUND_Y - 258 },
      checkpoint: { x: checkpointX, y: GROUND_Y - 78, w: 26, h: 78, reached: false, safeRadius: 90 },
      gateOpen: false
    };
  }

  window.GameLevels = { createStage };
})();
