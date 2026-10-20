import { StageDefinition } from '../types/game';
import { GAME_CONFIG } from './gameConfig';

/**
 * Primer escenario fijo diseñado a mano: "Corredor Orbital Alfa".
 * Cinco planetas distribuidos verticalmente con zonas de captura generosas
 * y tres asteroides estáticos que separan rutas sencillas de atajos arriesgados:
 * - Las rutas directas p-base -> p-relay-east -> p-high-west -> p-summit están despejadas
 *   si el jugador lanza en la ventana correcta.
 * - Los asteroides penalizan lanzamientos apresurados por el centro o los flancos.
 */
export const STAGE_1: StageDefinition = {
  id: 'stage-1-corredor-alfa',
  name: 'Corredor Orbital Alfa',
  worldWidth: GAME_CONFIG.worldWidth,
  worldHeight: GAME_CONFIG.worldHeight,
  startPlanetId: 'p-base',
  startOrbitAngle: -Math.PI / 2,
  startOrbitDirection: 1,
  targetSequence: ['p-relay-east', 'p-high-west', 'p-summit', 'p-base'],
  planets: [
    {
      id: 'p-base',
      name: 'Estación Aurora',
      position: { x: 270, y: 810 },
      visualRadius: 30,
      orbitRadius: 50,
      captureRadius: 78,
      angularSpeed: 2.2,
      color: '#38bdf8',
      accentColor: '#bae6fd',
    },
    {
      id: 'p-relay-west',
      name: 'Nexo Coral',
      position: { x: 145, y: 615 },
      visualRadius: 26,
      orbitRadius: 44,
      captureRadius: 72,
      angularSpeed: 2.4,
      color: '#fb7185',
      accentColor: '#fecdd3',
    },
    {
      id: 'p-relay-east',
      name: 'Faro Ámbar',
      position: { x: 395, y: 540 },
      visualRadius: 28,
      orbitRadius: 46,
      captureRadius: 74,
      angularSpeed: 2.25,
      color: '#fbbf24',
      accentColor: '#fde68a',
    },
    {
      id: 'p-high-west',
      name: 'Puerto Cobalto',
      position: { x: 165, y: 345 },
      visualRadius: 28,
      orbitRadius: 46,
      captureRadius: 74,
      angularSpeed: 2.35,
      color: '#a78bfa',
      accentColor: '#ddd6fe',
    },
    {
      id: 'p-summit',
      name: 'Cúpula Esmeralda',
      position: { x: 325, y: 165 },
      visualRadius: 32,
      orbitRadius: 52,
      captureRadius: 80,
      angularSpeed: 2.1,
      color: '#34d399',
      accentColor: '#a7f3d0',
    },
  ],
  asteroids: [
    {
      id: 'ast-central-low',
      position: { x: 255, y: 665 },
      radius: 20,
    },
    {
      id: 'ast-east-ridge',
      position: { x: 355, y: 365 },
      radius: 22,
    },
    {
      id: 'ast-north-west',
      position: { x: 185, y: 195 },
      radius: 19,
    },
  ],
};
