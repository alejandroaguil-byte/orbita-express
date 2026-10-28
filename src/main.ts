import './ui/styles.css';
import { SoundEffectsController } from './audio/soundEffects';
import { GAME_CONFIG } from './config/gameConfig';
import { CAMPAIGN_STAGES } from './config/stage1';
import { SimulationEngine } from './core/simulation';
import { InputController } from './input/inputController';
import { CanvasRenderer } from './render/canvasRenderer';
import { loadPersistedData, savePersistedData } from './storage/storage';
import { GameSnapshot, InputCommand, SimulationEvent } from './types/game';
import { HudOverlay } from './ui/hud';

export interface OrbitaDebugApi {
  getSnapshot: () => GameSnapshot;
  sendCommand: (command: InputCommand) => void;
  stepSimulation: (seconds: number) => void;
}

declare global {
  interface Window {
    __ORBITA_DEBUG__?: OrbitaDebugApi;
  }
}

function bootstrapGame(): void {
  const root = document.getElementById('app-root');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

  if (!root || !canvas) {
    throw new Error('No se encontraron los contenedores principales del juego.');
  }

  const persisted = loadPersistedData();
  let lastSavedHighScore = persisted.highScore;

  const sound = new SoundEffectsController(persisted.audioMuted);
  const engine = new SimulationEngine(CAMPAIGN_STAGES, {
    initialAppState: 'START',
    initialHighScore: persisted.highScore,
  });
  const renderer = new CanvasRenderer(canvas);

  const processSimulationEvents = (
    events: readonly SimulationEvent[],
    snapshot: GameSnapshot,
  ): void => {
    sound.syncMusicState(snapshot.appState, snapshot.currentSectorNumber);
    sound.handleSimulationEvents(events);
    renderer.handleSimulationEvents(events);

    if (snapshot.highScore > lastSavedHighScore) {
      lastSavedHighScore = snapshot.highScore;
      savePersistedData({
        highScore: lastSavedHighScore,
        audioMuted: sound.isMuted(),
      });
    }
  };

  const handleCommand = (command: InputCommand): void => {
    if (
      command.type === 'START_GAME' ||
      command.type === 'AIM_START' ||
      command.type === 'RESUME_GAME' ||
      command.type === 'RESTART_GAME'
    ) {
      sound.unlockAudioContext();
    }

    const events = engine.handleInput(command);
    const snap = engine.getSnapshot();
    processSimulationEvents(events, snap);
    hud.update(snap);
    renderer.render(snap);
  };

  const hud = new HudOverlay(root, {
    onCommand: handleCommand,
    onToggleMute: () => {
      const muted = sound.toggleMuted();
      const snap = engine.getSnapshot();
      sound.syncMusicState(snap.appState, snap.currentSectorNumber);
      savePersistedData({
        highScore: snap.highScore,
        audioMuted: muted,
      });
      return muted;
    },
    isMuted: () => sound.isMuted(),
  });

  const input = new InputController(canvas, handleCommand);

  const handleResize = (): void => {
    renderer.resize();
    renderer.render(engine.getSnapshot());
  };

  window.addEventListener('resize', handleResize);

  let accumulator = 0;
  let lastTimestamp: number | null = null;

  const frame = (timestamp: number): void => {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const rawDelta = Math.max(0, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    const clampedDelta = Math.min(rawDelta, GAME_CONFIG.maxFrameDelta);
    accumulator += clampedDelta;

    while (accumulator >= GAME_CONFIG.fixedTimeStep) {
      const stepEvents = engine.step(GAME_CONFIG.fixedTimeStep);
      if (stepEvents.length > 0) {
        processSimulationEvents(stepEvents, engine.getSnapshot());
      }
      accumulator -= GAME_CONFIG.fixedTimeStep;
    }

    const snapshot = engine.getSnapshot();
    sound.syncMusicState(snapshot.appState, snapshot.currentSectorNumber);
    hud.update(snapshot);
    renderer.render(snapshot);

    window.requestAnimationFrame(frame);
  };

  window.__ORBITA_DEBUG__ = {
    getSnapshot: () => engine.getSnapshot(),
    sendCommand: (command: InputCommand) => {
      if (command.type === 'AIM_CANCEL' || command.type === 'RESTART_GAME') {
        input.cancelActiveGestures();
      }
      handleCommand(command);
    },
    stepSimulation: (seconds: number) => {
      const ticks = Math.max(1, Math.round(seconds / GAME_CONFIG.fixedTimeStep));
      for (let i = 0; i < ticks; i += 1) {
        const ev = engine.step(GAME_CONFIG.fixedTimeStep);
        if (ev.length > 0) {
          processSimulationEvents(ev, engine.getSnapshot());
        }
      }
      const snap = engine.getSnapshot();
      sound.syncMusicState(snap.appState, snap.currentSectorNumber);
      hud.update(snap);
      renderer.render(snap);
    },
  };

  const initialSnapshot = engine.getSnapshot();
  hud.update(initialSnapshot);
  renderer.render(initialSnapshot);
  window.requestAnimationFrame(frame);
}

bootstrapGame();
