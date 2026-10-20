import { GAME_CONFIG } from '../config/gameConfig';
import {
  AsteroidDefinition,
  DeliveryEffectState,
  GameSnapshot,
  PlanetDefinition,
} from '../types/game';

interface StarPoint {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: readonly StarPoint[];
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
    this.stars = this.createDeterministicStars(52);
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  private createDeterministicStars(count: number): StarPoint[] {
    const result: StarPoint[] = [];
    let seed = 421337;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      result.push({
        x: nextRand() * GAME_CONFIG.worldWidth,
        y: nextRand() * GAME_CONFIG.worldHeight,
        radius: 0.8 + nextRand() * 1.4,
        alpha: 0.2 + nextRand() * 0.55,
      });
    }
    return result;
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

    // Fondo exterior (letterbox)
    ctx.fillStyle = '#050814';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Transformación al espacio de coordenadas lógicas (540 x 960)
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    this.drawStageBackground(snapshot);

    for (const asteroid of snapshot.stage.asteroids) {
      this.drawAsteroid(asteroid);
    }

    for (const planet of snapshot.stage.planets) {
      const isTarget = planet.id === snapshot.targetPlanetId;
      const isCurrentOrbit = planet.id === snapshot.ship.currentPlanetId;
      const isLockedOrigin = planet.id === snapshot.ship.originPlanetLockedId;
      this.drawPlanet(planet, isTarget, isCurrentOrbit, isLockedOrigin, snapshot.elapsedTime);
    }

    if (snapshot.deliveryEffect !== null) {
      this.drawDeliveryEffect(snapshot.deliveryEffect);
    }

    if (snapshot.aimGuide.active) {
      this.drawAimGuide(snapshot);
    }

    this.drawShipTrail(snapshot);
    this.drawShip(snapshot);

