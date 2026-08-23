(function () {
  'use strict';

  const SETTINGS_KEY = 'skyboundCircuitSettingsV2';
  const PROGRESS_KEY = 'skyboundCircuitProgressV2';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...clone(fallback), ...JSON.parse(raw) } : clone(fallback);
    } catch (_error) {
      return clone(fallback);
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function normalizeSettings(settings) {
    const defaults = GameConfig.defaultSettings;
    const result = { ...clone(defaults), ...settings };
    result.volume = Math.max(0, Math.min(1, Number(result.volume) || 0));
    if (!GameConfig.difficulties[result.difficulty]) result.difficulty = defaults.difficulty;
    result.bindings = [0, 1].map((index) => ({
      ...clone(defaults.bindings[index]),
      ...(result.bindings && result.bindings[index] ? result.bindings[index] : {})
    }));
    return result;
  }

  const defaultProgress = {
    unlockedStages: 1,
    selectedStage: 0,
    selectedCharacter: 0,
    bestScores: {},
    bestTimes: {},
    bestGrades: {},
    shards: {},
    totalWins: 0
  };

  function loadSettings() {
    return normalizeSettings(read(SETTINGS_KEY, GameConfig.defaultSettings));
  }

  function saveSettings(settings) {
    return write(SETTINGS_KEY, normalizeSettings(settings));
  }

  function loadProgress() {
    const value = read(PROGRESS_KEY, defaultProgress);
    value.unlockedStages = Math.max(1, Math.min(GameConfig.stages.length, Number(value.unlockedStages) || 1));
    value.selectedStage = Math.max(0, Math.min(value.unlockedStages - 1, Number(value.selectedStage) || 0));
    value.selectedCharacter = Math.max(0, Math.min(GameConfig.characters.length - 1, Number(value.selectedCharacter) || 0));
    return value;
  }

  function saveProgress(progress) {
    return write(PROGRESS_KEY, { ...defaultProgress, ...progress });
  }

  function resetProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch (_error) { /* storage can be unavailable */ }
    return loadProgress();
  }

  window.GameStorage = { loadSettings, saveSettings, loadProgress, saveProgress, resetProgress };
})();
