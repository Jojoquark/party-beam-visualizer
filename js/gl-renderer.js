import { SCENES } from './scenes.js';

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_HEADER = `
precision highp float;
varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform float uBeatAccum;
uniform float uSub;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uKick;
uniform float uSnare;
uniform float uDrop;
uniform float uDropAccent;
uniform float uStrobe;
uniform float uBrightness;
uniform float uBlackout;
uniform float uMirrorX;
uniform float uMirrorY;
uniform float uZoom;
uniform float uMaskMode;

uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform sampler2D uAudioTex;

float sampleSpec(float x) {
  return texture2D(uAudioTex, vec2(clamp(x, 0.01, 0.99), 0.25)).r;
}

float sampleWave(float x) {
  return texture2D(uAudioTex, vec2(clamp(x, 0.01, 0.99), 0.75)).r * 2.0 - 1.0;
}
`;

const FRAG_FOOTER = `
float computeMask(vec2 uv, float aspect) {
  if (uMaskMode < 0.5) {
    return 1.0;
  }
  vec2 p = vec2(uv.x * aspect, uv.y);
  if (uMaskMode < 1.5) {
    float r = length(uv);
    return smoothstep(1.12, 0.62, r);
  }
  if (uMaskMode < 2.5) {
    float maxR = min(aspect, 1.0) * 0.94;
    return smoothstep(maxR, maxR - 0.04, length(p));
  }
  vec2 q = abs(uv) - vec2(0.84, 0.84);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.1;
  return smoothstep(0.03, -0.02, d);
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 uv = vUv * 2.0 - 1.0;

  if (uMirrorX > 0.5) uv.x = -uv.x;
  if (uMirrorY > 0.5) uv.y = -uv.y;

  uv /= max(0.25, uZoom);

  if (abs(uv.x) > 1.0 || abs(uv.y) > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 col = renderScene(uv, aspect);

  if (uDropAccent > 0.001) {
    col *= 1.0 + uDropAccent * 1.45;
    col += col * uColC * (uDropAccent * 0.55);
  }

  if (uStrobe > 0.001) {
    col += mix(uColC, vec3(1.0), 0.7) * uStrobe;
  }

  float mask = computeMask(uv, aspect);
  float master = uBrightness * (1.0 - uBlackout) * mask;
  col *= master;

  col = col / (1.0 + col * 0.35);
  col = pow(max(col, vec3(0.0)), vec3(0.92));

  gl_FragColor = vec4(col, 1.0);
}
`;

