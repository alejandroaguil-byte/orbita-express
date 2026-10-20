import { GAME_CONFIG } from '../config/gameConfig';
import {
  AimGuideState,
  AppState,
  AsteroidDefinition,
  DeliveryEffectState,
  FailureReason,
  GameOverReason,
  GameSnapshot,
  InputCommand,
  OrbitDirection,
  PlanetDefinition,
  ShipState,
  SimulationEvent,
  SimulationOptions,
  StageDefinition,
  Vector2D,
} from '../types/game';
import {
  computeCaptureOrbitParams,
  computeOrbitPosition,
  computeOrbitTangent,
  distanceBetween,
  intersectSegmentCircle,
  normalizeAngle,
} from './geometry';
import { calculateDeliveryPoints, calculateTimeBonus } from './scoring';

export class SimulationEngine {
  private readonly stage: StageDefinition;
  private appState: AppState;
  private elapsedTime = 0;
  private remainingTime: number = GAME_CONFIG.matchDurationSeconds;
  private ship!: ShipState;
  private currentOrbitRadius = 0;
  private isAiming = false;
  private targetSequenceIndex = 0;
  private deliveriesCompleted = 0;
  private score = 0;
  private highScore = 0;
  private isNewHighScore = false;
  private combo = 0;
  private maxCombo = 0;
  private lastDeliveryPoints = 0;
  private timeBonusPoints = 0;
  private gameOverReason: GameOverReason | null = null;
  private jumpCount = 0;
  private outOfBoundsCount = 0;
  private asteroidHitsCount = 0;
  private deliveryEffect: DeliveryEffectState | null = null;
  private statusMessage: string | null = GAME_CONFIG.initialHelpText;
  private statusMessageTimer = 0;

  constructor(stage: StageDefinition, options?: SimulationOptions) {
    this.stage = stage;
    this.highScore = Math.max(0, Math.floor(options?.initialHighScore ?? 0));
    this.appState = options?.initialAppState ?? 'PLAYING';
    this.resetMatchState(this.appState);
  }

  private getPlanetById(planetId: string): PlanetDefinition {
    const found = this.stage.planets.find((p) => p.id === planetId);
    if (!found) {
      throw new Error(`Planeta no encontrado en el escenario: ${planetId}`);
    }
    return found;
  }

  private resetMatchState(targetAppState: AppState): void {
    const startPlanet = this.getPlanetById(this.stage.startPlanetId);
    const startAngle = this.stage.startOrbitAngle;
    const startDir = this.stage.startOrbitDirection;
    const startPos = computeOrbitPosition(
      startPlanet.position,
      startPlanet.orbitRadius,
      startAngle,
    );
    const tangent = computeOrbitTangent(startAngle, startDir);

    this.appState = targetAppState;
    this.elapsedTime = 0;
    this.remainingTime = GAME_CONFIG.matchDurationSeconds;
    this.currentOrbitRadius = startPlanet.orbitRadius;
    this.isAiming = false;
    this.targetSequenceIndex = 0;
    this.deliveriesCompleted = 0;
    this.score = 0;
    this.isNewHighScore = false;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastDeliveryPoints = 0;
    this.timeBonusPoints = 0;
    this.gameOverReason = null;
    this.jumpCount = 0;
    this.outOfBoundsCount = 0;
    this.asteroidHitsCount = 0;
    this.deliveryEffect = null;
    this.statusMessage = GAME_CONFIG.initialHelpText;
    this.statusMessageTimer = 0;

    this.ship = {
      mode: 'ORBITING',
      position: startPos,
      velocity: { x: 0, y: 0 },
      headingAngle: Math.atan2(tangent.y, tangent.x),
      currentPlanetId: startPlanet.id,
      orbitAngle: startAngle,
      orbitDirection: startDir,
      lastSafePlanetId: startPlanet.id,
      lastSafeOrbitAngle: startAngle,
      lastSafeOrbitDirection: startDir,
      originPlanetLockedId: null,
      recoveryTimer: 0,
      lastFailureReason: null,
      trail: [startPos],
    };
  }

  public getTargetPlanetId(): string {
    const seq = this.stage.targetSequence;
    if (seq.length === 0) {
      return this.stage.startPlanetId;
    }
    return seq[this.targetSequenceIndex % seq.length];
  }

