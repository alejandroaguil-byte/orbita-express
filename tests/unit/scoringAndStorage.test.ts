import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { calculateDeliveryPoints, calculateTimeBonus } from '../../src/core/scoring';
import {
  loadPersistedData,
  savePersistedData,
  STORAGE_KEY_V1,
  StorageLike,
} from '../../src/storage/storage';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  public throwOnAccess = false;

  public getItem(key: string): string | null {
    if (this.throwOnAccess) {
      throw new Error('Storage bloqueado');
    }
    return this.map.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    if (this.throwOnAccess) {
      throw new Error('Storage bloqueado');
    }
    this.map.set(key, value);
  }
}

describe('Puntuación y combo (scoring)', () => {
  it('calcula puntos crecientes por entregas consecutivas según la fórmula configurada', () => {
    expect(calculateDeliveryPoints(1)).toBe(GAME_CONFIG.baseDeliveryPoints);
    expect(calculateDeliveryPoints(2)).toBe(
      GAME_CONFIG.baseDeliveryPoints + GAME_CONFIG.comboStepBonus,
    );
    expect(calculateDeliveryPoints(3)).toBe(
      GAME_CONFIG.baseDeliveryPoints + GAME_CONFIG.comboStepBonus * 2,
    );
  });

  it('calcula el bonus por tiempo restante truncando a segundos enteros no negativos', () => {
    expect(calculateTimeBonus(20.9)).toBe(20 * GAME_CONFIG.timeBonusPerSecond);
    expect(calculateTimeBonus(0.4)).toBe(0);
    expect(calculateTimeBonus(-5)).toBe(0);
  });
});

describe('Persistencia local versionada y segura (storage)', () => {
  it('devuelve valores seguros por defecto cuando el almacenamiento está vacío o no existe', () => {
    const mem = new MemoryStorage();
    expect(loadPersistedData(mem)).toEqual({
      version: 1,
      highScore: 0,
      audioMuted: false,
    });
    expect(loadPersistedData(null)).toEqual({
      version: 1,
      highScore: 0,
      audioMuted: false,
    });
  });

  it('guarda y recupera correctamente el récord y la preferencia de silencio', () => {
    const mem = new MemoryStorage();
    const ok = savePersistedData({ highScore: 1450, audioMuted: true }, mem);
    expect(ok).toBe(true);

    const loaded = loadPersistedData(mem);
    expect(loaded).toEqual({
      version: 1,
      highScore: 1450,
      audioMuted: true,
    });
  });

  it('tolera JSON inválido, versiones desconocidas, números negativos o excepciones sin fallar', () => {
    const mem = new MemoryStorage();

    mem.setItem(STORAGE_KEY_V1, '{json_corrupto');
    expect(loadPersistedData(mem)).toEqual({
      version: 1,
      highScore: 0,
      audioMuted: false,
    });

    mem.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({ version: 99, highScore: 5000, audioMuted: true }),
    );
    expect(loadPersistedData(mem)).toEqual({
      version: 1,
      highScore: 0,
      audioMuted: false,
    });

    mem.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({ version: 1, highScore: -300, audioMuted: 'no-booleano' }),
    );
    expect(loadPersistedData(mem)).toEqual({
      version: 1,
      highScore: 0,
      audioMuted: false,
    });

    mem.throwOnAccess = true;
    expect(loadPersistedData(mem)).toEqual({
      version: 1,
      highScore: 0,
      audioMuted: false,
    });
    expect(savePersistedData({ highScore: 500, audioMuted: false }, mem)).toBe(false);
  });
});
