import { GAME_CONFIG } from '../config/gameConfig';

/**
 * Calcula los puntos otorgados por una entrega según el combo actual (1 = primera entrega sin fallo).
 * Fórmula: baseDeliveryPoints + (combo - 1) * comboStepBonus
 */
export function calculateDeliveryPoints(combo: number): number {
  const safeCombo = Math.max(1, Math.floor(combo));
  return GAME_CONFIG.baseDeliveryPoints + (safeCombo - 1) * GAME_CONFIG.comboStepBonus;
}

/**
 * Calcula el bonus por tiempo restante al completar las tres entregas.
 * Fórmula: Math.floor(Math.max(0, remainingTime)) * timeBonusPerSecond
 */
export function calculateTimeBonus(remainingTime: number): number {
  const wholeSeconds = Math.max(0, Math.floor(remainingTime));
  return wholeSeconds * GAME_CONFIG.timeBonusPerSecond;
}
