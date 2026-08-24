(function () {
  'use strict';

  let context = null;
  let master = null;
  let started = false;
  let settings = GameStorage.loadSettings();
  let nextBeatAt = 0;
  let musicStep = 0;
  let resumePromise = null;
  let lastPreviewAt = -Infinity;
  let musicElement = null;
  let musicUrl = null;
  let musicStage = -1;
  let musicPlayPromise = null;
  let musicWanted = false;
  let musicPreviewUntil = 0;
  let currentStage = 0;

  const melodies = [
    [523.25, 659.25, 783.99, 880, 783.99, 659.25, 587.33, 698.46],
    [293.66, 369.99, 440, 554.37, 440, 369.99, 329.63, 415.3],
    [392, 493.88, 587.33, 739.99, 659.25, 587.33, 493.88, 440],
    [220, 277.18, 329.63, 415.3, 369.99, 329.63, 277.18, 246.94],
    [349.23, 440, 523.25, 659.25, 587.33, 523.25, 440, 392],
    [261.63, 329.63, 392, 493.88, 523.25, 493.88, 392, 329.63]
  ];

  function reportStatus(status) {
    if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('game-audio-status', { detail: status }));
  }

  function writeAscii(view, offset, value) {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  }

  function buildMusicBlob(stageIndex) {
    if (typeof window.Blob !== 'function') return null;
    const sampleRate = 12000;
    const beat = stageIndex === 5 ? 0.24 : 0.3;
    const notes = melodies[stageIndex % melodies.length];
    const duration = beat * notes.length * 4;
    const sampleCount = Math.floor(sampleRate * duration);
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
    for (let index = 0; index < sampleCount; index++) {
      const time = index / sampleRate;
      const beatIndex = Math.floor(time / beat);
      const beatPhase = (time % beat) / beat;
      const note = notes[beatIndex % notes.length];
      const envelope = Math.min(1, beatPhase / 0.06) * Math.min(1, (1 - beatPhase) / 0.24);
      const lead = Math.sin(Math.PI * 2 * note * time) * 0.55;
      const bassNote = note / (beatIndex % 4 === 0 ? 4 : 2);
      const bass = Math.sin(Math.PI * 2 * bassNote * time) * 0.28;
      const pulse = Math.sin(Math.PI * 2 * 54 * (time % beat)) * Math.exp(-beatPhase * 13) * 0.17;
      const sample = Math.max(-1, Math.min(1, (lead + bass + pulse) * envelope * 0.48));
      view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }
    return new window.Blob([buffer], { type: 'audio/wav' });
  }

  function ensureMusicTrack(stageIndex) {
    const canUseMedia = typeof window.Audio === 'function' && typeof window.URL?.createObjectURL === 'function';
    if (!canUseMedia) return false;
    if (musicElement && musicStage === stageIndex) return true;
    musicElement?.pause();
    if (musicUrl) window.URL.revokeObjectURL?.(musicUrl);
    const blob = buildMusicBlob(stageIndex);
    if (!blob) return false;
    musicUrl = window.URL.createObjectURL(blob);
    musicElement = new window.Audio();
    musicElement.loop = true;
    musicElement.preload = 'auto';
    musicElement.src = musicUrl;
    musicElement.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.72);
    musicElement.muted = settings.muted;
    musicElement.addEventListener?.('playing', () => reportStatus('Playing'));
    musicElement.addEventListener?.('waiting', () => reportStatus('Loading…'));
    musicElement.addEventListener?.('error', () => reportStatus('Blocked'));
    musicElement.load?.();
    musicStage = stageIndex;
    return true;
  }

  function playMusicTrack() {
    if (!musicElement || settings.muted || settings.volume <= 0) {
      reportStatus(settings.muted || settings.volume <= 0 ? 'Muted' : 'Ready');
      return false;
    }
    if (!musicElement.paused) {
      reportStatus('Playing');
      return true;
    }
    if (musicPlayPromise) return true;
    reportStatus('Starting…');
    try {
      const playResult = musicElement.play();
      if (playResult?.then) {
        musicPlayPromise = playResult
          .then(() => { reportStatus('Playing'); return true; })
          .catch(() => { reportStatus('Blocked — press Test music'); return false; })
          .finally(() => { musicPlayPromise = null; });
      } else reportStatus('Playing');
      return true;
    } catch (_error) {
      reportStatus('Blocked — press Test music');
      return false;
    }
  }

  function ensure() {
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
    if (!context || context.state === 'running') return Promise.resolve(true);
    if (resumePromise) return resumePromise;
    resumePromise = Promise.resolve(context.resume())
      .then(() => {
        nextBeatAt = 0;
        return context.state === 'running';
      })
      .catch(() => false)
      .finally(() => { resumePromise = null; });
    return resumePromise;
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
      musicElement.volume = settings.muted ? 0 : Math.min(1, settings.volume * 0.72);
      if (!settings.muted && settings.volume > 0 && musicWanted) playMusicTrack();
      else if (settings.muted || settings.volume <= 0) reportStatus('Muted');
    }
    if (started && !settings.muted && settings.volume > 0) resumeContext();
  }

  function start(stageIndex = currentStage) {
    currentStage = stageIndex;
    const hasContext = ensure();
    started = true;
    musicWanted = true;
    nextBeatAt = 0;
    if (hasContext) resumeContext();
    const hasTrack = ensureMusicTrack(currentStage);
    if (hasTrack) playMusicTrack();
    return hasContext || hasTrack;
  }

  function previewVolume() {
    if (!ensure() || settings.muted || settings.volume <= 0) return false;
    started = true;
    resumeContext().then((running) => {
      if (!running || !context || context.state !== 'running') return;
      if (context.currentTime - lastPreviewAt < 0.075) return;
      lastPreviewAt = context.currentTime;
      tone(659.25, 0.12, 0.085, 'triangle', 783.99);
    });
    return true;
  }

  function tone(frequency, duration = 0.1, volume = 0.06, wave = 'triangle', endFrequency) {
    if (!started || !ensure() || settings.muted || settings.volume <= 0) return;
    if (context.state !== 'running') {
      resumeContext();
      return;
    }
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
    currentStage = stageIndex;
    const previewing = Date.now() < musicPreviewUntil;
    musicWanted = Boolean(playing || previewing);
    if (!started) return;
    if (ensureMusicTrack(stageIndex)) {
      if (musicWanted) playMusicTrack();
      else if (musicElement && !musicElement.paused) {
        musicElement.pause();
        reportStatus('Ready');
      }
      return;
    }
    if (!playing || !context || settings.muted || settings.volume <= 0) return;
    if (context.state !== 'running') {
      resumeContext();
      return;
    }
    const now = context.currentTime;
    if (now < nextBeatAt) return;
    const melody = melodies[stageIndex % melodies.length];
    const note = melody[musicStep % melody.length];
    const bass = note / (musicStep % 4 === 0 ? 4 : 2);
    tone(note, 0.21, 0.065, stageIndex === 3 ? 'square' : 'triangle');
    if (musicStep % 2 === 0) tone(bass, 0.3, 0.045, 'sine');
    musicStep++;
    nextBeatAt = now + (stageIndex === 5 ? 0.245 : 0.31);
  }

  function resetMusic() {
    musicStep = 0;
    nextBeatAt = 0;
    if (musicElement) {
      try { musicElement.currentTime = 0; } catch (_error) { /* media may still be loading */ }
    }
  }

  function testMusic() {
    musicPreviewUntil = Date.now() + 2600;
    musicWanted = true;
    start(currentStage);
    resetMusic();
    playMusicTrack();
  }

  const resumeOnGesture = () => {
    if (!started) return;
    resumeContext();
    if (musicWanted) playMusicTrack();
  };
  window.addEventListener('pointerdown', resumeOnGesture, { capture: true });
  window.addEventListener('keydown', resumeOnGesture, { capture: true });
  window.addEventListener('game-settings-changed', (event) => applySettings(event.detail));
  window.addEventListener('game-audio-preview', previewVolume);
  window.addEventListener('game-audio-test', testMusic);
  window.GameAudio = { start, sfx, updateMusic, resetMusic, applySettings, previewVolume, testMusic };
})();
