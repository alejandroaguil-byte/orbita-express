import { GAME_CONFIG } from '../config/gameConfig';
import {
  AimGuideState,
  AppState,
  AsteroidDefinition,
  AsteroidRuntimeState,
  DeliveryEffectState,
  FailureReason,
  GameOverReason,
  GameSnapshot,
  InputCommand,
  OrbitDirection,
  PlanetDefinition,
  PowerUpOrbRuntimeState,
  ShipPowersState,
  ShipState,
  ShipTier,
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
  private readonly stages: readonly StageDefinition[];
  private currentStageIndex = 0;
  private appState: AppState;
  private elapsedTime = 0;
  private stageElapsedTime = 0;
  private remainingTime: number = GAME_CONFIG.matchDurationSeconds;
  private ship!: ShipState;
  private currentOrbitRadius = 0;
  private isAiming = false;
  private targetSequenceIndex = 0;
  private sectorDeliveriesCompleted = 0;
  private deliveriesCompleted = 0;
  private totalDeliveriesGoal = 3;
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

  private readonly destroyedAsteroidIds = new Set<string>();
  private readonly collectedPowerUpIds = new Set<string>();
  private readonly activatedGateIds = new Set<string>();
  private readonly wormholeCooldownIds = new Set<string>();

  constructor(
    stageOrStages: StageDefinition | readonly StageDefinition[],
    options?: SimulationOptions,
  ) {
    if (Array.isArray(stageOrStages)) {
      if (stageOrStages.length === 0) {
        throw new Error('Se requiere al menos un escenario para iniciar la simulación.');
      }
      this.stages = stageOrStages;
    } else {
      this.stages = [stageOrStages as StageDefinition];
    }

    this.totalDeliveriesGoal =
      this.stages.length === 1
        ? GAME_CONFIG.deliveriesGoal
        : this.stages.reduce((acc, st) => acc + Math.max(1, st.deliveriesRequired ?? 1), 0);

    this.highScore = Math.max(0, Math.floor(options?.initialHighScore ?? 0));
    this.appState = options?.initialAppState ?? 'PLAYING';
    this.resetMatchState(this.appState);
  }

  private getCurrentStage(): StageDefinition {
    return this.stages[this.currentStageIndex];
  }

  private getCurrentSectorGoal(): number {
    if (this.stages.length === 1) {
      return this.totalDeliveriesGoal;
    }
    return Math.max(1, this.getCurrentStage().deliveriesRequired ?? 1);
  }

  private getPlanetById(planetId: string): PlanetDefinition {
    const found = this.getCurrentStage().planets.find((p) => p.id === planetId);
    if (!found) {
      throw new Error(`Planeta no encontrado en el escenario: ${planetId}`);
    }
    return found;
  }

  private computeAsteroidPosition(asteroid: AsteroidDefinition): Vector2D {
    const offset = asteroid.patrolOffset;
    const speed = asteroid.patrolSpeed ?? 0;
    if (!offset || (offset.x === 0 && offset.y === 0) || speed === 0) {
      return asteroid.position;
    }
    const phase = (asteroid.patrolPhase ?? 0) + this.stageElapsedTime * speed;
    const wave = Math.sin(phase);
    return {
      x: asteroid.position.x + offset.x * wave,
      y: asteroid.position.y + offset.y * wave,
    };
  }

  private getActiveAsteroids(): AsteroidRuntimeState[] {
    const stage = this.getCurrentStage();
    return stage.asteroids.map((ast) => {
      const isMoving = Boolean(
        ast.patrolOffset &&
          (ast.patrolOffset.x !== 0 || ast.patrolOffset.y !== 0) &&
          (ast.patrolSpeed ?? 0) !== 0,
      );
      return {
        id: ast.id,
        position: this.computeAsteroidPosition(ast),
        basePosition: ast.position,
        radius: ast.radius,
        isMoving,
        destroyed: this.destroyedAsteroidIds.has(ast.id),
      };
    });
  }

  private getActivePowerUpOrbs(): PowerUpOrbRuntimeState[] {
    const stage = this.getCurrentStage();
    const orbs = stage.powerUpOrbs ?? [];
    return orbs.map((orb) => ({
      id: orb.id,
      position: orb.position,
      radius: orb.radius,
      power: orb.power,
      collected: this.collectedPowerUpIds.has(orb.id),
    }));
  }

  private setupStageState(
    stageIndex: number,
    preservedTier: ShipTier = 1,
    preservedPowers: ShipPowersState = {
      phaseShield: false,
      chronoAimTimer: 0,
      magnetarTimer: 0,
    },
  ): void {
    this.currentStageIndex = stageIndex;
    this.stageElapsedTime = 0;
    this.destroyedAsteroidIds.clear();
    this.collectedPowerUpIds.clear();
    this.activatedGateIds.clear();
    this.wormholeCooldownIds.clear();

    const stage = this.getCurrentStage();
    const startPlanet = this.getPlanetById(stage.startPlanetId);
    const startAngle = stage.startOrbitAngle;
    const startDir = stage.startOrbitDirection;
    const startPos = computeOrbitPosition(
      startPlanet.position,
      startPlanet.orbitRadius,
      startAngle,
    );
    const tangent = computeOrbitTangent(startAngle, startDir);

    this.currentOrbitRadius = startPlanet.orbitRadius;
    this.isAiming = false;
    this.targetSequenceIndex = 0;
    this.sectorDeliveriesCompleted = 0;

    this.ship = {
      mode: 'ORBITING',
      tier: preservedTier,
      powers: preservedPowers,
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

  private resetMatchState(targetAppState: AppState): void {
    this.appState = targetAppState;
    this.elapsedTime = 0;
    this.remainingTime = GAME_CONFIG.matchDurationSeconds;
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

    this.setupStageState(0, 1, {
      phaseShield: false,
      chronoAimTimer: 0,
      magnetarTimer: 0,
    });
  }

  public getTargetPlanetId(): string {
    const stage = this.getCurrentStage();
    const seq = stage.targetSequence;
    if (seq.length === 0) {
      return stage.startPlanetId;
    }
    return seq[this.targetSequenceIndex % seq.length];
  }

  private getEffectiveLaunchSpeed(): number {
    const multiplier =
      this.ship.powers.magnetarTimer > 0 ? GAME_CONFIG.magnetarLaunchSpeedMultiplier : 1;
    return GAME_CONFIG.launchSpeed * multiplier;
  }

  private getEffectiveCaptureRadius(planet: PlanetDefinition): number {
    const bonus =
      this.ship.powers.magnetarTimer > 0 ? GAME_CONFIG.magnetarCaptureRadiusBonus : 0;
    return planet.captureRadius + bonus;
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

      case 'FLIP_ORBIT': {
        if (this.appState === 'PLAYING' && this.ship.mode === 'ORBITING') {
          const nextDirection: OrbitDirection = this.ship.orbitDirection === 1 ? -1 : 1;
          const tangent = computeOrbitTangent(this.ship.orbitAngle, nextDirection);
          this.ship = {
            ...this.ship,
            orbitDirection: nextDirection,
            lastSafeOrbitDirection: nextDirection,
            headingAngle: Math.atan2(tangent.y, tangent.x),
          };
          this.statusMessage = '¡Propulsor lateral: sentido orbital invertido!';
          this.statusMessageTimer = 1.6;
          events.push({
            type: 'ORBIT_INVERTED',
            planetId: this.ship.currentPlanetId ?? undefined,
          });
        }
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
          this.activatedGateIds.clear();
          this.wormholeCooldownIds.clear();

          const originId = this.ship.currentPlanetId;
          const tangent = computeOrbitTangent(this.ship.orbitAngle, this.ship.orbitDirection);
          const launchSpeed = this.getEffectiveLaunchSpeed();
          const velocity: Vector2D = {
            x: tangent.x * launchSpeed,
            y: tangent.y * launchSpeed,
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
    this.stageElapsedTime += dt;
    this.remainingTime = Math.max(0, this.remainingTime - dt);

    // Actualizar temporizadores de poderes activos
    if (this.ship.powers.chronoAimTimer > 0 || this.ship.powers.magnetarTimer > 0) {
      this.ship = {
        ...this.ship,
        powers: {
          ...this.ship.powers,
          chronoAimTimer: Math.max(0, this.ship.powers.chronoAimTimer - dt),
          magnetarTimer: Math.max(0, this.ship.powers.magnetarTimer - dt),
        },
      };
    }

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

    if (this.appState === 'PLAYING' && this.remainingTime <= 0) {
      this.finishMatch('TIME_EXPIRED', events);
    }

    return events;
  }

  private stepOrbiting(dt: number): void {
    if (!this.ship.currentPlanetId) return;
    const planet = this.getPlanetById(this.ship.currentPlanetId);

    const radiusDiff = planet.orbitRadius - this.currentOrbitRadius;
    if (Math.abs(radiusDiff) > 0.05) {
      const blend = Math.min(1, dt * 14);
      this.currentOrbitRadius += radiusDiff * blend;
    } else {
      this.currentOrbitRadius = planet.orbitRadius;
    }

    const slowDown =
      this.isAiming && this.ship.powers.chronoAimTimer > 0
        ? GAME_CONFIG.chronoAimOrbitSlowdownFactor
        : 1;

    const nextAngle = normalizeAngle(
      this.ship.orbitAngle + planet.angularSpeed * slowDown * this.ship.orbitDirection * dt,
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

  private applyGravityWells(dt: number): void {
    const wells = this.getCurrentStage().gravityWells;
    if (!wells || wells.length === 0) {
      return;
    }

    let vx = this.ship.velocity.x;
    let vy = this.ship.velocity.y;
    let changed = false;

    for (const well of wells) {
      const dx = well.position.x - this.ship.position.x;
      const dy = well.position.y - this.ship.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && dist <= well.influenceRadius) {
        const pull = well.strength / Math.max(26, dist);
        vx += (dx / dist) * pull * dt;
        vy += (dy / dist) * pull * dt;
        changed = true;
      }
    }

    if (changed) {
      const speed = Math.hypot(vx, vy);
      const minSpeed = GAME_CONFIG.launchSpeed * 0.85;
      const maxSpeed = GAME_CONFIG.launchSpeed * 1.65;
      if (speed > 0) {
        const clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
        vx = (vx / speed) * clampedSpeed;
        vy = (vy / speed) * clampedSpeed;
      }
      this.ship = {
        ...this.ship,
        velocity: { x: vx, y: vy },
        headingAngle: Math.atan2(vy, vx),
      };
    }
  }

  private checkFlightPowerUpsAndGates(
    startPos: Vector2D,
    endPos: Vector2D,
    events: SimulationEvent[],
  ): void {
    const stage = this.getCurrentStage();

    // 1. Cápsulas de poder (Power-Up Orbs)
    for (const orb of stage.powerUpOrbs ?? []) {
      if (this.collectedPowerUpIds.has(orb.id)) {
        continue;
      }
      const hit = intersectSegmentCircle(startPos, endPos, orb.position, orb.radius);
      if (hit !== null) {
        this.collectedPowerUpIds.add(orb.id);
        this.addScore(GAME_CONFIG.powerUpCollectPoints);

        const prevTier = this.ship.tier;
        const nextTier = Math.min(3, prevTier + 1) as ShipTier;
        const nextPowers: ShipPowersState = {
          phaseShield:
            orb.power === 'PHASE_SHIELD' ? true : this.ship.powers.phaseShield,
          chronoAimTimer:
            orb.power === 'CHRONO_AIM'
              ? GAME_CONFIG.chronoAimDurationSeconds
              : this.ship.powers.chronoAimTimer,
          magnetarTimer:
            orb.power === 'MAGNETAR'
              ? GAME_CONFIG.magnetarDurationSeconds
              : this.ship.powers.magnetarTimer,
        };

        this.ship = {
          ...this.ship,
          tier: nextTier,
          powers: nextPowers,
        };

        const powerLabel =
          orb.power === 'PHASE_SHIELD'
            ? 'Escudo de Fase'
            : orb.power === 'CHRONO_AIM'
              ? 'Enfoque Crono'
              : 'Pulso Magnetar';
        this.statusMessage = `¡Poder adquirido: ${powerLabel} (Nave MK-${nextTier})! +${GAME_CONFIG.powerUpCollectPoints} pts`;
        this.statusMessageTimer = 2.8;

        events.push({
          type: 'POWERUP_COLLECTED',
          power: orb.power,
          shipTier: nextTier,
          pointsAwarded: GAME_CONFIG.powerUpCollectPoints,
        });

        if (nextTier > prevTier) {
          events.push({
            type: 'SHIP_UPGRADED',
            shipTier: nextTier,
          });
        }
      }
    }

    // 2. Anillos de Impulso (Boost Gates)
    for (const gate of stage.boostGates ?? []) {
      if (this.activatedGateIds.has(gate.id)) {
        continue;
      }
      const hit = intersectSegmentCircle(startPos, endPos, gate.position, gate.radius);
      if (hit !== null) {
        this.activatedGateIds.add(gate.id);
        const mult = gate.speedMultiplier ?? GAME_CONFIG.boostGateDefaultSpeedMultiplier;
        const bonus = gate.bonusPoints ?? GAME_CONFIG.boostGateBonusPoints;
        this.addScore(bonus);

        const vx = this.ship.velocity.x * mult;
        const vy = this.ship.velocity.y * mult;

        this.ship = {
          ...this.ship,
          velocity: { x: vx, y: vy },
          headingAngle: Math.atan2(vy, vx),
          powers: {
            ...this.ship.powers,
            magnetarTimer: Math.max(this.ship.powers.magnetarTimer, 8),
          },
        };

        this.statusMessage = `¡Anillo de Impulso activado! Velocidad x${mult.toFixed(2)} (+${bonus} pts)`;
        this.statusMessageTimer = 2.4;

        events.push({
          type: 'BOOST_GATE_PASSED',
          gateId: gate.id,
          pointsAwarded: bonus,
        });
      }
    }
  }

  private stepFlying(dt: number, events: SimulationEvent[]): void {
    const stage = this.getCurrentStage();

    // Influencia de pozos gravitacionales sobre el vector de velocidad actual
    this.applyGravityWells(dt);

    const startPos = this.ship.position;
    const endPos: Vector2D = {
      x: startPos.x + this.ship.velocity.x * dt,
      y: startPos.y + this.ship.velocity.y * dt,
    };

    let originLockedId = this.ship.originPlanetLockedId;
    if (originLockedId !== null) {
      const originPlanet = this.getPlanetById(originLockedId);
      const unlockRadius =
        this.getEffectiveCaptureRadius(originPlanet) + GAME_CONFIG.originUnlockMargin;
      if (distanceBetween(endPos, originPlanet.position) > unlockRadius) {
        originLockedId = null;
        events.push({ type: 'ORIGIN_UNLOCKED', planetId: originPlanet.id });
      }
    }

    // Recolección de cápsulas y cruce por anillos de impulso en el segmento
    this.checkFlightPowerUpsAndGates(startPos, endPos, events);

    // Portales Wormhole (teletransporte cuántico de entrada a salida)
    for (const wormhole of stage.wormholes ?? []) {
      if (this.wormholeCooldownIds.has(wormhole.id)) {
        continue;
      }
      const hit = intersectSegmentCircle(
        startPos,
        endPos,
        wormhole.entryPosition,
        wormhole.radius,
      );
      if (hit !== null) {
        this.wormholeCooldownIds.add(wormhole.id);
        this.addScore(GAME_CONFIG.wormholeBonusPoints);
        const exitPos = wormhole.exitPosition;

        this.ship = {
          ...this.ship,
          position: exitPos,
          originPlanetLockedId: null,
          trail: [exitPos],
        };

        this.statusMessage = `¡Salto por ${wormhole.name}! +${GAME_CONFIG.wormholeBonusPoints} pts`;
        this.statusMessageTimer = 2.6;

        events.push({
          type: 'WORMHOLE_TRAVERSED',
          wormholeId: wormhole.id,
          pointsAwarded: GAME_CONFIG.wormholeBonusPoints,
        });
        return;
      }
    }

    interface AsteroidCandidate {
      readonly asteroid: AsteroidRuntimeState;
      readonly t: number;
      readonly point: Vector2D;
    }

    const asteroidHits: AsteroidCandidate[] = [];
    for (const asteroid of this.getActiveAsteroids()) {
      if (asteroid.destroyed) {
        continue;
      }
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

    interface CaptureCandidate {
      readonly planet: PlanetDefinition;
      readonly t: number;
      readonly point: Vector2D;
      readonly centerDistAtEnd: number;
    }

    const captureCandidates: CaptureCandidate[] = [];
    for (const planet of stage.planets) {
      if (planet.id === originLockedId) {
        continue;
      }

      const effectiveCaptureRadius = this.getEffectiveCaptureRadius(planet);
      const hit = intersectSegmentCircle(
        startPos,
        endPos,
        planet.position,
        effectiveCaptureRadius,
      );
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

    if (firstAsteroid !== null && (firstCapture === null || firstAsteroid.t <= firstCapture.t)) {
      // ¿Tiene la nave el Escudo de Fase activo? Absorbe el golpe y destruye el asteroide
      if (this.ship.powers.phaseShield) {
        this.destroyedAsteroidIds.add(firstAsteroid.asteroid.id);
        this.addScore(GAME_CONFIG.shieldAbsorbBonusPoints);
        this.ship = {
          ...this.ship,
          powers: {
            ...this.ship.powers,
            phaseShield: false,
          },
        };
        this.statusMessage = `¡Escudo de Fase pulverizó el asteroide! +${GAME_CONFIG.shieldAbsorbBonusPoints} pts`;
        this.statusMessageTimer = 2.6;
        events.push({
          type: 'SHIELD_ABSORBED_HIT',
          asteroidId: firstAsteroid.asteroid.id,
          pointsAwarded: GAME_CONFIG.shieldAbsorbBonusPoints,
        });

        // Si en el mismo paso también capturaba un planeta detrás, procesamos la captura
        if (firstCapture !== null) {
          this.capturePlanet(firstCapture.planet, firstCapture.point, events);
          return;
        }
      } else {
        this.triggerFlightFailure(
          'ASTEROID_HIT',
          firstAsteroid.point,
          events,
          firstAsteroid.asteroid.id,
        );
        return;
      }
    } else if (firstCapture !== null) {
      this.capturePlanet(firstCapture.planet, firstCapture.point, events);
      return;
    }

    const margin = GAME_CONFIG.outOfBoundsMargin;
    const isOut =
      endPos.x < -margin ||
      endPos.x > stage.worldWidth + margin ||
      endPos.y < -margin ||
      endPos.y > stage.worldHeight + margin;

    if (isOut) {
      this.triggerFlightFailure('OUT_OF_BOUNDS', endPos, events);
      return;
    }

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
    const stage = this.getCurrentStage();
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

    if (planet.id === this.getTargetPlanetId()) {
      this.deliveriesCompleted += 1;
      this.sectorDeliveriesCompleted += 1;
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
        sectorNumber: stage.sectorNumber,
        pointsAwarded: deliveryPoints,
      });

      // ¿Completamos todas las entregas de la campaña o escenario?
      if (this.deliveriesCompleted >= this.totalDeliveriesGoal) {
        const timeBonus = calculateTimeBonus(this.remainingTime);
        this.timeBonusPoints = timeBonus;
        this.addScore(timeBonus);
        this.statusMessage = `¡Campaña completada! +${deliveryPoints} pts (Bonus tiempo: +${timeBonus})`;
        this.statusMessageTimer = 4.0;
        this.finishMatch('DELIVERIES_COMPLETED', events);
        return;
      }

      // ¿Completamos las entregas requeridas del sector actual y hay un siguiente sector?
      if (
        this.sectorDeliveriesCompleted >= this.getCurrentSectorGoal() &&
        this.currentStageIndex + 1 < this.stages.length
      ) {
        const nextStageIndex = this.currentStageIndex + 1;
        const prevTier = this.ship.tier;
        const upgradedTier = Math.min(3, Math.max(prevTier, nextStageIndex + 1)) as ShipTier;

        // Evolución de la nave al avanzar de sector: otorga Escudo de Fase y en Sector 3 Enfoque Crono
        const nextPowers: ShipPowersState = {
          phaseShield: true,
          chronoAimTimer:
            upgradedTier >= 3
              ? Math.max(this.ship.powers.chronoAimTimer, GAME_CONFIG.chronoAimDurationSeconds)
              : this.ship.powers.chronoAimTimer,
          magnetarTimer: this.ship.powers.magnetarTimer,
        };

        this.setupStageState(nextStageIndex, upgradedTier, nextPowers);
        const nextStage = this.getCurrentStage();
        const nextTarget = this.getPlanetById(this.getTargetPlanetId());

        this.remainingTime = Math.min(
          GAME_CONFIG.maxMatchCapSeconds,
          this.remainingTime + GAME_CONFIG.sectorClearTimeBonusSeconds,
        );

        this.statusMessage = `¡Sector ${nextStage.sectorNumber}: ${nextStage.name} · Nave MK-${upgradedTier} equipada! +${GAME_CONFIG.sectorClearTimeBonusSeconds}s · Destino: ${nextTarget.name}`;
        this.statusMessageTimer = 4.0;

        if (upgradedTier > prevTier) {
          events.push({
            type: 'SHIP_UPGRADED',
            shipTier: upgradedTier,
          });
        }

        events.push({
          type: 'SECTOR_ADVANCED',
          sectorNumber: nextStage.sectorNumber,
          planetId: nextTarget.id,
          shipTier: upgradedTier,
        });
        return;
      }

      this.targetSequenceIndex += 1;
      if (this.getTargetPlanetId() === planet.id && stage.targetSequence.length > 1) {
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
    const guideLength =
      this.ship.powers.chronoAimTimer > 0
        ? GAME_CONFIG.aimGuideLength * GAME_CONFIG.chronoAimGuideLengthMultiplier
        : GAME_CONFIG.aimGuideLength;

    const endPoint: Vector2D = {
      x: this.ship.position.x + direction.x * guideLength,
      y: this.ship.position.y + direction.y * guideLength,
    };

    return {
      active: true,
      origin: this.ship.position,
      direction,
      endPoint,
    };
  }

  public getSnapshot(): GameSnapshot {
    const currentStage = this.getCurrentStage();
    return {
      appState: this.appState,
      elapsedTime: this.elapsedTime,
      remainingTime: this.remainingTime,
      totalMatchDuration: GAME_CONFIG.matchDurationSeconds,
      ship: this.ship,
      aimGuide: this.computeAimGuide(),
      targetPlanetId: this.getTargetPlanetId(),
      currentSectorNumber: currentStage.sectorNumber,
      totalSectors: this.stages.length,
      sectorDeliveriesCompleted: this.sectorDeliveriesCompleted,
      sectorDeliveriesGoal: this.getCurrentSectorGoal(),
      deliveriesCompleted: this.deliveriesCompleted,
      totalDeliveriesGoal: this.totalDeliveriesGoal,
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
      activeAsteroids: this.getActiveAsteroids(),
      activePowerUpOrbs: this.getActivePowerUpOrbs(),
      activatedGateIds: Array.from(this.activatedGateIds),
      stage: currentStage,
    };
  }
}
