// Recorrido de humo en modo demo con un navegador headless. Se ejecuta con: sh e2e/run.sh
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OUT_DIR ?? '/out';
mkdirSync(OUT, { recursive: true });
const errors = [];
const step = (msg) => console.log(`✔ ${msg}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-CO' });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const shot = async (name) => {
  await page.waitForTimeout(900); // deja terminar las animaciones del stepper
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};
const expectText = async (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });

await page.goto(BASE);
await expectText('Que ningún costo se quede por fuera');
await shot('01-landing');
step('Landing');

await page.getByRole('button', { name: /Probar con un negocio de ejemplo/ }).click();
await expectText('Mis negocios');
await expectText('Estás en modo demo');
step('Modo demo con aviso visible');

// Nuevo negocio: las horas del mes las calcula el sistema
await page.getByRole('button', { name: 'Nuevo negocio' }).click();
await page.getByLabel('Nombre del negocio').fill('Accesorios Luna');
await page.getByRole('radio', { name: 'Sí' }).click();
await page.getByLabel('¿Cuánto suman al mes?').fill('300.000');
await page.getByLabel('Horas en un día normal').fill('8');
await expectText('173,3 horas al mes');
await expectText('$ 1.730,80'); // 300.000 ÷ 173,33 h
await page.getByText('horas al mes').scrollIntoViewIfNeeded();
await shot('00-nuevo-negocio');
await page.getByRole('button', { name: 'Guardar' }).click();
await expectText('173,33 h de producción');
step('Nuevo negocio con horas del mes calculadas (5 días × 8 h → 173,33 h)');
await page.goto(`${BASE}/app`);

await page.getByRole('link', { name: /Panadería La Espiga/ }).click();
await expectText('Pan artesanal');
await expectText('Pastel de fresas');
await shot('02-productos');
step('Lista de productos');

// Duplicar
await page.getByRole('button', { name: 'Más acciones para Pan artesanal' }).click();
await page.getByRole('menuitem', { name: 'Duplicar' }).click();
await expectText('Pan artesanal (copia)');
step('Duplicar producto');

// Crear producto nuevo
await page.getByRole('link', { name: 'Nuevo producto' }).click();
await page.getByLabel('Nombre del producto').fill('Galletas de avena');
await page.getByLabel('¿Cuántas unidades puedes vender?').fill('20');
await page.getByRole('button', { name: 'Siguiente: materiales' }).click();
await page.getByRole('button', { name: /Agregar material de la biblioteca/ }).click();
await page.getByRole('combobox', { name: 'Material' }).click();
await page.getByRole('option', { name: /Harina de trigo/ }).click();
await page.getByLabel('¿Cuánto necesitas?').fill('500');
await page.getByRole('combobox', { name: 'Unidad' }).click();
await page.getByRole('option', { name: 'g', exact: true }).click();
await expectText('= $ 2.400');
await shot('03-asistente-materiales');
step('Cálculo inmediato de material ($4.800/kg × 500 g = $2.400)');
await page.getByRole('button', { name: 'Siguiente: trabajo y otros costos' }).click();
await page.getByLabel(/minutos le dedicas/).fill('60');
await page.getByRole('button', { name: 'Siguiente: checklist' }).click();
await shot('04-checklist');
await page.getByRole('button', { name: 'Siguiente: margen y resultado' }).click();
await expectText('Precio provisional');
await shot('05-resultado-provisional');
step('Resultado con precio provisional y pendientes');
await page.getByRole('button', { name: 'Guardar y ver reporte' }).click();
await expectText('Reporte de costeo');
await expectText('Galletas de avena');
step('Guardar producto nuevo y abrir reporte');

// Persistencia tras recargar
await page.reload();
await expectText('Galletas de avena');
// Costo: (2.400 + 9.000 trabajo) / 20 = 570
await expectText('$ 570');
step('Persistencia tras recargar (costo unitario $570)');

await page.getByRole('button', { name: 'Guardar reporte' }).click();
await expectText('Reporte guardado');
await shot('06-reporte');
step('Instantánea del reporte guardada');

// Editar: cambiar unidades vendibles
await page.getByRole('link', { name: 'Editar' }).click();
await page.getByLabel('¿Cuántas unidades puedes vender?').fill('19');
await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
await expectText('Guardado');
step('Editar producto');

// Impacto del precio de un material
await page.getByRole('link', { name: 'Panadería La Espiga' }).click();
await page.getByRole('tab', { name: 'Materiales' }).click();
await page.getByRole('button', { name: 'Editar Harina de trigo' }).click();
await page.getByLabel('¿Cuánto te costó?').fill('6000');
await expectText('se recalculan los costeos actuales');
await expectText('no cambian');
await shot('07-impacto-material');
await page.getByRole('button', { name: 'Guardar material' }).click();
await expectText('Material actualizado');
step('Edición de material explica qué costeos se recalculan');

// Reporte guardado conserva $570
await page.getByRole('tab', { name: 'Reportes guardados' }).click();
await page.getByRole('link', { name: 'Galletas de avena' }).click();
await expectText('conserva los valores');
await expectText('$ 570');
step('Reporte guardado conserva su valor original tras cambiar el material');

// Eliminar con confirmación
await page.getByRole('link', { name: 'Panadería La Espiga' }).click();
await page.getByRole('tab', { name: 'Productos' }).click();
await page.getByRole('button', { name: 'Más acciones para Pan artesanal (copia)' }).click();
await page.getByRole('menuitem', { name: 'Eliminar' }).click();
await page.getByRole('button', { name: 'Eliminar producto' }).click();
await expectText('Producto eliminado');
step('Eliminar producto con confirmación');

// Recarga en ruta interna
await page.goto(`${BASE}/app`);
await expectText('Luz de Monte');
step('Recarga directa de una ruta interna');

// Móvil
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('link', { name: /Luz de Monte/ }).click();
await page.getByRole('link', { name: 'Editar' }).first().click();
await expectText('Resumen en vivo');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await shot('08-movil-asistente');
if (overflow) errors.push('Desbordamiento horizontal en móvil');
step(`Vista móvil (desbordamiento horizontal: ${overflow ? 'sí' : 'no'})`);

await browser.close();
const relevant = errors.filter(
  (e) =>
    !/fonts\.(googleapis|gstatic)/.test(e) &&
    // En GitHub Pages las rutas internas se sirven con 404.html (estado 404): es lo esperado.
    !(process.env.GITHUB_PAGES && /status of 404/.test(e)),
);
if (relevant.length) {
  console.error('Errores en consola:\n' + relevant.join('\n'));
  process.exit(1);
}
console.log('OK: recorrido de humo completo sin errores de consola');
