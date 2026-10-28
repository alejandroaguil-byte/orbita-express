import { expect, test } from '@playwright/test';

test.describe('Órbita Express - Verificación Integral de Navegador y Progresión de Sectores', () => {
  test('flujo completo: inicio, sector 1/3, poderes de nave, inversión de órbita, dash en vuelo, controles táctiles/teclado, cancelar gesto, pausa, fin de partida y 360px', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Verificar pantalla de Inicio visible, sector inicial, nivel de nave y ayuda obligatoria
    const startModal = page.locator('#start-modal');
    await expect(startModal).toBeVisible();
    await expect(page.locator('#hud-sector')).toHaveText('1 / 3');
    await expect(page.locator('#hud-ship-powers')).toHaveText('MK-I · Base');
    await expect(page.locator('#hud-help-banner')).toHaveText(
      'Mantené presionado para ver la dirección. Soltá para saltar.',
    );

    // Iniciar la partida desde el botón principal
    await page.locator('#btn-start').click();
    await expect(startModal).toBeHidden();

    const shipStatus = page.locator('#hud-ship-status');
    await expect(shipStatus).toHaveText('Orbitando');

    // Probar inversión de sentido orbital con botón #btn-flip-orbit y tecla R
    const initialDir = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().ship.orbitDirection,
    );
    expect(initialDir).toBe(1);

    await page.locator('#btn-flip-orbit').click();
    const flippedDir = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().ship.orbitDirection,
    );
    expect(flippedDir).toBe(-1);

    await page.keyboard.press('KeyR');
    const restoredDir = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().ship.orbitDirection,
    );
    expect(restoredDir).toBe(1);

    // 2. Probar mantener presionado y cancelar gesto (pointercancel) -> NO debe lanzar
    const canvas = page.locator('#game-canvas');
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    });
    await expect(shipStatus).toHaveText('Apuntando salida');

    await canvas.dispatchEvent('pointercancel', {
      pointerId: 1,
      pointerType: 'touch',
    });
    await expect(shipStatus).toHaveText('Orbitando');

    const jumpsAfterCancel = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().jumpCount,
    );
    expect(jumpsAfterCancel).toBe(0);

    // 3. Mantener y soltar puntero -> debe lanzar la nave y habilitar Dash en vuelo
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    });
    await expect(shipStatus).toHaveText('Apuntando salida');

    await canvas.dispatchEvent('pointerup', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
    });

    const jumpsAfterLaunch = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().jumpCount,
    );
    expect(jumpsAfterLaunch).toBe(1);

    // Activar Dash en vuelo con botón #btn-flight-dash
    await page.locator('#btn-flight-dash').click();
    const dashAvailableAfterClick = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().ship.dashAvailableThisFlight,
    );
    expect(dashAvailableAfterClick).toBe(false);

    // 4. Pausar y continuar (con botón y con teclado en el modal)
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-modal')).toBeVisible();

    const remainingAtPause = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().remainingTime ?? 0,
    );
    await page.waitForTimeout(150);
    const remainingStillPaused = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().remainingTime ?? 0,
    );
    expect(remainingStillPaused).toBeCloseTo(remainingAtPause, 5);

    await page.keyboard.press('Enter');
    await expect(page.locator('#pause-modal')).toBeHidden();

    // 5. Cambiar tamaño de pantalla a 360px sin borrar la partida ni producir scroll horizontal
    await page.setViewportSize({ width: 360, height: 640 });
    const jumpsAfterResize = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().jumpCount,
    );
    expect(jumpsAfterResize).toBe(1);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    // 6. Control de silencio de audio persistente
    const muteBtn = page.locator('#btn-mute');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');

    // 7. Reiniciar partida limpiamente y probar control con tecla Espacio
    await page.locator('#btn-restart').click();
    const snapshotAfterRestart = await page.evaluate(() =>
      window.__ORBITA_DEBUG__?.getSnapshot(),
    );
    expect(snapshotAfterRestart?.jumpCount).toBe(0);
    expect(snapshotAfterRestart?.currentSectorNumber).toBe(1);
    expect(snapshotAfterRestart?.ship.currentPlanetId).toBe('p-base');

    await page.keyboard.down('Space');
    await expect(shipStatus).toHaveText('Apuntando salida');
    await page.keyboard.up('Space');
    const jumpsAfterSpace = await page.evaluate(
      () => window.__ORBITA_DEBUG__?.getSnapshot().jumpCount,
    );
    expect(jumpsAfterSpace).toBe(1);

    // 8. Terminar partida por agotamiento de tiempo y reiniciar desde "Otra partida"
    await page.evaluate(() => {
      window.__ORBITA_DEBUG__?.stepSimulation(70);
    });

    const resultModal = page.locator('#result-modal');
    await expect(resultModal).toBeVisible();
    await expect(page.locator('#result-title')).toHaveText('Se acabó el tiempo');

    await page.locator('#btn-play-again').click();
    await expect(resultModal).toBeHidden();
    const snapAfterPlayAgain = await page.evaluate(() =>
      window.__ORBITA_DEBUG__?.getSnapshot(),
    );
    expect(snapAfterPlayAgain?.appState).toBe('PLAYING');
    expect(snapAfterPlayAgain?.currentSectorNumber).toBe(1);
    expect(snapAfterPlayAgain?.deliveriesCompleted).toBe(0);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
