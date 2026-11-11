export const PALETTES = [
  {
    id: 'neon-club',
    name: 'Neon Club',
    primary: [0.0, 0.94, 1.0],
    secondary: [1.0, 0.08, 0.48],
    highlight: [1.0, 0.96, 1.0],
    cssAccent: '#00f0ff'
  },
  {
    id: 'laser-classic',
    name: 'Laser Klassik',
    primary: [0.0, 1.0, 0.45],
    secondary: [1.0, 0.08, 0.22],
    highlight: [0.92, 1.0, 0.85],
    cssAccent: '#00ff73'
  },
  {
    id: 'fire-gold',
    name: 'Feuer & Gold',
    primary: [1.0, 0.36, 0.0],
    secondary: [1.0, 0.82, 0.08],
    highlight: [1.0, 0.97, 0.88],
    cssAccent: '#ff5c00'
  },
  {
    id: 'ice-polar',
    name: 'Eis & Polar',
    primary: [0.22, 0.74, 0.98],
    secondary: [0.85, 0.95, 1.0],
    highlight: [1.0, 1.0, 1.0],
    cssAccent: '#38bdf8'
  },
  {
    id: 'uv-acid',
    name: 'UV & Acid',
    primary: [0.58, 0.2, 1.0],
    secondary: [0.64, 0.95, 0.12],
    highlight: [0.95, 0.92, 1.0],
    cssAccent: '#a3e635'
  },
  {
    id: 'mono-laser',
    name: 'Monochrom Laser',
    primary: [1.0, 1.0, 1.0],
    secondary: [0.58, 0.68, 0.82],
    highlight: [1.0, 1.0, 1.0],
    cssAccent: '#f8fafc'
  }
];

export function lerpPalette(target, a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const inv = 1 - k;
  for (let i = 0; i < 3; i += 1) {
    target.primary[i] = a.primary[i] * inv + b.primary[i] * k;
    target.secondary[i] = a.secondary[i] * inv + b.secondary[i] * k;
    target.highlight[i] = a.highlight[i] * inv + b.highlight[i] * k;
  }
}
