(function () {
  'use strict';

  const WIDTH = 960;
  const HEIGHT = 540;
  const GROUND_Y = 438;
  const STAGE_WIDTH = 4200;

  const stages = [
    {
      id: 'sunmeadow',
      name: 'Sunmeadow Launch',
      shortName: 'MEADOW',
      story: 'Wake the old skyway and outrun the garden sentry.',
      bossName: 'BRAMBLE-0',
      parTime: 112,
      palette: { skyTop: '#78c7ff', skyBottom: '#dcf6ff', sun: '#fff0a8', far: '#8fc789', near: '#4c976d', ground: '#6caa58', soil: '#6d5839', platform: '#ae78db', accent: '#ffe06d', hazard: '#ff687c' },
      weather: 'petals'
    },
    {
      id: 'moonvault',
      name: 'Moonvault Ruins',
      shortName: 'RUINS',
      story: 'Cross the sleeping archive before its guardian fully wakes.',
      bossName: 'ARCHIVIST',
      parTime: 120,
      palette: { skyTop: '#111d4a', skyBottom: '#5d66a7', sun: '#d9e8ff', far: '#485187', near: '#2a315e', ground: '#6670a0', soil: '#34354f', platform: '#8ec7de', accent: '#cde7ff', hazard: '#ff7a9e' },
      weather: 'stars'
    },
    {
      id: 'neoncanopy',
      name: 'Neon Canopy',
      shortName: 'CANOPY',
      story: 'Climb the living circuit and silence its rogue pollinator.',
      bossName: 'HIVE MIND',
      parTime: 128,
      palette: { skyTop: '#123b43', skyBottom: '#69c79b', sun: '#dbff96', far: '#3b8b63', near: '#185642', ground: '#3f9a62', soil: '#244a38', platform: '#5de0cb', accent: '#e8ff75', hazard: '#ff5fa2' },
      weather: 'spores'
    },
    {
      id: 'emberworks',
      name: 'Emberworks',
      shortName: 'FOUNDRY',
      story: 'Ride the heat vents through a factory that refuses to cool.',
      bossName: 'THE FOREMAN',
      parTime: 136,
      palette: { skyTop: '#341a2b', skyBottom: '#da6647', sun: '#ffcf6a', far: '#713440', near: '#462533', ground: '#746054', soil: '#342a2a', platform: '#e69b55', accent: '#ffd56e', hazard: '#ff3d45' },
      weather: 'embers'
    },
    {
      id: 'glasscanyon',
      name: 'Glass Canyon',
      shortName: 'CANYON',
      story: 'Leap across crystal fault lines where every landing rings.',
      bossName: 'PRISM WARDEN',
      parTime: 144,
      palette: { skyTop: '#244e75', skyBottom: '#e5b6c4', sun: '#fff5db', far: '#9b789b', near: '#655977', ground: '#a47e70', soil: '#55464b', platform: '#7de5ff', accent: '#fff3a5', hazard: '#ff557e' },
      weather: 'shards'
    },
    {
      id: 'stormcitadel',
      name: 'Storm Citadel',
      shortName: 'CITADEL',
      story: 'Reach the weather engine and end the endless overdrive.',
      bossName: 'TEMPEST PRIME',
      parTime: 152,
      palette: { skyTop: '#090f2f', skyBottom: '#4552a4', sun: '#a8d8ff', far: '#2c3974', near: '#151f50', ground: '#3e4f7a', soil: '#1c2441', platform: '#8aa7ff', accent: '#74f3ff', hazard: '#ff5577' },
      weather: 'rain'
    }
  ];

  const characters = [
    { id: 'scout', name: 'Scout', unlockStage: 0, body: '#5da9ff', detail: '#d8efff', trail: '#75e7ff' },
    { id: 'ember', name: 'Ember', unlockStage: 2, body: '#ff6d76', detail: '#ffd6a5', trail: '#ffb65c' },
    { id: 'tide', name: 'Tide', unlockStage: 4, body: '#65d8c7', detail: '#d5fff6', trail: '#8bf5df' },
    { id: 'nova', name: 'Nova', unlockStage: 6, body: '#b778ff', detail: '#f3dbff', trail: '#e8a7ff' }
  ];

  const difficulties = {
    easy: { label: 'Explorer', enemySpeed: 0.9, enemyHp: 0.7, bossHp: 1, bossRate: 0.85, bossSpread: 0, startingLives: 4, score: 0.75 },
    normal: { label: 'Arcade', enemySpeed: 1.12, enemyHp: 1, bossHp: 1.45, bossRate: 1.15, bossSpread: 0, startingLives: 3, score: 1 },
    hard: { label: 'Overdrive', enemySpeed: 1.34, enemyHp: 1.4, bossHp: 1.9, bossRate: 1.4, bossSpread: 1, startingLives: 2, score: 1.5 }
  };

  const defaultBindings = [
    { left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS', attack: 'Space' },
    { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown', attack: 'Slash' }
  ];

  const defaultSettings = {
    difficulty: 'normal',
    volume: 0.65,
    muted: false,
    reducedMotion: false,
    highContrast: false,
    bindings: defaultBindings
  };

  window.GameConfig = Object.freeze({
    WIDTH,
    HEIGHT,
    GROUND_Y,
    STAGE_WIDTH,
    stages,
    characters,
    difficulties,
    defaultBindings,
    defaultSettings
  });
})();