  public handleInput(command: InputCommand): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    switch (command.type) {
      case 'START_GAME': {
        if (this.appState === 'START') {
          this.resetMatchState('PLAYING');
          events.push({ type: 'GAME_STARTED' });
        }
        break;
      }

      case 'RESTART_GAME': {
        this.resetMatchState('PLAYING');
        events.push({ type: 'GAME_STARTED' });
        break;
      }

      case 'PAUSE_GAME': {
        if (this.appState === 'PLAYING') {
          this.appState = 'PAUSED';
          this.isAiming = false;
        }
        break;
      }

      case 'RESUME_GAME': {
        if (this.appState === 'PAUSED') {
          this.appState = 'PLAYING';
          this.isAiming = false;
        }
        break;
      }

      case 'AIM_START': {
        if (this.appState === 'PLAYING' && this.ship.mode === 'ORBITING') {
          this.isAiming = true;
        }
        break;
      }

      case 'AIM_CANCEL': {
        this.isAiming = false;
        break;
      }

      case 'AIM_RELEASE_LAUNCH': {
        if (
          this.appState === 'PLAYING' &&
          this.ship.mode === 'ORBITING' &&
          this.isAiming &&
          this.ship.currentPlanetId !== null
        ) {
          this.isAiming = false;
          const originId = this.ship.currentPlanetId;
          const tangent = computeOrbitTangent(this.ship.orbitAngle, this.ship.orbitDirection);
          const velocity: Vector2D = {
            x: tangent.x * GAME_CONFIG.launchSpeed,
            y: tangent.y * GAME_CONFIG.launchSpeed,
          };

          this.ship = {
            ...this.ship,
            mode: 'FLYING',
            velocity,
            headingAngle: Math.atan2(velocity.y, velocity.x),
            currentPlanetId: null,
            lastSafePlanetId: originId,
            lastSafeOrbitAngle: this.ship.orbitAngle,
            lastSafeOrbitDirection: this.ship.orbitDirection,
            originPlanetLockedId: originId,
            lastFailureReason: null,
          };

          this.jumpCount += 1;
          events.push({ type: 'SHIP_LAUNCHED', planetId: originId });
        } else {
          this.isAiming = false;
        }
        break;
      }
    }

