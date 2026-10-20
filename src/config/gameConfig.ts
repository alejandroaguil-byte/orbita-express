/**
 * Configuración central de parámetros de simulación, puntuación y presentación para Órbita Express.
 *
 * Fórmulas de puntuación:
 * 1) Puntos por entrega (con combo actual >= 1 tras incrementar):
 *    puntosEntrega = baseDeliveryPoints + (combo - 1) * comboStepBonus
 *    Ejemplo: 1ª entrega = 250, 2ª consecutiva = 375, 3ª consecutiva = 500.
 *
 * 2) Bonus por tiempo restante (solo al completar las 3 entregas):
 *    bonusTiempo = Math.floor(remainingTime) * timeBonusPerSecond
 */
export const GAME_CONFIG = {
  /** Dimensiones lógicas del escenario (independientes de la resolución física) */
  worldWidth: 540,
  worldHeight: 960,

  /** Paso fijo de simulación en segundos (60 Hz) */
  fixedTimeStep: 1 / 60,

  /** Límite máximo de tiempo acumulado por cuadro para evitar espirales tras pausas */
  maxFrameDelta: 0.1,

  /** Límite máximo de devicePixelRatio para equilibrar nitidez y rendimiento móvil */
  maxDevicePixelRatio: 2,

  /** Duración máxima de la partida en segundos (pilar: <= 90 segundos) */
  matchDurationSeconds: 65,

  /** Penalización al tiempo restante por salir del escenario o chocar con un asteroide (segundos) */
  failureTimePenaltySeconds: 5,

  /** Velocidad de salida tangencial al lanzar la nave (unidades lógicas / segundo) */
  launchSpeed: 420,

  /** Longitud visual de la línea de ayuda de dirección (unidades lógicas) */
  aimGuideLength: 135,

  /**
   * Margen adicional fuera del captureRadius que la nave debe superar
   * para rehabilitar la captura en el mismo planeta de origen.
   */
  originUnlockMargin: 14,

  /**
   * Margen fuera de los límites del escenario lógico antes de declarar fuera de área.
   * Permite que una órbita cercana al borde no dispare falsos positivos.
   */
  outOfBoundsMargin: 28,

  /** Duración de la breve pausa/feedback de recuperación tras un fallo (segundos) */
  recoveryDuration: 0.45,

  /** Duración del destello/onda expansiva al completar una entrega (segundos) */
  deliveryEffectDuration: 0.65,

  /** Cantidad máxima de puntos guardados para dibujar la estela de la nave */
  maxTrailPoints: 18,

  /** Meta de entregas para completar la partida */
  deliveriesGoal: 3,

  /** Puntos base otorgados por cada entrega completada */
  baseDeliveryPoints: 250,

  /** Puntos extra por cada eslabón de entregas consecutivas sin fallos */
  comboStepBonus: 125,

  /** Puntos de bonus por cada segundo entero restante al completar las 3 entregas */
  timeBonusPerSecond: 15,

  /** Texto de ayuda inicial obligatorio */
  initialHelpText: 'Mantené presionado para ver la dirección. Soltá para saltar.',
} as const;
