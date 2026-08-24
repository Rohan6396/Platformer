(function () {
  'use strict';

  const MUSIC_URL = 'assets/audio/overworld-theme.ogg?v=2.2.0';
  let context = null;
  let master = null;
  let started = false;
  let settings = GameStorage.loadSettings();
  let resumePromise = null;
  let lastPreviewAt = -Infinity;
  let musicElement = null;
  let musicPlayPromise = null;
  let musicWanted = false;
  let musicPreviewUntil = 0;
  const sfxPools = new Map();
  const sfxPoolIndexes = new Map();

  const effectSpecs = {
    jump: { duration: 0.14, tones: [[360, 680, 'triangle', 0.9]] },
    land: { duration: 0.08, tones: [[125, 72, 'sine', 0.8]], noise: 0.08 },
    coin: { duration: 0.13, tones: [[880, 880, 'square', 0.55], [1174.66, 1318.51, 'square', 0.45]] },
    shard: { duration: 0.24, tones: [[659.25, 987.77, 'triangle', 0.5], [987.77, 1318.51, 'triangle', 0.4]] },
    attack: { duration: 0.11, tones: [[280, 590, 'sawtooth', 0.8]], noise: 0.08 },
    shoot: { duration: 0.14, tones: [[760, 260, 'square', 0.75]] },
    hit: { duration: 0.16, tones: [[190, 95, 'sawtooth', 0.8]], noise: 0.22 },
    hurt: { duration: 0.25, tones: [[190, 65, 'sawtooth', 0.85]], noise: 0.12 },
    power: { duration: 0.32, tones: [[440, 880, 'triangle', 0.5], [659.25, 1318.51, 'triangle', 0.35]] },
    checkpoint: { duration: 0.4, tones: [[523.25, 783.99, 'square', 0.4], [659.25, 1046.5, 'triangle', 0.45]] },
    boss: { duration: 0.46, tones: [[82.41, 62, 'sawtooth', 0.65], [164.81, 110, 'square', 0.35]], noise: 0.1 },
    bossHit: { duration: 0.2, tones: [[220, 72, 'square', 0.7]], noise: 0.25 },
    gate: { duration: 0.5, tones: [[110, 620, 'sawtooth', 0.7]], noise: 0.12 },
    win: { duration: 0.72, tones: [[523.25, 1046.5, 'triangle', 0.45], [659.25, 1318.51, 'triangle', 0.35]] },
    menu: { duration: 0.1, tones: [[520, 720, 'triangle', 0.8]] },
    push: { duration: 0.22, tones: [[145, 520, 'sine', 0.75]], noise: 0.14 },
    zap: { duration: 0.34, tones: [[1580, 180, 'sawtooth', 0.55], [760, 1240, 'square', 0.35], [96, 52, 'sine', 0.5]], noise: 0.52 }
  };

  function dispatchStatus(type, detail) {
    if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function reportMusic(status) {
    dispatchStatus('game-audio-status', status);
  }

  function writeAscii(view, offset, value) {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  }

  function waveform(kind, phase) {
    const sine = Math.sin(phase);
    if (kind === 'square') return sine >= 0 ? 1 : -1;
    if (kind === 'sawtooth') return 2 * ((phase / (Math.PI * 2)) % 1) - 1;
    if (kind === 'triangle') return 2 / Math.PI * Math.asin(sine);
    return sine;
  }

  function buildEffectBlob(type) {
    const spec = effectSpecs[type];
    if (!spec || typeof window.Blob !== 'function') return null;
    const sampleRate = 16000;
    const sampleCount = Math.floor(sampleRate * spec.duration);
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, sampleCount * 2, true);
    const phases = spec.tones.map(() => 0);
    let noiseSeed = type.split('').reduce((seed, character) => seed + character.charCodeAt(0) * 2654435761, 2166136261) >>> 0;
    for (let index = 0; index < sampleCount; index++) {
      const progress = index / sampleCount;
      const attack = Math.min(1, progress / 0.055);
      const envelope = attack * Math.pow(1 - progress, type === 'zap' ? 0.72 : 1.45);
      let sample = 0;
      spec.tones.forEach(([startFrequency, endFrequency, wave, gain], toneIndex) => {
        const frequency = startFrequency * Math.pow(Math.max(0.01, endFrequency / startFrequency), progress);
        phases[toneIndex] += Math.PI * 2 * frequency / sampleRate;
        sample += waveform(wave, phases[toneIndex]) * gain;
      });
      if (spec.noise) {
        noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
        sample += ((noiseSeed / 4294967295) * 2 - 1) * spec.noise;
      }
      const peak = type === 'zap' ? 0.54 : 0.46;
      sample = Math.max(-1, Math.min(1, sample * envelope * peak));
      view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }
    return new window.Blob([buffer], { type: 'audio/wav' });
  }

  function ensureSfxPool(type) {
    if (sfxPools.has(type)) return sfxPools.get(type);
    const canUseMedia = typeof window.Audio === 'function' && typeof window.URL?.createObjectURL === 'function';
    if (!canUseMedia) return null;
    const blob = buildEffectBlob(type);
    if (!blob) return null;
    const url = window.URL.createObjectURL(blob);
    const pool = Array.from({ length: 3 }, () => {
      const audio = new window.Audio();
      audio.preload = 'auto';
      audio.src = url;
      audio.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.92);
      audio.muted = settings.muted;
      audio.load?.();
      return audio;
    });
    sfxPools.set(type, pool);
    sfxPoolIndexes.set(type, 0);
    return pool;
  }

  function playMediaEffect(type) {
    const pool = ensureSfxPool(type);
    if (!pool) return false;
    const available = pool.find((audio) => audio.paused || audio.ended);
    const index = sfxPoolIndexes.get(type) || 0;
    const audio = available || pool[index % pool.length];
    sfxPoolIndexes.set(type, index + 1);
    audio.muted = settings.muted;
    audio.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.92);
    try { audio.currentTime = 0; } catch (_error) { /* media may still be loading */ }
    try {
      const playResult = audio.play();
      if (playResult?.then) {
        playResult
          .then(() => dispatchStatus('game-sfx-played', type))
          .catch(() => queueWebAudioEffect(type));
      } else dispatchStatus('game-sfx-played', type);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function ensureContext() {
    if (context?.state === 'closed') {
      context = null;
      master = null;
    }
    if (context) return true;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return false;
    context = new AudioContextCtor();
    master = context.createGain();
    master.connect(context.destination);
    applySettings(settings);
    return true;
  }

  function resumeContext() {
    if (!context || context.state === 'running') return Promise.resolve(Boolean(context));
    if (resumePromise) return resumePromise;
    resumePromise = Promise.resolve(context.resume())
      .then(() => context.state === 'running')
      .catch(() => false)
      .finally(() => { resumePromise = null; });
    return resumePromise;
  }

  function ensureMusicTrack() {
    if (musicElement) return true;
    if (typeof window.Audio !== 'function') {
      reportMusic('Unavailable');
      return false;
    }
    musicElement = new window.Audio();
    musicElement.loop = true;
    musicElement.preload = 'auto';
    musicElement.src = MUSIC_URL;
    musicElement.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.58);
    musicElement.muted = settings.muted;
    musicElement.addEventListener?.('playing', () => reportMusic('Playing'));
    musicElement.addEventListener?.('waiting', () => reportMusic('Loading…'));
    musicElement.addEventListener?.('canplay', () => {
      if (musicElement.paused && !musicWanted) reportMusic('Ready');
    });
    musicElement.addEventListener?.('error', () => reportMusic('Could not load'));
    musicElement.load?.();
    return true;
  }

  function playMusicTrack() {
    if (!musicElement || settings.muted || settings.volume <= 0) {
      reportMusic(settings.muted || settings.volume <= 0 ? 'Muted' : 'Ready');
      return false;
    }
    if (!musicElement.paused) {
      reportMusic('Playing');
      return true;
    }
    if (musicPlayPromise) return true;
    reportMusic('Starting…');
    try {
      const playResult = musicElement.play();
      if (playResult?.then) {
        musicPlayPromise = playResult
          .then(() => { reportMusic('Playing'); return true; })
          .catch(() => { reportMusic('Blocked — press Test music'); return false; })
          .finally(() => { musicPlayPromise = null; });
      } else reportMusic('Playing');
      return true;
    } catch (_error) {
      reportMusic('Blocked — press Test music');
      return false;
    }
  }

  function applySettings(next) {
    settings = next || GameStorage.loadSettings();
    if (master && context) {
      const value = settings.muted ? 0 : Math.max(0, Math.min(1, settings.volume));
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(value, context.currentTime, 0.025);
    }
    if (musicElement) {
      musicElement.muted = settings.muted;
      musicElement.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.58);
      if (!settings.muted && settings.volume > 0 && musicWanted) playMusicTrack();
      else if (settings.muted || settings.volume <= 0) reportMusic('Muted');
    }
    sfxPools.forEach((pool) => pool.forEach((audio) => {
      audio.muted = settings.muted;
      audio.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.92);
    }));
    if (started && !settings.muted && settings.volume > 0) resumeContext();
  }

  function start() {
    started = true;
    musicWanted = true;
    const hasContext = ensureContext();
    if (hasContext) resumeContext();
    const hasTrack = ensureMusicTrack();
    if (hasTrack) playMusicTrack();
    return hasContext || hasTrack;
  }

  function tone(frequency, duration = 0.1, volume = 0.06, wave = 'triangle', endFrequency, delay = 0) {
    if (!started || !context || context.state !== 'running' || settings.muted || settings.volume <= 0) return false;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(30, frequency), now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
    return true;
  }

  function chord(notes, duration, volume, wave, delay = 0) {
    notes.forEach((note, index) => tone(note, duration, volume / Math.max(1, notes.length - 0.5), wave, note * (index % 2 ? 0.98 : 1.03), delay));
  }

  function noiseBurst(duration, volume, frequency) {
    if (!context?.createBuffer || !context.createBufferSource || context.state !== 'running') return;
    const sampleRate = context.sampleRate || 44100;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      const fade = 1 - index / samples.length;
      samples[index] = (Math.random() * 2 - 1) * fade;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    const filter = context.createBiquadFilter?.();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    if (filter) {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(frequency, context.currentTime);
      filter.Q.setValueAtTime(1.2, context.currentTime);
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(master);
    source.start(context.currentTime);
    source.stop(context.currentTime + duration + 0.02);
  }

  function playWebAudioEffect(type) {
    const effects = {
      jump: () => tone(360, 0.11, 0.07, 'triangle', 650),
      land: () => tone(115, 0.055, 0.035, 'sine', 90),
      coin: () => chord([880, 1174.66], 0.085, 0.09, 'square'),
      shard: () => chord([659.25, 987.77, 1318.51], 0.18, 0.11, 'triangle'),
      attack: () => tone(280, 0.08, 0.055, 'sawtooth', 560),
      shoot: () => tone(720, 0.1, 0.065, 'square', 280),
      hit: () => chord([130, 190], 0.12, 0.12, 'sawtooth'),
      hurt: () => tone(180, 0.22, 0.12, 'sawtooth', 72),
      power: () => chord([440, 659.25, 880], 0.24, 0.12, 'triangle'),
      checkpoint: () => chord([523.25, 659.25, 783.99], 0.3, 0.13, 'square'),
      boss: () => chord([82.41, 110, 164.81], 0.42, 0.16, 'sawtooth'),
      bossHit: () => chord([92.5, 138.59, 220], 0.15, 0.15, 'square'),
      gate: () => tone(120, 0.45, 0.1, 'sawtooth', 560),
      win: () => chord([523.25, 659.25, 783.99, 1046.5], 0.65, 0.2, 'triangle'),
      menu: () => tone(520, 0.07, 0.055, 'triangle', 680),
      push: () => {
        noiseBurst(0.15, 0.035, 520);
        tone(150, 0.18, 0.075, 'sine', 480);
      },
      zap: () => {
        noiseBurst(0.26, 0.14, 1850);
        tone(1580, 0.2, 0.1, 'sawtooth', 180);
        tone(760, 0.24, 0.075, 'square', 1240, 0.015);
        tone(96, 0.28, 0.09, 'sine', 52);
      }
    };
    const effect = effects[type];
    if (!effect) return false;
    effect();
    dispatchStatus('game-sfx-played', type);
    return true;
  }

  function queueWebAudioEffect(type) {
    if (!ensureContext()) return false;
    if (context.state === 'running') return playWebAudioEffect(type);
    resumeContext().then((running) => {
      if (running) playWebAudioEffect(type);
    });
    return true;
  }

  function sfx(type) {
    started = true;
    if (settings.muted || settings.volume <= 0) return false;
    if (playMediaEffect(type)) return true;
    return queueWebAudioEffect(type);
  }

  function previewVolume() {
    started = true;
    if (!ensureContext() || settings.muted || settings.volume <= 0) return false;
    resumeContext().then((running) => {
      if (!running || context.currentTime - lastPreviewAt < 0.075) return;
      lastPreviewAt = context.currentTime;
      tone(659.25, 0.12, 0.1, 'triangle', 783.99);
    });
    return true;
  }

  function updateMusic(_stageIndex, playing) {
    const previewing = Date.now() < musicPreviewUntil;
    musicWanted = Boolean(playing || previewing);
    if (!started || !ensureMusicTrack()) return;
    if (musicWanted) playMusicTrack();
    else if (!musicElement.paused) {
      musicElement.pause();
      reportMusic('Ready');
    }
  }

  function resetMusic() {
    if (!musicElement) return;
    try { musicElement.currentTime = 0; } catch (_error) { /* media may still be loading */ }
  }

  function testMusic() {
    musicPreviewUntil = Date.now() + 4200;
    musicWanted = true;
    start();
    resetMusic();
    playMusicTrack();
  }

  function testSfx() {
    sfx('zap');
  }

  const resumeOnGesture = () => {
    started = true;
    if (ensureContext()) resumeContext();
    if (musicWanted && ensureMusicTrack()) playMusicTrack();
  };
  window.addEventListener('pointerdown', resumeOnGesture, { capture: true });
  window.addEventListener('keydown', resumeOnGesture, { capture: true });
  window.addEventListener('game-settings-changed', (event) => applySettings(event.detail));
  window.addEventListener('game-audio-preview', previewVolume);
  window.addEventListener('game-audio-test', testMusic);
  window.addEventListener('game-sfx-test', testSfx);
  window.GameAudio = { start, sfx, updateMusic, resetMusic, applySettings, previewVolume, testMusic, testSfx };
})();
