export class Autopilot {
  constructor(sceneCount, paletteCount, laserIndices = []) {
    this.enabled = true;
    this.autoPalette = true;
    this.beatsPerScene = 32;
    this.directorMode = 'party'; // 'party' | 'laser-strobe'
    this.sceneCount = sceneCount;
    this.paletteCount = paletteCount;
    this.laserIndices = laserIndices.length
      ? laserIndices
      : Array.from({ length: sceneCount }, (_, i) => i);

    this.beatsSinceSwitch = 0;
    this.totalDirectorBeats = 0;
    this.lastSwitchMs = performance.now();
    this.switchCount = 0;

    this.strobeBurstUntilMs = 0;
    this.lastBurstTriggerMs = 0;
    this.autoStrobePhase = 0;
  }

  resetTimer(nowMs) {
    this.beatsSinceSwitch = 0;
    this.lastSwitchMs = nowMs;
  }

  pickNextScene(currentSceneIndex, pool) {
    if (pool.length <= 1) return pool[0] ?? 0;
    const pos = pool.indexOf(currentSceneIndex);
    if (pos === -1) return pool[0];
    const step = 1 + Math.floor(Math.random() * Math.min(2, pool.length - 1));
    return pool[(pos + step) % pool.length];
  }

  update(nowMs, audio, currentSceneIndex, currentPaletteIndex, countdownState, safeMode = false) {
    const isLaserDirector = this.directorMode === 'laser-strobe';

    if (countdownState !== 'idle') {
      return { nextScene: null, nextPalette: null, laserGain: 1.0, directorStrobe: 0.0 };
    }

    let laserGain = 1.0;
    let directorStrobe = 0.0;

    if (isLaserDirector && !safeMode) {
      if (audio.kickFired) {
        this.totalDirectorBeats += 1;
      }

      const burstCooldownElapsed = nowMs - this.lastBurstTriggerMs > 4800;
      const phraseHit = audio.kickFired && this.totalDirectorBeats % 16 === 0 && audio.energy > 0.3;
      const snarePeak = audio.snareFired && audio.bass > 0.52 && burstCooldownElapsed;

      if (audio.dropFired || phraseHit || snarePeak) {
        this.lastBurstTriggerMs = nowMs;
        this.strobeBurstUntilMs = nowMs + (audio.dropFired ? 2400 : 1500);
      }

      if (nowMs < this.strobeBurstUntilMs) {
        const fastPulse = Math.sin(nowMs * 0.068);
        const onPhase = fastPulse > 0.05;
        laserGain = onPhase ? 1.75 : 0.0;
        if (onPhase && (audio.kick > 0.45 || audio.snare > 0.45 || fastPulse > 0.72)) {
          directorStrobe = audio.drop > 0.3 ? 0.62 : 0.34;
        }
      } else {
        laserGain = 1.0 + audio.kick * 0.32;
        if (audio.snareFired && audio.energy > 0.45) {
          directorStrobe = 0.22;
        }
      }
    }

    const shouldAutoSwitch = this.enabled || isLaserDirector;
    if (!shouldAutoSwitch) {
      return { nextScene: null, nextPalette: null, laserGain, directorStrobe };
    }

    if (audio.kickFired) {
      this.beatsSinceSwitch += 1;
    }

    const elapsedMs = nowMs - this.lastSwitchMs;
    const targetBeats = isLaserDirector
      ? (this.switchCount % 2 === 0 ? 8 : 16)
      : this.beatsPerScene;
    const minDropBeats = isLaserDirector ? 4 : 8;
    const fallbackMs = isLaserDirector ? 11000 : 26000;

    const hitDrop = audio.dropFired && this.beatsSinceSwitch >= minDropBeats;
    const hitBeatLimit = this.beatsSinceSwitch >= targetBeats;
    const hitTimeFallback = elapsedMs >= fallbackMs && audio.energy > 0.06;

    const pool = isLaserDirector
      ? this.laserIndices
      : Array.from({ length: this.sceneCount }, (_, i) => i);

    const outOfPool = isLaserDirector && !pool.includes(currentSceneIndex);

    if (!outOfPool && !hitDrop && !hitBeatLimit && !hitTimeFallback) {
      return { nextScene: null, nextPalette: null, laserGain, directorStrobe };
    }

    const nextScene = this.pickNextScene(currentSceneIndex, pool);
    this.beatsSinceSwitch = 0;
    this.lastSwitchMs = nowMs;
    this.switchCount += 1;

    let nextPalette = null;
    if (this.autoPalette && (isLaserDirector || this.switchCount % 2 === 0)) {
      nextPalette = (currentPaletteIndex + 1) % this.paletteCount;
    }

    return { nextScene, nextPalette, laserGain, directorStrobe };
  }
}
