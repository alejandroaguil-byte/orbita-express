/**
 * Configuración central de parámetros de simulación, puntuación y presentación para Órbita Express.
 *
 * Fórmulas de puntuación:
 * 1) Puntos por entrega (con combo actual >= 1 tras incrementar):
 *    puntosEntrega = baseDeliveryPoints + (combo - 1) * comboStepBonus
 *    Ejemplo: 1ª entrega = 250, 2ª consecutiva = 375, 3ª consecutiva = 500.
 *
 * 2) Bonus por tiempo restante (al completar todos los sectores de la partida):
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

  /** Duración inicial de la partida en segundos (pilar: <= 90 segundos) */
  matchDurationSeconds: 65,

  /** Tope absoluto del reloj de partida en segundos (pilar estricto <= 90 s) */
  maxMatchCapSeconds: 90,

  /** Segundos extra otorgados al completar un sector y avanzar al siguiente */
  sectorClearTimeBonusSeconds: 12,

  /** Penalización al tiempo restante por salir del escenario o chocar con un asteroide (segundos) */
  failureTimePenaltySeconds: 5,

  /** Velocidad de salida tangencial al lanzar la nave (unidades lógicas / segundo) */
  launchSpeed: 420,

  /** Longitud visual de la línea de ayuda de dirección (unidades lógicas) */
  aimGuideLength: 135,

  /** Factor de ralentización orbital al apuntar con el poder Enfoque Crono (CHRONO_AIM) */
  chronoAimOrbitSlowdownFactor: 0.65,

  /** Multiplicador de longitud de la guía de puntería con Enfoque Crono */
  chronoAimGuideLengthMultiplier: 1.45,

  /** Duración otorgada al recolectar o activar el poder Enfoque Crono (segundos) */
  chronoAimDurationSeconds: 16,

  /** Multiplicador de velocidad de lanzamiento con el poder Pulso Magnetar */
  magnetarLaunchSpeedMultiplier: 1.2,

  /** Radio extra de captura gravitacional de planetas con Pulso Magnetar (unidades lógicas) */
  magnetarCaptureRadiusBonus: 18,

  /** Duración otorgada al recolectar o activar el poder Pulso Magnetar (segundos) */
  magnetarDurationSeconds: 16,

  /** Multiplicador por defecto al atravesar un Anillo de Impulso (Boost Gate) */
  boostGateDefaultSpeedMultiplier: 1.38,

  /** Puntos extra otorgados al atravesar un Anillo de Impulso */
  boostGateBonusPoints: 75,

  /** Puntos otorgados al recolectar una cápsula de poder en vuelo */
  powerUpCollectPoints: 60,

  /** Puntos otorgados al pulverizar un asteroide con el Escudo de Fase */
  shieldAbsorbBonusPoints: 100,

  /** Puntos otorgados al atravesar un portal Wormhole */
  wormholeBonusPoints: 90,

  /** Tolerancia (en unidades lógicas respecto a orbitRadius) para considerar una Captura Perfecta (Bullseye) */
  perfectCaptureTolerance: 14,

  /** Puntos de bonificación otorgados por lograr una Captura Perfecta (Bullseye) */
  perfectCaptureBonusPoints: 120,

  /** Segundos extra al reloj por lograr una Captura Perfecta (Bullseye) */
  perfectCaptureTimeBonusSeconds: 1.5,

  /** Multiplicador de velocidad al activar el Micro-Impulso en Vuelo (Flight Dash) */
  flightDashSpeedMultiplier: 1.25,

  /** Puntos extra por activar un Micro-Impulso en Vuelo */
  flightDashBonusPoints: 40,

  /** Duración de los textos flotantes en el escenario (segundos) */
  floatingPopupDuration: 1.1,

  /** Segundos extra al elegir la mejora de Sobrecarga de Escudo en la Armería entre sectores */
  armoryShieldTimeBonusSeconds: 6,

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

  /** Meta por defecto de entregas en escenarios individuales */
  deliveriesGoal: 3,

  /** Puntos base otorgados por cada entrega completada */
  baseDeliveryPoints: 250,

  /** Puntos extra por cada eslabón de entregas consecutivas sin fallos */
  comboStepBonus: 125,

  /** Puntos de bonus por cada segundo entero restante al completar la partida */
  timeBonusPerSecond: 15,

  /** Texto de ayuda inicial obligatorio */
  initialHelpText: 'Mantené presionado para ver la dirección. Soltá para saltar.',
} as const;