export class GLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl =
      canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
      }) || canvas.getContext('experimental-webgl');

    if (!this.gl) {
      throw new Error('WebGL wird auf diesem Gerät/Browser nicht unterstützt.');
    }

    this.programs = [];
    this.currentSceneIndex = 0;
    this.audioBytes = new Uint8Array(64 * 2);
    this.beatAccum = 0;
    this.qualityScale = 1.25;

    this.initGeometry();
    this.initAudioTexture();
    this.compileScenes();
    this.resize();
  }

  compileShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader-Kompilierungsfehler: ${log}`);
    }
    return shader;
  }

  compileScenes() {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, VERT_SRC);

    for (const scene of SCENES) {
      const fragSrc = `${FRAG_HEADER}\n${scene.frag}\n${FRAG_FOOTER}`;
      const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
      const prog = gl.createProgram();
      gl.attachShader(prog, vert);
      gl.attachShader(prog, frag);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        throw new Error(`Shader-Linkfehler (${scene.id}): ${log}`);
      }
      gl.deleteShader(frag);

      const posLoc = gl.getAttribLocation(prog, 'aPos');
      const uniforms = {
        uResolution: gl.getUniformLocation(prog, 'uResolution'),
        uTime: gl.getUniformLocation(prog, 'uTime'),
        uBeatAccum: gl.getUniformLocation(prog, 'uBeatAccum'),
        uSub: gl.getUniformLocation(prog, 'uSub'),
        uBass: gl.getUniformLocation(prog, 'uBass'),
        uMid: gl.getUniformLocation(prog, 'uMid'),
        uHigh: gl.getUniformLocation(prog, 'uHigh'),
        uEnergy: gl.getUniformLocation(prog, 'uEnergy'),
        uKick: gl.getUniformLocation(prog, 'uKick'),
        uSnare: gl.getUniformLocation(prog, 'uSnare'),
        uDrop: gl.getUniformLocation(prog, 'uDrop'),
        uDropAccent: gl.getUniformLocation(prog, 'uDropAccent'),
        uStrobe: gl.getUniformLocation(prog, 'uStrobe'),
        uBrightness: gl.getUniformLocation(prog, 'uBrightness'),
        uBlackout: gl.getUniformLocation(prog, 'uBlackout'),
        uMirrorX: gl.getUniformLocation(prog, 'uMirrorX'),
        uMirrorY: gl.getUniformLocation(prog, 'uMirrorY'),
        uZoom: gl.getUniformLocation(prog, 'uZoom'),
        uMaskMode: gl.getUniformLocation(prog, 'uMaskMode'),
        uColA: gl.getUniformLocation(prog, 'uColA'),
        uColB: gl.getUniformLocation(prog, 'uColB'),
        uColC: gl.getUniformLocation(prog, 'uColC'),
        uAudioTex: gl.getUniformLocation(prog, 'uAudioTex')
      };

      this.programs.push({ id: scene.id, prog, posLoc, uniforms });
    }

    gl.deleteShader(vert);
  }

  initGeometry() {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    this.quadBuffer = buffer;
  }

  initAudioTexture() {
    const gl = this.gl;
    this.audioTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      64,
      2,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      this.audioBytes
    );
  }

  setQualityScale(scale) {
    this.qualityScale = scale;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.qualityScale);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setSceneIndex(index) {
    this.currentSceneIndex = ((index % this.programs.length) + this.programs.length) % this.programs.length;
  }

  render(timeSec, dtSec, audio, palette, settings) {
    const gl = this.gl;
    const entry = this.programs[this.currentSceneIndex];
    if (!entry) return;

    this.beatAccum += dtSec * (audio.kick * 2.2 + audio.energy * 0.45);

    for (let i = 0; i < 64; i += 1) {
      const s = Math.max(0, Math.min(1, audio.spec64[i]));
      const w = Math.max(-1, Math.min(1, audio.wave64[i]));
      this.audioBytes[i] = Math.round(s * 255);
      this.audioBytes[64 + i] = Math.round((w * 0.5 + 0.5) * 255);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 2, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.audioBytes);

    gl.useProgram(entry.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(entry.posLoc);
    gl.vertexAttribPointer(entry.posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = entry.uniforms;
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, timeSec);
    gl.uniform1f(u.uBeatAccum, this.beatAccum);
    gl.uniform1f(u.uSub, audio.sub);
    gl.uniform1f(u.uBass, audio.bass);
    gl.uniform1f(u.uMid, audio.mid);
    gl.uniform1f(u.uHigh, audio.high);
    gl.uniform1f(u.uEnergy, audio.energy);
    gl.uniform1f(u.uKick, audio.kick);
    gl.uniform1f(u.uSnare, audio.snare);
    gl.uniform1f(u.uDrop, audio.drop);
    gl.uniform1f(u.uDropAccent, settings.dropAccent || 0);
    gl.uniform1f(u.uStrobe, settings.strobeLevel);
    gl.uniform1f(u.uBrightness, settings.brightness);
    gl.uniform1f(u.uBlackout, settings.blackout ? 1.0 : 0.0);
    gl.uniform1f(u.uMirrorX, settings.mirrorX ? 1.0 : 0.0);
    gl.uniform1f(u.uMirrorY, settings.mirrorY ? 1.0 : 0.0);
    gl.uniform1f(u.uZoom, settings.zoom);
    gl.uniform1f(u.uMaskMode, settings.maskMode);

    gl.uniform3fv(u.uColA, palette.primary);
    gl.uniform3fv(u.uColB, palette.secondary);
    gl.uniform3fv(u.uColC, palette.highlight);
    gl.uniform1i(u.uAudioTex, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
