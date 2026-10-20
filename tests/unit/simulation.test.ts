import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { CAMPAIGN_STAGES, STAGE_1 } from '../../src/config/stage1';
import { SimulationEngine } from '../../src/core/simulation';
import { StageDefinition } from '../../src/types/game';

describe('SimulationEngine - Mecánica, Partida Completa y Campaña de Sectores', () => {
  it('inicia orbitando el planeta base con la guía de dirección desactivada', () => {
    const engine = new SimulationEngine(STAGE_1);
    const snap = engine.getSnapshot();

    expect(snap.appState).toBe('PLAYING');
    expect(snap.ship.mode).toBe('ORBITING');
    expect(snap.ship.currentPlanetId).toBe('p-base');
    expect(snap.aimGuide.active).toBe(false);
    expect(snap.targetPlanetId).toBe(STAGE_1.targetSequence[0]);
    expect(snap.remainingTime).toBe(GAME_CONFIG.matchDurationSeconds);
  });

  it('permite iniciar en estado START y transicionar a PLAYING con START_GAME', () => {
    const engine = new SimulationEngine(STAGE_1, {
      initialAppState: 'START',
      initialHighScore: 900,
    });
    expect(engine.getSnapshot().appState).toBe('START');
    expect(engine.getSnapshot().highScore).toBe(900);

    engine.step(1.0);
    expect(engine.getSnapshot().remainingTime).toBe(GAME_CONFIG.matchDurationSeconds);

    const events = engine.handleInput({ type: 'START_GAME' });
    expect(events.some((e) => e.type === 'GAME_STARTED')).toBe(true);
    expect(engine.getSnapshot().appState).toBe('PLAYING');
  });

  it('avanza la posición orbital mientras se mantiene presionado y actualiza la guía tangencial', () => {
    const engine = new SimulationEngine(STAGE_1);
    const initialSnap = engine.getSnapshot();

    engine.handleInput({ type: 'AIM_START' });
    const aimingSnap1 = engine.getSnapshot();
    expect(aimingSnap1.aimGuide.active).toBe(true);

    engine.step(0.25);
    const aimingSnap2 = engine.getSnapshot();

    expect(aimingSnap2.ship.mode).toBe('ORBITING');
    expect(aimingSnap2.ship.orbitAngle).toBeGreaterThan(initialSnap.ship.orbitAngle);
    expect(aimingSnap2.aimGuide.active).toBe(true);
    expect(aimingSnap2.aimGuide.origin.x).toBeCloseTo(aimingSnap2.ship.position.x, 5);
    expect(aimingSnap2.aimGuide.origin.y).toBeCloseTo(aimingSnap2.ship.position.y, 5);
    expect(aimingSnap2.aimGuide.direction.x).not.toBeCloseTo(aimingSnap1.aimGuide.direction.x, 3);
  });

  it('cancelar el gesto (AIM_CANCEL) oculta la guía y NUNCA lanza la nave', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.handleInput({ type: 'AIM_START' });
    engine.step(0.1);
    expect(engine.getSnapshot().aimGuide.active).toBe(true);

    const events = engine.handleInput({ type: 'AIM_CANCEL' });
    const snap = engine.getSnapshot();

    expect(events).toHaveLength(0);
    expect(snap.aimGuide.active).toBe(false);
    expect(snap.ship.mode).toBe('ORBITING');
    expect(snap.jumpCount).toBe(0);

    const releaseAfterCancel = engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });
    expect(releaseAfterCancel).toHaveLength(0);
    expect(engine.getSnapshot().ship.mode).toBe('ORBITING');
  });

  it('lanza la nave tangencialmente al soltar y bloquea recaptura inmediata del planeta de origen', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.handleInput({ type: 'AIM_START' });
    const beforeLaunch = engine.getSnapshot();

    const events = engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });
    const afterLaunch = engine.getSnapshot();

    expect(events.some((e) => e.type === 'SHIP_LAUNCHED')).toBe(true);
    expect(afterLaunch.ship.mode).toBe('FLYING');
    expect(afterLaunch.ship.currentPlanetId).toBeNull();
    expect(afterLaunch.ship.originPlanetLockedId).toBe('p-base');
    expect(afterLaunch.jumpCount).toBe(1);

    const speed = Math.hypot(afterLaunch.ship.velocity.x, afterLaunch.ship.velocity.y);
    expect(speed).toBeCloseTo(GAME_CONFIG.launchSpeed, 4);
    expect(afterLaunch.ship.velocity.x / speed).toBeCloseTo(beforeLaunch.aimGuide.direction.x, 5);
    expect(afterLaunch.ship.velocity.y / speed).toBeCloseTo(beforeLaunch.aimGuide.direction.y, 5);

    const stepEvents = engine.step(GAME_CONFIG.fixedTimeStep);
    expect(stepEvents.some((e) => e.type === 'PLANET_CAPTURED')).toBe(false);
    expect(engine.getSnapshot().ship.mode).toBe('FLYING');
  });

  it('rehabilita la captura del planeta de origen solo tras superar captureRadius + margen', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    let unlocked = false;
    for (let i = 0; i < 30; i += 1) {
      const ev = engine.step(GAME_CONFIG.fixedTimeStep);
      if (ev.some((e) => e.type === 'ORIGIN_UNLOCKED')) {
        unlocked = true;
        break;
      }
    }

    expect(unlocked).toBe(true);
    expect(engine.getSnapshot().ship.originPlanetLockedId).toBeNull();
  });

  it('ignora intentos de lanzamiento repetidos mientras la nave ya está volando', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });
    expect(engine.getSnapshot().jumpCount).toBe(1);

    engine.handleInput({ type: 'AIM_START' });
    const duplicateEvents = engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    expect(duplicateEvents).toHaveLength(0);
    expect(engine.getSnapshot().jumpCount).toBe(1);
    expect(engine.getSnapshot().aimGuide.active).toBe(false);
  });

  it('captura un planeta destino sin duplicación, incrementa combo/puntuación y asigna el siguiente', () => {
    const customStage: StageDefinition = {
      id: 'test-capture',
      name: 'Escenario de Prueba',
      sectorNumber: 1,
      difficultyLabel: 'Prueba',
      deliveriesRequired: 3,
      worldWidth: 540,
      worldHeight: 960,
      startPlanetId: 'p1',
      startOrbitAngle: 0,
      startOrbitDirection: -1,
      targetSequence: ['p2', 'p1', 'p2'],
      planets: [
        {
          id: 'p1',
          name: 'Origen',
          position: { x: 270, y: 700 },
          visualRadius: 24,
          orbitRadius: 40,
          captureRadius: 65,
          angularSpeed: 2.0,
          color: '#38bdf8',
          accentColor: '#bae6fd',
        },
        {
          id: 'p2',
          name: 'Destino Norte',
          position: { x: 310, y: 420 },
          visualRadius: 26,
          orbitRadius: 44,
          captureRadius: 70,
          angularSpeed: 2.0,
          color: '#fbbf24',
          accentColor: '#fde68a',
        },
      ],
      asteroids: [],
    };

    const engine = new SimulationEngine(customStage);
    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    let deliveryEvents = 0;
    for (let i = 0; i < 60; i += 1) {
      const events = engine.step(GAME_CONFIG.fixedTimeStep);
      deliveryEvents += events.filter((e) => e.type === 'DELIVERY_COMPLETED').length;
    }

    const snap = engine.getSnapshot();
    expect(deliveryEvents).toBe(1);
    expect(snap.ship.mode).toBe('ORBITING');
    expect(snap.ship.currentPlanetId).toBe('p2');
    expect(snap.deliveriesCompleted).toBe(1);
    expect(snap.combo).toBe(1);
    expect(snap.score).toBe(GAME_CONFIG.baseDeliveryPoints);
    expect(snap.targetPlanetId).toBe('p1');
  });

  it('elige planeta de forma determinista cuando dos zonas de captura están superpuestas', () => {
    const createOverlapStage = (reverseArrayOrder: boolean): StageDefinition => {
      const planets = [
        {
          id: 'p-start',
          name: 'Salida',
          position: { x: 270, y: 800 },
          visualRadius: 24,
          orbitRadius: 40,
          captureRadius: 60,
          angularSpeed: 2.0,
          color: '#38bdf8',
          accentColor: '#bae6fd',
        },
        {
          id: 'p-alpha',
          name: 'Alfa',
          position: { x: 300, y: 550 },
          visualRadius: 24,
          orbitRadius: 40,
          captureRadius: 75,
          angularSpeed: 2.0,
          color: '#fb7185',
          accentColor: '#fecdd3',
        },
        {
          id: 'p-beta',
          name: 'Beta',
          position: { x: 320, y: 550 },
          visualRadius: 24,
          orbitRadius: 40,
          captureRadius: 75,
          angularSpeed: 2.0,
          color: '#34d399',
          accentColor: '#a7f3d0',
        },
      ];

      return {
        id: 'overlap-stage',
        name: 'Overlap',
        sectorNumber: 1,
        difficultyLabel: 'Test',
        deliveriesRequired: 1,
        worldWidth: 540,
        worldHeight: 960,
        startPlanetId: 'p-start',
        startOrbitAngle: 0,
        startOrbitDirection: -1,
        targetSequence: ['p-alpha'],
        planets: reverseArrayOrder ? [planets[0], planets[2], planets[1]] : planets,
        asteroids: [],
      };
    };

    const engineNormal = new SimulationEngine(createOverlapStage(false));
    const engineReversed = new SimulationEngine(createOverlapStage(true));

    engineNormal.handleInput({ type: 'AIM_START' });
    engineNormal.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    engineReversed.handleInput({ type: 'AIM_START' });
    engineReversed.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    for (let i = 0; i < 60; i += 1) {
      engineNormal.step(GAME_CONFIG.fixedTimeStep);
      engineReversed.step(GAME_CONFIG.fixedTimeStep);
    }

    expect(engineNormal.getSnapshot().ship.currentPlanetId).toBe('p-alpha');
    expect(engineReversed.getSnapshot().ship.currentPlanetId).toBe('p-alpha');
  });

  it('detecta colisión continua con un asteroide, aplica penalización única, reinicia combo y recupera en el último planeta seguro', () => {
    const asteroidStage: StageDefinition = {
      id: 'asteroid-test',
      name: 'Campo de Asteroides',
      sectorNumber: 1,
      difficultyLabel: 'Test',
      deliveriesRequired: 1,
      worldWidth: 540,
      worldHeight: 960,
      startPlanetId: 'p1',
      startOrbitAngle: 0,
      startOrbitDirection: -1,
      targetSequence: ['p2'],
      planets: [
        {
          id: 'p1',
          name: 'Base',
          position: { x: 270, y: 700 },
          visualRadius: 24,
          orbitRadius: 40,
          captureRadius: 65,
          angularSpeed: 2.0,
          color: '#38bdf8',
          accentColor: '#bae6fd',
        },
        {
          id: 'p2',
          name: 'Meta',
          position: { x: 310, y: 300 },
          visualRadius: 26,
          orbitRadius: 44,
          captureRadius: 70,
          angularSpeed: 2.0,
          color: '#fbbf24',
          accentColor: '#fde68a',
        },
      ],
      asteroids: [
        {
          id: 'ast-blocker',
          position: { x: 310, y: 540 },
          radius: 22,
        },
      ],
    };

    const engine = new SimulationEngine(asteroidStage);
    const timeBefore = engine.getSnapshot().remainingTime;
    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    let asteroidHitEvents = 0;
    let simulatedTime = 0;
    for (let i = 0; i < 90; i += 1) {
      const ev = engine.step(GAME_CONFIG.fixedTimeStep);
      simulatedTime += GAME_CONFIG.fixedTimeStep;
      asteroidHitEvents += ev.filter((e) => e.type === 'SHIP_ASTEROID_HIT').length;
    }

    const snap = engine.getSnapshot();
    expect(asteroidHitEvents).toBe(1);
    expect(snap.asteroidHitsCount).toBe(1);
    expect(snap.combo).toBe(0);
    expect(snap.remainingTime).toBeCloseTo(
      timeBefore - simulatedTime - GAME_CONFIG.failureTimePenaltySeconds,
      4,
    );
    expect(snap.ship.mode).toBe('ORBITING');
    expect(snap.ship.currentPlanetId).toBe('p1');
  });

  it('detecta salida del escenario una sola vez, aplica penalización única y recupera la nave', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    let outEventsCount = 0;
    let enteredRecovery = false;

    for (let i = 0; i < 120; i += 1) {
      const ev = engine.step(GAME_CONFIG.fixedTimeStep);
      outEventsCount += ev.filter((e) => e.type === 'SHIP_OUT_OF_BOUNDS').length;
      if (engine.getSnapshot().ship.mode === 'RECOVERING') {
        enteredRecovery = true;
      }
    }

    expect(enteredRecovery).toBe(true);
    expect(outEventsCount).toBe(1);
    expect(engine.getSnapshot().outOfBoundsCount).toBe(1);

    const finalSnap = engine.getSnapshot();
    expect(finalSnap.ship.mode).toBe('ORBITING');
    expect(finalSnap.ship.currentPlanetId).toBe('p-base');
  });

  it('termina la partida inmediatamente si la penalización por fallo agota el tiempo restante', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.step(GAME_CONFIG.matchDurationSeconds - 2.0);
    expect(engine.getSnapshot().appState).toBe('PLAYING');

    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });

    let finishedByTime = false;
    for (let i = 0; i < 60; i += 1) {
      const ev = engine.step(GAME_CONFIG.fixedTimeStep);
      if (
        ev.some(
          (e) => e.type === 'GAME_FINISHED' && e.gameOverReason === 'TIME_EXPIRED',
        )
      ) {
        finishedByTime = true;
        break;
      }
    }

    expect(finishedByTime).toBe(true);
    expect(engine.getSnapshot().appState).toBe('RESULT');
    expect(engine.getSnapshot().remainingTime).toBe(0);
    expect(engine.getSnapshot().gameOverReason).toBe('TIME_EXPIRED');
  });

  it('pausa, reanuda y reinicia limpiamente sin consumir cuenta regresiva durante la pausa', () => {
    const engine = new SimulationEngine(STAGE_1);
    engine.step(0.5);
    const remainingBeforePause = engine.getSnapshot().remainingTime;
    const angleBeforePause = engine.getSnapshot().ship.orbitAngle;

    engine.handleInput({ type: 'AIM_START' });
    engine.handleInput({ type: 'PAUSE_GAME', reason: 'visibility' });

    const pausedSnap = engine.getSnapshot();
    expect(pausedSnap.appState).toBe('PAUSED');
    expect(pausedSnap.aimGuide.active).toBe(false);

    engine.step(5.0);
    expect(engine.getSnapshot().remainingTime).toBeCloseTo(remainingBeforePause, 6);
    expect(engine.getSnapshot().ship.orbitAngle).toBeCloseTo(angleBeforePause, 6);

    engine.handleInput({ type: 'RESUME_GAME' });
    expect(engine.getSnapshot().appState).toBe('PLAYING');
    engine.step(0.2);
    expect(engine.getSnapshot().remainingTime).toBeCloseTo(remainingBeforePause - 0.2, 5);

    engine.handleInput({ type: 'RESTART_GAME' });
    const restarted = engine.getSnapshot();
    expect(restarted.elapsedTime).toBe(0);
    expect(restarted.remainingTime).toBe(GAME_CONFIG.matchDurationSeconds);
    expect(restarted.jumpCount).toBe(0);
    expect(restarted.deliveriesCompleted).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.combo).toBe(0);
    expect(restarted.ship.currentPlanetId).toBe('p-base');
  });

  it('progresa a través de los 3 sectores de CAMPAIGN_STAGES de forma resoluble y sin chocar con asteroides', () => {
    const engine = new SimulationEngine(CAMPAIGN_STAGES);

    const launchToPlanetInCurrentStage = (targetId: string): boolean => {
      for (let tick = 0; tick < 300; tick += 1) {
        engine.handleInput({ type: 'AIM_START' });
        const snap = engine.getSnapshot();
        const targetPlanet = snap.stage.planets.find((p) => p.id === targetId);
        if (!targetPlanet) return false;

        const toTargetX = targetPlanet.position.x - snap.ship.position.x;
        const toTargetY = targetPlanet.position.y - snap.ship.position.y;
        const dist = Math.hypot(toTargetX, toTargetY);
        const dirX = toTargetX / dist;
        const dirY = toTargetY / dist;
        const dot =
          snap.aimGuide.direction.x * dirX + snap.aimGuide.direction.y * dirY;

        if (dot > 0.992) {
          const prevDeliveries = snap.deliveriesCompleted;
          engine.handleInput({ type: 'AIM_RELEASE_LAUNCH' });
          for (let flyTick = 0; flyTick < 140; flyTick += 1) {
            engine.step(GAME_CONFIG.fixedTimeStep);
            const currentSnap = engine.getSnapshot();
            if (currentSnap.deliveriesCompleted > prevDeliveries) {
              return true;
            }
            if (currentSnap.ship.mode === 'ORBITING') {
              return currentSnap.ship.currentPlanetId === targetId;
            }
            if (currentSnap.ship.mode === 'RECOVERING') {
              return false;
            }
          }
          return false;
        }
        engine.step(GAME_CONFIG.fixedTimeStep);
      }
      return false;
    };

    // Sector 1: p-base -> p-relay-east (meta del Sector 1) -> avanza automáticamente al Sector 2
    expect(engine.getSnapshot().currentSectorNumber).toBe(1);
    expect(launchToPlanetInCurrentStage('p-relay-east')).toBe(true);
    expect(engine.getSnapshot().deliveriesCompleted).toBe(1);
    expect(engine.getSnapshot().currentSectorNumber).toBe(2);
    expect(engine.getSnapshot().stage.id).toBe('stage-2-cinturon-cobalto');

    // Sector 2: s2-base -> escala en s2-mid-center -> s2-high-east (meta del Sector 2) -> avanza al Sector 3
    expect(launchToPlanetInCurrentStage('s2-mid-center')).toBe(true);
    expect(launchToPlanetInCurrentStage('s2-high-east')).toBe(true);
    expect(engine.getSnapshot().deliveriesCompleted).toBe(2);
    expect(engine.getSnapshot().currentSectorNumber).toBe(3);
    expect(engine.getSnapshot().stage.id).toBe('stage-3-tormenta-esmeralda');

    // Sector 3: s3-base -> s3-step-west -> s3-step-east -> s3-zenith (meta del Sector 3)
    expect(launchToPlanetInCurrentStage('s3-step-west')).toBe(true);
    expect(launchToPlanetInCurrentStage('s3-step-east')).toBe(true);
    expect(launchToPlanetInCurrentStage('s3-zenith')).toBe(true);

    const finalSnap = engine.getSnapshot();
    expect(finalSnap.deliveriesCompleted).toBe(3);
    expect(finalSnap.combo).toBe(3);
    expect(finalSnap.asteroidHitsCount).toBe(0);
    expect(finalSnap.appState).toBe('RESULT');
    expect(finalSnap.gameOverReason).toBe('DELIVERIES_COMPLETED');
    expect(finalSnap.score).toBe(250 + 375 + 500 + finalSnap.timeBonusPoints);
  });
});
