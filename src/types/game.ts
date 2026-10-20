export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export type OrbitDirection = 1 | -1;

export type AppState = 'START' | 'PLAYING' | 'PAUSED' | 'RESULT';

export type ShipMode = 'ORBITING' | 'FLYING' | 'RECOVERING';

export type FailureReason = 'OUT_OF_BOUNDS' | 'ASTEROID_HIT';

export type GameOverReason = 'DELIVERIES_COMPLETED' | 'TIME_EXPIRED';

export interface PlanetDefinition {
  readonly id: string;
  readonly name: string;
  readonly position: Vector2D;
  /** Radio del cuerpo pintado del planeta */
  readonly visualRadius: number;
  /** Radio en el que orbita la nave alrededor del planeta */
  readonly orbitRadius: number;
  /** Radio de la zona de captura cuando la nave entra en vuelo */
  readonly captureRadius: number;
  /** Velocidad angular base en radianes por segundo */
  readonly angularSpeed: number;
  /** Color principal e identificador visual */
  readonly color: string;
  readonly accentColor: string;
}

export interface AsteroidDefinition {
  readonly id: string;
  readonly position: Vector2D;
  /** Radio de colisión y representación del asteroide estático */
  readonly radius: number;
}

export interface StageDefinition {
  readonly id: string;
  readonly name: string;
  readonly sectorNumber: number;
  readonly difficultyLabel: string;
  readonly deliveriesRequired: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly startPlanetId: string;
  readonly startOrbitAngle: number;
  readonly startOrbitDirection: OrbitDirection;
  /** Secuencia determinista de planetas destino */
  readonly targetSequence: readonly string[];
  readonly planets: readonly PlanetDefinition[];
  readonly asteroids: readonly AsteroidDefinition[];
}

export interface ShipState {
  readonly mode: ShipMode;
  readonly position: Vector2D;
  readonly velocity: Vector2D;
  /** Ángulo hacia donde apunta la proa o el movimiento de la nave (radianes) */
  readonly headingAngle: number;
  /** ID del planeta en el que orbita actualmente (si mode === 'ORBITING') */
  readonly currentPlanetId: string | null;
  /** Ángulo orbital actual en radianes */
  readonly orbitAngle: number;
  /** Dirección de giro orbital (+1 horario en pantalla, -1 antihorario) */
  readonly orbitDirection: OrbitDirection;
  /** Último planeta seguro para restaurar tras fallar el salto */
  readonly lastSafePlanetId: string;
  readonly lastSafeOrbitAngle: number;
  readonly lastSafeOrbitDirection: OrbitDirection;
  /**
   * Planeta bloqueado temporalmente para no recapturar de inmediato al despegar.
   * Se rehabilita explícitamente al salir de captureRadius + margen o capturar otro planeta.
   */
  readonly originPlanetLockedId: string | null;
  /** Tiempo restante de recuperación tras un fallo (segundos) */
  readonly recoveryTimer: number;
  /** Motivo del último fallo durante la recuperación */
  readonly lastFailureReason: FailureReason | null;
  /** Historial breve de posiciones para dibujar estela */
  readonly trail: readonly Vector2D[];
}

export interface AimGuideState {
  readonly active: boolean;
  readonly origin: Vector2D;
  readonly direction: Vector2D;
  readonly endPoint: Vector2D;
}

export interface DeliveryEffectState {
  readonly planetId: string;
  readonly position: Vector2D;
  readonly timer: number;
  readonly duration: number;
  readonly pointsEarned: number;
}

export type SimulationEventType =
  | 'GAME_STARTED'
  | 'SHIP_LAUNCHED'
  | 'PLANET_CAPTURED'
  | 'DELIVERY_COMPLETED'
  | 'SECTOR_ADVANCED'
  | 'ORIGIN_UNLOCKED'
  | 'SHIP_OUT_OF_BOUNDS'
  | 'SHIP_ASTEROID_HIT'
  | 'SHIP_RECOVERED'
  | 'GAME_FINISHED';

export interface SimulationEvent {
  readonly type: SimulationEventType;
  readonly planetId?: string;
  readonly asteroidId?: string;
  readonly deliveryNumber?: number;
  readonly sectorNumber?: number;
  readonly pointsAwarded?: number;
  readonly gameOverReason?: GameOverReason;
}

export type InputCommand =
  | { readonly type: 'START_GAME' }
  | { readonly type: 'AIM_START' }
  | { readonly type: 'AIM_RELEASE_LAUNCH' }
  | { readonly type: 'AIM_CANCEL' }
  | { readonly type: 'PAUSE_GAME'; readonly reason?: 'user' | 'visibility' }
  | { readonly type: 'RESUME_GAME' }
  | { readonly type: 'RESTART_GAME' };

export interface SimulationOptions {
  readonly initialAppState?: AppState;
  readonly initialHighScore?: number;
}

export interface GameSnapshot {
  readonly appState: AppState;
  readonly elapsedTime: number;
  readonly remainingTime: number;
  readonly totalMatchDuration: number;
  readonly ship: ShipState;
  readonly aimGuide: AimGuideState;
  readonly targetPlanetId: string;
  readonly currentSectorNumber: number;
  readonly totalSectors: number;
  readonly sectorDeliveriesCompleted: number;
  readonly sectorDeliveriesGoal: number;
  readonly deliveriesCompleted: number;
  readonly totalDeliveriesGoal: number;
  readonly score: number;
  readonly highScore: number;
  readonly isNewHighScore: boolean;
  readonly combo: number;
  readonly maxCombo: number;
  readonly lastDeliveryPoints: number;
  readonly timeBonusPoints: number;
  readonly gameOverReason: GameOverReason | null;
  readonly jumpCount: number;
  readonly outOfBoundsCount: number;
  readonly asteroidHitsCount: number;
  readonly deliveryEffect: DeliveryEffectState | null;
  readonly statusMessage: string | null;
  readonly statusMessageTimer: number;
  readonly stage: StageDefinition;
}
