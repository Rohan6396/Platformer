(function () {
  'use strict';

  let context = null;
  let master = null;
  let started = false;
  let settings = GameStorage.loadSettings();
  let nextBeatAt = 0;
  let musicStep = 0;

  const melodies = [
    [523.25, 659.25, 783.99, 880, 783.99, 659.25, 587.33, 698.46],
    [293.66, 369.99, 440, 554.37, 440, 369.99, 329.63, 415.3],
    [392, 493.88, 587.33, 739.99, 659.25, 587.33, 493.88, 440],
    [220, 277.18, 329.63, 415.3, 369.99, 329.63, 277.18, 246.94],
    [349.23, 440, 523.25, 659.25, 587.33, 523.25, 440, 392],
    [261.63, 329.63, 392, 493.88, 523.25, 493.88, 392, 329.63]
  ];

  function ensure() {
    if (context) return true;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return false;
    context = new AudioContextCtor();
    master = context.createGain();
    master.connect(context.destination);
    applySettings(settings);
    return true;
  }

  function applySettings(next) {
    settings = next || GameStorage.loadSettings();
    if (master && context) {
      const value = settings.muted ? 0 : Math.max(0, Math.min(1, settings.volume));
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(value, context.currentTime, 0.025);
    }
  }

  function start() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume();
    started = true;
  }

  function tone(frequency, duration = 0.1, volume = 0.06, wave = 'triangle', endFrequency) {
    if (!started || !ensure() || settings.muted || settings.volume <= 0) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(30, frequency), now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  function chord(notes, duration, volume, wave) {
    notes.forEach((note, index) => tone(note, duration, volume / Math.max(1, notes.length - 0.5), wave, note * (index % 2 ? 0.98 : 1.03)));
  }

  function sfx(type) {
    const effects = {
      jump: () => tone(360, 0.11, 0.06, 'triangle', 620),
      land: () => tone(115, 0.055, 0.025, 'sine', 90),
      coin: () => chord([880, 1174.66], 0.085, 0.07, 'square'),
      shard: () => chord([659.25, 987.77, 1318.51], 0.18, 0.08, 'triangle'),
      attack: () => tone(280, 0.08, 0.04, 'sawtooth', 560),
      shoot: () => tone(720, 0.1, 0.045, 'square', 280),
      hit: () => chord([130, 190], 0.12, 0.09, 'sawtooth'),
      hurt: () => tone(180, 0.22, 0.09, 'sawtooth', 72),
      power: () => chord([440, 659.25, 880], 0.24, 0.09, 'triangle'),
      checkpoint: () => chord([523.25, 659.25, 783.99], 0.3, 0.1, 'square'),
      boss: () => chord([82.41, 110, 164.81], 0.42, 0.13, 'sawtooth'),
      bossHit: () => chord([92.5, 138.59, 220], 0.15, 0.12, 'square'),
      gate: () => tone(120, 0.45, 0.07, 'sawtooth', 560),
      win: () => chord([523.25, 659.25, 783.99, 1046.5], 0.65, 0.16, 'triangle'),
      menu: () => tone(520, 0.07, 0.035, 'triangle', 680),
      push: () => tone(150, 0.16, 0.055, 'sine', 440),
      zap: () => chord([220, 640], 0.14, 0.075, 'sawtooth')
    };
    effects[type]?.();
  }

  function updateMusic(stageIndex, playing) {
    if (!playing || !started || !context || settings.muted || settings.volume <= 0) return;
    const now = context.currentTime;
    if (now < nextBeatAt) return;
    const melody = melodies[stageIndex % melodies.length];
    const note = melody[musicStep % melody.length];
    const bass = note / (musicStep % 4 === 0 ? 4 : 2);
    tone(note, 0.19, 0.026, stageIndex === 3 ? 'square' : 'triangle');
    if (musicStep % 2 === 0) tone(bass, 0.28, 0.021, 'sine');
    musicStep++;
    nextBeatAt = now + (stageIndex === 5 ? 0.245 : 0.31);
  }

  function resetMusic() {
    musicStep = 0;
    nextBeatAt = 0;
  }

  window.addEventListener('game-settings-changed', (event) => applySettings(event.detail));
  window.GameAudio = { start, sfx, updateMusic, resetMusic, applySettings };
})();
