(function () {
  'use strict';

  const pressed = new Set();
  const virtualPressed = new Set();
  const gamepadPressed = [new Set(), new Set()];
  let installed = false;
  let listeningFor = null;
  let settings = GameStorage.loadSettings();

  const preventCodes = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Slash',
    'KeyA', 'KeyD', 'KeyW', 'KeyS'
  ]);

  const codeLabels = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: 'Space', Slash: '/', Enter: 'Enter', Escape: 'Esc'
  };

  function codeLabel(code) {
    return codeLabels[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
  }

  function updateKeybindLabels() {
    document.querySelectorAll('.keybind').forEach((button) => {
      const player = Number(button.dataset.player);
      const action = button.dataset.action;
      const actionLabel = action === 'down' ? 'Crouch' : action.charAt(0).toUpperCase() + action.slice(1);
      button.textContent = `${actionLabel}: ${codeLabel(settings.bindings[player][action])}`;
      button.classList.toggle('is-listening', Boolean(listeningFor && listeningFor.button === button));
    });
  }

  function saveAndNotify() {
    const snapshot = {
      ...settings,
      bindings: settings.bindings.map((binding) => ({ ...binding }))
    };
    GameStorage.saveSettings(snapshot);
    document.body.classList.toggle('high-contrast', settings.highContrast);
    window.dispatchEvent(new CustomEvent('game-settings-changed', { detail: snapshot }));
  }

  function clear() {
    pressed.clear();
    virtualPressed.clear();
    gamepadPressed.forEach((set) => set.clear());
    document.querySelectorAll('.touch-key').forEach((button) => button.classList.remove('is-active'));
  }

  function handleKeyDown(event) {
    if (document.getElementById('settings-dialog')?.open && !listeningFor) return;
    if (listeningFor) {
      event.preventDefault();
      settings.bindings[listeningFor.player][listeningFor.action] = event.code;
      preventCodes.add(event.code);
      listeningFor = null;
      updateKeybindLabels();
      saveAndNotify();
      return;
    }
    pressed.add(event.code);
    if (preventCodes.has(event.code)) event.preventDefault();
  }

  function handleKeyUp(event) {
    pressed.delete(event.code);
    if (preventCodes.has(event.code)) event.preventDefault();
  }

  function bindTouchControls() {
    document.querySelectorAll('.touch-key').forEach((button) => {
      const code = button.dataset.code;
      const activate = (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        virtualPressed.add(code);
        button.classList.add('is-active');
      };
      const release = (event) => {
        event.preventDefault();
        virtualPressed.delete(code);
        button.classList.remove('is-active');
      };
      button.addEventListener('pointerdown', activate);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    });
  }

  function bindSettings() {
    const dialog = document.getElementById('settings-dialog');
    const settingsButton = document.getElementById('settings-button');
    const muteButton = document.getElementById('mute-button');
    const fullscreenButton = document.getElementById('fullscreen-button');
    const difficultyButtons = ['easy', 'normal', 'hard'].map((key) => document.getElementById(`difficulty-${key}`));
    const volume = document.getElementById('volume-range');
    const difficultyValue = document.getElementById('difficulty-value');
    const volumeValue = document.getElementById('volume-value');
    const musicStatus = document.getElementById('music-status');
    const musicTest = document.getElementById('music-test');
    const sfxStatus = document.getElementById('sfx-status');
    const sfxTest = document.getElementById('sfx-test');
    const reducedMotion = document.getElementById('reduced-motion');
    const highContrast = document.getElementById('high-contrast');
    let openedDifficulty = settings.difficulty;

    function syncSettingsUi() {
      volume.value = String(settings.volume);
      difficultyValue.textContent = GameConfig.difficulties[settings.difficulty].label;
      difficultyButtons.forEach((button) => {
        const selected = button.dataset.difficulty === settings.difficulty;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
      reducedMotion.checked = settings.reducedMotion;
      highContrast.checked = settings.highContrast;
      muteButton.textContent = settings.muted ? 'Sound off' : 'Sound on';
      muteButton.setAttribute('aria-pressed', String(settings.muted));
      updateKeybindLabels();
    }

    settingsButton.addEventListener('click', () => {
      openedDifficulty = settings.difficulty;
      syncSettingsUi();
      clear();
      dialog.showModal();
      window.dispatchEvent(new CustomEvent('game-autopause', { detail: { source: 'settings' } }));
    });

    dialog.addEventListener('close', () => {
      listeningFor = null;
      updateKeybindLabels();
      window.dispatchEvent(new CustomEvent('game-settings-closed', {
        detail: { difficultyChanged: settings.difficulty !== openedDifficulty }
      }));
      document.querySelector('#canvas-mount canvas')?.focus();
    });

    muteButton.addEventListener('click', () => {
      settings.muted = !settings.muted;
      syncSettingsUi();
      saveAndNotify();
    });

    fullscreenButton.addEventListener('click', async () => {
      const shell = document.getElementById('game-shell');
      try {
        if (!document.fullscreenElement) await shell.requestFullscreen();
        else await document.exitFullscreen();
      } catch (_error) {
        window.dispatchEvent(new CustomEvent('game-message', { detail: 'Fullscreen is unavailable in this browser.' }));
      }
    });

    difficultyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        settings.difficulty = button.dataset.difficulty;
        difficultyValue.textContent = GameConfig.difficulties[settings.difficulty].label;
        difficultyButtons.forEach((choice) => {
          const selected = choice === button;
          choice.classList.toggle('is-selected', selected);
          choice.setAttribute('aria-pressed', String(selected));
        });
        saveAndNotify();
      });
    });
    volume.addEventListener('input', () => {
      settings.volume = Number(volume.value);
      if (settings.volume > 0 && settings.muted) settings.muted = false;
      volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
      muteButton.textContent = settings.muted ? 'Sound off' : 'Sound on';
      muteButton.setAttribute('aria-pressed', String(settings.muted));
      saveAndNotify();
      window.dispatchEvent(new CustomEvent('game-audio-preview'));
    });
    musicTest.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('game-audio-test'));
    });
    sfxTest.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('game-sfx-test'));
    });
    window.addEventListener('game-audio-status', (event) => {
      musicStatus.textContent = String(event.detail || 'Ready');
    });
    window.addEventListener('game-sfx-played', (event) => {
      sfxStatus.textContent = event.detail === 'zap' ? 'Lightning played' : 'Played';
    });
    reducedMotion.addEventListener('change', () => { settings.reducedMotion = reducedMotion.checked; saveAndNotify(); });
    highContrast.addEventListener('change', () => { settings.highContrast = highContrast.checked; saveAndNotify(); });

    document.querySelectorAll('.keybind').forEach((button) => {
      button.addEventListener('click', () => {
        listeningFor = { player: Number(button.dataset.player), action: button.dataset.action, button };
        updateKeybindLabels();
        button.textContent = 'Press a key…';
      });
    });

    document.getElementById('reset-progress').addEventListener('click', () => {
      if (!window.confirm('Reset every unlocked level, medal, shard, and best score?')) return;
      GameStorage.resetProgress();
      window.dispatchEvent(new CustomEvent('game-progress-reset'));
      dialog.close();
    });

    syncSettingsUi();
    document.body.classList.toggle('high-contrast', settings.highContrast);
  }

  function install() {
    if (installed) return;
    installed = true;
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    window.addEventListener('blur', () => { clear(); window.dispatchEvent(new CustomEvent('game-autopause')); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clear(); window.dispatchEvent(new CustomEvent('game-autopause')); }
    });
    bindTouchControls();
    bindSettings();
  }

  function pollGamepads() {
    gamepadPressed.forEach((set) => set.clear());
    if (!navigator.getGamepads) return;
    const pads = Array.from(navigator.getGamepads()).filter(Boolean);
    pads.slice(0, 2).forEach((pad, padIndex) => {
      const playerIndex = padIndex === 0 ? 1 : 0;
      const set = gamepadPressed[playerIndex];
      const x = pad.axes[0] || 0;
      const y = pad.axes[1] || 0;
      if (x < -0.28 || pad.buttons[14]?.pressed) set.add('left');
      if (x > 0.28 || pad.buttons[15]?.pressed) set.add('right');
      if (y > 0.35 || pad.buttons[13]?.pressed) set.add('down');
      if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[12]?.pressed) set.add('jump');
      if (pad.buttons[2]?.pressed || pad.buttons[3]?.pressed || pad.buttons[5]?.pressed) set.add('attack');
      if (pad.buttons[9]?.pressed) set.add('pause');
    });
  }

  function isDown(playerIndex, action) {
    const code = settings.bindings[playerIndex][action];
    return pressed.has(code) || virtualPressed.has(code) || gamepadPressed[playerIndex].has(action);
  }

  function isCodeDown(code) {
    return pressed.has(code) || virtualPressed.has(code);
  }

  function getSettings() { return settings; }
  function refreshSettings() { settings = GameStorage.loadSettings(); updateKeybindLabels(); return settings; }

  window.GameInput = { install, pollGamepads, isDown, isCodeDown, clear, codeLabel, getSettings, refreshSettings };
})();
