/**
 * Generador procedimental de sprites en Pixel-Art con tramado Bayer 4x4
 * inspirado en la estética biomecánica 16-bit de Axiom Verge.
 */

const BAYER_4X4: readonly (readonly number[])[] = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function parseHexColor(hex: string): RgbColor {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) {
    return { r: 120, g: 200, b: 255 };
  }
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) {
    return { r: 120, g: 200, b: 255 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function scaleColor(c: RgbColor, factor: number): RgbColor {
  return {
    r: Math.max(0, Math.min(255, Math.round(c.r * factor))),
    g: Math.max(0, Math.min(255, Math.round(c.g * factor))),
    b: Math.max(0, Math.min(255, Math.round(c.b * factor))),
  };
}

function rgbToCss(c: RgbColor): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

function hash2D(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

/**
 * Crea un canvas offscreen de baja resolución (pixel-art) para un planeta biomecánico.
 * Incluye iluminación esférica con tramado Bayer 4x4, estrías horizontales orgánicas
 * y nodos luminosos estilo Axiom Verge.
 */
export function createPixelPlanetSprite(
  id: string,
  baseHex: string,
  accentHex: string,
  gridSize = 28,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const base = parseHexColor(baseHex);
  const accent = parseHexColor(accentHex);

  // Paleta escalonada de 5 tonos estilo 16-bits
  const deepShadow: RgbColor = {
    r: Math.round(base.r * 0.16),
    g: Math.round(base.g * 0.12),
    b: Math.round(base.b * 0.24),
  };
  const midShadow = scaleColor(base, 0.45);
  const midTone = scaleColor(base, 0.82);
  const brightTone = scaleColor(base, 1.15);
  const highlightTone = accent;

  let seed = 0;
  for (let i = 0; i < id.length; i += 1) {
    seed = (seed * 31 + id.charCodeAt(i)) % 10000;
  }

  const center = (gridSize - 1) / 2;
  const maxR = gridSize / 2 - 1;

  for (let py = 0; py < gridSize; py += 1) {
    for (let px = 0; px < gridSize; px += 1) {
      const dx = (px - center) / maxR;
      const dy = (py - center) / maxR;
      const distSq = dx * dx + dy * dy;

      if (distSq > 1.0) {
        continue;
      }

      const dist = Math.sqrt(distSq);
      const dz = Math.sqrt(Math.max(0, 1 - distSq));

      // Borde exterior oscuro de 1 píxel (contorno pixel-art)
      if (dist > 0.9) {
        ctx.fillStyle = rgbToCss(deepShadow);
        ctx.fillRect(px, py, 1, 1);
        continue;
      }

      // Luz direccional desde arriba-izquierda (-0.45, -0.5, 0.74)
      const light = Math.max(0, dx * -0.45 + dy * -0.5 + dz * 0.74);

      // Estrías biomecánicas horizontales y celulares
      const ribBand = Math.sin(py * 1.35 + Math.cos(px * 0.6 + seed) * 1.4) * 0.14;
      const organicNoise = (hash2D(px, py, seed) - 0.5) * 0.12;
      const bayerThreshold = BAYER_4X4[py % 4][px % 4] - 0.5;

      const level = light + ribBand + organicNoise + bayerThreshold * 0.24;

      let chosen: RgbColor;
      if (level < 0.24) {
        chosen = deepShadow;
      } else if (level < 0.46) {
        chosen = midShadow;
      } else if (level < 0.7) {
        chosen = midTone;
      } else if (level < 0.9) {
        chosen = brightTone;
      } else {
        chosen = highlightTone;
      }

      // Pequeños poros/nodos luminosos de energía alienígena en la zona sombreada
      if (level < 0.35 && hash2D(px * 2, py * 2, seed + 17) > 0.93) {
        chosen = highlightTone;
      }

      ctx.fillStyle = rgbToCss(chosen);
      ctx.fillRect(px, py, 1, 1);
    }
  }

  return canvas;
}

/**
 * Crea un sprite pixel-art de asteroide biomecánico/fósil con núcleo pulsante.
 */
export function createPixelAsteroidSprite(
  id: string,
  gridSize = 20,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  let seed = 101;
  for (let i = 0; i < id.length; i += 1) {
    seed = (seed * 37 + id.charCodeAt(i)) % 10000;
  }

  const center = (gridSize - 1) / 2;
  const maxR = gridSize / 2 - 1;

  for (let py = 0; py < gridSize; py += 1) {
    for (let px = 0; px < gridSize; px += 1) {
      const dx = (px - center) / maxR;
      const dy = (py - center) / maxR;
      const angle = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);

      // Silueta irregular dentada
      const jag = 0.84 + Math.sin(angle * 5 + seed) * 0.09 + Math.cos(angle * 3 - seed) * 0.07;
      if (dist > jag) {
        continue;
      }

      const bayer = BAYER_4X4[py % 4][px % 4];
      if (dist > jag - 0.12) {
        // Borde rojizo/óxido biomecánico
        ctx.fillStyle = '#9f1239';
      } else if (dist < 0.28 && bayer > 0.35) {
        // Núcleo incandescente carmesí
        ctx.fillStyle = '#fb7185';
      } else if (dx + dy < -0.15 + (bayer - 0.5) * 0.4) {
        ctx.fillStyle = '#64748b';
      } else if (bayer > 0.5) {
        ctx.fillStyle = '#334155';
      } else {
        ctx.fillStyle = '#1e293b';
      }

      ctx.fillRect(px, py, 1, 1);
    }
  }

  return canvas;
}
