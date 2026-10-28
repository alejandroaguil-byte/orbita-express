import { GAME_CONFIG } from '../config/gameConfig';
import {
  AimGuideState,
  AppState,
  AsteroidDefinition,
  AsteroidRuntimeState,
  DeliveryEffectState,
  FailureReason,
  FloatingPopupState,
  GameOverReason,
  GameSnapshot,
  InputCommand,
  OrbitDirection,
  PlanetDefinition,
  PowerUpOrbRuntimeState,
  SectorUpgradeOptionId,
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
  private perfectCapturesCount = 0;
  private dashCount = 0;
  private armoryChoiceAvailable = false;
  private lastDeliveryPoints = 0;
  private timeBonusPoints = 0;
  private gameOverReason: GameOverReason | null = null;
  private jumpCount = 0;
  private outOfBoundsCount = 0;
  private asteroidHitsCount = 0;
  private deliveryEffect: DeliveryEffectState | null = null;
  private floatingPopups: FloatingPopupState[] = [];
  private popupSequence = 0;
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

  private spawnPopup(text: string, position: Vector2D, color: string): void {
    this.popupSequence += 1;
    this.floatingPopups = [
      ...this.floatingPopups.slice(-7),
      {
        id: `popup-${this.popupSequence}`,
        text,
        position: { x: position.x, y: position.y - 16 },
        color,
        timer: GAME_CONFIG.floatingPopupDuration,
        duration: GAME_CONFIG.floatingPopupDuration,
      },
    ];
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
      dashAvailableThisFlight: false,
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
    this.perfectCapturesCount = 0;
    this.dashCount = 0;
    this.armoryChoiceAvailable = false;
    this.lastDeliveryPoints = 0;
    this.timeBonusPoints = 0;
    this.gameOverReason = null;
    this.jumpCount = 0;
    this.outOfBoundsCount = 0;
    this.asteroidHitsCount = 0;
    this.deliveryEffect = null;
    this.floatingPopups = [];
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

  private executeFlightDash(events: SimulationEvent[]): void {
    if (
      this.appState !== 'PLAYING' ||
      this.ship.mode !== 'FLYING' ||
      !this.ship.dashAvailableThisFlight
    ) {
      return;
    }

    const stage = this.getCurrentStage();
    const currentSpeed = Math.hypot(this.ship.velocity.x, this.ship.velocity.y);
    if (currentSpeed <= 1) {
      return;
    }

    let dirX = this.ship.velocity.x / currentSpeed;
    let dirY = this.ship.velocity.y / currentSpeed;

    // Si hay un planeta adelante dentro de un cono de asistencia, curvar ligeramente hacia él
    let bestPlanet: PlanetDefinition | null = null;
    let bestDist = Infinity;

    for (const planet of stage.planets) {
      if (planet.id === this.ship.originPlanetLockedId) {
        continue;
      }
      const toX = planet.position.x - this.ship.position.x;
      const toY = planet.position.y - this.ship.position.y;
      const dist = Math.hypot(toX, toY);
      if (dist > 10 && dist < 340) {
        const dot = (toX / dist) * dirX + (toY / dist) * dirY;
        if (dot > 0.65 && dist < bestDist) {
          bestDist = dist;
          bestPlanet = planet;
        }
      }
    }

    if (bestPlanet !== null) {
      const toX = bestPlanet.position.x - this.ship.position.x;
      const toY = bestPlanet.position.y - this.ship.position.y;
      const dist = Math.hypot(toX, toY);
      if (dist > 0) {
        const targetDirX = toX / dist;
        const targetDirY = toY / dist;
        const blend = 0.42;
        const mixedX = dirX * (1 - blend) + targetDirX * blend;
        const mixedY = dirY * (1 - blend) + targetDirY * blend;
        const mixedLen = Math.hypot(mixedX, mixedY) || 1;
        dirX = mixedX / mixedLen;
        dirY = mixedY / mixedLen;
      }
    }

    const boostedSpeed = Math.min(
      GAME_CONFIG.launchSpeed * 1.75,
      currentSpeed * GAME_CONFIG.flightDashSpeedMultiplier,
    );
    const nextVel: Vector2D = {
      x: dirX * boostedSpeed,
      y: dirY * boostedSpeed,
    };

    this.dashCount += 1;
    this.addScore(GAME_CONFIG.flightDashBonusPoints);

    this.ship = {
      ...this.ship,
      dashAvailableThisFlight: false,
      velocity: nextVel,
      headingAngle: Math.atan2(nextVel.y, nextVel.x),
    };

    this.spawnPopup(
      `DASH +${GAME_CONFIG.flightDashBonusPoints}`,
      this.ship.position,
      '#38bdf8',
    );
    this.statusMessage = `¡Micro-Impulso en vuelo activado! +${GAME_CONFIG.flightDashBonusPoints} pts`;
    this.statusMessageTimer = 1.8;

    events.push({
      type: 'SHIP_DASHED',
      position: this.ship.position,
      pointsAwarded: GAME_CONFIG.flightDashBonusPoints,
    });
  }

  private applySectorUpgradeChoice(
    upgradeId: SectorUpgradeOptionId,
    events: SimulationEvent[],
  ): void {
    if (this.appState !== 'PLAYING' || !this.armoryChoiceAvailable) {
      return;
    }

    this.armoryChoiceAvailable = false;

    if (upgradeId === 'SHIELD_OVERCHARGE') {
      this.remainingTime = Math.min(
        GAME_CONFIG.maxMatchCapSeconds,
        this.remainingTime + GAME_CONFIG.armoryShieldTimeBonusSeconds,
      );
      this.ship = {
        ...this.ship,
        powers: {
          ...this.ship.powers,
          phaseShield: true,
        },
      };
      this.spawnPopup(
        `ESCUDO +${GAME_CONFIG.armoryShieldTimeBonusSeconds}S`,
        this.ship.position,
        '#38bdf8',
      );
      this.statusMessage = `¡Armería: Escudo de Fase sobrecargado y +${GAME_CONFIG.armoryShieldTimeBonusSeconds}s al reloj!`;
      this.statusMessageTimer = 2.6;
    } else {
      this.ship = {
        ...this.ship,
        powers: {
          ...this.ship.powers,
          chronoAimTimer: Math.max(
            this.ship.powers.chronoAimTimer,
            GAME_CONFIG.chronoAimDurationSeconds,
          ),
          magnetarTimer: Math.max(
            this.ship.powers.magnetarTimer,
            GAME_CONFIG.magnetarDurationSeconds,
          ),
        },
      };
      this.spawnPopup('MAGNETAR + CRONO', this.ship.position, '#fde047');
      this.statusMessage =
        '¡Armería: Pulso Magnetar + Enfoque Crono activados a máxima potencia!';
      this.statusMessageTimer = 2.6;
    }

    events.push({
      type: 'SECTOR_UPGRADE_APPLIED',
      upgradeId,
      position: this.ship.position,
    });
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

      case 'FLIGHT_DASH': {
        this.executeFlightDash(events);
        break;
      }

      case 'SELECT_SECTOR_UPGRADE': {
        this.applySectorUpgradeChoice(command.upgradeId, events);
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
          this.spawnPopup('GIRO INVERTIDO', this.ship.position, '#a78bfa');
          this.statusMessage = '¡Propulsor lateral: sentido orbital invertido!';
          this.statusMessageTimer = 1.6;
          events.push({
            type: 'ORBIT_INVERTED',
            planetId: this.ship.currentPlanetId ?? undefined,
            position: this.ship.position,
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
          this.armoryChoiceAvailable = false;
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
            dashAvailableThisFlight: true,
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
          events.push({
            type: 'SHIP_LAUNCHED',
            planetId: originId,
            position: this.ship.position,
          });
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

    if (this.floatingPopups.length > 0) {
      this.floatingPopups = this.floatingPopups
        .map((p) => ({
          ...p,
          timer: p.timer - dt,
          position: { x: p.position.x, y: p.position.y - 22 * dt },
        }))
        .filter((p) => p.timer > 0);
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

  private computeGravityAdjustedVelocity(
    pos: Vector2D,
    vel: Vector2D,
    dt: number,
  ): Vector2D {
    const wells = this.getCurrentStage().gravityWells;
    if (!wells || wells.length === 0) {
      return vel;
    }

    let vx = vel.x;
    let vy = vel.y;
    let changed = false;

    for (const well of wells) {
      const dx = well.position.x - pos.x;
      const dy = well.position.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && dist <= well.influenceRadius) {
        const pull = well.strength / Math.max(26, dist);
        vx += (dx / dist) * pull * dt;
        vy += (dy / dist) * pull * dt;
        changed = true;
      }
    }

    if (!changed) {
      return vel;
    }

    const speed = Math.hypot(vx, vy);
    const minSpeed = GAME_CONFIG.launchSpeed * 0.85;
    const maxSpeed = GAME_CONFIG.launchSpeed * 1.65;
    if (speed > 0) {
      const clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
      vx = (vx / speed) * clampedSpeed;
      vy = (vy / speed) * clampedSpeed;
    }

    return { x: vx, y: vy };
  }

  private applyGravityWells(dt: number): void {
    const nextVel = this.computeGravityAdjustedVelocity(
      this.ship.position,
      this.ship.velocity,
      dt,
    );
    if (nextVel.x !== this.ship.velocity.x || nextVel.y !== this.ship.velocity.y) {
      this.ship = {
        ...this.ship,
        velocity: nextVel,
        headingAngle: Math.atan2(nextVel.y, nextVel.x),
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
        this.spawnPopup(
          `+${powerLabel.toUpperCase()}`,
          orb.position,
          orb.power === 'PHASE_SHIELD'
            ? '#38bdf8'
            : orb.power === 'CHRONO_AIM'
              ? '#fde047'
              : '#c084fc',
        );
        this.statusMessage = `¡Poder adquirido: ${powerLabel} (Nave MK-${nextTier})! +${GAME_CONFIG.powerUpCollectPoints} pts`;
        this.statusMessageTimer = 2.8;

        events.push({
          type: 'POWERUP_COLLECTED',
          position: orb.position,
          power: orb.power,
          shipTier: nextTier,
          pointsAwarded: GAME_CONFIG.powerUpCollectPoints,
        });

        if (nextTier > prevTier) {
          events.push({
            type: 'SHIP_UPGRADED',
            position: orb.position,
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

        this.spawnPopup(`IMPULSO +${bonus}`, gate.position, '#2dd4bf');
        this.statusMessage = `¡Anillo de Impulso activado! Velocidad x${mult.toFixed(2)} (+${bonus} pts)`;
        this.statusMessageTimer = 2.4;

        events.push({
          type: 'BOOST_GATE_PASSED',
          position: gate.position,
          gateId: gate.id,
          pointsAwarded: bonus,
        });
      }
    }
  }

  private stepFlying(dt: number, events: SimulationEvent[]): void {
    const stage = this.getCurrentStage();

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

    this.checkFlightPowerUpsAndGates(startPos, endPos, events);

    // Portales Wormhole
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

        this.spawnPopup(`PORTAL +${GAME_CONFIG.wormholeBonusPoints}`, exitPos, '#c084fc');
        this.statusMessage = `¡Salto por ${wormhole.name}! +${GAME_CONFIG.wormholeBonusPoints} pts`;
        this.statusMessageTimer = 2.6;

        events.push({
          type: 'WORMHOLE_TRAVERSED',
          position: exitPos,
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
        this.spawnPopup(
          `ESCUDO +${GAME_CONFIG.shieldAbsorbBonusPoints}`,
          firstAsteroid.point,
          '#38bdf8',
        );
        this.statusMessage = `¡Escudo de Fase pulverizó el asteroide! +${GAME_CONFIG.shieldAbsorbBonusPoints} pts`;
        this.statusMessageTimer = 2.6;
        events.push({
          type: 'SHIELD_ABSORBED_HIT',
          position: firstAsteroid.point,
          asteroidId: firstAsteroid.asteroid.id,
          pointsAwarded: GAME_CONFIG.shieldAbsorbBonusPoints,
        });

        if (firstCapture !== null) {
          this.capturePlanet(
            firstCapture.planet,
            firstCapture.point,
            firstCapture.centerDistAtEnd,
            events,
          );
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
      this.capturePlanet(
        firstCapture.planet,
        firstCapture.point,
        firstCapture.centerDistAtEnd,
        events,
      );
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
    centerDistAtEnd: number,
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

    // ¿Fue una Captura Perfecta (Bullseye) cercana al anillo orbital ideal?
    const isPerfectCapture =
      Math.abs(centerDistAtEnd - planet.orbitRadius) <= GAME_CONFIG.perfectCaptureTolerance;

    this.ship = {
      ...this.ship,
      mode: 'ORBITING',
      dashAvailableThisFlight: false,
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

    events.push({
      type: 'PLANET_CAPTURED',
      planetId: planet.id,
      position: exactEntryPos,
    });

    if (isPerfectCapture) {
      this.perfectCapturesCount += 1;
      this.addScore(GAME_CONFIG.perfectCaptureBonusPoints);
      this.remainingTime = Math.min(
        GAME_CONFIG.maxMatchCapSeconds,
        this.remainingTime + GAME_CONFIG.perfectCaptureTimeBonusSeconds,
      );
      this.spawnPopup(
        `PERFECTO! +${GAME_CONFIG.perfectCaptureBonusPoints}`,
        planet.position,
        '#fde047',
      );
      events.push({
        type: 'PERFECT_CAPTURE',
        planetId: planet.id,
        position: planet.position,
        pointsAwarded: GAME_CONFIG.perfectCaptureBonusPoints,
      });
    }

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
        position: planet.position,
        deliveryNumber: this.deliveriesCompleted,
        sectorNumber: stage.sectorNumber,
        pointsAwarded: deliveryPoints,
      });

      if (this.deliveriesCompleted >= this.totalDeliveriesGoal) {
        const timeBonus = calculateTimeBonus(this.remainingTime);
        this.timeBonusPoints = timeBonus;
        this.addScore(timeBonus);
        this.statusMessage = `¡Campaña completada! +${deliveryPoints} pts (Bonus tiempo: +${timeBonus})`;
        this.statusMessageTimer = 4.0;
        this.finishMatch('DELIVERIES_COMPLETED', events);
        return;
      }

      if (
        this.sectorDeliveriesCompleted >= this.getCurrentSectorGoal() &&
        this.currentStageIndex + 1 < this.stages.length
      ) {
        const nextStageIndex = this.currentStageIndex + 1;
        const prevTier = this.ship.tier;
        const upgradedTier = Math.min(3, Math.max(prevTier, nextStageIndex + 1)) as ShipTier;

        const nextPowers: ShipPowersState = {
          phaseShield: true,
          chronoAimTimer:
            upgradedTier >= 3
              ? Math.max(this.ship.powers.chronoAimTimer, GAME_CONFIG.chronoAimDurationSeconds)
              : this.ship.powers.chronoAimTimer,
          magnetarTimer: this.ship.powers.magnetarTimer,
        };

        this.setupStageState(nextStageIndex, upgradedTier, nextPowers);
        this.armoryChoiceAvailable = true;

        const nextStage = this.getCurrentStage();
        const nextTarget = this.getPlanetById(this.getTargetPlanetId());

        this.remainingTime = Math.min(
          GAME_CONFIG.maxMatchCapSeconds,
          this.remainingTime + GAME_CONFIG.sectorClearTimeBonusSeconds,
        );

        this.spawnPopup(
          `SECTOR ${nextStage.sectorNumber} · MK-${upgradedTier}`,
          this.ship.position,
          '#34d399',
        );
        this.statusMessage = `¡Sector ${nextStage.sectorNumber}: ${nextStage.name} · Nave MK-${upgradedTier} equipada! +${GAME_CONFIG.sectorClearTimeBonusSeconds}s · Destino: ${nextTarget.name}`;
        this.statusMessageTimer = 4.0;

        if (upgradedTier > prevTier) {
          events.push({
            type: 'SHIP_UPGRADED',
            position: this.ship.position,
            shipTier: upgradedTier,
          });
        }

        events.push({
          type: 'SECTOR_ADVANCED',
          position: this.ship.position,
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
      const perfectTag = isPerfectCapture ? '¡Captura Perfecta! ' : '';
      this.statusMessage = `${perfectTag}Escala en ${planet.name}. Destino actual: ${target.name}`;
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
      this.spawnPopup(`-${GAME_CONFIG.failureTimePenaltySeconds}S IMPACTO`, contactPos, '#f43f5e');
      this.statusMessage = `¡Impacto con asteroide! ${penaltyText} · Volviendo a ${safePlanet.name}`;
      events.push({
        type: 'SHIP_ASTEROID_HIT',
        position: contactPos,
        planetId: safePlanet.id,
        asteroidId,
      });
    } else {
      this.outOfBoundsCount += 1;
      this.spawnPopup(`-${GAME_CONFIG.failureTimePenaltySeconds}S DESVÍO`, contactPos, '#f43f5e');
      this.statusMessage = `Desvío fuera de sector ${penaltyText} · Volviendo a ${safePlanet.name}`;
      events.push({
        type: 'SHIP_OUT_OF_BOUNDS',
        position: contactPos,
        planetId: safePlanet.id,
      });
    }

    this.statusMessageTimer = 2.5;

    this.ship = {
      ...this.ship,
      mode: 'RECOVERING',
      dashAvailableThisFlight: false,
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
    this.armoryChoiceAvailable = false;
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
      dashAvailableThisFlight: false,
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

    events.push({
      type: 'SHIP_RECOVERED',
      planetId: safePlanet.id,
      position: restoredPos,
    });
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
        points: [this.ship.position],
      };
    }

    const direction = computeOrbitTangent(this.ship.orbitAngle, this.ship.orbitDirection);
    const guideLength =
      this.ship.powers.chronoAimTimer > 0
        ? GAME_CONFIG.aimGuideLength * GAME_CONFIG.chronoAimGuideLengthMultiplier
        : GAME_CONFIG.aimGuideLength;

    // Simular puntos de la trayectoria teniendo en cuenta pozos gravitacionales
    const sampleSteps = this.ship.powers.chronoAimTimer > 0 ? 16 : 12;
    const launchSpeed = this.getEffectiveLaunchSpeed();
    const totalSimTime = guideLength / launchSpeed;
    const stepDt = totalSimTime / sampleSteps;

    const points: Vector2D[] = [this.ship.position];
    let simPos: Vector2D = this.ship.position;
    let simVel: Vector2D = {
      x: direction.x * launchSpeed,
      y: direction.y * launchSpeed,
    };

    for (let i = 0; i < sampleSteps; i += 1) {
      simVel = this.computeGravityAdjustedVelocity(simPos, simVel, stepDt);
      simPos = {
        x: simPos.x + simVel.x * stepDt,
        y: simPos.y + simVel.y * stepDt,
      };
      points.push(simPos);
    }

    const endPoint = points[points.length - 1];

    return {
      active: true,
      origin: this.ship.position,
      direction,
      endPoint,
      points,
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
      perfectCapturesCount: this.perfectCapturesCount,
      dashCount: this.dashCount,
      armoryChoiceAvailable: this.armoryChoiceAvailable,
      lastDeliveryPoints: this.lastDeliveryPoints,
      timeBonusPoints: this.timeBonusPoints,
      gameOverReason: this.gameOverReason,
      jumpCount: this.jumpCount,
      outOfBoundsCount: this.outOfBoundsCount,
      asteroidHitsCount: this.asteroidHitsCount,
      deliveryEffect: this.deliveryEffect,
      floatingPopups: this.floatingPopups,
      statusMessage: this.statusMessage,
      statusMessageTimer: this.statusMessageTimer,
      activeAsteroids: this.getActiveAsteroids(),
      activePowerUpOrbs: this.getActivePowerUpOrbs(),
      activatedGateIds: Array.from(this.activatedGateIds),
      stage: currentStage,
    };
  }
}
