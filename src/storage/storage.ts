export interface PersistedDataV1 {
  readonly version: 1;
  readonly highScore: number;
  readonly audioMuted: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY_V1 = 'orbita_express_save_v1';

const DEFAULT_PERSISTED_DATA: PersistedDataV1 = {
  version: 1,
  highScore: 0,
  audioMuted: false,
};

function getSafeBrowserStorage(customStorage?: StorageLike | null): StorageLike | null {
  if (customStorage !== undefined) {
    return customStorage;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // El acceso a localStorage puede estar bloqueado por políticas del navegador
  }
  return null;
}

function isValidNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000_000 &&
    Math.floor(value) === value
  );
}

/**
 * Lee de forma segura el estado persistido local.
 * Si el almacenamiento no está disponible o contiene JSON/datos corruptos,
 * devuelve valores por defecto seguros sin lanzar excepciones.
 */
export function loadPersistedData(customStorage?: StorageLike | null): PersistedDataV1 {
  const storage = getSafeBrowserStorage(customStorage);
  if (!storage) {
    return { ...DEFAULT_PERSISTED_DATA };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY_V1);
    if (!raw) {
      return { ...DEFAULT_PERSISTED_DATA };
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_PERSISTED_DATA };
    }

    const record = parsed as Record<string, unknown>;
    if (record.version !== 1) {
      return { ...DEFAULT_PERSISTED_DATA };
    }

    const highScore = isValidNonNegativeInteger(record.highScore)
      ? record.highScore
      : DEFAULT_PERSISTED_DATA.highScore;
    const audioMuted =
      typeof record.audioMuted === 'boolean'
        ? record.audioMuted
        : DEFAULT_PERSISTED_DATA.audioMuted;

    return {
      version: 1,
      highScore,
      audioMuted,
    };
  } catch {
    return { ...DEFAULT_PERSISTED_DATA };
  }
}

/**
 * Guarda de forma segura el récord y preferencia de audio.
 */
export function savePersistedData(
  data: Pick<PersistedDataV1, 'highScore' | 'audioMuted'>,
  customStorage?: StorageLike | null,
): boolean {
  const storage = getSafeBrowserStorage(customStorage);
  if (!storage) {
    return false;
  }

  try {
    const payload: PersistedDataV1 = {
      version: 1,
      highScore: isValidNonNegativeInteger(data.highScore) ? data.highScore : 0,
      audioMuted: Boolean(data.audioMuted),
    };
    storage.setItem(STORAGE_KEY_V1, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
