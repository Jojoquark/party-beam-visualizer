export class Autopilot {
  constructor(sceneCount, paletteCount) {
    this.enabled = true;
    this.autoPalette = true;
    this.beatsPerScene = 32;
    this.sceneCount = sceneCount;
    this.paletteCount = paletteCount;

    this.beatsSinceSwitch = 0;
    this.lastSwitchMs = performance.now();
    this.switchCount = 0;
  }

  resetTimer(nowMs) {
    this.beatsSinceSwitch = 0;
    this.lastSwitchMs = nowMs;
  }

  update(nowMs, audio, currentSceneIndex, currentPaletteIndex, countdownState) {
    if (!this.enabled || countdownState !== 'idle') {
      return null;
    }

    if (audio.kickFired) {
      this.beatsSinceSwitch += 1;
    }

    const elapsedMs = nowMs - this.lastSwitchMs;
    const hitDrop = audio.dropFired && this.beatsSinceSwitch >= 8;
    const hitBeatLimit = this.beatsSinceSwitch >= this.beatsPerScene;
    const hitTimeFallback = elapsedMs >= 26000 && audio.energy > 0.08;

    if (!hitDrop && !hitBeatLimit && !hitTimeFallback) {
      return null;
    }

    let nextScene = (currentSceneIndex + 1 + Math.floor(Math.random() * 2)) % this.sceneCount;
    if (nextScene === currentSceneIndex) {
      nextScene = (currentSceneIndex + 1) % this.sceneCount;
    }

    this.beatsSinceSwitch = 0;
    this.lastSwitchMs = nowMs;
    this.switchCount += 1;

    let nextPalette = currentPaletteIndex;
    if (this.autoPalette && this.switchCount % 2 === 0) {
      nextPalette = (currentPaletteIndex + 1) % this.paletteCount;
    }

    return { nextScene, nextPalette };
  }
}
