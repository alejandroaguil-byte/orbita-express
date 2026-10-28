import { GAME_CONFIG } from '../config/gameConfig';
import {
  AsteroidRuntimeState,
  BoostGateDefinition,
  DeliveryEffectState,
  FloatingPopupState,
  GameSnapshot,
  GravityWellDefinition,
  PlanetDefinition,
  PowerUpOrbRuntimeState,
  SimulationEvent,
  WormholePairDefinition,
} from '../types/game';
import {
  createPixelAsteroidSprite,
  createPixelPlanetSprite,
} from './pixelArtGenerator';

interface StarPoint {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly alpha: number;
}

interface NebulaBand {
  readonly y: number;
  readonly height: number;
  readonly color: string;
}

interface PixelParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: readonly StarPoint[];
  private readonly nebulaBands: readonly NebulaBand[];
  private readonly planetSprites = new Map<string, HTMLCanvasElement>();
  private readonly asteroidSprites = new Map<string, HTMLCanvasElement>();
  private particles: PixelParticle[] = [];
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private lastRenderElapsedTime = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dpr = 1;
  private reducedMotion = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo obtener el contexto 2D del Canvas.');
    }
    this.ctx = context;
    this.stars = this.createDeterministicStars(64);
    this.nebulaBands = this.createBioNebulaBands();
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  private createDeterministicStars(count: number): StarPoint[] {
    const palette = ['#f43f5e', '#38bdf8', '#a855f7', '#2dd4bf', '#fde047', '#e2e8f0'];
    const result: StarPoint[] = [];
    let seed = 421337;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      result.push({
        x: Math.floor(nextRand() * (GAME_CONFIG.worldWidth / 2)) * 2,
        y: Math.floor(nextRand() * (GAME_CONFIG.worldHeight / 2)) * 2,
        size: nextRand() > 0.72 ? 4 : 2,
        color: palette[i % palette.length],
        alpha: 0.25 + nextRand() * 0.6,
      });
    }
    return result;
  }

  private createBioNebulaBands(): NebulaBand[] {
    return [
      { y: 120, height: 96, color: 'rgba(136, 19, 55, 0.14)' },
      { y: 380, height: 120, color: 'rgba(76, 29, 149, 0.14)' },
      { y: 680, height: 110, color: 'rgba(15, 118, 110, 0.12)' },
    ];
  }

  public handleSimulationEvents(events: readonly SimulationEvent[]): void {
    if (this.reducedMotion || events.length === 0) {
      return;
    }

    for (const ev of events) {
      if (ev.type === 'GAME_STARTED') {
        this.particles = [];
        this.shakeTimer = 0;
        continue;
      }

      const pos = ev.position;
      if (!pos) continue;

      switch (ev.type) {
        case 'PERFECT_CAPTURE':
          this.spawnParticleBurst(pos.x, pos.y, 18, ['#fde047', '#fef08a', '#2dd4bf'], 150);
          this.triggerShake(0.14, 3);
          break;
        case 'DELIVERY_COMPLETED':
          this.spawnParticleBurst(pos.x, pos.y, 22, ['#34d399', '#2dd4bf', '#fde047'], 165);
          this.triggerShake(0.18, 4);
          break;
        case 'SHIELD_ABSORBED_HIT':
          this.spawnParticleBurst(pos.x, pos.y, 24, ['#38bdf8', '#fb7185', '#fde047'], 190);
          this.triggerShake(0.22, 5);
          break;
        case 'BOOST_GATE_PASSED':
          this.spawnParticleBurst(pos.x, pos.y, 14, ['#2dd4bf', '#fde047'], 135);
          this.triggerShake(0.1, 2.5);
          break;
        case 'POWERUP_COLLECTED':
          this.spawnParticleBurst(pos.x, pos.y, 16, ['#c084fc', '#38bdf8', '#fde047'], 130);
          break;
        case 'WORMHOLE_TRAVERSED':
          this.spawnParticleBurst(pos.x, pos.y, 20, ['#c084fc', '#2dd4bf', '#f8fafc'], 160);
          this.triggerShake(0.15, 3.5);
          break;
        case 'SHIP_DASHED':
          this.spawnParticleBurst(pos.x, pos.y, 12, ['#38bdf8', '#fde047'], 120);
          break;
        case 'SHIP_ASTEROID_HIT':
        case 'SHIP_OUT_OF_BOUNDS':
          this.spawnParticleBurst(pos.x, pos.y, 20, ['#f43f5e', '#fb923c', '#fde047'], 170);
          this.triggerShake(0.25, 6);
          break;
      }
    }
  }

  private triggerShake(duration: number, intensity: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  private spawnParticleBurst(
    cx: number,
    cy: number,
    count: number,
    palette: readonly string[],
    maxSpeed: number,
  ): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + (i % 3) * 0.18;
      const speed = maxSpeed * (0.45 + ((i * 7) % 10) / 18);
      const life = 0.35 + ((i * 3) % 5) * 0.08;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: i % 2 === 0 ? 4 : 3,
        color: palette[i % palette.length],
        life,
        maxLife: life,
      });
    }
    if (this.particles.length > 120) {
      this.particles = this.particles.slice(this.particles.length - 120);
    }
  }

  private stepVisualEffects(elapsedTime: number): void {
    const dt = Math.max(0, Math.min(0.05, elapsedTime - this.lastRenderElapsedTime));
    this.lastRenderElapsedTime = elapsedTime;
    if (dt <= 0) return;

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    if (this.particles.length > 0) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }
  }

  private getPlanetSprite(planet: PlanetDefinition): HTMLCanvasElement | null {
    const key = `${planet.id}:${planet.color}:${planet.accentColor}`;
    const cached = this.planetSprites.get(key);
    if (cached) {
      return cached;
    }
    const created = createPixelPlanetSprite(planet.id, planet.color, planet.accentColor, 28);
    if (created) {
      this.planetSprites.set(key, created);
    }
    return created;
  }

  private getAsteroidSprite(asteroidId: string): HTMLCanvasElement | null {
    const cached = this.asteroidSprites.get(asteroidId);
    if (cached) {
      return cached;
    }
    const created = createPixelAsteroidSprite(asteroidId, 20);
    if (created) {
      this.asteroidSprites.set(asteroidId, created);
    }
    return created;
  }

  public resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || window.innerWidth);
    const cssHeight = Math.max(1, rect.height || window.innerHeight);

    this.dpr = Math.min(window.devicePixelRatio || 1, GAME_CONFIG.maxDevicePixelRatio);
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);

    const scaleX = cssWidth / GAME_CONFIG.worldWidth;
    const scaleY = cssHeight / GAME_CONFIG.worldHeight;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (cssWidth - GAME_CONFIG.worldWidth * this.scale) * 0.5;
    this.offsetY = (cssHeight - GAME_CONFIG.worldHeight * this.scale) * 0.5;
  }

  public render(snapshot: GameSnapshot): void {
    this.stepVisualEffects(snapshot.elapsedTime);

    const { ctx, dpr, scale, offsetX, offsetY } = this;
    const cssWidth = this.canvas.width / dpr;
    const cssHeight = this.canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#040208';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (!this.reducedMotion) {
      if (snapshot.ship.mode === 'RECOVERING') {
        const glitchOffset = Math.round(Math.sin(snapshot.elapsedTime * 60) * 4);
        ctx.translate(glitchOffset, 0);
      } else if (this.shakeTimer > 0) {
        const shakeX = Math.round(Math.sin(snapshot.elapsedTime * 90) * this.shakeIntensity);
        const shakeY = Math.round(Math.cos(snapshot.elapsedTime * 75) * this.shakeIntensity);
        ctx.translate(shakeX, shakeY);
      }
    }

    this.drawStageBackground(snapshot);

    for (const well of snapshot.stage.gravityWells ?? []) {
      this.drawGravityWell(well, snapshot.elapsedTime);
    }

    for (const wormhole of snapshot.stage.wormholes ?? []) {
      this.drawWormhole(wormhole, snapshot.elapsedTime);
    }

    for (const gate of snapshot.stage.boostGates ?? []) {
      const isActivated = snapshot.activatedGateIds.includes(gate.id);
      this.drawBoostGate(gate, isActivated, snapshot.elapsedTime);
    }

    for (const orb of snapshot.activePowerUpOrbs) {
      if (!orb.collected) {
        this.drawPowerUpOrb(orb, snapshot.elapsedTime);
      }
    }

    for (const asteroid of snapshot.activeAsteroids) {
      if (!asteroid.destroyed) {
        this.drawAsteroid(asteroid, snapshot.elapsedTime);
      }
    }

    const magnetarBonus =
      snapshot.ship.powers.magnetarTimer > 0 ? GAME_CONFIG.magnetarCaptureRadiusBonus : 0;
    for (const planet of snapshot.stage.planets) {
      const isTarget = planet.id === snapshot.targetPlanetId;
      const isCurrentOrbit = planet.id === snapshot.ship.currentPlanetId;
      const isLockedOrigin = planet.id === snapshot.ship.originPlanetLockedId;
      this.drawPlanet(
        planet,
        isTarget,
        isCurrentOrbit,
        isLockedOrigin,
        magnetarBonus,
        snapshot.elapsedTime,
      );
    }

    if (snapshot.deliveryEffect !== null) {
      this.drawDeliveryEffect(snapshot.deliveryEffect);
    }

    if (snapshot.aimGuide.active) {
      this.drawAimGuide(snapshot);
    }

    this.drawParticles();
    this.drawShipTrail(snapshot);
    this.drawShip(snapshot);
    this.drawFloatingPopups(snapshot.floatingPopups);
    this.drawCrtScanlines(snapshot);

    ctx.restore();
  }

  private drawParticles(): void {
    if (this.reducedMotion || this.particles.length === 0) return;
    const { ctx } = this;
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawFloatingPopups(popups: readonly FloatingPopupState[]): void {
    if (popups.length === 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.font = '700 11px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const popup of popups) {
      const alpha = Math.max(0, Math.min(1, popup.timer / popup.duration));
      const x = Math.round(popup.position.x);
      const y = Math.round(popup.position.y);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#040208';
      ctx.fillText(popup.text, x + 1, y + 1);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, x, y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawStageBackground(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { worldWidth, worldHeight } = snapshot.stage;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, worldHeight);
    if (snapshot.currentSectorNumber === 1) {
      bgGrad.addColorStop(0, '#090414');
      bgGrad.addColorStop(0.5, '#0c061a');
      bgGrad.addColorStop(1, '#05020c');
    } else if (snapshot.currentSectorNumber === 2) {
      bgGrad.addColorStop(0, '#070a1c');
      bgGrad.addColorStop(0.5, '#110922');
      bgGrad.addColorStop(1, '#05040f');
    } else {
      bgGrad.addColorStop(0, '#160514');
      bgGrad.addColorStop(0.5, '#0b141a');
      bgGrad.addColorStop(1, '#06030b');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, worldWidth, worldHeight);

    for (const band of this.nebulaBands) {
      ctx.fillStyle = band.color;
      ctx.fillRect(0, band.y, worldWidth, band.height);
    }

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.06)';
    ctx.lineWidth = 1;
    const gridStep = 45;
    for (let gx = gridStep; gx < worldWidth; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, worldHeight);
      ctx.stroke();
    }
    for (let gy = gridStep; gy < worldHeight; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(worldWidth, gy);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(88, 28, 135, 0.22)';
    for (let py = 0; py < worldHeight; py += 24) {
      ctx.fillRect(4, py, 6, 16);
      ctx.fillRect(worldWidth - 10, py, 6, 16);
    }

    for (const star of this.stars) {
      ctx.fillStyle = star.color;
      ctx.globalAlpha = star.alpha;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle =
      snapshot.ship.mode === 'RECOVERING'
        ? 'rgba(244, 63, 94, 0.85)'
        : 'rgba(45, 212, 191, 0.35)';
    ctx.lineWidth = snapshot.ship.mode === 'RECOVERING' ? 3 : 2;
    ctx.strokeRect(2, 2, worldWidth - 4, worldHeight - 4);
  }

  private drawGravityWell(well: GravityWellDefinition, elapsedTime: number): void {
    const { ctx } = this;
    const x = Math.round(well.position.x);
    const y = Math.round(well.position.y);

    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.arc(0, 0, well.influenceRadius, 0, Math.PI * 2);
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, Math.round(well.influenceRadius * 0.6), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
    ctx.stroke();
    ctx.setLineDash([]);

    const spin = this.reducedMotion ? 0 : elapsedTime * 2.5;
    for (let i = 0; i < 6; i += 1) {
      const a = spin + (i * Math.PI) / 3;
      const dist = well.coreRadius + 10 + (i % 2) * 12;
      const px = Math.round(Math.cos(a) * dist);
      const py = Math.round(Math.sin(a) * dist);
      ctx.fillStyle = i % 2 === 0 ? '#34d399' : '#c084fc';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    ctx.beginPath();
    ctx.arc(0, 0, well.coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#05020a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    ctx.font = '700 9px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('VÓRTICE GRAV.', 0, well.coreRadius + 6);

    ctx.restore();
  }

  private drawWormhole(wormhole: WormholePairDefinition, elapsedTime: number): void {
    const { ctx } = this;
    const ex = Math.round(wormhole.entryPosition.x);
    const ey = Math.round(wormhole.entryPosition.y);
    const ox = Math.round(wormhole.exitPosition.x);
    const oy = Math.round(wormhole.exitPosition.y);

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ox, oy);
    ctx.setLineDash([3, 9]);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    const drawPortalNode = (
      px: number,
      py: number,
      label: string,
      ringColor: string,
    ): void => {
      const pulse = this.reducedMotion ? 0 : Math.sin(elapsedTime * 5) * 2;
      ctx.beginPath();
      ctx.arc(px, py, wormhole.radius + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(168, 85, 247, 0.14)';
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px - 8, py - 8, 16, 16);

      ctx.font = '700 9px "Courier New", Courier, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText(label, px, py + wormhole.radius + 5);
    };

    drawPortalNode(ex, ey, 'PORTAL IN', wormhole.color);
    drawPortalNode(ox, oy, 'PORTAL OUT', '#2dd4bf');

    ctx.restore();
  }

  private drawBoostGate(
    gate: BoostGateDefinition,
    isActivated: boolean,
    elapsedTime: number,
  ): void {
    const { ctx } = this;
    const x = Math.round(gate.position.x);
    const y = Math.round(gate.position.y);
    const r = gate.radius;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(gate.angle);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = isActivated ? '#34d399' : '#2dd4bf';
    ctx.lineWidth = 2;
    ctx.fillStyle = isActivated
      ? 'rgba(52, 211, 153, 0.14)'
      : 'rgba(45, 212, 191, 0.08)';
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fde047';
    ctx.fillRect(-4, -r - 2, 8, 5);
    ctx.fillRect(-4, r - 3, 8, 5);

    const shift = this.reducedMotion ? 0 : Math.round(Math.sin(elapsedTime * 8) * 2);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4 + shift, -8);
    ctx.lineTo(5 + shift, 0);
    ctx.lineTo(-4 + shift, 8);
    ctx.stroke();

    ctx.restore();
  }

  private drawPowerUpOrb(orb: PowerUpOrbRuntimeState, elapsedTime: number): void {
    const { ctx } = this;
    const x = Math.round(orb.position.x);
    const y = Math.round(orb.position.y);
    const bob = this.reducedMotion ? 0 : Math.round(Math.sin(elapsedTime * 5) * 2);

    const color =
      orb.power === 'PHASE_SHIELD'
        ? '#38bdf8'
        : orb.power === 'CHRONO_AIM'
          ? '#fde047'
          : '#c084fc';
    const label =
      orb.power === 'PHASE_SHIELD'
        ? 'ESCUDO'
        : orb.power === 'CHRONO_AIM'
          ? 'CRONO'
          : 'MAGNETAR';

    ctx.save();
    ctx.translate(x, y + bob);

    ctx.beginPath();
    ctx.moveTo(0, -orb.radius);
    ctx.lineTo(orb.radius, 0);
    ctx.lineTo(0, orb.radius);
    ctx.lineTo(-orb.radius, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(-4, -4, 8, 8);

    ctx.font = '700 9px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(`+${label}`, 0, orb.radius + 4);

    ctx.restore();
  }

  private drawAsteroid(asteroid: AsteroidRuntimeState, elapsedTime: number): void {
    const { ctx } = this;
    const { x, y } = asteroid.position;
    const r = asteroid.radius;

    ctx.save();

    if (asteroid.isMoving) {
      ctx.beginPath();
      ctx.moveTo(Math.round(asteroid.basePosition.x), Math.round(asteroid.basePosition.y));
      ctx.lineTo(Math.round(x), Math.round(y));
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.translate(Math.round(x), Math.round(y));

    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = asteroid.isMoving
      ? 'rgba(251, 146, 60, 0.78)'
      : 'rgba(244, 63, 94, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    const sprite = this.getAsteroidSprite(asteroid.id);
    if (sprite) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#475569';
      ctx.fill();
    }

    const pulseAlpha = this.reducedMotion ? 0.7 : 0.45 + Math.sin(elapsedTime * 6) * 0.3;
    ctx.fillStyle = asteroid.isMoving
      ? `rgba(251, 146, 60, ${pulseAlpha})`
      : `rgba(251, 113, 133, ${pulseAlpha})`;
    ctx.fillRect(-2, -2, 4, 4);

    ctx.restore();
  }

  private drawPlanet(
    planet: PlanetDefinition,
    isTarget: boolean,
    isCurrentOrbit: boolean,
    isLockedOrigin: boolean,
    magnetarBonus: number,
    elapsedTime: number,
  ): void {
    const { ctx } = this;
    const x = Math.round(planet.position.x);
    const y = Math.round(planet.position.y);
    const pulse = this.reducedMotion ? 0 : Math.round(Math.sin(elapsedTime * 6) * 3);
    const effectiveCaptureRadius = planet.captureRadius + magnetarBonus;

    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, effectiveCaptureRadius, 0, Math.PI * 2);
    ctx.setLineDash(isTarget ? [6, 4] : [3, 6]);
    if (isLockedOrigin) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.lineWidth = 1;
    } else if (isTarget) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.78)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(250, 204, 21, 0.07)';
      ctx.fill();
    } else if (magnetarBonus > 0) {
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.34)';
      ctx.lineWidth = 1.25;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(x, y, planet.orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isCurrentOrbit
      ? 'rgba(45, 212, 191, 0.72)'
      : 'rgba(226, 232, 240, 0.18)';
    ctx.lineWidth = isCurrentOrbit ? 2 : 1;
    ctx.stroke();

    if (isTarget) {
      const boxHalf = effectiveCaptureRadius + 6 + pulse;
      const cornerLen = 14;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.moveTo(x - boxHalf, y - boxHalf + cornerLen);
      ctx.lineTo(x - boxHalf, y - boxHalf);
      ctx.lineTo(x - boxHalf + cornerLen, y - boxHalf);
      ctx.moveTo(x + boxHalf - cornerLen, y - boxHalf);
      ctx.lineTo(x + boxHalf, y - boxHalf);
      ctx.lineTo(x + boxHalf, y - boxHalf + cornerLen);
      ctx.moveTo(x + boxHalf, y + boxHalf - cornerLen);
      ctx.lineTo(x + boxHalf, y + boxHalf);
      ctx.lineTo(x + boxHalf - cornerLen, y + boxHalf);
      ctx.moveTo(x - boxHalf + cornerLen, y + boxHalf);
      ctx.lineTo(x - boxHalf, y + boxHalf);
      ctx.lineTo(x - boxHalf, y + boxHalf - cornerLen);
      ctx.stroke();

      const badgeY = y - effectiveCaptureRadius - 20;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x - 4, badgeY + 4, 8, 4);
      ctx.fillRect(x - 2, badgeY + 8, 4, 4);

      ctx.font = '700 11px "Courier New", Courier, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fef08a';
      ctx.fillText('★ DESTINO', x, badgeY + 2);
    }

    const r = planet.visualRadius;
    const sprite = this.getPlanetSprite(planet);
    if (sprite) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = planet.color;
      ctx.fill();
    }

    if (isTarget) {
      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.font = '700 11px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isTarget ? '#fef08a' : 'rgba(226, 232, 240, 0.85)';
    ctx.fillText(planet.name.toUpperCase(), x, y + planet.orbitRadius + 7);

    ctx.restore();
  }

  private drawDeliveryEffect(effect: DeliveryEffectState): void {
    const { ctx } = this;
    const progress = 1 - Math.max(0, effect.timer / effect.duration);
    const alpha = Math.max(0, 1 - progress);
    const halfSize = Math.round(this.reducedMotion ? 48 : 30 + progress * 54);
    const cx = Math.round(effect.position.x);
    const cy = Math.round(effect.position.y);

    ctx.save();
    ctx.strokeStyle = `rgba(45, 212, 191, ${alpha * 0.9})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - halfSize, cy - halfSize, halfSize * 2, halfSize * 2);

    ctx.font = '700 14px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(167, 243, 208, ${alpha})`;
    const floatOffset = Math.round(this.reducedMotion ? 44 : 34 + progress * 28);
    ctx.fillText(`+${effect.pointsEarned} PTS`, cx, cy - floatOffset);
    ctx.restore();
  }

  private drawAimGuide(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { points, endPoint, direction } = snapshot.aimGuide;

    ctx.save();

    // Renderizar cada nodo muestreado de la trayectoria (incluye curvatura por gravedad)
    for (let i = 1; i < points.length; i += 1) {
      const pt = points[i];
      const px = Math.round(pt.x);
      const py = Math.round(pt.y);
      const box = i === points.length - 1 ? 6 : 4;
      ctx.fillStyle = i % 2 === 0 ? '#2dd4bf' : '#fde047';
      ctx.fillRect(px - box / 2, py - box / 2, box, box);
    }

    const headLen = 11;
    const prevPt = points.length >= 2 ? points[points.length - 2] : snapshot.aimGuide.origin;
    const tipAngle = Math.atan2(endPoint.y - prevPt.y || direction.y, endPoint.x - prevPt.x || direction.x);
    ctx.beginPath();
    ctx.moveTo(endPoint.x, endPoint.y);
    ctx.lineTo(
      endPoint.x - headLen * Math.cos(tipAngle - Math.PI / 6),
      endPoint.y - headLen * Math.sin(tipAngle - Math.PI / 6),
    );
    ctx.lineTo(
      endPoint.x - headLen * Math.cos(tipAngle + Math.PI / 6),
      endPoint.y - headLen * Math.sin(tipAngle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fillStyle = '#fde047';
    ctx.fill();

    ctx.restore();
  }

  private drawShipTrail(snapshot: GameSnapshot): void {
    if (this.reducedMotion) return;
    const { trail, tier } = snapshot.ship;
    if (trail.length < 2) return;

    const { ctx } = this;
    ctx.save();

    for (let i = 0; i < trail.length; i += 1) {
      const pt = trail[i];
      const ratio = (i + 1) / trail.length;
      const size = ratio > 0.6 ? (tier >= 3 ? 5 : 4) : 2;
      ctx.fillStyle =
        i % 2 === 0
          ? `rgba(45, 212, 191, ${ratio * 0.75})`
          : tier >= 2
            ? `rgba(250, 204, 21, ${ratio * 0.7})`
            : `rgba(244, 63, 94, ${ratio * 0.65})`;
      ctx.fillRect(Math.round(pt.x - size / 2), Math.round(pt.y - size / 2), size, size);
    }

    ctx.restore();
  }

  private drawShip(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { ship } = snapshot;

    ctx.save();
    ctx.translate(Math.round(ship.position.x), Math.round(ship.position.y));

    if (ship.powers.phaseShield) {
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.fill();
      ctx.stroke();
    }

    if (ship.powers.magnetarTimer > 0) {
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-14, -14, 28, 28);
    }

    if (ship.mode === 'RECOVERING') {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(-11, -11, 22, 22);
    }

    ctx.rotate(ship.headingAngle);

    if (ship.tier >= 2) {
      ctx.fillStyle = ship.tier >= 3 ? '#fde047' : '#38bdf8';
      ctx.fillRect(-7, -12, 8, 3);
      ctx.fillRect(-7, 9, 8, 3);
    }
    if (ship.tier >= 3) {
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(-12, -6, 4, 12);
    }

    ctx.beginPath();
    ctx.moveTo(14 + (ship.tier - 1) * 2, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-4, 3);
    ctx.lineTo(-8, 9);
    ctx.closePath();

    ctx.fillStyle = ship.mode === 'RECOVERING' ? '#fb7185' : '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      ship.mode === 'FLYING'
        ? '#fde047'
        : ship.tier >= 3
          ? '#34d399'
          : '#2dd4bf';
    ctx.stroke();

    ctx.fillStyle = ship.tier >= 2 ? '#38bdf8' : '#f43f5e';
    ctx.fillRect(-2, -2, 5, 4);

    ctx.restore();
  }

  private drawCrtScanlines(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { worldWidth, worldHeight } = snapshot.stage;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < worldHeight; y += 4) {
      ctx.fillRect(0, y, worldWidth, 2);
    }
    ctx.restore();
  }
}
