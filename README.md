# Órbita Express

Arcade espacial de partidas rápidas para móvil (Android) y navegador de escritorio.

## Características implementadas (Entregas 1, 2 y 3)

### 1. Mecánica central (Entrega 1)
- **Órbita circular parametrizada**: separación explícita entre `visualRadius`, `orbitRadius` y `captureRadius`.
- **Ayuda de dirección en vivo**: mantener presionado muestra el vector tangencial de salida actualizado a medida que la órbita avanza.
- **Lanzamiento tangencial y vuelo rectilíneo**: detección continua por barrido segmento-círculo (`intersectSegmentCircle`) para evitar atravesar zonas de captura u obstáculos entre pasos de simulación.
- **Captura suave y determinista**: transición continua al radio orbital sin teletransportes visuales; desempate determinista ante zonas superpuestas y bloqueo temporal del planeta de origen hasta superar `captureRadius + originUnlockMargin`.
- **Controles unificados**: Pointer Events (`pointerdown`, `pointerup`, `pointercancel`, `lostpointercapture`, pérdida de foco/visibilidad) + teclado (`Espacio` para apuntar/lanzar, `P` o `Escape` para pausar).

### 2. Partida completa (Entrega 2)
- **Ciclo de 3 entregas con cuenta regresiva activa (65 s)**: el reloj solo corre durante el juego activo (`PLAYING`) y se detiene automáticamente si la pestaña pasa a segundo plano (`visibilitychange`), exigiendo acción explícita del jugador para continuar.
- **Asteroides estáticos (`STAGE_1`)**: tres asteroides estratégicamente ubicados en el corredor vertical que separan rutas seguras por escalas de lanzamientos directos más arriesgados.
- **Recuperación tras fallo con penalización única**: salir del escenario o chocar con un asteroide descuenta `5 s` una única vez por fallo, reinicia el combo y devuelve la nave al último planeta seguro (o termina la partida si la penalización agota el reloj).
- **Sistema transparente de puntuación y combo (`src/core/scoring.ts`)**:
  - `puntosEntrega = 250 + (combo - 1) * 125`
  - `bonusTiempo = Math.floor(remainingTime) * 15` (al completar las 3 entregas)
- **Estados completos**: pantallas de **Inicio**, **Jugando**, **Pausa** y **Resultado** con botón destacado **"Otra partida"** para reinicio inmediato.

### 3. Pulido, persistencia y accesibilidad (Entrega 3)
- **Persistencia local segura y versionada (`orbita_express_save_v1`)**: guarda récord local y preferencia de silencio, tolerando almacenamiento deshabilitado o JSON corrupto sin romper el juego.
- **Efectos de sonido sintetizados opcionales (`Web Audio API`)**: activados únicamente tras interacción del usuario, con botón visible **Sonido: Sí/No** y degradación silenciosa si el navegador bloquea el audio.
- **Accesibilidad y diseño adaptable**: respeto por `prefers-reduced-motion: reduce`, navegación por teclado en todos los diálogos y adaptación sin desborde desde `360 px` de ancho.

## Comandos principales

```bash
# Servidor de desarrollo (solo en loopback 127.0.0.1:5173)
npm run dev

# Control estricto de tipos
npm run typecheck

# Pruebas unitarias deterministas (Vitest)
npm test

# Compilación de producción
npm run build

# Pruebas automatizadas en navegador (Playwright: escritorio y móvil 360x640)
npm run test:e2e
```