    ctx.restore();
  }

  private drawStageBackground(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { worldWidth, worldHeight } = snapshot.stage;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, worldHeight);
    bgGrad.addColorStop(0, '#091128');
    bgGrad.addColorStop(0.5, '#0b1530');
    bgGrad.addColorStop(1, '#070d1f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, worldWidth, worldHeight);

    for (const star of this.stars) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(226, 232, 240, ${star.alpha})`;
      ctx.fill();
    }

    ctx.strokeStyle =
      snapshot.ship.mode === 'RECOVERING'
        ? 'rgba(251, 113, 133, 0.72)'
        : 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = snapshot.ship.mode === 'RECOVERING' ? 3 : 1.5;
    ctx.strokeRect(2, 2, worldWidth - 4, worldHeight - 4);
  }

  private drawAsteroid(asteroid: AsteroidDefinition): void {
    const { ctx } = this;
    const { x, y } = asteroid.position;
    const r = asteroid.radius;

    ctx.save();
    ctx.translate(x, y);

    // Halo de advertencia discreto para identificar claramente el radio de colisión
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Cuerpo poligonal rocoso inscrito en el radio
    const vertices = 8;
    ctx.beginPath();
    for (let i = 0; i < vertices; i += 1) {
      const angle = (i / vertices) * Math.PI * 2;
      const notch = i % 2 === 0 ? 1.0 : 0.84;
      const vx = Math.cos(angle) * r * notch;
      const vy = Math.sin(angle) * r * notch;
      if (i === 0) {
        ctx.moveTo(vx, vy);
      } else {
        ctx.lineTo(vx, vy);
      }
    }
    ctx.closePath();
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fda4af';
    ctx.stroke();

    // Cráteres interiores para distinguirlo de los planetas
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.arc(r * 0.22, r * 0.2, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill();

    ctx.restore();
  }

  private drawPlanet(
    planet: PlanetDefinition,
    isTarget: boolean,
    isCurrentOrbit: boolean,
    isLockedOrigin: boolean,
    elapsedTime: number,
  ): void {
    const { ctx } = this;
    const { x, y } = planet.position;
    const pulse = this.reducedMotion ? 0 : Math.sin(elapsedTime * 5) * 4;

    ctx.save();

    // 1. Zona de captura (captureRadius)
    ctx.beginPath();
    ctx.arc(x, y, planet.captureRadius, 0, Math.PI * 2);
    ctx.setLineDash(isTarget ? [8, 6] : [5, 7]);
    if (isLockedOrigin) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.lineWidth = 1;
    } else if (isTarget) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(250, 204, 21, 0.06)';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.25;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Anillo orbital nominal (orbitRadius)
    ctx.beginPath();
    ctx.arc(x, y, planet.orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isCurrentOrbit
      ? 'rgba(255, 255, 255, 0.55)'
      : 'rgba(226, 232, 240, 0.18)';
    ctx.lineWidth = isCurrentOrbit ? 1.8 : 1;
    ctx.stroke();

    // 3. Indicador geométrico de DESTINO (no depende solo del color)
    if (isTarget) {
      const beaconRadius = planet.captureRadius + 8 + pulse;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.2;

      const bracketAngles = [
        -Math.PI / 4,
        Math.PI / 4,
        (3 * Math.PI) / 4,
        (-3 * Math.PI) / 4,
      ];
      for (const angle of bracketAngles) {
        ctx.beginPath();
        ctx.arc(x, y, beaconRadius, angle - 0.22, angle + 0.22);
        ctx.stroke();
      }

      const badgeY = y - planet.captureRadius - 22;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(x, badgeY + 12);
      ctx.lineTo(x - 7, badgeY + 3);
      ctx.lineTo(x + 7, badgeY + 3);
      ctx.closePath();
      ctx.fill();

      ctx.font = '700 12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fef08a';
      ctx.fillText('★ DESTINO', x, badgeY + 1);
    }

    // 4. Cuerpo visual del planeta (visualRadius)
    ctx.beginPath();
    ctx.arc(x, y, planet.visualRadius, 0, Math.PI * 2);
    ctx.fillStyle = planet.color;
    ctx.fill();
    ctx.lineWidth = isTarget ? 3 : 2;
    ctx.strokeStyle = isTarget ? '#fef08a' : planet.accentColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      x - planet.visualRadius * 0.28,
      y - planet.visualRadius * 0.28,
      planet.visualRadius * 0.35,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isTarget ? '#fef08a' : 'rgba(226, 232, 240, 0.82)';
    ctx.fillText(planet.name, x, y + planet.orbitRadius + 8);

    ctx.restore();
  }

  private drawDeliveryEffect(effect: DeliveryEffectState): void {
    const { ctx } = this;
    const progress = 1 - Math.max(0, effect.timer / effect.duration);
    const alpha = Math.max(0, 1 - progress);
    const ringRadius = this.reducedMotion ? 52 : 34 + progress * 56;

    ctx.save();
    ctx.beginPath();
    ctx.arc(effect.position.x, effect.position.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(52, 211, 153, ${alpha * 0.85})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '800 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(167, 243, 208, ${alpha})`;
    const floatOffset = this.reducedMotion ? 44 : 34 + progress * 26;
    ctx.fillText(
      `+${effect.pointsEarned} PTS`,
      effect.position.x,
      effect.position.y - floatOffset,
    );
    ctx.restore();
  }

  private drawAimGuide(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { origin, endPoint, direction } = snapshot.aimGuide;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);

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
    ctx.fillStyle = '#7dd3fc';
    ctx.fill();

    ctx.restore();
  }

  private drawShipTrail(snapshot: GameSnapshot): void {
    if (this.reducedMotion) return;
    const { trail } = snapshot.ship;
    if (trail.length < 2) return;

    const { ctx } = this;
    ctx.save();

    for (let i = 1; i < trail.length; i += 1) {
      const prev = trail[i - 1];
      const curr = trail[i];
      const ratio = i / trail.length;

      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.strokeStyle = `rgba(125, 211, 252, ${ratio * 0.55})`;
      ctx.lineWidth = 1.5 + ratio * 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawShip(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const { ship } = snapshot;

    ctx.save();
    ctx.translate(ship.position.x, ship.position.y);

    if (ship.mode === 'RECOVERING') {
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.rotate(ship.headingAngle);

    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();

    ctx.fillStyle = ship.mode === 'RECOVERING' ? '#fda4af' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ship.mode === 'FLYING' ? '#facc15' : '#38bdf8';
    ctx.stroke();

    ctx.restore();
  }
}
