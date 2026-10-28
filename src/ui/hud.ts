import { GAME_CONFIG } from '../config/gameConfig';
import { InputCommandHandler } from '../input/inputController';
import { AppState, GameSnapshot, ShipMode, ShipState, ShipTier } from '../types/game';

export interface HudCallbacks {
  readonly onCommand: InputCommandHandler;
  readonly onToggleMute: () => boolean;
  readonly isMuted: () => boolean;
}

export class HudOverlay {
  private readonly canvasEl: HTMLElement;
  private readonly sectorEl: HTMLElement;
  private readonly sectorNameEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly deliveriesEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly shipPowersEl: HTMLElement;
  private readonly targetNameEl: HTMLElement;
  private readonly shipStatusEl: HTMLElement;
  private readonly helpBannerEl: HTMLElement;

  private readonly flipOrbitButtonEl: HTMLButtonElement;
  private readonly muteButtonEl: HTMLButtonElement;
  private readonly pauseButtonEl: HTMLButtonElement;
  private readonly restartButtonEl: HTMLButtonElement;

  private readonly startModalEl: HTMLElement;
  private readonly startHighScoreEl: HTMLElement;
  private readonly startButtonEl: HTMLButtonElement;

  private readonly pauseModalEl: HTMLElement;
  private readonly resumeButtonEl: HTMLElement;
  private readonly modalRestartButtonEl: HTMLButtonElement;

  private readonly resultModalEl: HTMLElement;
  private readonly resultBadgeEl: HTMLElement;
  private readonly resultTitleEl: HTMLElement;
  private readonly resultSubtitleEl: HTMLElement;
  private readonly resultDeliveriesEl: HTMLElement;
  private readonly resultScoreEl: HTMLElement;
  private readonly resultHighScoreEl: HTMLElement;
  private readonly resultTimeBonusEl: HTMLElement;
  private readonly playAgainButtonEl: HTMLButtonElement;

  private readonly callbacks: HudCallbacks;
  private lastAppState: AppState | null = null;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;

    this.canvasEl = this.requireElement(root, '#game-canvas');
    this.sectorEl = this.requireElement(root, '#hud-sector');
    this.sectorNameEl = this.requireElement(root, '#hud-sector-name');
    this.timeEl = this.requireElement(root, '#hud-time');
    this.deliveriesEl = this.requireElement(root, '#hud-deliveries');
    this.scoreEl = this.requireElement(root, '#hud-score');
    this.comboEl = this.requireElement(root, '#hud-combo');
    this.shipPowersEl = this.requireElement(root, '#hud-ship-powers');
    this.targetNameEl = this.requireElement(root, '#hud-target-name');
    this.shipStatusEl = this.requireElement(root, '#hud-ship-status');
    this.helpBannerEl = this.requireElement(root, '#hud-help-banner');

    this.flipOrbitButtonEl = this.requireElement(root, '#btn-flip-orbit') as HTMLButtonElement;
    this.muteButtonEl = this.requireElement(root, '#btn-mute') as HTMLButtonElement;
    this.pauseButtonEl = this.requireElement(root, '#btn-pause') as HTMLButtonElement;
    this.restartButtonEl = this.requireElement(root, '#btn-restart') as HTMLButtonElement;

    this.startModalEl = this.requireElement(root, '#start-modal');
    this.startHighScoreEl = this.requireElement(root, '#start-high-score');
    this.startButtonEl = this.requireElement(root, '#btn-start') as HTMLButtonElement;

    this.pauseModalEl = this.requireElement(root, '#pause-modal');
    this.resumeButtonEl = this.requireElement(root, '#btn-resume') as HTMLButtonElement;
    this.modalRestartButtonEl = this.requireElement(
      root,
      '#btn-restart-modal',
    ) as HTMLButtonElement;

