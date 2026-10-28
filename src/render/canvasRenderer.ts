import { GAME_CONFIG } from '../config/gameConfig';
import {
  AsteroidRuntimeState,
  BoostGateDefinition,
  DeliveryEffectState,
  GameSnapshot,
  GravityWellDefinition,
  PlanetDefinition,
  PowerUpOrbRuntimeState,
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

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: readonly StarPoint[];
  private readonly nebulaBands: readonly NebulaBand[];
  private readonly planetSprites = new Map<string, HTMLCanvasElement>();
  private readonly asteroidSprites = new Map<string, HTMLCanvasElement>();
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
    const { ctx, dpr, scale, offsetX, offsetY } = this;
    const cssWidth = this.canvas.width / dpr;
    const cssHeight = this.canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    // Fondo exterior oscuro (vacío CRT)
    ctx.fillStyle = '#040208';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Transformación al espacio de coordenadas lógicas (540 x 960)
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Desplazamiento breve de glitch horizontal si la nave está recuperándose de un impacto
    if (!this.reducedMotion && snapshot.ship.mode === 'RECOVERING') {
      const glitchOffset = Math.round(Math.sin(snapshot.elapsedTime * 60) * 4);
      ctx.translate(glitchOffset, 0);
    }

    this.drawStageBackground(snapshot);

    // 1. Pozos gravitacionales (Sector 3+)
    for (const well of snapshot.stage.gravityWells ?? []) {
      this.drawGravityWell(well, snapshot.elapsedTime);
    }

    // 2. Portales Wormhole (Sector 3+)
    for (const wormhole of snapshot.stage.wormholes ?? []) {
      this.drawWormhole(wormhole, snapshot.elapsedTime);
    }

    // 3. Anillos de impulso (Boost Gates)
    for (const gate of snapshot.stage.boostGates ?? []) {
      const isActivated = snapshot.activatedGateIds.includes(gate.id);
      this.drawBoostGate(gate, isActivated, snapshot.elapsedTime);
    }

    // 4. Cápsulas recolectables de poder (Power-Up Orbs)
    for (const orb of snapshot.activePowerUpOrbs) {
      if (!orb.collected) {
        this.drawPowerUpOrb(orb, snapshot.elapsedTime);
      }
    }

    // 5. Asteroides (estáticos y patrullas móviles)
    for (const asteroid of snapshot.activeAsteroids) {
      if (!asteroid.destroyed) {
        this.drawAsteroid(asteroid, snapshot.elapsedTime);
      }
    }

    // 6. Planetas y zonas de captura
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

    this.drawShipTrail(snapshot);
    this.drawShip(snapshot);
    this.drawCrtScanlines(snapshot);

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

    // Anillos concéntricos de atracción gravitacional
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

    // Partículas orbitales de acreción
    const spin = this.reducedMotion ? 0 : elapsedTime * 2.5;
    for (let i = 0; i < 6; i += 1) {
      const a = spin + (i * Math.PI) / 3;
      const dist = well.coreRadius + 10 + (i % 2) * 12;
      const px = Math.round(Math.cos(a) * dist);
      const py = Math.round(Math.sin(a) * dist);
      ctx.fillStyle = i % 2 === 0 ? '#34d399' : '#c084fc';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // Núcleo oscuro de singularidad
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

    // Línea de enlace cuántico entre entrada y salida
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

    // Anillo exterior del portal de impulso
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

    // Pilones laterales pixel-art
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-4, -r - 2, 8, 5);
    ctx.fillRect(-4, r - 3, 8, 5);

    // Chevrones de aceleración en el centro
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

    // Rombo energético pixel-art
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

    // Núcleo brillante cuadrado
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

    // Si es un asteroide patrulla móvil, mostrar marcador de patrulla desde su posición base
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

    // 1. Zona de captura (captureRadius + magnetarBonus) con estética de escáner retro
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

    // 2. Anillo orbital nominal (orbitRadius)
    ctx.beginPath();
    ctx.arc(x, y, planet.orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isCurrentOrbit
      ? 'rgba(45, 212, 191, 0.72)'
      : 'rgba(226, 232, 240, 0.18)';
    ctx.lineWidth = isCurrentOrbit ? 2 : 1;
    ctx.stroke();

    // 3. Mira cuadrada pixel-art de DESTINO
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

    // 4. Cuerpo del planeta en Pixel-Art con tramado Bayer
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
    const { origin, endPoint, direction } = snapshot.aimGuide;
    const hasChronoAim = snapshot.ship.powers.chronoAimTimer > 0;

    ctx.save();

    const steps = hasChronoAim ? 16 : 12;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const px = Math.round(origin.x + (endPoint.x - origin.x) * t);
      const py = Math.round(origin.y + (endPoint.y - origin.y) * t);
      const box = i === steps ? 6 : 4;
      ctx.fillStyle = i % 2 === 0 ? '#2dd4bf' : '#fde047';
      ctx.fillRect(px - box / 2, py - box / 2, box, box);
    }

    const headLen = 11;
    const angle = Math.atan2(direction.y, direction.x);
    ctx.beginPath();
    ctx.moveTo(endPoint.x, endPoint.y);
    ctx.lineTo(
      endPoint.x - headLen * Math.cos(angle - Math.PI / 6),
      endPoint.y - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      endPoint.x - headLen * Math.cos(angle + Math.PI / 6),
      endPoint.y - headLen * Math.sin(angle + Math.PI / 6),
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

    // Escudo de Fase activo alrededor de la nave
    if (ship.powers.phaseShield) {
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.fill();
      ctx.stroke();
    }

    // Ondas de Pulso Magnetar activo
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

    // Evolución de alerones biomecánicos según el nivel (MK-II y MK-III)
    if (ship.tier >= 2) {
      ctx.fillStyle = ship.tier >= 3 ? '#fde047' : '#38bdf8';
      ctx.fillRect(-7, -12, 8, 3);
      ctx.fillRect(-7, 9, 8, 3);
    }
    if (ship.tier >= 3) {
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(-12, -6, 4, 12);
    }

    // Chasis principal de la nave biomecánica estilo 16-bits
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

    // Cabina / núcleo energético de la nave
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
