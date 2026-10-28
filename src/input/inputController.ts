import { InputCommand } from '../types/game';

export type InputCommandHandler = (command: InputCommand) => void;

/**
 * Controlador unificado de entrada mediante Pointer Events y teclado.
 * Gestiona captura de puntero, cancelación segura, Dash en vuelo y atajos de armería.
 */
export class InputController {
  private readonly surface: HTMLElement;
  private readonly onCommand: InputCommandHandler;
  private activePointerId: number | null = null;
  private isSpaceAiming = false;

  constructor(surface: HTMLElement, onCommand: InputCommandHandler) {
    this.surface = surface;
    this.onCommand = onCommand;
    this.bindEvents();
  }

  private isInteractiveControlTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(target.closest('button, a, input, select, textarea'));
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.isInteractiveControlTarget(event.target)) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (this.activePointerId !== null) {
      return;
    }

    event.preventDefault();
    this.activePointerId = event.pointerId;

    try {
      this.surface.setPointerCapture(event.pointerId);
    } catch {
      // Eventos sintéticos en pruebas pueden no admitir setPointerCapture
    }

    this.onCommand({ type: 'AIM_START' });
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) {
      return;
    }

    event.preventDefault();
    this.releaseActivePointer(event.pointerId);
    this.onCommand({ type: 'AIM_RELEASE_LAUNCH' });
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) {
      return;
    }

    this.releaseActivePointer(event.pointerId);
    this.onCommand({ type: 'AIM_CANCEL' });
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.activePointerId !== null && event.pointerId === this.activePointerId) {
      this.activePointerId = null;
      this.onCommand({ type: 'AIM_CANCEL' });
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      if (this.isInteractiveControlTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (event.repeat || this.isSpaceAiming) {
        return;
      }
      this.isSpaceAiming = true;
      this.onCommand({ type: 'AIM_START' });
      return;
    }

    if ((event.code === 'KeyD' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat) {
      if (this.isInteractiveControlTarget(event.target)) {
        return;
      }
      event.preventDefault();
      this.onCommand({ type: 'FLIGHT_DASH' });
      return;
    }

    if (event.code === 'Digit1' && !event.repeat) {
      if (this.isInteractiveControlTarget(event.target)) {
        return;
      }
      this.onCommand({ type: 'SELECT_SECTOR_UPGRADE', upgradeId: 'SHIELD_OVERCHARGE' });
      return;
    }

    if (event.code === 'Digit2' && !event.repeat) {
      if (this.isInteractiveControlTarget(event.target)) {
        return;
      }
      this.onCommand({ type: 'SELECT_SECTOR_UPGRADE', upgradeId: 'MAGNETAR_CHRONO' });
      return;
    }

    if (event.code === 'KeyR' && !event.repeat) {
      if (this.isInteractiveControlTarget(event.target)) {
        return;
      }
      event.preventDefault();
      this.onCommand({ type: 'FLIP_ORBIT' });
      return;
    }

    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      event.preventDefault();
      this.cancelActiveGestures();
      this.onCommand({ type: 'PAUSE_GAME', reason: 'user' });
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      if (!this.isSpaceAiming) {
        return;
      }
      event.preventDefault();
      this.isSpaceAiming = false;
      this.onCommand({ type: 'AIM_RELEASE_LAUNCH' });
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.cancelActiveGestures();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.cancelActiveGestures();
      this.onCommand({ type: 'PAUSE_GAME', reason: 'visibility' });
    }
  };

  private releaseActivePointer(pointerId: number): void {
    try {
      if (this.surface.hasPointerCapture(pointerId)) {
        this.surface.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignorar si la captura ya fue liberada
    }
    this.activePointerId = null;
  }

  public cancelActiveGestures(): void {
    if (this.activePointerId !== null) {
      this.releaseActivePointer(this.activePointerId);
    }
    this.isSpaceAiming = false;
    this.onCommand({ type: 'AIM_CANCEL' });
  }

  private bindEvents(): void {
    this.surface.addEventListener('pointerdown', this.handlePointerDown);
    this.surface.addEventListener('pointerup', this.handlePointerUp);
    this.surface.addEventListener('pointercancel', this.handlePointerCancel);
    this.surface.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.surface.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public destroy(): void {
    this.surface.removeEventListener('pointerdown', this.handlePointerDown);
    this.surface.removeEventListener('pointerup', this.handlePointerUp);
    this.surface.removeEventListener('pointercancel', this.handlePointerCancel);
    this.surface.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.surface.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
