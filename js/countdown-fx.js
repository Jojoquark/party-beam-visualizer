const PARTICLE_COUNT = 140;

function rgbCss(rgb, alpha = 1) {
  const r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class CountdownFX {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.armed = false;
    this.targetTimeStr = '00:00';
    this.leadSeconds = 30;
    this.celebrationSeconds = 25;
    this.headline = 'HAPPY BIRTHDAY';
    this.subtitle = '';

    this.state = 'idle'; // 'idle' | 'countdown' | 'celebration'
    this.endMs = 0;
    this.totalMs = 30000;
    this.celebrateUntilMs = 0;
    this.celebrateStartMs = 0;
    this.lastSec = -1;
    this.secPulse = 0;
    this.lastFiredTargetMs = 0;

    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      colorKind: 0
    }));
    this.particleCursor = 0;
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  computeNextTargetMs(nowDate) {
    const [hhStr, mmStr] = (this.targetTimeStr || '00:00').split(':');
    const hh = Math.max(0, Math.min(23, Number.parseInt(hhStr, 10) || 0));
    const mm = Math.max(0, Math.min(59, Number.parseInt(mmStr, 10) || 0));
    const target = new Date(nowDate.getTime());
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= nowDate.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  getArmedRemainingMs(nowMs = Date.now()) {
    if (!this.armed) return null;
    const targetMs = this.computeNextTargetMs(new Date(nowMs));
    return Math.max(0, targetMs - nowMs);
  }

  triggerNow(seconds = this.leadSeconds) {
    const nowMs = Date.now();
    this.leadSeconds = Math.max(5, Math.min(120, seconds));
    this.totalMs = this.leadSeconds * 1000;
    this.endMs = nowMs + this.totalMs;
    this.state = 'countdown';
    this.lastSec = -1;
    this.secPulse = 1;
  }

  triggerCelebrationNow() {
    const nowMs = Date.now();
    this.startCelebration(nowMs);
  }

  cancel() {
    this.state = 'idle';
    this.lastSec = -1;
    this.secPulse = 0;
    for (const p of this.particles) {
      p.active = false;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  startCelebration(nowMs) {
    this.state = 'celebration';
    this.celebrateStartMs = nowMs;
    this.celebrateUntilMs = nowMs + this.celebrationSeconds * 1000;
    this.spawnBurst(0, 0, 72, 1.0);
    this.spawnBurst(-0.32, -0.14, 28, 0.8);
    this.spawnBurst(0.32, -0.14, 28, 0.8);
  }

  spawnBurst(normX, normY, count, power) {
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_COUNT;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.08 + Math.random() ** 0.75 * 0.82) * power;
      p.active = true;
      p.x = normX + (Math.random() - 0.5) * 0.04;
      p.y = normY + (Math.random() - 0.5) * 0.04;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0;
      p.maxLife = 0.75 + Math.random() * 1.25;
      p.size = 1.8 + Math.random() * 3.8;
      p.colorKind = Math.floor(Math.random() * 3);
    }
  }

  update(nowWallMs, dtSec, audio) {
    if (this.armed && this.state === 'idle') {
      const targetMs = this.computeNextTargetMs(new Date(nowWallMs));
      const remMs = targetMs - nowWallMs;
      if (
        remMs <= this.leadSeconds * 1000 &&
        remMs > -1500 &&
        this.lastFiredTargetMs !== targetMs
      ) {
        this.lastFiredTargetMs = targetMs;
        this.totalMs = Math.max(1000, this.leadSeconds * 1000);
        this.endMs = targetMs;
        this.state = 'countdown';
        this.lastSec = -1;
      }
    }

    if (this.state === 'countdown') {
      const remMs = this.endMs - nowWallMs;
      if (remMs <= 0) {
        this.startCelebration(nowWallMs);
      } else {
        const sec = Math.ceil(remMs / 1000);
        if (sec !== this.lastSec) {
          this.lastSec = sec;
          this.secPulse = 1.0;
        } else {
          this.secPulse = Math.max(0, this.secPulse - dtSec * 3.2);
        }
      }
    } else if (this.state === 'celebration') {
      if (nowWallMs >= this.celebrateUntilMs) {
        this.cancel();
        return;
      }
      if (audio.kickFired && Math.random() < 0.7) {
        this.spawnBurst((Math.random() - 0.5) * 0.85, (Math.random() - 0.5) * 0.5, 20, 0.72);
      } else if (audio.snareFired && Math.random() < 0.45) {
        this.spawnBurst((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.55, 14, 0.58);
      }
      for (const p of this.particles) {
        if (!p.active) continue;
        p.life += dtSec;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.vx *= 1 - dtSec * 0.95;
        p.vy = p.vy * (1 - dtSec * 0.95) + dtSec * 0.12;
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
      }
    }
  }

  render(nowWallMs, audio, palette, settings) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.state === 'idle' || settings.blackout) {
      return;
    }

    const minDim = Math.min(w, h);
    ctx.save();
    if (settings.maskMode === 2) {
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, minDim * 0.47 * Math.min(1.2, settings.zoom), 0, Math.PI * 2);
      ctx.clip();
    } else if (settings.maskMode === 3) {
      const marginX = w * 0.08;
      const marginY = h * 0.08;
      const rw = w - marginX * 2;
      const rh = h - marginY * 2;
      const rad = Math.min(rw, rh) * 0.08;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(marginX, marginY, rw, rh, rad);
      } else {
        ctx.rect(marginX, marginY, rw, rh);
      }
      ctx.clip();
    }

    ctx.globalAlpha = Math.max(0.1, Math.min(1, settings.brightness));
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(
      (settings.mirrorX ? -1 : 1) * settings.zoom,
      (settings.mirrorY ? -1 : 1) * settings.zoom
    );

    if (this.state === 'countdown') {
      this.renderCountdown(ctx, minDim, nowWallMs, audio, palette);
    } else if (this.state === 'celebration') {
      this.renderCelebration(ctx, w, h, minDim, nowWallMs, audio, palette, settings.zoom);
    }

    ctx.restore();

    if (settings.maskMode === 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const maxR = Math.hypot(w * 0.5, h * 0.5);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, maxR * 0.52, w * 0.5, h * 0.5, maxR * 0.96);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  renderCountdown(ctx, minDim, nowWallMs, audio, palette) {
    const remMs = Math.max(0, this.endMs - nowWallMs);
    const sec = Math.max(1, Math.ceil(remMs / 1000));
    const frac = Math.max(0, Math.min(1, remMs / Math.max(1000, this.totalMs)));
    const isFinalTen = sec <= 10;

    const ringRadius = minDim * (0.28 + audio.kick * 0.025 + this.secPulse * 0.015);
    const ringCol = isFinalTen ? palette.secondary : palette.primary;

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = rgbCss(ringCol, 0.18 + audio.bass * 0.18);
    ctx.lineWidth = Math.max(3, minDim * 0.008);
    ctx.stroke();

    const startAngle = -Math.PI * 0.5;
    const endAngle = startAngle + Math.PI * 2 * frac;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, startAngle, endAngle);
    ctx.strokeStyle = rgbCss(ringCol, 0.95);
    ctx.lineWidth = Math.max(5, minDim * 0.014);
    ctx.lineCap = 'round';
    ctx.shadowColor = rgbCss(ringCol, 0.9);
    ctx.shadowBlur = minDim * (0.03 + audio.kick * 0.04);
    ctx.stroke();

    const tickCount = 12;
    for (let i = 0; i < tickCount; i += 1) {
      const a = (i / tickCount) * Math.PI * 2 - Math.PI * 0.5;
      const r0 = ringRadius * 1.1;
      const r1 = ringRadius * (1.14 + audio.high * 0.04);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.strokeStyle = rgbCss(palette.highlight, 0.35 + audio.kick * 0.45);
      ctx.lineWidth = Math.max(2, minDim * 0.004);
      ctx.stroke();
    }

    const pulseScale = 1 + this.secPulse * (isFinalTen ? 0.14 : 0.07) + audio.kick * 0.05;
    ctx.scale(pulseScale, pulseScale);

    const fontSize = Math.round(minDim * (isFinalTen ? 0.34 : 0.28));
    ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = rgbCss(ringCol, 0.95);
    ctx.shadowBlur = minDim * (0.04 + audio.bass * 0.04);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(sec), 0, fontSize * 0.03);

    ctx.restore();
  }

  renderCelebration(ctx, w, h, minDim, nowWallMs, audio, palette, zoom = 1) {
    const elapsedSec = Math.max(0, (nowWallMs - this.celebrateStartMs) / 1000);
    const enterT = Math.min(1, elapsedSec / 0.45);
    const easeOut = 1 - (1 - enterT) ** 3;
    const remSec = Math.max(0, (this.celebrateUntilMs - nowWallMs) / 1000);
    const exitAlpha = remSec < 1.2 ? Math.max(0, remSec / 1.2) : 1;

    ctx.save();
    ctx.globalAlpha *= exitAlpha;

    for (const p of this.particles) {
      if (!p.active) continue;
      const lifeRatio = 1 - p.life / p.maxLife;
      const px = p.x * minDim;
      const py = p.y * minDim;
      const col = p.colorKind === 0 ? palette.primary : p.colorKind === 1 ? palette.secondary : palette.highlight;
      ctx.beginPath();
      ctx.arc(px, py, p.size * (0.5 + lifeRatio * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(col, lifeRatio * 0.92);
      ctx.fill();
    }

    const scale = (0.86 + 0.14 * easeOut) * (1 + audio.kick * 0.055);
    ctx.scale(scale, scale);

    const mainText = (this.headline || 'HAPPY BIRTHDAY').trim().toUpperCase();
    const subText = (this.subtitle || '').trim();
    const maxWidth = Math.min(w, w / Math.max(0.25, zoom)) * 0.82;

    let fontSize = Math.round(minDim * 0.13);
    ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const measured = ctx.measureText(mainText).width;
    if (measured > maxWidth && measured > 0) {
      fontSize = Math.max(24, Math.floor(fontSize * (maxWidth / measured)));
      ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const yOffset = subText ? -fontSize * 0.42 : 0;
    ctx.shadowColor = rgbCss(palette.primary, 0.95);
    ctx.shadowBlur = minDim * (0.045 + audio.bass * 0.045);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(mainText, 0, yOffset);

    if (subText) {
      const subSize = Math.round(fontSize * 0.56);
      ctx.font = `700 ${subSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.shadowColor = rgbCss(palette.secondary, 0.95);
      ctx.shadowBlur = minDim * 0.03;
      ctx.fillStyle = rgbCss(palette.secondary, 1);
      ctx.fillText(subText, 0, fontSize * 0.62);
    }

    ctx.restore();
  }
}
