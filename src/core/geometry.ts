import { OrbitDirection, Vector2D } from '../types/game';

export interface SegmentCircleHit {
  /** Parámetro normalizado [0, 1] a lo largo del segmento donde ocurre el contacto */
  readonly t: number;
  /** Punto exacto de intersección */
  readonly point: Vector2D;
  /** Distancia al centro del círculo en el punto de contacto */
  readonly distanceToCenter: number;
}

export function distanceBetween(a: Vector2D, b: Vector2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  const wrapped = ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

export function computeOrbitPosition(
  center: Vector2D,
  radius: number,
  angleRadians: number,
): Vector2D {
  return {
    x: center.x + Math.cos(angleRadians) * radius,
    y: center.y + Math.sin(angleRadians) * radius,
  };
}

export function computeOrbitTangent(
  angleRadians: number,
  direction: OrbitDirection,
): Vector2D {
  return {
    x: -Math.sin(angleRadians) * direction,
    y: Math.cos(angleRadians) * direction,
  };
}

/**
 * Intersección continua entre un segmento (start -> end) y un círculo (center, radius).
 * Evita que la nave atraviese zonas de captura u obstáculos entre pasos de simulación.
 */
export function intersectSegmentCircle(
  start: Vector2D,
  end: Vector2D,
  center: Vector2D,
  radius: number,
): SegmentCircleHit | null {
  const fx = start.x - center.x;
  const fy = start.y - center.y;
  const startDist = Math.hypot(fx, fy);

  if (startDist <= radius) {
    return {
      t: 0,
      point: { x: start.x, y: start.y },
      distanceToCenter: startDist,
    };
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const a = dx * dx + dy * dy;

  if (a <= 1e-12) {
    return null;
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return null;
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / (2 * a);

  if (t1 >= 0 && t1 <= 1) {
    const point = {
      x: start.x + dx * t1,
      y: start.y + dy * t1,
    };
    return {
      t: t1,
      point,
      distanceToCenter: distanceBetween(point, center),
    };
  }

  return null;
}

/**
 * Determina el ángulo orbital inicial y el sentido de giro a partir del punto
 * de entrada y el vector velocidad para conservar la continuidad visual.
 */
export function computeCaptureOrbitParams(
  planetCenter: Vector2D,
  entryPoint: Vector2D,
  velocity: Vector2D,
): { orbitAngle: number; orbitDirection: OrbitDirection } {
  const rx = entryPoint.x - planetCenter.x;
  const ry = entryPoint.y - planetCenter.y;
  const orbitAngle = Math.atan2(ry, rx);

  // Producto cruzado 2D (r x v): positivo => giro horario en coordenadas de pantalla (+Y abajo)
  const cross = rx * velocity.y - ry * velocity.x;
  const orbitDirection: OrbitDirection = cross >= 0 ? 1 : -1;

  return { orbitAngle, orbitDirection };
}
