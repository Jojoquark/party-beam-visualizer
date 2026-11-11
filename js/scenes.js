export const SCENES = [
  {
    id: 'laser-fan',
    name: 'Scanner-Fächer',
    category: 'Laser / Nebel',
    isLaser: true,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 col = vec3(0.0);

  vec2 originTop = vec2(sin(uTime * 0.65) * 0.28 * aspect, 0.84);
  vec2 d1 = p - originTop;
  float r1 = length(d1);
  float a1 = atan(d1.y, d1.x + 1e-5) + 1.5708;

  float spread = 0.72 + uBass * 0.48 + uKick * 0.2;
  float sweep = sin(uTime * (0.9 + uEnergy * 0.7)) * 0.42;

  for (int i = 0; i < 9; i++) {
    float fi = float(i) - 4.0;
    float spec = sampleSpec(float(i) / 8.0);
    float targetAngle = fi * (spread / 4.2) + sweep * (0.7 + 0.3 * sin(fi + uTime));
    float diff = abs(a1 - targetAngle);
    float width = 0.008 + spec * 0.022 + uKick * 0.01;
    float beam = exp(-diff / width) * smoothstep(0.0, 0.14, -d1.y);
    float core = exp(-diff / (width * 0.22)) * smoothstep(0.0, 0.1, -d1.y);
    float fade = exp(-r1 * 0.45);
    vec3 beamCol = mix(uColA, uColB, abs(fi) / 4.0);
    col += beamCol * beam * fade * (0.55 + spec * 1.15);
    col += uColC * core * fade * (0.35 + uHigh * 0.7);
  }

  vec2 originBot = vec2(-sin(uTime * 0.5) * 0.32 * aspect, -0.84);
  vec2 d2 = p - originBot;
  float r2 = length(d2);
  float a2 = atan(d2.y, d2.x + 1e-5) - 1.5708;
  float sweep2 = cos(uTime * 1.15) * 0.45;
  for (int j = 0; j < 5; j++) {
    float fj = float(j) - 2.0;
    float spec = sampleSpec(0.35 + float(j) * 0.14);
    float targetA = fj * (0.34 + uMid * 0.35) + sweep2;
    float diff = abs(atan(sin(a2 - targetA), cos(a2 - targetA)));
    float w = 0.009 + uSnare * 0.018 + spec * 0.016;
    float beam = exp(-diff / w) * smoothstep(0.0, 0.15, d2.y);
    col += mix(uColB, uColA, float(j) / 4.0) * beam * exp(-r2 * 0.52) * (0.35 + uMid * 0.9 + uSnare * 0.7);
  }

  vec2 cellId = floor(p * 22.0);
  vec2 cellUv = fract(p * 22.0) - 0.5;
  float dustHash = fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 offset = vec2(fract(dustHash * 17.3) - 0.5, fract(dustHash * 31.7) - 0.5) * 0.5;
  float dotMask = exp(-dot(cellUv - offset, cellUv - offset) * 34.0);
  float shimmer = smoothstep(0.84, 1.0, dustHash) * dotMask * (0.5 + 0.5 * sin(uTime * 11.0 + dustHash * 60.0));
  col += uColC * shimmer * uHigh * 0.95 * smoothstep(0.15, 1.3, r1);
  return col;
}
`
  },
  {
    id: 'laser-tunnel',
    name: 'Laser-Tunnel',
    category: 'Laser / Nebel',
    isLaser: true,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  p += vec2(sin(uTime * 0.8), cos(uTime * 0.63)) * (0.04 + uMid * 0.06);

  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  float rot = uTime * 0.35 + uSub * 0.45;
  float sides = 6.0;
  float slice = 6.2831853 / sides;
  float polyAng = mod(a + rot, slice) - slice * 0.5;
  float polyDist = cos(polyAng) * r;

  float travel = uTime * (1.4 + uEnergy * 2.1) + uBeatAccum * 0.55;
  vec3 col = vec3(0.0);

  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float z = fract(fi * 0.1 - travel * 0.18);
    float depth = mix(2.4, 0.08, z);
    float ringR = 0.75 / depth;
    float thickness = (0.006 + uKick * 0.012) / depth;
    float dRing = abs(polyDist - ringR);
    float glow = exp(-dRing / max(0.0025, thickness));
    float spec = sampleSpec(fi / 10.0);
    float alpha = smoothstep(0.0, 0.25, z) * smoothstep(1.0, 0.88, z);
    vec3 c = mix(uColA, uColB, z);
    col += c * glow * alpha * (0.45 + spec * 1.1 + uKick * 0.45);
  }

  float railDist = abs(sin((a + rot) * (sides * 0.5)));
  float rail = exp(-railDist / (0.014 + uHigh * 0.018)) * smoothstep(0.06, 0.5, r);
  col += mix(uColB, uColC, uHigh) * rail * (0.28 + uBass * 0.75);

  float centerPulse = exp(-r / (0.04 + uKick * 0.09));
  col += uColC * centerPulse * (0.2 + uDrop * 0.8);
  return col;
}
`
  },
  {
    id: 'prism-beams',
    name: 'Radial-Kegel',
    category: 'Laser / Nebel',
    isLaser: true,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  vec3 col = vec3(0.0);

  float rot1 = uTime * (0.55 + uMid * 0.6) + uBeatAccum * 0.22;
  float blades = 12.0;
  float angMod1 = abs(sin((a + rot1) * blades * 0.5));
  float spec = sampleSpec(fract(a / 6.2831853 + 0.5));
  float width1 = 0.015 + uKick * 0.035 + spec * 0.03;
  float beam1 = exp(-angMod1 / width1) * smoothstep(0.06, 0.2, r);
  col += uColA * beam1 * (0.55 + uBass * 1.1) * exp(-r * 0.35);

  float rot2 = -uTime * 0.85 - uBeatAccum * 0.15;
  float angMod2 = abs(sin((a + rot2) * 6.0 * 0.5));
  float width2 = 0.01 + uSnare * 0.025 + uHigh * 0.02;
  float beam2 = exp(-angMod2 / width2) * smoothstep(0.12, 0.35, r);
  col += uColB * beam2 * (0.4 + uHigh * 1.15 + uSnare * 0.6) * exp(-r * 0.25);

  float ringRadius = 0.24 + uKick * 0.12 + spec * 0.08;
  float ring = exp(-abs(r - ringRadius) / (0.008 + uBass * 0.012));
  col += uColC * ring * (0.6 + uEnergy * 0.7);

  float core = exp(-r / (0.035 + uKick * 0.06));
  col += mix(uColA, uColC, 0.6) * core * (0.65 + uKick * 0.6);
  return col;
}
`
  },
  {
    id: 'horizon-matrix',
    name: 'Horizont & Matrix',
    category: 'Laser / Nebel',
    isLaser: true,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 col = vec3(0.0);

  float tilt = sin(uTime * 0.55) * (0.18 + uMid * 0.22);
  float cT = cos(tilt);
  float sT = sin(tilt);
  vec2 pr = vec2(p.x * cT - p.y * sT, p.x * sT + p.y * cT);

  float wave = sampleWave((uv.x * 0.5 + 0.5)) * (0.28 + uBass * 0.42);
  float specX = sampleSpec(abs(uv.x));

  float yOffset1 = sin(uTime * 0.9) * 0.22 + wave;
  float line1 = exp(-abs(pr.y - yOffset1) / (0.009 + uKick * 0.02));
  float core1 = exp(-abs(pr.y - yOffset1) / 0.003);
  col += uColA * line1 * (0.65 + uEnergy * 0.85) + uColC * core1 * 0.65;

  float yOffset2 = -sin(uTime * 0.75) * 0.22 - wave * 0.75;
  float line2 = exp(-abs(pr.y - yOffset2) / (0.008 + uSnare * 0.018));
  col += uColB * line2 * (0.55 + uMid * 0.95);

  float gridX = abs(fract((pr.x + uTime * 0.22) * 3.5) - 0.5);
  float colBeam = exp(-gridX / (0.018 + uHigh * 0.025)) * exp(-abs(pr.y) * 1.4);
  col += mix(uColA, uColB, 0.5 + 0.5 * sin(pr.x * 3.0)) * colBeam * (0.25 + specX * 1.15);

  float nodes = exp(-gridX / 0.03) * exp(-abs(pr.y - yOffset1) / 0.025);
  col += uColC * nodes * (0.4 + uHigh * 1.1);
  return col;
}
`
  },
  {
    id: 'laser-lissajous',
    name: 'Laser-Lissajous',
    category: 'Laser / Wand',
    isLaser: true,
    frag: `
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(1e-5, dot(ba, ba)), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 lissajousPoint(float t, float fx, float fy, float phase, float morph) {
  float rScale = 0.72 + 0.14 * sin(t * 2.0 + morph);
  return vec2(
    sin(t * fx + phase) * rScale,
    sin(t * fy + morph * 0.7) * rScale * 0.85
  );
}

vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float rot = uTime * 0.28 + uBeatAccum * 0.15;
  float cR = cos(rot);
  float sR = sin(rot);
  p = vec2(p.x * cR - p.y * sR, p.x * sR + p.y * cR);

  float fx = 2.0 + floor(mod(uBeatAccum * 0.15, 3.0));
  float fy = fx + 1.0;
  float phase = uTime * (0.95 + uMid * 0.65);
  float morph = uTime * 0.4 + uBass * 0.85;

  float minD = 9.9;
  vec2 prevPt = lissajousPoint(0.0, fx, fy, phase, morph);
  for (int i = 1; i <= 32; i++) {
    float t = (float(i) / 32.0) * 6.2831853;
    vec2 curPt = lissajousPoint(t, fx, fy, phase, morph);
    minD = min(minD, segDist(p, prevPt, curPt));
    prevPt = curPt;
  }

  float width = 0.008 + uKick * 0.014;
  float beam = exp(-minD / width);
  float core = exp(-minD / 0.0028);

  float minD2 = 9.9;
  vec2 prevPt2 = lissajousPoint(0.0, fy, fx + 1.0, -phase * 0.7, morph + 1.2);
  for (int j = 1; j <= 24; j++) {
    float t2 = (float(j) / 24.0) * 6.2831853;
    vec2 curPt2 = lissajousPoint(t2, fy, fx + 1.0, -phase * 0.7, morph + 1.2);
    minD2 = min(minD2, segDist(p, prevPt2, curPt2));
    prevPt2 = curPt2;
  }
  float beam2 = exp(-minD2 / (0.007 + uSnare * 0.014));

  vec3 col = uColA * beam * (0.7 + uBass * 0.9) + uColC * core * 0.75;
  col += uColB * beam2 * (0.4 + uMid * 0.85 + uHigh * 0.5);
  return col;
}
`
  },
  {
    id: 'laser-polygons',
    name: 'Laser-Polygone',
    category: 'Laser / Wand',
    isLaser: true,
    frag: `
float polyDist(vec2 p, float sides, float radius, float rot) {
  float a = atan(p.y, p.x + 1e-5) + rot;
  float slice = 6.2831853 / sides;
  float sector = mod(a, slice) - slice * 0.5;
  return abs(cos(sector) * length(p) - radius);
}

vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 col = vec3(0.0);

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float sides = 3.0 + mod(fi + floor(uBeatAccum * 0.25), 4.0);
    float radius = 0.22 + fi * 0.18 + uKick * 0.08 * (1.0 - fi * 0.18);
    float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float rot = uTime * (0.45 + fi * 0.18) * dir + uBeatAccum * 0.18 * dir;

    float d = polyDist(p, sides, radius, rot);
    float spec = sampleSpec(fi / 4.0);
    float w = 0.007 + uKick * 0.011 + spec * 0.008;
    float line = exp(-d / w);
    float core = exp(-d / 0.0025);
    vec3 c = mix(uColA, uColB, fi / 3.0);
    col += c * line * (0.6 + uEnergy * 0.8 + spec * 0.6) + uColC * core * 0.45;
  }

  float a = atan(p.y, p.x + 1e-5);
  float r = length(p);
  float ray = exp(-abs(sin(a * 4.0 + uTime * 0.7)) / (0.012 + uHigh * 0.02)) * smoothstep(0.18, 0.9, r);
  col += uColB * ray * (0.15 + uSnare * 0.7 + uHigh * 0.45);
  return col;
}
`
  },
  {
    id: 'laser-array',
    name: 'Laser-Punktraster',
    category: 'Laser / Wand',
    isLaser: true,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float tilt = sin(uTime * 0.48) * 0.35 + uMid * 0.25 * cos(uTime * 0.9);
  float cT = cos(tilt);
  float sT = sin(tilt);
  vec2 pr = vec2(p.x * cT - p.y * sT, p.x * sT + p.y * cT);

  vec2 scale = vec2(5.5 + uBass * 1.5, 4.0);
  vec2 g = pr * scale + vec2(uTime * 0.8, sin(pr.x * 2.2 + uTime * 2.2) * (0.4 + uBass * 0.7));
  vec2 cell = fract(g) - 0.5;
  vec2 id = floor(g);

  float hash = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
  float spec = sampleSpec(hash);
  float dotRadius = 0.012 + uKick * 0.02 + spec * 0.018;
  float spot = exp(-dot(cell, cell) / dotRadius);

  float hLine = exp(-abs(cell.y) / (0.022 + uSnare * 0.035));
  float vLine = exp(-abs(cell.x) / (0.022 + uHigh * 0.035));

  vec3 col = mix(uColA, uColB, hash) * spot * (0.7 + uEnergy * 1.1);
  col += uColA * hLine * (0.08 + uSnare * 0.65);
  col += uColB * vLine * (0.06 + uHigh * 0.55);
  col += uColC * spot * spot * 0.55;
  return col * smoothstep(1.65, 0.25, length(p));
}
`
  },
  {
    id: 'shockwaves',
    name: 'Bass-Schockwellen',
    category: 'Wand / Raum',
    isLaser: false,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  vec3 col = vec3(0.0);

  float speed = uTime * (1.2 + uEnergy * 0.9) + uBeatAccum * 0.45;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float ringPos = fract(fi / 7.0 + speed * 0.22) * 1.65;
    float distort = sin(a * (4.0 + mod(fi, 3.0) * 2.0) + uTime * 2.0) * (0.015 + uMid * 0.045);
    float d = abs(r - (ringPos + distort));
    float spec = sampleSpec(fi / 7.0);
    float thickness = 0.009 + uKick * 0.018 + spec * 0.014;
    float ring = exp(-d / thickness) * smoothstep(1.65, 0.35, ringPos);
    vec3 c = mix(uColA, uColB, fi / 6.0);
    col += c * ring * (0.5 + uBass * 0.95 + spec * 0.5);
  }

  float ripple = pow(max(0.0, sin(r * 24.0 - uTime * 8.0)), 6.0) * exp(-r * 1.6);
  col += uColC * ripple * (uDrop * 1.2 + uSnare * 0.65);

  float burst = exp(-r / (0.05 + uKick * 0.14));
  col += mix(uColA, uColC, 0.5) * burst * (0.4 + uKick * 0.9);
  return col;
}
`
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoskop-Prism',
    category: 'Wand / Raum',
    isLaser: false,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5) + uTime * 0.25 + uBeatAccum * 0.12;

  float folds = 8.0;
  float sector = 6.2831853 / folds;
  a = abs(mod(a, sector) - sector * 0.5);

  vec2 k = vec2(cos(a), sin(a)) * r;
  float warp = uTime * 0.9 + uBass * 1.4;

  float pat1 = abs(sin(k.x * 9.0 + sin(k.y * 7.0 + warp)));
  float line1 = exp(-pat1 / (0.032 + uKick * 0.045));

  float pat2 = abs(cos(k.y * 11.0 - cos(k.x * 8.0 - warp * 1.2)));
  float line2 = exp(-pat2 / (0.025 + uHigh * 0.035));

  float spec = sampleSpec(clamp(r * 0.75, 0.0, 1.0));
  vec3 col = uColA * line1 * (0.45 + uBass * 0.95 + spec * 0.6);
  col += uColB * line2 * (0.35 + uMid * 0.9 + uHigh * 0.55);
  col += uColC * (line1 * line2) * (0.5 + uKick * 1.0);

  col *= smoothstep(1.85, 0.25, r);
  return col;
}
`
  },
  {
    id: 'hyperspace',
    name: 'Hyperraum-Vortex',
    category: 'Wand / Raum',
    isLaser: false,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  vec3 col = vec3(0.0);

  float twist = a + r * (0.75 * sin(uTime * 0.45)) + uTime * 0.18;
  float sectors = 24.0;
  float sectorId = floor((twist + 3.14159265) / 6.2831853 * sectors);
  float sectorAng = abs(fract((twist + 3.14159265) / 6.2831853 * sectors) - 0.5);

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float hash = fract(sin(sectorId * 12.9898 + fi * 78.233) * 43758.5453);
    float speed = (0.7 + hash * 0.9) * (1.0 + uEnergy * 1.6 + uDrop * 1.2);
    float z = fract(hash * 3.7 - uTime * speed * 0.55 - uBeatAccum * 0.18);
    float rad = (1.0 - z) * 1.55;
    float streakLen = 0.08 + uBass * 0.16 + uDrop * 0.18;
    float radialMask = smoothstep(rad - streakLen, rad, r) * smoothstep(rad + 0.015, rad, r);
    float angWidth = 0.045 + uKick * 0.045;
    float streak = exp(-sectorAng / angWidth) * radialMask * smoothstep(0.04, 0.22, r);
    float spec = sampleSpec(hash);
    vec3 c = mix(uColA, uColB, hash);
    col += c * streak * (0.45 + spec * 1.1 + uKick * 0.5);
  }

  float vortexRing = exp(-abs(r - (0.14 + uKick * 0.08)) / 0.009);
  col += uColC * vortexRing * (0.35 + uMid * 0.7);
  return col;
}
`
  },
  {
    id: 'spectrum-ring',
    name: 'Frequenz-Geometrie',
    category: 'Wand / Raum',
    isLaser: false,
    frag: `
vec3 renderScene(vec2 uv, float aspect) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  float normAng = abs(a) / 3.14159265;
  float spec = sampleSpec(normAng);
  float wave = sampleWave(fract(a / 6.2831853 + 0.5));
  vec3 col = vec3(0.0);

  float baseR = 0.34 + uKick * 0.06;
  float outerR = baseR + spec * (0.36 + uEnergy * 0.24);
  float barMask = step(baseR - 0.01, r) * exp(-max(0.0, r - outerR) * 32.0);
  float angularBars = smoothstep(0.32, 0.12, abs(fract(a / 6.2831853 * 64.0) - 0.5));
  float edgeGlow = exp(-abs(r - outerR) / 0.014);

  col += mix(uColA, uColB, normAng) * barMask * angularBars * (0.55 + spec * 0.95);
  col += uColC * edgeGlow * (0.45 + uHigh * 0.75);

  float waveR = 0.2 + wave * (0.08 + uMid * 0.11);
  float waveLine = exp(-abs(r - waveR) / (0.007 + uBass * 0.008));
  col += mix(uColB, uColC, 0.45) * waveLine * (0.65 + uEnergy * 0.65);

  float ticks = exp(-abs(fract((a + uTime * 0.4) / 6.2831853 * 16.0) - 0.5) / 0.03)
              * exp(-abs(r - (0.78 + uKick * 0.05)) / 0.014);
  col += uColA * ticks * (0.35 + uSnare * 0.9 + uHigh * 0.6);
  return col;
}
`
  }
];
