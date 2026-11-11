const FFT_SIZE = 1024;
const SPEC_COUNT = 64;
const WAVE_COUNT = 64;
const HISTORY_LEN = 36;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.micStream = null;
    this.micSource = null;

    this.testActive = false;
    this.testTimer = null;
    this.testBus = null;
    this.testMonitorGain = null;
    this.testMonitorEnabled = false;
    this.testStep = 0;
    this.noiseBuffer = null;

    this.mode = 'idle';
    this.selectedDeviceId = '';

    this.autoGain = true;
    this.sensitivity = 1.0;
    this.noiseGate = 0.04;

    this.freqData = new Uint8Array(FFT_SIZE / 2);
    this.timeData = new Float32Array(FFT_SIZE);
    this.spec64 = new Float32Array(SPEC_COUNT);
    this.wave64 = new Float32Array(WAVE_COUNT);

    this.binMapStart = new Int32Array(SPEC_COUNT);
    this.binMapEnd = new Int32Array(SPEC_COUNT);
    this.bandBins = { sub: [1, 2], bass: [2, 5], mid: [5, 48], high: [55, 280] };

    this.bassHistory = new Float32Array(HISTORY_LEN);
    this.bassHistIdx = 0;

    this.agcPeak = 0.25;
    this.noiseFloor = 0.015;
    this.slowEnergy = 0.12;
    this.prevBassRaw = 0;
    this.prevHighRaw = 0;

    this.lastKickMs = 0;
    this.lastSnareMs = 0;
    this.lastDropMs = 0;
    this.beatIntervalMs = 476;
    this.bpm = 126;
    this.beatCount = 0;

    this.features = {
      sub: 0,
      bass: 0,
      mid: 0,
      high: 0,
      energy: 0,
      rms: 0,
      kick: 0,
      snare: 0,
      drop: 0,
      kickFired: false,
      snareFired: false,
      dropFired: false,
      beatCount: 0,
      beatPhase: 0,
      bpm: 126,
      spec64: this.spec64,
      wave64: this.wave64
    };
  }

  async ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.0;
      this.computeFrequencyMaps();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  computeFrequencyMaps() {
    const sampleRate = this.ctx ? this.ctx.sampleRate : 48000;
    const nyquist = sampleRate * 0.5;
    const binHz = nyquist / (FFT_SIZE / 2);

    const hzToBin = (hz) => Math.max(1, Math.min(FFT_SIZE / 2 - 1, Math.round(hz / binHz)));
    this.bandBins = {
      sub: [hzToBin(24), hzToBin(90)],
      bass: [hzToBin(55), hzToBin(175)],
      mid: [hzToBin(240), hzToBin(2200)],
      high: [hzToBin(3200), hzToBin(13500)]
    };

    const minHz = 28;
    const maxHz = Math.min(15000, nyquist * 0.9);
    const logMin = Math.log(minHz);
    const logRange = Math.log(maxHz) - logMin;

    for (let i = 0; i < SPEC_COUNT; i += 1) {
      const f0 = Math.exp(logMin + (i / SPEC_COUNT) * logRange);
      const f1 = Math.exp(logMin + ((i + 1) / SPEC_COUNT) * logRange);
      const b0 = hzToBin(f0);
      const b1 = Math.max(b0, hzToBin(f1));
      this.binMapStart[i] = b0;
      this.binMapEnd[i] = b1;
    }
  }

  async startMicrophone(deviceId = '') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Mikrofon blockiert: Auf iPad/iPhone oder über WLAN muss die Seite per HTTPS (oder localhost) geladen werden.'
      );
    }

    await this.ensureContext();
    this.stopTestBeat();
    this.stopMicStream();

    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1
    };
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });
    } catch (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        throw new Error('Mikrofon-Berechtigung wurde verweigert. Bitte im Browser erlauben.');
      }
      if (err && err.name === 'OverconstrainedError' && deviceId) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        });
      } else {
        throw new Error(`Audio-Eingang konnte nicht gestartet werden (${err?.message || 'Unbekannt'}).`);
      }
    }

    const activeTrack = this.micStream.getAudioTracks()[0];
    if (activeTrack) {
      const settings = activeTrack.getSettings();
      this.selectedDeviceId = settings.deviceId || deviceId || '';
    }

    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.analyser);
    this.mode = 'mic';
  }

  stopMicStream() {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (_) {}
      this.micSource = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
  }

  async listInputDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio-Eingang ${idx + 1}`
      }));
  }

  async startTestBeat() {
    await this.ensureContext();
    this.stopMicStream();
    this.stopTestBeat();

    this.testBus = this.ctx.createGain();
    this.testBus.gain.value = 1.0;
    this.testBus.connect(this.analyser);

    this.testMonitorGain = this.ctx.createGain();
    this.testMonitorGain.gain.value = this.testMonitorEnabled ? 0.28 : 0.0;
    this.testBus.connect(this.testMonitorGain);
    this.testMonitorGain.connect(this.ctx.destination);

    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    this.testStep = 0;
    this.testActive = true;
    this.mode = 'test';

    const stepMs = (60 / 126 / 4) * 1000;
    this.triggerTestStep();
    this.testTimer = window.setInterval(() => this.triggerTestStep(), stepMs);
  }

  setTestMonitor(enabled) {
    this.testMonitorEnabled = Boolean(enabled);
    if (this.testMonitorGain && this.ctx) {
      this.testMonitorGain.gain.setTargetAtTime(
        this.testMonitorEnabled ? 0.28 : 0.0,
        this.ctx.currentTime,
        0.02
      );
    }
  }

  triggerTestStep() {
    if (!this.testActive || !this.ctx || !this.testBus) return;
    const now = this.ctx.currentTime;
    const step = this.testStep % 16;
    const bar = Math.floor(this.testStep / 16) % 8;
    const isDropBar = bar >= 4;

    if (step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(148, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
      gain.gain.setValueAtTime(isDropBar ? 1.0 : 0.78, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this.testBus);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    if (step === 4 || step === 12) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.9;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.testBus);
      src.start(now);
      src.stop(now + 0.15);
    }

    if (step % 2 === 1 || (isDropBar && step % 2 === 0)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(step % 4 === 2 ? 0.32 : 0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(this.testBus);
      src.start(now);
      src.stop(now + 0.05);
    }

    if (isDropBar && (step === 0 || step === 3 || step === 6 || step === 10 || step === 14)) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const notes = [110, 130.81, 146.83, 164.81, 196];
      osc.frequency.setValueAtTime(notes[(step + bar) % notes.length], now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(320, now + 0.16);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.testBus);
      osc.start(now);
      osc.stop(now + 0.18);
    }

    this.testStep += 1;
  }

  stopTestBeat() {
    this.testActive = false;
    if (this.testTimer !== null) {
      window.clearInterval(this.testTimer);
      this.testTimer = null;
    }
    if (this.testBus) {
      try {
        this.testBus.disconnect();
      } catch (_) {}
      this.testBus = null;
    }
    this.testMonitorGain = null;
  }

  bandAverage(startBin, endBin) {
    let sum = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i += 1) {
      sum += this.freqData[i];
      count += 1;
    }
    return count > 0 ? sum / (count * 255) : 0;
  }

  update(nowMs) {
    const f = this.features;
    f.kickFired = false;
    f.snareFired = false;
    f.dropFired = false;

    if (!this.analyser || this.mode === 'idle') {
      f.kick *= 0.85;
      f.snare *= 0.82;
      f.drop *= 0.9;
      return f;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getFloatTimeDomainData(this.timeData);

    let sumSq = 0;
    const waveStep = Math.floor(FFT_SIZE / WAVE_COUNT);
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      const sample = this.timeData[i * waveStep];
      this.wave64[i] = this.wave64[i] * 0.35 + sample * 0.65;
    }
    for (let i = 0; i < FFT_SIZE; i += 4) {
      const s = this.timeData[i];
      sumSq += s * s;
    }
    const rmsRaw = Math.sqrt(sumSq / (FFT_SIZE / 4));

    const subRaw = this.bandAverage(this.bandBins.sub[0], this.bandBins.sub[1]);
    const bassRaw = this.bandAverage(this.bandBins.bass[0], this.bandBins.bass[1]);
    const midRaw = this.bandAverage(this.bandBins.mid[0], this.bandBins.mid[1]);
    const highRaw = this.bandAverage(this.bandBins.high[0], this.bandBins.high[1]);

    const rawEnergy = Math.max(rmsRaw * 1.4, bassRaw * 0.55 + midRaw * 0.3 + highRaw * 0.15);

    if (rawEnergy < this.noiseFloor + 0.04) {
      this.noiseFloor = this.noiseFloor * 0.96 + rawEnergy * 0.04;
    } else {
      this.noiseFloor = this.noiseFloor * 0.998 + rawEnergy * 0.002;
    }
    const effectiveGate = Math.max(this.noiseFloor * 1.15, this.noiseGate);

    if (this.autoGain) {
      if (rawEnergy > this.agcPeak) {
        this.agcPeak = this.agcPeak * 0.72 + rawEnergy * 0.28;
      } else {
        this.agcPeak = Math.max(0.06, this.agcPeak * 0.994);
      }
    } else {
      this.agcPeak = 0.45;
    }

    const scale = this.sensitivity / Math.max(0.05, this.agcPeak - effectiveGate * 0.5);
    const normalize = (v) => Math.max(0, Math.min(1, (v - effectiveGate * 0.45) * scale));

    const subNorm = normalize(subRaw);
    const bassNorm = normalize(bassRaw);
    const midNorm = normalize(midRaw);
    const highNorm = normalize(highRaw);
    const energyNorm = normalize(rawEnergy);

    f.sub = subNorm > f.sub ? f.sub * 0.15 + subNorm * 0.85 : f.sub * 0.78 + subNorm * 0.22;
    f.bass = bassNorm > f.bass ? f.bass * 0.12 + bassNorm * 0.88 : f.bass * 0.76 + bassNorm * 0.24;
    f.mid = midNorm > f.mid ? f.mid * 0.2 + midNorm * 0.8 : f.mid * 0.8 + midNorm * 0.2;
    f.high = highNorm > f.high ? f.high * 0.15 + highNorm * 0.85 : f.high * 0.72 + highNorm * 0.28;
    f.energy = energyNorm > f.energy ? f.energy * 0.18 + energyNorm * 0.82 : f.energy * 0.82 + energyNorm * 0.18;
    f.rms = Math.min(1, rmsRaw * scale * 1.3);

    for (let i = 0; i < SPEC_COUNT; i += 1) {
      const val = normalize(this.bandAverage(this.binMapStart[i], this.binMapEnd[i]));
      const prev = this.spec64[i];
      this.spec64[i] = val > prev ? prev * 0.18 + val * 0.82 : prev * 0.75 + val * 0.25;
    }

    this.bassHistory[this.bassHistIdx] = bassRaw;
    this.bassHistIdx = (this.bassHistIdx + 1) % HISTORY_LEN;

    let histSum = 0;
    for (let i = 0; i < HISTORY_LEN; i += 1) {
      histSum += this.bassHistory[i];
    }
    const bassAvg = histSum / HISTORY_LEN;
    const bassFlux = Math.max(0, bassRaw - this.prevBassRaw);
    const highFlux = Math.max(0, (midRaw * 0.45 + highRaw * 0.55) - this.prevHighRaw);
    this.prevBassRaw = bassRaw * 0.65 + this.prevBassRaw * 0.35;
    this.prevHighRaw = (midRaw * 0.45 + highRaw * 0.55) * 0.65 + this.prevHighRaw * 0.35;

    const kickRatio = bassRaw / Math.max(0.02, bassAvg);
    const kickThreshold = 1.24 / Math.max(0.6, Math.min(1.6, this.sensitivity));
    if (
      rawEnergy > effectiveGate * 1.35 &&
      bassNorm > 0.24 &&
      kickRatio > kickThreshold &&
      bassFlux > 0.014 &&
      nowMs - this.lastKickMs > 145
    ) {
      const delta = nowMs - this.lastKickMs;
      if (delta >= 320 && delta <= 920) {
        this.beatIntervalMs = this.beatIntervalMs * 0.82 + delta * 0.18;
        this.bpm = Math.round(60000 / this.beatIntervalMs);
      }
      this.lastKickMs = nowMs;
      this.beatCount += 1;
      f.kick = 1.0;
      f.kickFired = true;
      f.beatCount = this.beatCount;
      f.bpm = this.bpm;
    } else {
      f.kick *= 0.84;
    }

    if (
      rawEnergy > effectiveGate * 1.3 &&
      highFlux > 0.025 &&
      (midNorm > 0.32 || highNorm > 0.36) &&
      nowMs - this.lastSnareMs > 165
    ) {
      this.lastSnareMs = nowMs;
      f.snare = 1.0;
      f.snareFired = true;
    } else {
      f.snare *= 0.8;
    }

    this.slowEnergy = this.slowEnergy * 0.985 + rawEnergy * 0.015;
    if (
      rawEnergy > effectiveGate * 2.2 &&
      rawEnergy > this.slowEnergy * 1.62 &&
      bassNorm > 0.65 &&
      nowMs - this.lastDropMs > 4200
    ) {
      this.lastDropMs = nowMs;
      f.drop = 1.0;
      f.dropFired = true;
    } else {
      f.drop *= 0.92;
    }

    const elapsedSinceBeat = Math.max(0, nowMs - this.lastKickMs);
    f.beatPhase = Math.min(1, elapsedSinceBeat / Math.max(250, this.beatIntervalMs));

    return f;
  }

  destroy() {
    this.stopTestBeat();
    this.stopMicStream();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
