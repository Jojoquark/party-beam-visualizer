import { AudioEngine } from './audio-engine.js';
import { PALETTES, lerpPalette } from './palettes.js';
import { SCENES } from './scenes.js';
import { GLRenderer } from './gl-renderer.js';
import { CountdownFX } from './countdown-fx.js';
import { Autopilot } from './autopilot.js';
import { WakeLockManager } from './wake-lock.js';

const STORAGE_KEY = 'beam_party_settings_v1';
const HUD_HIDE_DELAY_MS = 3500;

const DEFAULT_PREFS = {
  sceneIndex: 0,
  paletteIndex: 0,
  autoPalette: true,
  autopilot: true,
  directorMode: 'party',
  beatsPerScene: 32,
  dropFlashes: true,
  safeMode: false,
  autoGain: true,
  sensitivity: 1.0,
  noiseGate: 0.04,
  brightness: 1.0,
  zoom: 1.0,
  maskMode: 0,
  mirrorX: false,
  mirrorY: false,
  qualityScale: 1.25,
  pinHud: false,
  cdArmed: false,
  cdTargetTime: '00:00',
  cdLeadSec: 30,
  cdCelebrateSec: 25,
  cdHeadline: 'HAPPY BIRTHDAY',
  cdSubtitle: ''
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

function formatHms(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

class PartyApp {
  constructor() {
    this.prefs = loadPrefs();
    this.started = false;
    this.hudVisible = false;
    this.hudTimer = null;
    this.toastTimer = null;
    this.strobeHeld = false;
    this.dropFlashLevel = 0;
    this.blackout = false;

    this.activePalette = {
      primary: [...PALETTES[0].primary],
      secondary: [...PALETTES[0].secondary],
      highlight: [...PALETTES[0].highlight]
    };
    this.targetPaletteIdx = this.prefs.paletteIndex;
    this.prevPaletteIdx = this.prefs.paletteIndex;
    this.paletteBlend = 1;

    this.cacheDom();

    this.audio = new AudioEngine();
    this.renderer = new GLRenderer(this.dom.glCanvas);
    this.countdownFX = new CountdownFX(this.dom.fxCanvas);
    this.laserIndices = SCENES.map((s, i) => (s.isLaser ? i : -1)).filter((i) => i >= 0);
    this.autopilot = new Autopilot(SCENES.length, PALETTES.length, this.laserIndices);
    this.wakeLock = new WakeLockManager();

    this.applyPrefsToEngines();
    this.buildDynamicGrids();
    this.syncControlsUI();
    this.bindEvents();
    this.refreshStartDevices();
    this.registerSW();

    this.lastFrameMs = performance.now();
    this.startTimeMs = this.lastFrameMs;
    this.lastMeterUpdateMs = 0;
    this.prevCdState = 'idle';

    requestAnimationFrame((t) => this.loop(t));
  }

  cacheDom() {
    const q = (id) => document.getElementById(id);
    this.dom = {
      stage: q('stage'),
      glCanvas: q('gl-canvas'),
      fxCanvas: q('fx-canvas'),
      toast: q('stage-toast'),
      startScreen: q('start-screen'),
      startDeviceSelect: q('start-device-select'),
      startError: q('start-error'),
      btnStartMic: q('btn-start-mic'),
      btnStartTest: q('btn-start-test'),
      hudDock: q('hud-dock'),
      btnPrev: q('btn-prev'),
      btnScenePill: q('btn-scene-pill'),
      hudBeatDot: q('hud-beat-dot'),
      hudSceneName: q('hud-scene-name'),
      btnNext: q('btn-next'),
      btnPalette: q('btn-palette'),
      hudPaletteDot: q('hud-palette-dot'),
      btnCountdownQuick: q('btn-countdown-quick'),
      hudCdDot: q('hud-cd-dot'),
      btnLaserDirector: q('btn-laser-director'),
      btnStrobe: q('btn-strobe'),
      btnBlackout: q('btn-blackout'),
      btnFullscreen: q('btn-fullscreen'),
      btnDrawer: q('btn-drawer'),
      drawer: q('drawer'),
      segDirector: q('seg-director'),
      directorHint: q('director-hint'),
      sceneGrid: q('scene-grid'),
      paletteGrid: q('palette-grid'),
      optAutopilot: q('opt-autopilot'),
      segBeats: q('seg-beats'),
      optDropFlashes: q('opt-drop-flashes'),
      optSafeMode: q('opt-safe-mode'),
      cdStatusBanner: q('cd-status-banner'),
      cdArmed: q('cd-armed'),
      cdTargetTime: q('cd-target-time'),
      cdLeadSec: q('cd-lead-sec'),
      cdHeadline: q('cd-headline'),
      cdSubtitle: q('cd-subtitle'),
      cdCelebrateSec: q('cd-celebrate-sec'),
      btnCdStartNow: q('btn-cd-start-now'),
      btnCdPreviewHb: q('btn-cd-preview-hb'),
      btnCdCancel: q('btn-cd-cancel'),
      mSub: q('m-sub'),
      mBass: q('m-bass'),
      mMid: q('m-mid'),
      mHigh: q('m-high'),
      audioModeLabel: q('audio-mode-label'),
      bpmLabel: q('bpm-label'),
      btnSrcMic: q('btn-src-mic'),
      btnSrcTest: q('btn-src-test'),
      testMonitorRow: q('test-monitor-row'),
      optTestMonitor: q('opt-test-monitor'),
      drawerDeviceSelect: q('drawer-device-select'),
      optAutogain: q('opt-autogain'),
      optSensitivity: q('opt-sensitivity'),
      valSensitivity: q('val-sensitivity'),
      optNoisegate: q('opt-noisegate'),
      valNoisegate: q('val-noisegate'),
      optBrightness: q('opt-brightness'),
      valBrightness: q('val-brightness'),
      optZoom: q('opt-zoom'),
      valZoom: q('val-zoom'),
      segMask: q('seg-mask'),
      optMirrorX: q('opt-mirror-x'),
      optMirrorY: q('opt-mirror-y'),
      optQuality: q('opt-quality'),
      optPinHud: q('opt-pin-hud'),
      btnBeamerReset: q('btn-beamer-reset')
    };
  }

  applyPrefsToEngines() {
    const p = this.prefs;
    this.renderer.setSceneIndex(p.sceneIndex);
    this.renderer.setQualityScale(p.qualityScale);
    this.countdownFX.resize(this.dom.glCanvas.width, this.dom.glCanvas.height);

    this.autopilot.enabled = p.autopilot;
    this.autopilot.directorMode = p.directorMode === 'laser-strobe' ? 'laser-strobe' : 'party';
    this.autopilot.autoPalette = p.autoPalette;
    this.autopilot.beatsPerScene = p.beatsPerScene;

    if (this.autopilot.directorMode === 'laser-strobe' && !SCENES[this.renderer.currentSceneIndex]?.isLaser) {
      this.renderer.setSceneIndex(this.laserIndices[0] ?? 0);
    }

    this.audio.autoGain = p.autoGain;
    this.audio.sensitivity = p.sensitivity;
    this.audio.noiseGate = p.noiseGate;

    this.countdownFX.armed = p.cdArmed;
    this.countdownFX.targetTimeStr = p.cdTargetTime;
    this.countdownFX.leadSeconds = p.cdLeadSec;
    this.countdownFX.celebrationSeconds = p.cdCelebrateSec;
    this.countdownFX.headline = p.cdHeadline;
    this.countdownFX.subtitle = p.cdSubtitle;

    this.setPalette(p.paletteIndex, true);
  }

  buildDynamicGrids() {
    this.dom.sceneGrid.innerHTML = '';
    SCENES.forEach((scene, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.dataset.sceneIdx = String(idx);
      btn.textContent = scene.name;
      btn.addEventListener('click', () => {
        this.setScene(idx, true);
      });
      this.dom.sceneGrid.appendChild(btn);
    });

    this.dom.paletteGrid.innerHTML = '';
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'chip-btn';
    autoBtn.dataset.paletteMode = 'auto';
    autoBtn.innerHTML = '<span class="chip-dot" style="background: conic-gradient(#00f0ff, #ff006e, #ffd000, #00f0ff)"></span><span>Auto-Mix</span>';
    autoBtn.addEventListener('click', () => {
      this.prefs.autoPalette = true;
      this.autopilot.autoPalette = true;
      savePrefs(this.prefs);
      this.syncControlsUI();
    });
    this.dom.paletteGrid.appendChild(autoBtn);

    PALETTES.forEach((pal, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.dataset.paletteIdx = String(idx);
      btn.innerHTML = `<span class="chip-dot" style="background:${pal.cssAccent}"></span><span>${pal.name}</span>`;
      btn.addEventListener('click', () => {
        this.prefs.autoPalette = false;
        this.autopilot.autoPalette = false;
        this.setPalette(idx, false);
        savePrefs(this.prefs);
        this.syncControlsUI();
      });
      this.dom.paletteGrid.appendChild(btn);
    });
  }

  syncControlsUI() {
    const p = this.prefs;
    const scene = SCENES[this.renderer.currentSceneIndex];
    const pal = PALETTES[this.targetPaletteIdx];

    this.dom.hudSceneName.textContent = scene.name;
    this.dom.hudPaletteDot.style.backgroundColor = pal.cssAccent;
    document.documentElement.style.setProperty('--accent', pal.cssAccent);

    const isLaserMode = p.directorMode === 'laser-strobe';
    this.dom.btnLaserDirector.classList.toggle('is-active', isLaserMode);

    for (const btn of this.dom.segDirector.querySelectorAll('button')) {
      btn.classList.toggle('is-selected', btn.dataset.director === p.directorMode);
    }
    if (isLaserMode) {
      this.dom.directorHint.hidden = false;
      this.dom.directorHint.textContent = p.safeMode
        ? 'Nur Laser-Muster aktiv (Safe Mode sperrt automatische Blitze).'
        : 'Director wechselt selbstständig durch alle Wand- & Raum-Laser inklusive Auto-Strobe.';
    } else {
      this.dom.directorHint.hidden = true;
    }

    this.dom.optAutopilot.checked = p.autopilot;
    this.dom.optDropFlashes.checked = p.dropFlashes;
    this.dom.optSafeMode.checked = p.safeMode;

    this.dom.btnStrobe.classList.toggle('is-locked', p.safeMode);
    this.dom.btnStrobe.disabled = p.safeMode;
    this.dom.btnStrobe.title = p.safeMode ? 'Im Safe Mode deaktiviert' : 'Strobe halten (S)';

    this.dom.btnBlackout.classList.toggle('is-blackout', this.blackout);

    for (const btn of this.dom.segBeats.querySelectorAll('button')) {
      btn.classList.toggle('is-selected', Number(btn.dataset.beats) === p.beatsPerScene);
    }

    for (const btn of this.dom.sceneGrid.querySelectorAll('.chip-btn')) {
      const idx = Number(btn.dataset.sceneIdx);
      btn.classList.toggle('is-selected', idx === this.renderer.currentSceneIndex);
      btn.classList.toggle('is-dimmed', isLaserMode && !SCENES[idx]?.isLaser);
    }

    for (const btn of this.dom.paletteGrid.querySelectorAll('.chip-btn')) {
      if (btn.dataset.paletteMode === 'auto') {
        btn.classList.toggle('is-selected', p.autoPalette);
      } else {
        btn.classList.toggle('is-selected', !p.autoPalette && Number(btn.dataset.paletteIdx) === this.targetPaletteIdx);
      }
    }

    this.dom.cdArmed.checked = p.cdArmed;
    this.dom.cdTargetTime.value = p.cdTargetTime;
    this.dom.cdLeadSec.value = String(p.cdLeadSec);
    this.dom.cdCelebrateSec.value = String(p.cdCelebrateSec);
    this.dom.cdHeadline.value = p.cdHeadline;
    this.dom.cdSubtitle.value = p.cdSubtitle;
    this.dom.btnCdStartNow.textContent = `${p.cdLeadSec}s Countdown jetzt starten`;
    this.dom.hudCdDot.hidden = !p.cdArmed && this.countdownFX.state === 'idle';

    this.dom.optAutogain.checked = p.autoGain;
    this.dom.optSensitivity.value = String(p.sensitivity);
    this.dom.valSensitivity.textContent = `${p.sensitivity.toFixed(1)}x`;
    this.dom.optNoisegate.value = String(p.noiseGate);
    this.dom.valNoisegate.textContent = `${Math.round(p.noiseGate * 100)}%`;

    this.dom.optBrightness.value = String(p.brightness);
    this.dom.valBrightness.textContent = `${Math.round(p.brightness * 100)}%`;
    this.dom.optZoom.value = String(p.zoom);
    this.dom.valZoom.textContent = `${Math.round(p.zoom * 100)}%`;

    for (const btn of this.dom.segMask.querySelectorAll('button')) {
      btn.classList.toggle('is-selected', Number(btn.dataset.mask) === p.maskMode);
    }

    this.dom.optMirrorX.checked = p.mirrorX;
    this.dom.optMirrorY.checked = p.mirrorY;
    this.dom.optQuality.value = String(p.qualityScale);
    this.dom.optPinHud.checked = p.pinHud;

    const isTest = this.audio.mode === 'test';
    this.dom.testMonitorRow.hidden = !isTest;
    this.dom.optTestMonitor.checked = this.audio.testMonitorEnabled;
    this.dom.btnSrcTest.classList.toggle('is-active', isTest);
    this.dom.btnSrcMic.classList.toggle('is-active', this.audio.mode === 'mic');
    this.dom.audioModeLabel.textContent =
      isTest ? 'Quelle: Test-Beat (126 BPM)' : this.audio.mode === 'mic' ? 'Quelle: Mikrofon / Line-In' : 'Quelle: Bereit';

    const canFs = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    this.dom.btnFullscreen.hidden = !canFs;
  }

  setDirectorMode(mode) {
    const next = mode === 'laser-strobe' ? 'laser-strobe' : 'party';
    this.prefs.directorMode = next;
    this.autopilot.directorMode = next;
    this.autopilot.resetTimer(performance.now());
    if (next === 'laser-strobe') {
      if (!SCENES[this.renderer.currentSceneIndex]?.isLaser) {
        this.renderer.setSceneIndex(this.laserIndices[0] ?? 0);
        this.prefs.sceneIndex = this.renderer.currentSceneIndex;
      }
      this.showToast('Director: Nur Laser & Strobe');
    } else {
      this.showToast('Director: Party-Mix');
    }
    savePrefs(this.prefs);
    this.syncControlsUI();
  }

  stepScene(delta) {
    if (this.prefs.directorMode === 'laser-strobe' && this.laserIndices.length > 0) {
      const curPos = this.laserIndices.indexOf(this.renderer.currentSceneIndex);
      const basePos = curPos === -1 ? 0 : curPos;
      const nextPos = ((basePos + delta) % this.laserIndices.length + this.laserIndices.length) % this.laserIndices.length;
      this.setScene(this.laserIndices[nextPos], true);
      return;
    }
    this.setScene(this.renderer.currentSceneIndex + delta, true);
  }

  setScene(idx, fromUser = false) {
    this.renderer.setSceneIndex(idx);
    this.prefs.sceneIndex = this.renderer.currentSceneIndex;
    if (fromUser) {
      if (this.prefs.directorMode === 'laser-strobe' && !SCENES[this.renderer.currentSceneIndex]?.isLaser) {
        this.prefs.directorMode = 'party';
        this.autopilot.directorMode = 'party';
      }
      this.autopilot.resetTimer(performance.now());
      savePrefs(this.prefs);
      this.showToast(SCENES[this.renderer.currentSceneIndex].name);
    }
    this.syncControlsUI();
  }

  setPalette(idx, instant = false) {
    const safeIdx = ((idx % PALETTES.length) + PALETTES.length) % PALETTES.length;
    this.prevPaletteIdx = this.targetPaletteIdx;
    this.targetPaletteIdx = safeIdx;
    this.prefs.paletteIndex = safeIdx;
    if (instant) {
      this.paletteBlend = 1;
      lerpPalette(this.activePalette, PALETTES[safeIdx], PALETTES[safeIdx], 1);
    } else {
      this.paletteBlend = 0;
    }
    this.syncControlsUI();
  }

  showToast(text) {
    this.dom.toast.textContent = text;
    this.dom.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.dom.toast.classList.remove('is-visible');
    }, 1350);
  }

  showHud() {
    if (!this.started) return;
    this.hudVisible = true;
    this.dom.hudDock.classList.remove('is-hidden');
    this.scheduleHudHide();
  }

  hideHud() {
    if (!this.dom.drawer.hidden || this.prefs.pinHud || this.blackout) return;
    this.hudVisible = false;
    this.dom.hudDock.classList.add('is-hidden');
    window.clearTimeout(this.hudTimer);
  }

  scheduleHudHide() {
    window.clearTimeout(this.hudTimer);
    if (!this.dom.drawer.hidden || this.prefs.pinHud || this.blackout) return;
    this.hudTimer = window.setTimeout(() => {
      this.hideHud();
    }, HUD_HIDE_DELAY_MS);
  }

  toggleDrawer(tabName = null) {
    const isClosed = this.dom.drawer.hidden;
    if (isClosed) {
      this.dom.drawer.hidden = false;
      this.dom.drawer.classList.remove('is-closing');
      this.dom.btnDrawer.classList.add('is-open');
      if (tabName) this.switchTab(tabName);
      this.showHud();
    } else if (tabName) {
      const currentTab = this.dom.drawer.querySelector('.tab-btn.is-active')?.dataset.tab;
      if (currentTab !== tabName) {
        this.switchTab(tabName);
        this.showHud();
      } else {
        this.closeDrawer();
      }
    } else {
      this.closeDrawer();
    }
  }

  closeDrawer() {
    if (this.dom.drawer.hidden) return;
    this.dom.drawer.hidden = true;
    this.dom.btnDrawer.classList.remove('is-open');
    this.scheduleHudHide();
  }

  switchTab(tabName) {
    for (const btn of this.dom.drawer.querySelectorAll('.tab-btn')) {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    for (const panel of this.dom.drawer.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('is-active', panel.dataset.panel === tabName);
    }
  }

  async refreshStartDevices() {
    const devices = await this.audio.listInputDevices();
    const populate = (selectEl) => {
      const prev = selectEl.value;
      selectEl.innerHTML = '<option value="">Standard-Mikrofon / Line-In</option>';
      for (const dev of devices) {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label;
        selectEl.appendChild(opt);
      }
      if (this.audio.selectedDeviceId) {
        selectEl.value = this.audio.selectedDeviceId;
      } else if (prev) {
        selectEl.value = prev;
      }
    };
    populate(this.dom.startDeviceSelect);
    populate(this.dom.drawerDeviceSelect);
  }

  async startWithMic(deviceId = '') {
    this.dom.startError.hidden = true;
    try {
      await this.audio.startMicrophone(deviceId);
      await this.refreshStartDevices();
      this.enterPartyView();
    } catch (err) {
      this.dom.startError.textContent = err.message;
      this.dom.startError.hidden = false;
      this.showToast(err.message);
    }
  }

  async startWithTestBeat() {
    this.dom.startError.hidden = true;
    await this.audio.startTestBeat();
    this.enterPartyView();
  }

  enterPartyView() {
    this.started = true;
    this.dom.startScreen.hidden = true;
    this.wakeLock.request();
    this.autopilot.resetTimer(performance.now());
    this.syncControlsUI();
    this.showHud();
  }

  toggleFullscreen() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsEl) {
      const target = document.documentElement;
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.countdownFX.resize(this.dom.glCanvas.width, this.dom.glCanvas.height);
    });

    this.dom.btnStartMic.addEventListener('click', () => {
      this.startWithMic(this.dom.startDeviceSelect.value);
    });
    this.dom.btnStartTest.addEventListener('click', () => {
      this.startWithTestBeat();
    });

    let pointerStart = null;
    this.dom.glCanvas.addEventListener('pointerdown', (e) => {
      pointerStart = { x: e.clientX, y: e.clientY, time: performance.now() };
    });

    this.dom.glCanvas.addEventListener('pointerup', (e) => {
      if (!this.started || !pointerStart) return;
      const dx = e.clientX - pointerStart.x;
      const dy = e.clientY - pointerStart.y;
      const dt = performance.now() - pointerStart.time;
      pointerStart = null;

      if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 650) {
        this.stepScene(dx < 0 ? 1 : -1);
        return;
      }

      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
        if (!this.dom.drawer.hidden) {
          this.closeDrawer();
        } else if (this.hudVisible && !this.prefs.pinHud && !this.blackout) {
          this.hideHud();
        } else {
          this.showHud();
        }
      }
    });

    this.dom.hudDock.addEventListener('pointerdown', () => this.scheduleHudHide());
    this.dom.drawer.addEventListener('pointerdown', () => this.scheduleHudHide());

    this.dom.btnPrev.addEventListener('click', () => {
      this.stepScene(-1);
      this.scheduleHudHide();
    });
    this.dom.btnNext.addEventListener('click', () => {
      this.stepScene(1);
      this.scheduleHudHide();
    });
    this.dom.btnScenePill.addEventListener('click', () => this.toggleDrawer('scenes'));
    this.dom.btnDrawer.addEventListener('click', () => this.toggleDrawer());
    this.dom.btnCountdownQuick.addEventListener('click', () => this.toggleDrawer('countdown'));
    this.dom.btnLaserDirector.addEventListener('click', () => {
      const next = this.prefs.directorMode === 'laser-strobe' ? 'party' : 'laser-strobe';
      this.setDirectorMode(next);
      this.scheduleHudHide();
    });

    this.dom.btnPalette.addEventListener('click', () => {
      this.setPalette(this.targetPaletteIdx + 1, false);
      this.showToast(`Palette: ${PALETTES[this.targetPaletteIdx].name}`);
      savePrefs(this.prefs);
      this.scheduleHudHide();
    });

    const releaseStrobe = () => {
      this.strobeHeld = false;
      this.dom.btnStrobe.classList.remove('is-active');
    };
    this.dom.btnStrobe.addEventListener('pointerdown', (e) => {
      if (this.prefs.safeMode) return;
      e.preventDefault();
      this.strobeHeld = true;
      this.dom.btnStrobe.classList.add('is-active');
    });
    this.dom.btnStrobe.addEventListener('pointerup', releaseStrobe);
    this.dom.btnStrobe.addEventListener('pointercancel', releaseStrobe);
    this.dom.btnStrobe.addEventListener('pointerleave', releaseStrobe);

    this.dom.btnBlackout.addEventListener('click', () => {
      this.blackout = !this.blackout;
      this.syncControlsUI();
      if (this.blackout) {
        this.showHud();
      } else {
        this.scheduleHudHide();
      }
    });

    this.dom.btnFullscreen.addEventListener('click', () => {
      this.toggleFullscreen();
      this.scheduleHudHide();
    });

    for (const tabBtn of this.dom.drawer.querySelectorAll('.tab-btn')) {
      tabBtn.addEventListener('click', () => this.switchTab(tabBtn.dataset.tab));
    }

    for (const b of this.dom.segDirector.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.setDirectorMode(b.dataset.director);
      });
    }

    this.dom.optAutopilot.addEventListener('change', (e) => {
      this.prefs.autopilot = e.target.checked;
      this.autopilot.enabled = e.target.checked;
      this.autopilot.resetTimer(performance.now());
      savePrefs(this.prefs);
    });

    for (const b of this.dom.segBeats.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        const val = Number(b.dataset.beats);
        this.prefs.beatsPerScene = val;
        this.autopilot.beatsPerScene = val;
        savePrefs(this.prefs);
        this.syncControlsUI();
      });
    }

    this.dom.optDropFlashes.addEventListener('change', (e) => {
      this.prefs.dropFlashes = e.target.checked;
      savePrefs(this.prefs);
    });

    this.dom.optSafeMode.addEventListener('change', (e) => {
      this.prefs.safeMode = e.target.checked;
      if (this.prefs.safeMode) {
        this.strobeHeld = false;
        this.dropFlashLevel = 0;
      }
      savePrefs(this.prefs);
      this.syncControlsUI();
    });

    // Countdown Controls
    this.dom.cdArmed.addEventListener('change', (e) => {
      this.prefs.cdArmed = e.target.checked;
      this.countdownFX.armed = e.target.checked;
      this.countdownFX.lastFiredTargetMs = 0;
      savePrefs(this.prefs);
      this.syncControlsUI();
    });

    this.dom.cdTargetTime.addEventListener('change', (e) => {
      this.prefs.cdTargetTime = e.target.value || '00:00';
      this.countdownFX.targetTimeStr = this.prefs.cdTargetTime;
      this.countdownFX.lastFiredTargetMs = 0;
      savePrefs(this.prefs);
    });

    this.dom.cdLeadSec.addEventListener('change', (e) => {
      this.prefs.cdLeadSec = Number(e.target.value) || 30;
      this.countdownFX.leadSeconds = this.prefs.cdLeadSec;
      savePrefs(this.prefs);
      this.syncControlsUI();
    });

    this.dom.cdCelebrateSec.addEventListener('change', (e) => {
      this.prefs.cdCelebrateSec = Number(e.target.value) || 25;
      this.countdownFX.celebrationSeconds = this.prefs.cdCelebrateSec;
      savePrefs(this.prefs);
    });

    this.dom.cdHeadline.addEventListener('input', (e) => {
      this.prefs.cdHeadline = e.target.value;
      this.countdownFX.headline = e.target.value || 'HAPPY BIRTHDAY';
      savePrefs(this.prefs);
    });

    this.dom.cdSubtitle.addEventListener('input', (e) => {
      this.prefs.cdSubtitle = e.target.value;
      this.countdownFX.subtitle = e.target.value;
      savePrefs(this.prefs);
    });

    this.dom.btnCdStartNow.addEventListener('click', () => {
      this.countdownFX.triggerNow(this.prefs.cdLeadSec);
      this.closeDrawer();
      this.hideHud();
      this.syncControlsUI();
    });

    this.dom.btnCdPreviewHb.addEventListener('click', () => {
      this.setScene(2, false);
      this.countdownFX.triggerCelebrationNow();
      this.closeDrawer();
      this.hideHud();
      this.syncControlsUI();
    });

    this.dom.btnCdCancel.addEventListener('click', () => {
      this.countdownFX.cancel();
      this.syncControlsUI();
    });

    // Audio Controls
    this.dom.btnSrcMic.addEventListener('click', () => {
      this.startWithMic(this.dom.drawerDeviceSelect.value);
    });

    this.dom.btnSrcTest.addEventListener('click', () => {
      this.audio.startTestBeat().then(() => this.syncControlsUI());
    });

    this.dom.optTestMonitor.addEventListener('change', (e) => {
      this.audio.setTestMonitor(e.target.checked);
    });

    this.dom.drawerDeviceSelect.addEventListener('change', (e) => {
      if (this.audio.mode === 'mic') {
        this.startWithMic(e.target.value);
      }
    });

    this.dom.optAutogain.addEventListener('change', (e) => {
      this.prefs.autoGain = e.target.checked;
      this.audio.autoGain = e.target.checked;
      savePrefs(this.prefs);
    });

    this.dom.optSensitivity.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.prefs.sensitivity = val;
      this.audio.sensitivity = val;
      this.dom.valSensitivity.textContent = `${val.toFixed(1)}x`;
      savePrefs(this.prefs);
    });

    this.dom.optNoisegate.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.prefs.noiseGate = val;
      this.audio.noiseGate = val;
      this.dom.valNoisegate.textContent = `${Math.round(val * 100)}%`;
      savePrefs(this.prefs);
    });

    // Beamer Controls
    this.dom.optBrightness.addEventListener('input', (e) => {
      this.prefs.brightness = Number(e.target.value);
      this.dom.valBrightness.textContent = `${Math.round(this.prefs.brightness * 100)}%`;
      savePrefs(this.prefs);
    });

    this.dom.optZoom.addEventListener('input', (e) => {
      this.prefs.zoom = Number(e.target.value);
      this.dom.valZoom.textContent = `${Math.round(this.prefs.zoom * 100)}%`;
      savePrefs(this.prefs);
    });

    for (const b of this.dom.segMask.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.prefs.maskMode = Number(b.dataset.mask);
        savePrefs(this.prefs);
        this.syncControlsUI();
      });
    }

    this.dom.optMirrorX.addEventListener('change', (e) => {
      this.prefs.mirrorX = e.target.checked;
      savePrefs(this.prefs);
    });

    this.dom.optMirrorY.addEventListener('change', (e) => {
      this.prefs.mirrorY = e.target.checked;
      savePrefs(this.prefs);
    });

    this.dom.optQuality.addEventListener('change', (e) => {
      this.prefs.qualityScale = Number(e.target.value);
      this.renderer.setQualityScale(this.prefs.qualityScale);
      this.countdownFX.resize(this.dom.glCanvas.width, this.dom.glCanvas.height);
      savePrefs(this.prefs);
    });

    this.dom.optPinHud.addEventListener('change', (e) => {
      this.prefs.pinHud = e.target.checked;
      savePrefs(this.prefs);
      if (this.prefs.pinHud) {
        this.showHud();
      } else {
        this.scheduleHudHide();
      }
    });

    this.dom.btnBeamerReset.addEventListener('click', () => {
      this.prefs.brightness = 1.0;
      this.prefs.zoom = 1.0;
      this.prefs.maskMode = 0;
      this.prefs.mirrorX = false;
      this.prefs.mirrorY = false;
      this.prefs.qualityScale = 1.25;
      this.renderer.setQualityScale(1.25);
      this.countdownFX.resize(this.dom.glCanvas.width, this.dom.glCanvas.height);
      savePrefs(this.prefs);
      this.syncControlsUI();
      this.showToast('Beamer-Werte zurückgesetzt');
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.started) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.blackout = !this.blackout;
        this.syncControlsUI();
        if (this.blackout) this.showHud();
        else this.scheduleHudHide();
      } else if (e.code === 'ArrowRight') {
        this.stepScene(1);
      } else if (e.code === 'ArrowLeft') {
        this.stepScene(-1);
      } else if (e.key === 'l' || e.key === 'L') {
        this.setDirectorMode(this.prefs.directorMode === 'laser-strobe' ? 'party' : 'laser-strobe');
      } else if (e.key === 'c' || e.key === 'C') {
        this.setPalette(this.targetPaletteIdx + 1, false);
        this.showToast(`Palette: ${PALETTES[this.targetPaletteIdx].name}`);
      } else if (e.key === 'a' || e.key === 'A') {
        this.prefs.autopilot = !this.prefs.autopilot;
        this.autopilot.enabled = this.prefs.autopilot;
        savePrefs(this.prefs);
        this.syncControlsUI();
        this.showToast(this.prefs.autopilot ? 'Autopilot: An' : 'Autopilot: Aus');
      } else if ((e.key === 's' || e.key === 'S') && !this.prefs.safeMode) {
        this.strobeHeld = true;
        this.dom.btnStrobe.classList.add('is-active');
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      } else if (e.key === 'h' || e.key === 'H') {
        if (this.hudVisible) this.hideHud();
        else this.showHud();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 's' || e.key === 'S') {
        this.strobeHeld = false;
        this.dom.btnStrobe.classList.remove('is-active');
      }
    });
  }

  updateCountdownUI(nowWallMs) {
    const state = this.countdownFX.state;
    const banner = this.dom.cdStatusBanner;
    const cancelBtn = this.dom.btnCdCancel;

    if (state !== this.prevCdState) {
      if (state === 'countdown') {
        this.closeDrawer();
        this.hideHud();
        this.dom.toast.classList.remove('is-visible');
      } else if (state === 'celebration') {
        this.setScene(2, false);
        this.closeDrawer();
        this.hideHud();
        this.dom.toast.classList.remove('is-visible');
      }
      this.prevCdState = state;
      this.syncControlsUI();
    }

    if (state === 'countdown') {
      const rem = Math.max(0, Math.ceil((this.countdownFX.endMs - nowWallMs) / 1000));
      banner.textContent = `Countdown aktiv: noch ${rem}s`;
      banner.className = 'status-banner is-live';
      cancelBtn.hidden = false;
    } else if (state === 'celebration') {
      const rem = Math.max(0, Math.ceil((this.countdownFX.celebrateUntilMs - nowWallMs) / 1000));
      banner.textContent = `Text-Anzeige aktiv (noch ${rem}s)`;
      banner.className = 'status-banner is-live';
      cancelBtn.hidden = false;
    } else if (this.countdownFX.armed) {
      const remMs = this.countdownFX.getArmedRemainingMs(nowWallMs);
      banner.textContent = `Scharfgestellt für ${this.prefs.cdTargetTime} Uhr (in ${formatHms(remMs)})`;
      banner.className = 'status-banner is-armed';
      cancelBtn.hidden = true;
    } else {
      banner.textContent = 'Countdown inaktiv';
      banner.className = 'status-banner';
      cancelBtn.hidden = true;
    }
  }

  loop(nowMs) {
    const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    const elapsedSec = (nowMs - this.startTimeMs) / 1000;
    const nowWallMs = Date.now();

    const audio = this.audio.update(nowMs);

    if (this.paletteBlend < 1) {
      this.paletteBlend = Math.min(1, this.paletteBlend + dtSec * 0.9);
      lerpPalette(
        this.activePalette,
        PALETTES[this.prevPaletteIdx],
        PALETTES[this.targetPaletteIdx],
        this.paletteBlend
      );
    }

    this.countdownFX.update(nowWallMs, dtSec, audio);

    const autoResult = this.autopilot.update(
      nowMs,
      audio,
      this.renderer.currentSceneIndex,
      this.targetPaletteIdx,
      this.countdownFX.state,
      this.prefs.safeMode
    );
    if (autoResult.nextScene !== null) {
      this.setScene(autoResult.nextScene, false);
    }
    if (autoResult.nextPalette !== null && autoResult.nextPalette !== this.targetPaletteIdx) {
      this.setPalette(autoResult.nextPalette, false);
    }

    if (this.prefs.safeMode) {
      this.dropFlashLevel = 0;
    } else {
      if (audio.dropFired && this.prefs.dropFlashes) {
        this.dropFlashLevel = 0.42;
      } else {
        this.dropFlashLevel *= 0.82;
      }
    }

    const manualStrobe =
      !this.prefs.safeMode && this.strobeHeld && Math.sin(nowMs * 0.062) > 0.22 ? 0.85 : 0.0;
    const totalStrobe = Math.max(manualStrobe, autoResult.directorStrobe || 0);

    this.renderer.render(elapsedSec, dtSec, audio, this.activePalette, {
      dropAccent: this.dropFlashLevel,
      laserGain: autoResult.laserGain,
      strobeLevel: totalStrobe,
      brightness: this.prefs.brightness,
      blackout: this.blackout,
      mirrorX: this.prefs.mirrorX,
      mirrorY: this.prefs.mirrorY,
      zoom: this.prefs.zoom,
      maskMode: this.prefs.maskMode
    });

    this.countdownFX.render(nowWallMs, audio, this.activePalette, {
      brightness: this.prefs.brightness,
      blackout: this.blackout,
      mirrorX: this.prefs.mirrorX,
      mirrorY: this.prefs.mirrorY,
      zoom: this.prefs.zoom,
      maskMode: this.prefs.maskMode
    });

    if (this.hudVisible) {
      this.dom.hudBeatDot.classList.toggle('is-kick', audio.kick > 0.45);
    }

    if (nowMs - this.lastMeterUpdateMs > 55) {
      this.lastMeterUpdateMs = nowMs;
      if (!this.dom.drawer.hidden) {
        this.dom.mSub.style.setProperty('--lvl', Math.max(0.05, audio.sub).toFixed(2));
        this.dom.mBass.style.setProperty('--lvl', Math.max(0.05, audio.bass).toFixed(2));
        this.dom.mMid.style.setProperty('--lvl', Math.max(0.05, audio.mid).toFixed(2));
        this.dom.mHigh.style.setProperty('--lvl', Math.max(0.05, audio.high).toFixed(2));
        this.dom.bpmLabel.textContent = `${audio.bpm} BPM`;
      }
      this.updateCountdownUI(nowWallMs);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PartyApp();
});
