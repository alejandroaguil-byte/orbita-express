# Órbita Express

**Órbita Express** es un arcade espacial de partidas cortas (`≤ 65 s`) para jugar desde un navegador móvil (Android) o de escritorio. Asumís el rol de un repartidor interplanetario que debe completar **3 entregas** saltando de órbita en órbita con un único control antes de que se agote la cuenta regresiva.

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

### Reglas de la partida
1. **Órbita continua**: Tu nave gira alrededor de un planeta. Mientras mantenés presionado, ves la guía tangencial de salida actualizándose en vivo.
2. **Captura suave**: Al entrar en el anillo punteado (`captureRadius`) de otro planeta, la nave se incorpora suavemente a su órbita conservando el sentido de giro según el ángulo de entrada.
3. **Objetivo (`★ DESTINO`)**: Llegar al planeta marcado con corchetes dorados y la etiqueta `★ DESTINO` completa una entrega y asigna inmediatamente el siguiente destino.
4. **Riesgo y recuperación**: Salir de los límites del sector o chocar contra un **asteroide estático** descuenta **`5 s`** del reloj una única vez, reinicia el combo y devuelve la nave al último planeta seguro.
5. **Fin del turno**: La partida termina al completar las **3 entregas** (victoria con bonus de tiempo) o cuando el reloj llega a **`0.0s`**.

---

## Fórmulas de puntuación y balance

Definidas en [`src/config/gameConfig.ts`](./src/config/gameConfig.ts) e implementadas como funciones puras en [`src/core/scoring.ts`](./src/core/scoring.ts):

| Concepto | Fórmula / Valor | Ejemplo |
| :--- | :--- | :--- |
| **Puntos por entrega** | `250 + (combo - 1) × 125` | 1.ª: `250` · 2.ª seguida: `375` · 3.ª seguida: `500` |
| **Bonus de tiempo final** | `Math.floor(remainingTime) × 15` *(solo al completar 3/3)* | Sobran `32.8 s` → `32 × 15 = +480 pts` |
| **Penalización por fallo** | `-5 s` al reloj y `combo = 0` | Se aplica una sola vez por desvío o impacto |
| **Duración del turno** | `65 s` de tiempo activo | No corre en pantalla de inicio, pausa ni pestaña oculta |

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
│   │   └── stage1.ts           # Escenario fijo "Corredor Orbital Alfa" (5 planetas + 3 asteroides)
│   ├── core/
│   │   ├── geometry.ts         # Posición orbital, tangentes y barrido continuo segmento-círculo
│   │   ├── scoring.ts          # Cálculo determinista de puntos por entrega, combo y bonus de tiempo
│   │   └── simulation.ts       # Máquina de estados y física arcade determinista (sin dependencias de DOM)
│   ├── input/
│   │   └── inputController.ts  # Pointer Events unificados + teclado + auto-pausa por visibilidad
│   ├── render/
│   │   └── canvasRenderer.ts   # Renderizado vectorial en coordenadas lógicas (540×960) con DPR acotado
│   ├── ui/
│   │   ├── hud.ts              # Sincronización del HUD, modales y gestión de foco para teclado
│   │   └── styles.css          # Diseño adaptable desde 360 px, touch-action local y reduced-motion
│   ├── audio/
│   │   └── soundEffects.ts     # Efectos sintetizados con Web Audio API (sin assets externos)
│   └── storage/
│       └── storage.ts          # Persistencia local versionada y validada (orbita_express_save_v1)
└── tests/
    ├── unit/                   # 23 pruebas deterministas en Vitest (geometría, simulación, puntos, storage)
    └── e2e/                    # Pruebas de navegador en Playwright (escritorio + móvil 360×640)
```

### Decisiones técnicas principales
- **Coordenadas lógicas independientes (`540 × 960`)**: El escenario mantiene siempre su proporción mediante *letterboxing*; redimensionar la ventana nunca altera la física ni reinicia la partida.
- **Colisión continua por barrido (`intersectSegmentCircle`)**: Cada paso de vuelo evalúa el segmento completo entre `t` y `t + dt`, evitando que la nave atraviese zonas de captura u obstáculos.
- **No-recaptura y desempate determinista**: Al despegar, el planeta de origen queda bloqueado hasta superar `captureRadius + 14 u`. Si dos zonas de captura se solapan, gana el menor tiempo de impacto `t ∈ [0, 1]`, luego la menor distancia al centro y finalmente el `id` lexicográfico.

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
