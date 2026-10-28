# Órbita Express

**Órbita Express** es un arcade espacial retro de partidas cortas (`≤ 90 s`) para jugar desde un navegador móvil (Android) o de escritorio, con dirección de arte **pixel-art biomecánica de 16-bits estilo *Axiom Verge*** y banda sonora electrónica espacial sintetizada en tiempo real. Asumís el rol de un repartidor interplanetario que debe superar **3 sectores con mecánicas únicas**, ejecutando **capturas perfectas (*Bullseye*)**, **maniobras de *Dash* en vuelo** y **mejoras tácticas de Armería Orbital** evolucionando su nave de **MK-I a MK-III** antes de que se agote la cuenta regresiva.

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
| **Invertir sentido orbital** | Botón **Giro (R)** en el HUD | Tecla **`R`** |
| **Dash de corrección en vuelo** | Botón **Dash (D)** en el HUD (1 por salto) | Tecla **`D`** o **`Shift`** |
| **Elegir mejora de Armería** | Botones de **Armería Orbital** al cambiar de sector | Teclas **`1`** o **`2`** |
| **Cancelar apuntado** | `pointercancel` / salir del contexto (no lanza) | Perder foco de ventana |
| **Pausar / Reanudar** | Botón **Pausar / Continuar** | Tecla **`P`** o **`Escape`** |
| **Silenciar audio** | Botón **Sonido: Sí / No** | Navegable con `Tab` + `Enter` |

### Progresión de sectores (Mecánicas únicas, dificultad y música adaptativa)
Cada partida recorre **3 sectores diseñados a mano** (`CAMPAIGN_STAGES`), acompañados por un secuenciador electrónico espacial que incrementa su ritmo (BPM) e introduce nuevos elementos interactivos en cada etapa:
1. **Sector 1 — Corredor Orbital Alfa (`Calentamiento` · `118 BPM`)**: Zonas de captura amplias (`72`–`80 u`), **Anillos de Impulso (*Boost Gates*)** que aceleran la nave (`1.38x`) y **Cápsulas de Poder** recolectables en ruta.
2. **Sector 2 — Cinturón de Cobalto (`Riesgo Medio` · `126 BPM`)**: Órbitas más ágiles (`2.4`–`2.6 rad/s`), **Asteroides Patrulla Móviles** con trayectorias oscilatorias deterministas y evolución automática de la nave a **`MK-II`** con Escudo de Fase equipado.
3. **Sector 3 — Tormenta Esmeralda (`Sector Crítico` · `134 BPM`)**: Alta velocidad orbital (`2.65`–`2.85 rad/s`), **Singularidad Gravitacional** central que curva la trayectoria de vuelo (con **predicción láser curva en tiempo real**), **Portal *Wormhole*** de atajo cuántico y evolución de la nave a **`MK-III`**.

Al completar la entrega de un sector, avanzás automáticamente al siguiente corredor, recibís **`+12 s`** de tiempo extra (con tope estricto en `90 s`) y se habilita la **Armería Orbital** para elegir una bonificación táctica.

---

## Mecánicas de Maestría, Evolución (`MK-I` → `MK-III`) y Armería

- **Captura Perfecta (*Bullseye*)**: Entrar a la órbita de un planeta rozando el anillo ideal (`orbitRadius ± 10 u`) otorga **`+120 pts`** y **`+1.5 s`** de reloj, más un estallido dorado en pantalla.
- **Dash de Corrección en Vuelo (`Tecla D` / Botón `Dash`)**: Una vez por salto en estado `FLYING`, activa un micro-impulso (`1.25x` velocidad + `+40 pts`) con asistencia direccional suave (`≤ 26°`) hacia el planeta objetivo más cercano en tu cono frontal.
- **Armería Orbital Táctica (`Teclas 1 / 2`)**: Al avanzar al Sector 2 o Sector 3 podés elegir en caliente entre:
  - **`[1] Escudo + 6s`** (`SHIELD_OVERCHARGE`): Activa Escudo de Fase y suma `+6 s` al reloj.
  - **`[2] Magnetar + Crono`** (`MAGNETAR_CHRONO`): Equipa simultáneamente Pulso Magnetar y Enfoque Crono.
- **Escudo de Fase (`PHASE_SHIELD`)**: Rodea la nave con una barrera energética azul cian. Si chocás contra un asteroide en vuelo, **lo pulverizás sin perder el salto ni reiniciar tu combo** (`+100 pts`).
- **Enfoque Crono (`CHRONO_AIM`)**: Mientras mantenés presionado para apuntar, **ralentiza el giro orbital (`0.65x`)** y extiende la guía láser un `+45%` para disparos de precisión quirúrgica.
- **Pulso Magnetar (`MAGNETAR`)**: Aumenta la velocidad de lanzamiento un `+20%` y **amplía el radio de captura gravitacional de todos los planetas (`+18 u`)**.
- **Inversor de Giro Orbital (`Giro / Tecla R`)**: Permite invertir al instante el sentido de rotación orbital (`+1` ↔ `-1`) mientras estás en órbita.

---

## Dirección artística, Game Feel y Audio (Estilo *Axiom Verge*)

