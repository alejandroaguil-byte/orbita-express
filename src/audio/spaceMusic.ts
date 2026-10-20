/**
 * Patrones musicales para el sintetizador espacial estilo Axiom Verge / Synthwave 16-bit.
 * Funciones puras y deterministas para convertir notas MIDI a frecuencias y seleccionar
 * tempos y secuencias según el sector actual.
 */

export interface SectorMusicTheme {
  readonly sectorNumber: number;
  readonly bpm: number;
  /** Notas MIDI del bajo en semicorcheas (16 pasos) */
  readonly bassSequence: readonly number[];
  /** Notas MIDI del arpegio espacial en semicorcheas (16 pasos, 0 = silencio) */
  readonly arpSequence: readonly number[];
  /** Frecuencia de corte base del filtro pasa-bajos del bajo (Hz) */
  readonly bassFilterCutoff: number;
}

const SECTOR_THEMES: readonly SectorMusicTheme[] = [
  {
    // Sector 1: Modo Frigio / Menor espacial en Re (D) - misterioso y magnético
    sectorNumber: 1,
    bpm: 118,
    bassFilterCutoff: 420,
    bassSequence: [
      38, 38, 50, 38, 39, 39, 51, 39,
      36, 36, 48, 36, 38, 38, 50, 45,
    ],
    arpSequence: [
      62, 65, 69, 74, 62, 65, 70, 74,
      63, 67, 70, 75, 60, 64, 67, 72,
    ],
  },
  {
    // Sector 2: Cinturón de Cobalto en Mi menor armónico (E) - más tenso y rítmico
    sectorNumber: 2,
    bpm: 126,
    bassFilterCutoff: 520,
    bassSequence: [
      40, 40, 52, 40, 41, 41, 53, 41,
      38, 38, 50, 38, 39, 39, 51, 47,
    ],
    arpSequence: [
      64, 67, 71, 76, 65, 68, 71, 77,
      62, 65, 69, 74, 63, 66, 71, 75,
    ],
  },
  {
    // Sector 3: Tormenta Esmeralda en Fa# frigio dominante - clímax biomecánico
    sectorNumber: 3,
    bpm: 134,
    bassFilterCutoff: 640,
    bassSequence: [
      42, 54, 42, 54, 43, 55, 43, 55,
      40, 52, 40, 52, 41, 53, 45, 57,
    ],
    arpSequence: [
      66, 70, 73, 78, 67, 71, 74, 79,
      64, 67, 71, 76, 65, 69, 73, 77,
    ],
  },
];

/**
 * Convierte una nota MIDI (ej. 69 = A4) en frecuencia en Hercios (Hz).
 */
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Devuelve el tema musical correspondiente al sector (1, 2, 3...).
 */
export function getSectorMusicTheme(sectorNumber: number): SectorMusicTheme {
  const index = Math.max(0, Math.min(SECTOR_THEMES.length - 1, sectorNumber - 1));
  return SECTOR_THEMES[index];
}

/**
 * Calcula la duración exacta en segundos de una semicorchea (1/16) para el BPM dado.
 */
export function getSixteenthNoteDuration(bpm: number): number {
  const safeBpm = Math.max(40, Math.min(240, bpm));
  return 60 / safeBpm / 4;
}