    this.resultModalEl = this.requireElement(root, '#result-modal');
    this.resultBadgeEl = this.requireElement(root, '#result-badge');
    this.resultTitleEl = this.requireElement(root, '#result-title');
    this.resultSubtitleEl = this.requireElement(root, '#result-subtitle');
    this.resultDeliveriesEl = this.requireElement(root, '#result-deliveries');
    this.resultScoreEl = this.requireElement(root, '#result-score');
    this.resultHighScoreEl = this.requireElement(root, '#result-high-score');
    this.resultTimeBonusEl = this.requireElement(root, '#result-time-bonus');
    this.playAgainButtonEl = this.requireElement(root, '#btn-play-again') as HTMLButtonElement;

    this.bindButtons();
    this.syncMuteButton(this.callbacks.isMuted());
  }

  private requireElement(root: HTMLElement, selector: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) {
      throw new Error(`Elemento de interfaz no encontrado: ${selector}`);
    }
    return el;
  }

  private focusGameSurface(): void {
    this.canvasEl.focus({ preventScroll: true });
  }

  private syncMuteButton(muted: boolean): void {
    this.muteButtonEl.textContent = muted ? 'Sonido: No' : 'Sonido: Sí';
    this.muteButtonEl.setAttribute('aria-pressed', String(muted));
    this.muteButtonEl.setAttribute(
      'aria-label',
      muted ? 'Activar sonido' : 'Silenciar sonido',
    );
  }

  private bindButtons(): void {
    this.flipOrbitButtonEl.addEventListener('click', () => {
      this.callbacks.onCommand({ type: 'FLIP_ORBIT' });
      this.focusGameSurface();
    });

    this.muteButtonEl.addEventListener('click', () => {
      const nextMuted = this.callbacks.onToggleMute();
      this.syncMuteButton(nextMuted);
      this.focusGameSurface();
    });

    this.startButtonEl.addEventListener('click', () => {
      this.callbacks.onCommand({ type: 'START_GAME' });
      this.focusGameSurface();
    });

    this.pauseButtonEl.addEventListener('click', () => {
      if (this.lastAppState === 'PAUSED') {
        this.callbacks.onCommand({ type: 'RESUME_GAME' });
        this.focusGameSurface();
      } else if (this.lastAppState === 'PLAYING') {
        this.callbacks.onCommand({ type: 'PAUSE_GAME', reason: 'user' });
      }
    });

    this.restartButtonEl.addEventListener('click', () => {
      this.callbacks.onCommand({ type: 'RESTART_GAME' });
      this.focusGameSurface();
    });

    this.resumeButtonEl.addEventListener('click', () => {
      this.callbacks.onCommand({ type: 'RESUME_GAME' });
      this.focusGameSurface();
    });

    this.modalRestartButtonEl.addEventListener('click', () => {
      this.callbacks.onCommand({ type: 'RESTART_GAME' });
      this.focusGameSurface();
    });

    this.playAgainButtonEl.addEventListener('click', () => {
      this.callbacks.onCommand({ type: 'RESTART_GAME' });
      this.focusGameSurface();
    });
  }

  private formatShipMode(mode: ShipMode, aiming: boolean): string {
    if (mode === 'ORBITING') {
      return aiming ? 'Apuntando salida' : 'Orbitando';
    }
    if (mode === 'FLYING') {
      return 'En vuelo';
    }
    return 'Recuperando ruta';
  }

  private formatTierRoman(tier: ShipTier): string {
    if (tier === 3) return 'MK-III';
    if (tier === 2) return 'MK-II';
    return 'MK-I';
  }

  private formatShipPowers(ship: ShipState): string {
    const badges: string[] = [];
    if (ship.powers.phaseShield) {
      badges.push('ESCUDO');
    }
    if (ship.powers.chronoAimTimer > 0) {
      badges.push(`CRONO ${Math.ceil(ship.powers.chronoAimTimer)}s`);
    }
    if (ship.powers.magnetarTimer > 0) {
      badges.push(`MAG ${Math.ceil(ship.powers.magnetarTimer)}s`);
    }
    const powerSuffix = badges.length > 0 ? badges.join('+') : 'Base';
    return `${this.formatTierRoman(ship.tier)} · ${powerSuffix}`;
  }

  public update(snapshot: GameSnapshot): void {
    const targetPlanet = snapshot.stage.planets.find((p) => p.id === snapshot.targetPlanetId);

    this.sectorEl.textContent = `${snapshot.currentSectorNumber} / ${snapshot.totalSectors}`;
    this.sectorNameEl.textContent = `Sector ${snapshot.currentSectorNumber}: ${snapshot.stage.name} (${snapshot.stage.difficultyLabel})`;

    this.timeEl.textContent = `${snapshot.remainingTime.toFixed(1)}s`;
    this.timeEl.classList.toggle('hud-value--low-time', snapshot.remainingTime <= 12);

    this.deliveriesEl.textContent = `${snapshot.deliveriesCompleted} / ${snapshot.totalDeliveriesGoal}`;
    this.scoreEl.textContent = `${snapshot.score}`;

    const displayCombo = Math.max(1, snapshot.combo);
    this.comboEl.textContent = `x${displayCombo}`;
    this.comboEl.classList.toggle('hud-value--combo-active', snapshot.combo >= 2);

    this.shipPowersEl.textContent = this.formatShipPowers(snapshot.ship);

    this.targetNameEl.textContent = targetPlanet ? targetPlanet.name : snapshot.targetPlanetId;
    this.shipStatusEl.textContent = this.formatShipMode(
      snapshot.ship.mode,
      snapshot.aimGuide.active,
    );
    this.shipStatusEl.dataset.mode = snapshot.ship.mode.toLowerCase();

    this.helpBannerEl.textContent = snapshot.statusMessage ?? GAME_CONFIG.initialHelpText;

    const isPaused = snapshot.appState === 'PAUSED';
    this.pauseButtonEl.textContent = isPaused ? 'Continuar' : 'Pausar';
    this.pauseButtonEl.setAttribute('aria-pressed', String(isPaused));
    this.pauseButtonEl.disabled =
      snapshot.appState !== 'PLAYING' && snapshot.appState !== 'PAUSED';
    this.flipOrbitButtonEl.disabled =
      snapshot.appState !== 'PLAYING' || snapshot.ship.mode !== 'ORBITING';

    this.startHighScoreEl.textContent = `${snapshot.highScore}`;

    if (snapshot.appState === 'RESULT') {
      const won = snapshot.gameOverReason === 'DELIVERIES_COMPLETED';
      this.resultBadgeEl.textContent = snapshot.isNewHighScore
        ? '¡Nuevo récord local!'
        : won
          ? 'Campaña completada'
          : 'Tiempo agotado';
      this.resultTitleEl.textContent = won
        ? '¡Reparto exitoso!'
        : 'Se acabó el tiempo';
      this.resultSubtitleEl.textContent = won
        ? `Superaste los ${snapshot.totalSectors} sectores con nave ${this.formatTierRoman(snapshot.ship.tier)} y ${snapshot.remainingTime.toFixed(1)}s de margen.`
        : `Alcanzaste el Sector ${snapshot.currentSectorNumber}/${snapshot.totalSectors} (${snapshot.deliveriesCompleted}/${snapshot.totalDeliveriesGoal} entregas).`;
      this.resultDeliveriesEl.textContent = `${snapshot.deliveriesCompleted} / ${snapshot.totalDeliveriesGoal}`;
      this.resultScoreEl.textContent = `${snapshot.score}`;
      this.resultHighScoreEl.textContent = `${snapshot.highScore}`;
      this.resultTimeBonusEl.textContent = `+${snapshot.timeBonusPoints}`;
    }

    if (snapshot.appState !== this.lastAppState) {
      this.lastAppState = snapshot.appState;

      this.startModalEl.hidden = snapshot.appState !== 'START';
      this.pauseModalEl.hidden = snapshot.appState !== 'PAUSED';
      this.resultModalEl.hidden = snapshot.appState !== 'RESULT';

      if (snapshot.appState === 'START') {
        this.startButtonEl.focus();
      } else if (snapshot.appState === 'PAUSED') {
        this.resumeButtonEl.focus();
      } else if (snapshot.appState === 'RESULT') {
        this.playAgainButtonEl.focus();
      } else {
        this.focusGameSurface();
      }
    }
  }
}
