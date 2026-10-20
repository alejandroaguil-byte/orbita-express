import { SimulationEvent } from '../types/game';

/**
 * Sintetizador ligero de efectos de sonido mediante Web Audio API.
 * - No requiere recursos externos.
 * - Solo inicializa o reanuda el AudioContext tras interacción explícita del usuario.
 * - Falla en silencio si el navegador bloquea o no soporta Web Audio.
 */
export class SoundEffectsController {
  private ctx: AudioContext | null = null;
  private muted: boolean;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMuted(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.unlockAudioContext();
      this.playTone(520, 660, 0.07, 'sine', 0.08);
    }
    return this.muted;
  }

  /**
   * Debe llamarse dentro de un gesto del usuario (pointerdown, keydown, click).
   */
  public unlockAudioContext(): void {
    if (this.muted || typeof window === 'undefined') {
      return;
    }

    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) {
          return;
        }
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {
          // Ignorar si el navegador aún no permite reanudar
        });
      }
    } catch {
      // Ignorar errores de audio en entornos sin dispositivo de salida
    }
  }

  public handleSimulationEvents(events: readonly SimulationEvent[]): void {
    if (this.muted || events.length === 0) {
      return;
    }

    for (const ev of events) {
      switch (ev.type) {
        case 'SHIP_LAUNCHED':
          this.playTone(280, 540, 0.09, 'triangle', 0.11);
          break;
        case 'PLANET_CAPTURED':
          this.playTone(420, 500, 0.06, 'sine', 0.08);
          break;
        case 'DELIVERY_COMPLETED':
          this.playChord([523.25, 659.25, 783.99], 0.16, 0.1);
          break;
        case 'SECTOR_ADVANCED':
          this.playChord([587.33, 739.99, 880], 0.22, 0.11);
          break;
        case 'SHIP_ASTEROID_HIT':
        case 'SHIP_OUT_OF_BOUNDS':
          this.playTone(190, 95, 0.18, 'sawtooth', 0.1);
          break;
        case 'GAME_FINISHED':
          if (ev.gameOverReason === 'DELIVERIES_COMPLETED') {
            this.playChord([523.25, 659.25, 783.99, 1046.5], 0.25, 0.11);
          } else {
            this.playTone(240, 120, 0.24, 'triangle', 0.1);
          }
          break;
      }
    }
  }

  private playTone(
    startFreq: number,
    endFreq: number,
    durationSec: number,
    type: OscillatorType,
    maxGain: number,
  ): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      return;
    }

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationSec);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(maxGain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + durationSec + 0.01);
    } catch {
      // Fallo silencioso ante cualquier restricción del navegador
    }
  }

  private playChord(frequencies: readonly number[], durationSec: number, maxGain: number): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      return;
    }

    for (const freq of frequencies) {
      this.playTone(freq, freq * 1.01, durationSec, 'sine', maxGain / frequencies.length);
    }
  }
}