- **Sprites Pixel-Art procedimentales con tramado Bayer (`src/render/pixelArtGenerator.ts`)**: Los planetas y asteroides se pre-renderizan en lienzos *offscreen* de baja resolución (`28×28` y `20×20` px) con `imageSmoothingEnabled = false`, matriz de *dithering* Bayer 4×4, estrías orgánicas y poros luminosos.
- **Game Feel 16-bit (`src/render/canvasRenderer.ts`)**: Sistema de **partículas pixeladas cuadradas** en lanzamientos, *dash*, portales, capturas y colisiones; **textos flotantes (*floating popups*)** en coordenadas de mundo (`+250`, `¡BULLSEYE! +120`, `¡ESCUDO! +100`, `-5s`); **predicción láser curva** ante pozos gravitacionales; y **micro-*screen shake*** amortiguado (respetando `prefers-reduced-motion: reduce`).
- **Sintetizador electrónico espacial (`src/audio/spaceMusic.ts` y `src/audio/soundEffects.ts`)**: Secuenciador de 16 pasos con *lookahead* sobre `Web Audio API` (bajo `sawtooth` con filtro pasa-bajos resonante, arpegio `square` con eco en modo frigio/menor armónico, bombo electrónico y *hi-hat* de ruido blanco filtrado).

---

## Fórmulas de puntuación y balance

Definidas en [`src/config/gameConfig.ts`](./src/config/gameConfig.ts) e implementadas como funciones puras en [`src/core/scoring.ts`](./src/core/scoring.ts):

| Concepto | Fórmula / Valor | Ejemplo |
| :--- | :--- | :--- |
| **Puntos por entrega** | `250 + (combo - 1) × 125` | 1.ª: `250` · 2.ª seguida: `375` · 3.ª seguida: `500` |
| **Captura Perfecta (*Bullseye*)** | `+120 pts` + `+1.5 s` al reloj | Capturar planeta cerca de su anillo `orbitRadius` |
| **Dash en vuelo** | `+40 pts` + impulso `1.25x` + asistencia de cono | Presionar `D` o botón `Dash` durante el salto |
| **Anillo de Impulso** | `+75 pts` + velocidad `1.38x` + pulso Magnetar | Cruzar portal de impulso en vuelo |
| **Cápsula de Poder** | `+60 pts` + mejora de nivel `MK` + poder activo | Recolectar rombo biomecánico en vuelo |
| **Escudo de Fase (Impacto)** | `+100 pts` + demolición de asteroide sin perder combo | Absorber asteroide con escudo activo |
| **Portal Wormhole** | `+90 pts` + teletransporte instantáneo | Cruzar portal cuántico en Sector 3 |
| **Bonus de tiempo final** | `Math.floor(remainingTime) × 15` *(al superar los 3 sectores)* | Sobran `32.8 s` → `32 × 15 = +480 pts` |
| **Recarga por sector** | `+12 s` al avanzar de sector *(tope máximo `90 s`)* | Premia superar rápido los primeros sectores |
| **Penalización por fallo** | `-5 s` al reloj y `combo = 0` | Se aplica una sola vez por desvío o impacto |
| **Reloj inicial** | `65 s` de tiempo activo | No corre en pantalla de inicio, pausa ni pestaña oculta |

---

## Arquitectura del proyecto

```text
orbita-express/
├── index.html                  # Estructura semántica, Canvas, barra de Armería y modales accesibles
├── src/
│   ├── main.ts                 # Bucle principal con paso fijo (60 Hz) y límite anti-espiral (maxFrameDelta)
│   ├── types/
│   │   └── game.ts             # Contrato único de tipos, estados, poderes, armería y GameSnapshot
│   ├── config/
│   │   ├── gameConfig.ts       # Parámetros físicos, radios, poderes, bullseye, dash y constantes de puntuación
│   │   └── stage1.ts           # Catálogo CAMPAIGN_STAGES (STAGE_1, STAGE_2 y STAGE_3 con mecánicas únicas)
│   ├── core/
│   │   ├── geometry.ts         # Posición orbital, tangentes y barrido continuo segmento-círculo
│   │   ├── scoring.ts          # Cálculo determinista de puntos por entrega, combo y bonus de tiempo
│   │   └── simulation.ts       # Máquina de estados, predicción curva, bullseye, dash y física determinista
│   ├── input/
│   │   └── inputController.ts  # Pointer Events unificados + teclado (Espacio, R, D, 1, 2, P) + auto-pausa
│   ├── render/
│   │   ├── pixelArtGenerator.ts# Generador de texturas pixel-art con tramado Bayer 4x4
│   │   └── canvasRenderer.ts   # Renderizado pixel-art CRT, partículas, popups flotantes y screen shake
│   ├── ui/
│   │   ├── hud.ts              # Sincronización del HUD, armería táctica, indicador de nave/poderes y modales
│   │   └── styles.css          # Terminal retro adaptable desde 360 px y reduced-motion
│   ├── audio/
│   │   ├── spaceMusic.ts       # Escalas, secuencias MIDI y BPM por sector
│   │   └── soundEffects.ts     # Secuenciador de música electrónica y efectos con Web Audio API
│   └── storage/
│       └── storage.ts          # Persistencia local versionada y validada (orbita_express_save_v1)
└── tests/
    ├── unit/                   # 28 pruebas deterministas en Vitest (geometría, campaña, poderes, maestría, música)
    └── e2e/                    # Pruebas de navegador en Playwright (escritorio + móvil 360×640)
```
