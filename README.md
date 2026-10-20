# Órbita Express

**Órbita Express** es un arcade espacial de partidas cortas (`≤ 90 s`) para jugar desde un navegador móvil (Android) o de escritorio. Asumís el rol de un repartidor interplanetario que debe superar **3 sectores de dificultad creciente** saltando de órbita en órbita con un único control antes de que se agote la cuenta regresiva.

---

## Ruta rápida (Quick Start)

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor local (escucha solo en 127.0.0.1:5173)
npm run dev

# 3. Ejecutar verificación completa (tipos + pruebas unitarias + compilación + E2E)
npm run typecheck && npm test && npm run build && npm run test:e2e
```

Abrí **`http://127.0.0.1:5173`** en tu navegador y presioná **Comenzar reparto**.

---

## Cómo se juega

| Acción | Táctil / Mouse (Pointer Events) | Teclado (Escritorio) |
| :--- | :--- | :--- |
| **Apuntar dirección** | **Mantener presionado** dentro del área de juego | **Mantener `Espacio`** |
| **Saltar (lanzar nave)** | **Soltar** en el instante deseado | **Soltar `Espacio`** |
| **Cancelar apuntado** | `pointercancel` / salir del contexto (no lanza) | Perder foco de ventana |
| **Pausar / Reanudar** | Botón **Pausar / Continuar** | Tecla **`P`** o **`Escape`** |
| **Silenciar audio** | Botón **Sonido: Sí / No** | Navegable con `Tab` + `Enter` |

### Progresión de sectores (Dificultad creciente)
Cada partida recorre **3 sectores diseñados a mano** (`CAMPAIGN_STAGES`):
1. **Sector 1 — Corredor Orbital Alfa (`Calentamiento`)**: Zonas de captura amplias (`72`–`80 u`), velocidades orbitales moderadas (`2.1`–`2.3 rad/s`) y 3 asteroides estáticos.
2. **Sector 2 — Cinturón de Cobalto (`Riesgo Medio`)**: Órbitas más ágiles (`2.4`–`2.6 rad/s`), radios de captura intermedios (`68`–`72 u`), inversión de giro inicial y 4 asteroides en la diagonal principal.
3. **Sector 3 — Tormenta Esmeralda (`Sector Crítico`)**: Alta velocidad orbital (`2.65`–`2.85 rad/s`), zonas de captura exigentes (`64`–`68 u`) y 5 asteroides custodiando el ascenso a la Cúpula Zenith.

Al completar la entrega de un sector, avanzás automáticamente al siguiente corredor y recibís **`+12 s`** de tiempo extra (con tope estricto en `90 s`).

---

## Fórmulas de puntuación y balance

Definidas en [`src/config/gameConfig.ts`](./src/config/gameConfig.ts) e implementadas como funciones puras en [`src/core/scoring.ts`](./src/core/scoring.ts):

| Concepto | Fórmula / Valor | Ejemplo |
| :--- | :--- | :--- |
| **Puntos por entrega** | `250 + (combo - 1) × 125` | 1.ª: `250` · 2.ª seguida: `375` · 3.ª seguida: `500` |
| **Bonus de tiempo final** | `Math.floor(remainingTime) × 15` *(al superar los 3 sectores)* | Sobran `32.8 s` → `32 × 15 = +480 pts` |
| **Recarga por sector** | `+12 s` al avanzar de sector *(tope máximo `90 s`)* | Premia superar rápido los primeros sectores |
| **Penalización por fallo** | `-5 s` al reloj y `combo = 0` | Se aplica una sola vez por desvío o impacto |
| **Reloj inicial** | `65 s` de tiempo activo | No corre en pantalla de inicio, pausa ni pestaña oculta |

---

## Arquitectura del proyecto

Diseño desacoplado en TypeScript sin motores pesados ni frameworks de interfaz:

```text
orbita-express/
├── index.html                  # Estructura semántica, Canvas y modales accesibles (Inicio, Pausa, Resultado)
├── src/
│   ├── main.ts                 # Bucle principal con paso fijo (60 Hz) y límite anti-espiral (maxFrameDelta)
│   ├── types/
│   │   └── game.ts             # Contrato único de tipos, estados, comandos de entrada y GameSnapshot
│   ├── config/
│   │   ├── gameConfig.ts       # Parámetros físicos, radios, tiempos y constantes de puntuación
│   │   └── stage1.ts           # Catálogo CAMPAIGN_STAGES (STAGE_1, STAGE_2 y STAGE_3)
│   ├── core/
│   │   ├── geometry.ts         # Posición orbital, tangentes y barrido continuo segmento-círculo
│   │   ├── scoring.ts          # Cálculo determinista de puntos por entrega, combo y bonus de tiempo
│   │   └── simulation.ts       # Máquina de estados, progresión de sectores y física determinista
│   ├── input/
│   │   └── inputController.ts  # Pointer Events unificados + teclado + auto-pausa por visibilidad
│   ├── render/
│   │   └── canvasRenderer.ts   # Renderizado vectorial en coordenadas lógicas (540×960) con DPR acotado
│   ├── ui/
│   │   ├── hud.ts              # Sincronización del HUD, indicador de sector, modales y foco de teclado
│   │   └── styles.css          # Diseño adaptable desde 360 px, touch-action local y reduced-motion
│   ├── audio/
│   │   └── soundEffects.ts     # Efectos sintetizados con Web Audio API (sin assets externos)
│   └── storage/
│       └── storage.ts          # Persistencia local versionada y validada (orbita_express_save_v1)
└── tests/
    ├── unit/                   # 23 pruebas deterministas en Vitest (geometría, campaña, puntos, storage)
    └── e2e/                    # Pruebas de navegador en Playwright (escritorio + móvil 360×640)
```

---

## Comandos disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Levanta Vite en `http://127.0.0.1:5173` (solo loopback). |
| `npm run typecheck` | Ejecuta `tsc --noEmit` en modo estricto. |
| `npm test` | Ejecuta las 23 pruebas unitarias deterministas con Vitest. |
| `npm run build` | Compila el paquete estático de producción en `dist/`. |
| `npm run preview` | Sirve el build de producción en `http://127.0.0.1:4173`. |
| `npm run test:e2e` | Ejecuta las pruebas E2E de Playwright en Chromium escritorio y móvil (`360×640`). |