    return events;
  }

  public step(dt: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    if (this.appState !== 'PLAYING' || dt <= 0) {
      return events;
    }

    this.elapsedTime += dt;
    this.remainingTime = Math.max(0, this.remainingTime - dt);

    if (this.statusMessageTimer > 0) {
      this.statusMessageTimer = Math.max(0, this.statusMessageTimer - dt);
      if (this.statusMessageTimer === 0) {
        this.statusMessage = null;
      }
    }

    if (this.deliveryEffect !== null) {
      const nextEffectTimer = this.deliveryEffect.timer - dt;
      this.deliveryEffect =
        nextEffectTimer > 0
          ? { ...this.deliveryEffect, timer: nextEffectTimer }
          : null;
    }

    if (this.ship.mode === 'ORBITING') {
      this.stepOrbiting(dt);
    } else if (this.ship.mode === 'FLYING') {
      this.stepFlying(dt, events);
    } else if (this.ship.mode === 'RECOVERING') {
      this.stepRecovering(dt, events);
    }

    // Si la partida no terminó ya por entregas o penalización, comprobar cuenta regresiva
    if (this.appState === 'PLAYING' && this.remainingTime <= 0) {
      this.finishMatch('TIME_EXPIRED', events);
    }

    return events;
  }

  private stepOrbiting(dt: number): void {
    if (!this.ship.currentPlanetId) return;
    const planet = this.getPlanetById(this.ship.currentPlanetId);

    // Convergencia suave desde el radio de captura hasta el radio orbital nominal
    const radiusDiff = planet.orbitRadius - this.currentOrbitRadius;
    if (Math.abs(radiusDiff) > 0.05) {
      const blend = Math.min(1, dt * 14);
      this.currentOrbitRadius += radiusDiff * blend;
    } else {
      this.currentOrbitRadius = planet.orbitRadius;
    }

    const nextAngle = normalizeAngle(
      this.ship.orbitAngle + planet.angularSpeed * this.ship.orbitDirection * dt,
    );
    const nextPos = computeOrbitPosition(planet.position, this.currentOrbitRadius, nextAngle);
    const tangent = computeOrbitTangent(nextAngle, this.ship.orbitDirection);

    this.ship = {
      ...this.ship,
      position: nextPos,
      orbitAngle: nextAngle,
      headingAngle: Math.atan2(tangent.y, tangent.x),
      trail: this.appendTrail(nextPos),
    };
  }

  private stepFlying(dt: number, events: SimulationEvent[]): void {
    const startPos = this.ship.position;
    const endPos: Vector2D = {
      x: startPos.x + this.ship.velocity.x * dt,
      y: startPos.y + this.ship.velocity.y * dt,
    };

    // 1. Verificar si el planeta de origen ya puede desbloquearse al alejarse lo suficiente
    let originLockedId = this.ship.originPlanetLockedId;
    if (originLockedId !== null) {
      const originPlanet = this.getPlanetById(originLockedId);
      const unlockRadius = originPlanet.captureRadius + GAME_CONFIG.originUnlockMargin;
      if (distanceBetween(endPos, originPlanet.position) > unlockRadius) {
        originLockedId = null;
        events.push({ type: 'ORIGIN_UNLOCKED', planetId: originPlanet.id });
      }
    }

    // 2. Buscar colisiones con asteroides estáticos (barrido continuo)
    interface AsteroidCandidate {
      readonly asteroid: AsteroidDefinition;
      readonly t: number;
      readonly point: Vector2D;
    }

    const asteroidHits: AsteroidCandidate[] = [];
    for (const asteroid of this.stage.asteroids) {
      const hit = intersectSegmentCircle(startPos, endPos, asteroid.position, asteroid.radius);
      if (hit !== null) {
        asteroidHits.push({
          asteroid,
          t: hit.t,
          point: hit.point,
        });
      }
    }

    asteroidHits.sort((a, b) => {
      if (Math.abs(a.t - b.t) > 1e-6) {
        return a.t - b.t;
      }
      return a.asteroid.id.localeCompare(b.asteroid.id);
    });

    // 3. Buscar capturas candidatas de planetas con desempate determinista
    interface CaptureCandidate {
      readonly planet: PlanetDefinition;
      readonly t: number;
      readonly point: Vector2D;
      readonly centerDistAtEnd: number;
    }

    const captureCandidates: CaptureCandidate[] = [];
    for (const planet of this.stage.planets) {
      if (planet.id === originLockedId) {
        continue;
      }

      const hit = intersectSegmentCircle(startPos, endPos, planet.position, planet.captureRadius);
      if (hit !== null) {
        captureCandidates.push({
          planet,
          t: hit.t,
          point: hit.point,
          centerDistAtEnd: distanceBetween(endPos, planet.position),
        });
      }
    }

    captureCandidates.sort((a, b) => {
      if (Math.abs(a.t - b.t) > 1e-6) {
        return a.t - b.t;
      }
      if (Math.abs(a.centerDistAtEnd - b.centerDistAtEnd) > 1e-6) {
        return a.centerDistAtEnd - b.centerDistAtEnd;
      }
      return a.planet.id.localeCompare(b.planet.id);
    });

    const firstAsteroid = asteroidHits[0] ?? null;
    const firstCapture = captureCandidates[0] ?? null;

    // Resolver lo que ocurra primero a lo largo del segmento de vuelo
    if (firstAsteroid !== null && (firstCapture === null || firstAsteroid.t <= firstCapture.t)) {
      this.triggerFlightFailure(
        'ASTEROID_HIT',
        firstAsteroid.point,
        events,
        firstAsteroid.asteroid.id,
      );
      return;
    }

    if (firstCapture !== null) {
      this.capturePlanet(firstCapture.planet, firstCapture.point, events);
      return;
    }

    // 4. Verificar si salió de los límites válidos del escenario
    const margin = GAME_CONFIG.outOfBoundsMargin;
    const isOut =
      endPos.x < -margin ||
      endPos.x > this.stage.worldWidth + margin ||
      endPos.y < -margin ||
      endPos.y > this.stage.worldHeight + margin;

    if (isOut) {
      this.triggerFlightFailure('OUT_OF_BOUNDS', endPos, events);
      return;
    }

    // 5. Continuar vuelo rectilíneo normal
    this.ship = {
      ...this.ship,
      position: endPos,
      originPlanetLockedId: originLockedId,
      trail: this.appendTrail(endPos),
    };
  }

  private capturePlanet(
    planet: PlanetDefinition,
    entryPoint: Vector2D,
    events: SimulationEvent[],
  ): void {
    const { orbitAngle, orbitDirection } = computeCaptureOrbitParams(
      planet.position,
      entryPoint,
      this.ship.velocity,
    );

    const entryRadius = Math.max(
      planet.visualRadius + 6,
      distanceBetween(planet.position, entryPoint),
    );
    this.currentOrbitRadius = entryRadius;

    const exactEntryPos = computeOrbitPosition(planet.position, entryRadius, orbitAngle);
    const tangent = computeOrbitTangent(orbitAngle, orbitDirection);

    this.ship = {
      ...this.ship,
      mode: 'ORBITING',
      position: exactEntryPos,
      velocity: { x: 0, y: 0 },
      headingAngle: Math.atan2(tangent.y, tangent.x),
      currentPlanetId: planet.id,
      orbitAngle,
      orbitDirection,
      lastSafePlanetId: planet.id,
      lastSafeOrbitAngle: orbitAngle,
      lastSafeOrbitDirection: orbitDirection,
      originPlanetLockedId: null,
      recoveryTimer: 0,
      lastFailureReason: null,
      trail: this.appendTrail(exactEntryPos),
    };

    events.push({ type: 'PLANET_CAPTURED', planetId: planet.id });

    // Si el planeta capturado es el destino actual, registrar entrega, puntos y combo
    if (planet.id === this.getTargetPlanetId()) {
      this.deliveriesCompleted += 1;
      this.combo += 1;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }

      const deliveryPoints = calculateDeliveryPoints(this.combo);
      this.lastDeliveryPoints = deliveryPoints;
      this.addScore(deliveryPoints);

      this.deliveryEffect = {
        planetId: planet.id,
        position: planet.position,
        timer: GAME_CONFIG.deliveryEffectDuration,
        duration: GAME_CONFIG.deliveryEffectDuration,
        pointsEarned: deliveryPoints,
      };

      events.push({
        type: 'DELIVERY_COMPLETED',
        planetId: planet.id,
        deliveryNumber: this.deliveriesCompleted,
        pointsAwarded: deliveryPoints,
      });

      if (this.deliveriesCompleted >= GAME_CONFIG.deliveriesGoal) {
        const timeBonus = calculateTimeBonus(this.remainingTime);
        this.timeBonusPoints = timeBonus;
        this.addScore(timeBonus);
        this.statusMessage = `¡Reparto completado! +${deliveryPoints} pts (Bonus tiempo: +${timeBonus})`;
        this.statusMessageTimer = 4.0;
        this.finishMatch('DELIVERIES_COMPLETED', events);
        return;
      }

      this.targetSequenceIndex += 1;
      if (this.getTargetPlanetId() === planet.id && this.stage.targetSequence.length > 1) {
        this.targetSequenceIndex += 1;
      }

      const nextTarget = this.getPlanetById(this.getTargetPlanetId());
      const comboBadge = this.combo > 1 ? ` (Combo x${this.combo})` : '';
      this.statusMessage = `¡Entrega #${this.deliveriesCompleted}! +${deliveryPoints} pts${comboBadge} · Próximo: ${nextTarget.name}`;
      this.statusMessageTimer = 3.2;
    } else {
      const target = this.getPlanetById(this.getTargetPlanetId());
      this.statusMessage = `Escala en ${planet.name}. Destino actual: ${target.name}`;
      this.statusMessageTimer = 2.0;
    }
  }

  private triggerFlightFailure(
    reason: FailureReason,
    contactPos: Vector2D,
    events: SimulationEvent[],
    asteroidId?: string,
  ): void {
    // Solo puede invocarse desde FLYING: cambia inmediatamente a RECOVERING o RESULT,
    // garantizando que nunca se aplique doble penalización por el mismo fallo.
    this.isAiming = false;
    this.combo = 0;
    this.remainingTime = Math.max(
      0,
      this.remainingTime - GAME_CONFIG.failureTimePenaltySeconds,
    );

    const safePlanet = this.getPlanetById(this.ship.lastSafePlanetId);
    const penaltyText = `(-${GAME_CONFIG.failureTimePenaltySeconds}s, combo reiniciado)`;

    if (reason === 'ASTEROID_HIT') {
      this.asteroidHitsCount += 1;
      this.statusMessage = `¡Impacto con asteroide! ${penaltyText} · Volviendo a ${safePlanet.name}`;
      events.push({
        type: 'SHIP_ASTEROID_HIT',
        planetId: safePlanet.id,
        asteroidId,
      });
    } else {
      this.outOfBoundsCount += 1;
      this.statusMessage = `Desvío fuera de sector ${penaltyText} · Volviendo a ${safePlanet.name}`;
      events.push({
        type: 'SHIP_OUT_OF_BOUNDS',
        planetId: safePlanet.id,
      });
    }

    this.statusMessageTimer = 2.5;

    this.ship = {
      ...this.ship,
      mode: 'RECOVERING',
      position: contactPos,
      velocity: { x: 0, y: 0 },
      originPlanetLockedId: null,
      recoveryTimer: GAME_CONFIG.recoveryDuration,
      lastFailureReason: reason,
    };

    if (this.remainingTime <= 0) {
      this.finishMatch('TIME_EXPIRED', events);
    }
  }

  private finishMatch(reason: GameOverReason, events: SimulationEvent[]): void {
    this.appState = 'RESULT';
    this.isAiming = false;
    this.gameOverReason = reason;

    if (reason === 'TIME_EXPIRED') {
      this.statusMessage = '¡Tiempo agotado! Fin del turno de reparto.';
    }

    events.push({
      type: 'GAME_FINISHED',
      gameOverReason: reason,
      pointsAwarded: this.score,
    });
  }

  private addScore(points: number): void {
    if (points <= 0) return;
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewHighScore = true;
    }
  }

  private stepRecovering(dt: number, events: SimulationEvent[]): void {
    const remaining = this.ship.recoveryTimer - dt;
    if (remaining > 0) {
      this.ship = {
        ...this.ship,
        recoveryTimer: remaining,
      };
      return;
    }

    const safePlanet = this.getPlanetById(this.ship.lastSafePlanetId);
    const angle = this.ship.lastSafeOrbitAngle;
    const direction: OrbitDirection = this.ship.lastSafeOrbitDirection;
    this.currentOrbitRadius = safePlanet.orbitRadius;
    const restoredPos = computeOrbitPosition(safePlanet.position, safePlanet.orbitRadius, angle);
    const tangent = computeOrbitTangent(angle, direction);

    this.ship = {
      ...this.ship,
      mode: 'ORBITING',
      position: restoredPos,
      velocity: { x: 0, y: 0 },
      headingAngle: Math.atan2(tangent.y, tangent.x),
      currentPlanetId: safePlanet.id,
      orbitAngle: angle,
      orbitDirection: direction,
      originPlanetLockedId: null,
      recoveryTimer: 0,
      lastFailureReason: null,
      trail: [restoredPos],
    };

    events.push({ type: 'SHIP_RECOVERED', planetId: safePlanet.id });
  }

  private appendTrail(point: Vector2D): readonly Vector2D[] {
    const next = [...this.ship.trail, point];
    if (next.length > GAME_CONFIG.maxTrailPoints) {
      return next.slice(next.length - GAME_CONFIG.maxTrailPoints);
    }
    return next;
  }

  private computeAimGuide(): AimGuideState {
    if (!this.isAiming || this.ship.mode !== 'ORBITING' || this.appState !== 'PLAYING') {
      return {
        active: false,
        origin: this.ship.position,
        direction: { x: 0, y: -1 },
        endPoint: this.ship.position,
      };
    }

    const direction = computeOrbitTangent(this.ship.orbitAngle, this.ship.orbitDirection);
    const endPoint: Vector2D = {
      x: this.ship.position.x + direction.x * GAME_CONFIG.aimGuideLength,
      y: this.ship.position.y + direction.y * GAME_CONFIG.aimGuideLength,
    };

    return {
      active: true,
      origin: this.ship.position,
      direction,
      endPoint,
    };
  }

  public getSnapshot(): GameSnapshot {
    return {
      appState: this.appState,
      elapsedTime: this.elapsedTime,
      remainingTime: this.remainingTime,
      totalMatchDuration: GAME_CONFIG.matchDurationSeconds,
      ship: this.ship,
      aimGuide: this.computeAimGuide(),
      targetPlanetId: this.getTargetPlanetId(),
      deliveriesCompleted: this.deliveriesCompleted,
      totalDeliveriesGoal: GAME_CONFIG.deliveriesGoal,
      score: this.score,
      highScore: this.highScore,
      isNewHighScore: this.isNewHighScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      lastDeliveryPoints: this.lastDeliveryPoints,
      timeBonusPoints: this.timeBonusPoints,
      gameOverReason: this.gameOverReason,
      jumpCount: this.jumpCount,
      outOfBoundsCount: this.outOfBoundsCount,
      asteroidHitsCount: this.asteroidHitsCount,
      deliveryEffect: this.deliveryEffect,
      statusMessage: this.statusMessage,
      statusMessageTimer: this.statusMessageTimer,
      stage: this.stage,
    };
  }
}
