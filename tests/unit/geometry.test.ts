import { describe, expect, it } from 'vitest';
import {
  computeCaptureOrbitParams,
  computeOrbitPosition,
  computeOrbitTangent,
  distanceBetween,
  intersectSegmentCircle,
  normalizeAngle,
} from '../../src/core/geometry';

describe('geometría orbital y colisión continua', () => {
  it('calcula correctamente la posición en órbita circular según radio y ángulo', () => {
    const center = { x: 200, y: 300 };
    const radius = 50;

    const posZero = computeOrbitPosition(center, radius, 0);
    expect(posZero.x).toBeCloseTo(250, 5);
    expect(posZero.y).toBeCloseTo(300, 5);

    const posHalfPi = computeOrbitPosition(center, radius, Math.PI / 2);
    expect(posHalfPi.x).toBeCloseTo(200, 5);
    expect(posHalfPi.y).toBeCloseTo(350, 5);
  });

  it('calcula el vector unitario tangente perpendicular al radio según el sentido orbital', () => {
    const radialAngle = 0; // A la derecha del planeta (1, 0)
    const tangentCw = computeOrbitTangent(radialAngle, 1);
    expect(tangentCw.x).toBeCloseTo(0, 5);
    expect(tangentCw.y).toBeCloseTo(1, 5);

    const tangentCcw = computeOrbitTangent(radialAngle, -1);
    expect(tangentCcw.x).toBeCloseTo(0, 5);
    expect(tangentCcw.y).toBeCloseTo(-1, 5);

    // Producto punto entre radial (cos, sin) y tangente debe ser 0
    const arbitraryAngle = 1.234;
    const radial = { x: Math.cos(arbitraryAngle), y: Math.sin(arbitraryAngle) };
    const tangent = computeOrbitTangent(arbitraryAngle, 1);
    const dot = radial.x * tangent.x + radial.y * tangent.y;
    expect(dot).toBeCloseTo(0, 6);
    expect(Math.hypot(tangent.x, tangent.y)).toBeCloseTo(1, 6);
  });

  it('detecta intersección continua entre un segmento de movimiento rápido y un círculo', () => {
    const circleCenter = { x: 200, y: 200 };
    const radius = 40;

    // Segmento que atraviesa el círculo de izquierda a derecha en un solo paso
    const hit = intersectSegmentCircle({ x: 100, y: 200 }, { x: 300, y: 200 }, circleCenter, radius);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(0.3, 5); // Entra en x = 160 -> (160-100)/(300-100) = 0.3
    expect(hit?.point.x).toBeCloseTo(160, 5);
    expect(hit?.point.y).toBeCloseTo(200, 5);

    // Segmento que pasa lejos
    const miss = intersectSegmentCircle({ x: 100, y: 100 }, { x: 300, y: 100 }, circleCenter, radius);
    expect(miss).toBeNull();
  });

  it('deriva ángulo y sentido de giro orbital coherentes al capturar una nave en vuelo', () => {
    const planetCenter = { x: 300, y: 300 };
    // La nave entra por la izquierda (230, 300) moviéndose hacia abajo (0, 400)
    // El producto cruzado r x v = (-70)*(400) - (0)*(0) < 0 -> sentido -1 (antihorario en pantalla)
    const capture = computeCaptureOrbitParams(
      planetCenter,
      { x: 230, y: 300 },
      { x: 0, y: 400 },
    );
    expect(normalizeAngle(capture.orbitAngle)).toBeCloseTo(Math.PI, 5);
    expect(capture.orbitDirection).toBe(-1);

    // Si entra por la izquierda moviéndose hacia arriba (0, -400) -> r x v > 0 -> sentido +1
    const captureCw = computeCaptureOrbitParams(
      planetCenter,
      { x: 230, y: 300 },
      { x: 0, y: -400 },
    );
    expect(captureCw.orbitDirection).toBe(1);
    expect(distanceBetween(planetCenter, { x: 230, y: 300 })).toBeCloseTo(70, 5);
  });
});
