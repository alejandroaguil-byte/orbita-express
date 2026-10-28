import { AppState, SimulationEvent } from '../types/game';
import {
  getSectorMusicTheme,
  getSixteenthNoteDuration,
  midiToFrequency,
} from './spaceMusic';

/**
 * Sintetizador de efectos y música electrónica espacial estilo Axiom Verge (Web Audio API).
 * - Cero recursos externos (licencia 100 % propia).
 * - Secuenciador por pasos (bajo analógico, arpegio cristalino y pulso electrónico) que
 *   adapta su BPM y escala armónica según el sector actual (1, 2 o 3).
 * - Solo inicializa o reanuda el AudioContext tras interacción explícita del usuario.
 */
export class SoundEffectsController {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean;
  private currentSector = 1;
  private currentAppState: AppState = 'START';
  private schedulerTimerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.muted) {
      this.stopMusicLoop();
    } else {
      this.unlockAudioContext();
      this.syncMusicState(this.currentAppState, this.currentSector);
    }
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playTone(520, 660, 0.07, 'square', 0.07);
    }
    return this.muted;
  }

  /**
   * Sincroniza el estado de la banda sonora electrónica según el estado del juego y el sector.
   */
  public syncMusicState(appState: AppState, sectorNumber: number): void {
    this.currentAppState = appState;
    this.currentSector = sectorNumber;

    if (this.muted || appState !== 'PLAYING') {
      this.stopMusicLoop();
      return;
    }

    if (this.ctx && this.ctx.state === 'running' && this.schedulerTimerId === null) {
      this.startMusicLoop();
    }
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
        this.noiseBuffer = this.createWhiteNoiseBuffer(this.ctx);
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx
          .resume()
          .then(() => {
            this.syncMusicState(this.currentAppState, this.currentSector);
          })
          .catch(() => {
            // Ignorar si el navegador aún no permite reanudar
          });
      } else if (this.ctx.state === 'running') {
        this.syncMusicState(this.currentAppState, this.currentSector);
      }
    } catch {
      // Ignorar errores de audio en entornos sin dispositivo de salida
    }
  }

  private createWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let seed = 987654321;
    for (let i = 0; i < bufferSize; i += 1) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      output[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  private startMusicLoop(): void {
    if (!this.ctx || this.schedulerTimerId !== null || typeof window === 'undefined') {
      return;
    }

    this.nextNoteTime = this.ctx.currentTime + 0.04;
    this.schedulerTimerId = window.setInterval(() => {
      this.schedulePendingNotes();
    }, 35);
  }

  private stopMusicLoop(): void {
    if (this.schedulerTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  private schedulePendingNotes(): void {
    if (
      this.muted ||
      !this.ctx ||
      this.ctx.state !== 'running' ||
      this.currentAppState !== 'PLAYING'
    ) {
      return;
    }

    const theme = getSectorMusicTheme(this.currentSector);
    const stepDuration = getSixteenthNoteDuration(theme.bpm);
    const lookaheadSeconds = 0.12;

    while (this.nextNoteTime < this.ctx.currentTime + lookaheadSeconds) {
      this.scheduleStepVoices(this.currentStep, this.nextNoteTime, stepDuration, theme);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 16;
    }
  }

  private scheduleStepVoices(
    step: number,
    time: number,
    stepDuration: number,
    theme: ReturnType<typeof getSectorMusicTheme>,
  ): void {
    if (!this.ctx) return;

    const bassMidi = theme.bassSequence[step % theme.bassSequence.length];
    if (bassMidi > 0) {
      const freq = midiToFrequency(bassMidi);
      const isAccent = step % 4 === 0;
      this.scheduleFilteredBassNote(
        freq,
        time,
        stepDuration * 0.85,
        theme.bassFilterCutoff + (isAccent ? 280 : 0),
        isAccent ? 0.055 : 0.038,
      );
    }

    const arpMidi = theme.arpSequence[step % theme.arpSequence.length];
    if (arpMidi > 0) {
      const arpFreq = midiToFrequency(arpMidi);
      this.scheduleArpNote(arpFreq, time, stepDuration * 0.72, 0.024);
      this.scheduleArpNote(arpFreq, time + stepDuration * 1.5, stepDuration * 0.5, 0.009);
    }

    if (step % 4 === 0) {
      this.scheduleKick(time, 0.065);
    }

    if (step % 4 === 2 || step === 15) {
      this.scheduleHiHat(time, step === 15 ? 0.014 : 0.022);
    }
  }

  private scheduleFilteredBassNote(
    freq: number,
    time: number,
    duration: number,
    cutoffHz: number,
    peakGain: number,
  ): void {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.Q.setValueAtTime(4.5, time);
      filter.frequency.setValueAtTime(cutoffHz, time);
      filter.frequency.exponentialRampToValueAtTime(140, time + duration);

      gain.gain.setValueAtTime(0.0008, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + duration + 0.01);
    } catch {
      // Ignorar fallos de scheduling
    }
  }

  private scheduleArpNote(
    freq: number,
    time: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.0005, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0005, time + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + duration + 0.01);
    } catch {
      // Ignorar fallos de scheduling
    }
  }

  private scheduleKick(time: number, peakGain: number): void {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, time);
      osc.frequency.exponentialRampToValueAtTime(34, time + 0.11);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.13);
    } catch {
      // Ignorar fallos de scheduling
    }
  }

  private scheduleHiHat(time: number, peakGain: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(5500, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(peakGain, time);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.045);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(time);
      source.stop(time + 0.05);
    } catch {
      // Ignorar fallos de scheduling
    }
  }

  public handleSimulationEvents(events: readonly SimulationEvent[]): void {
    if (this.muted || events.length === 0) {
      return;
    }

    for (const ev of events) {
      switch (ev.type) {
        case 'SHIP_LAUNCHED':
          this.playTone(260, 580, 0.09, 'square', 0.09);
          break;
        case 'PLANET_CAPTURED':
          this.playTone(390, 520, 0.06, 'triangle', 0.08);
          break;
        case 'DELIVERY_COMPLETED':
          this.playChord([587.33, 739.99, 880], 0.16, 0.1);
          break;
        case 'SECTOR_ADVANCED':
          this.playChord([587.33, 783.99, 932.33, 1174.66], 0.24, 0.11);
          break;
        case 'BOOST_GATE_PASSED':
          this.playChord([523.25, 659.25, 1046.5], 0.14, 0.1);
          break;
        case 'POWERUP_COLLECTED':
        case 'SHIP_UPGRADED':
          this.playChord([440, 554.37, 659.25, 880], 0.18, 0.1);
          break;
        case 'SHIELD_ABSORBED_HIT':
          this.playTone(680, 240, 0.15, 'triangle', 0.11);
          break;
        case 'WORMHOLE_TRAVERSED':
          this.playTone(320, 960, 0.2, 'sine', 0.1);
          break;
        case 'ORBIT_INVERTED':
          this.playTone(480, 360, 0.06, 'triangle', 0.07);
          break;
        case 'SHIP_ASTEROID_HIT':
        case 'SHIP_OUT_OF_BOUNDS':
          this.playTone(170, 62, 0.2, 'sawtooth', 0.11);
          break;
        case 'GAME_FINISHED':
          if (ev.gameOverReason === 'DELIVERIES_COMPLETED') {
            this.playChord([587.33, 739.99, 880, 1174.66], 0.28, 0.12);
          } else {
            this.playTone(220, 90, 0.26, 'sawtooth', 0.1);
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
      gain.gain.linearRampToValueAtTime(maxGain, now + 0.012);
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
      this.playTone(freq, freq * 1.008, durationSec, 'square', maxGain / frequencies.length);
    }
  }
}
