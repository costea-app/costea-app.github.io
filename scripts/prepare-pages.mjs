// Prepara la salida REAL de Angular para GitHub Pages y la verifica.
//  - Lee la ruta de salida desde angular.json (no se asume).
//  - Copia index.html a 404.html: GitHub Pages responde 404.html en rutas desconocidas,
//    así las rutas internas (/costea/app/…) cargan la app al recargar.
//  - Crea .nojekyll y comprueba que config.js no tenga claves secretas.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const angular = JSON.parse(readFileSync('angular.json', 'utf8'));
const [name, project] = Object.entries(angular.projects)[0];
const outputPath = project.architect.build.options.outputPath ?? `dist/${name}`;
const base = typeof outputPath === 'string' ? outputPath : outputPath.base;
const dir = [join(base, 'browser'), base].find((d) => existsSync(join(d, 'index.html')));
if (!dir) {
  console.error(`[prepare-pages] No se encontró index.html dentro de ${base}`);
  process.exit(1);
}
copyFileSync(join(dir, 'index.html'), join(dir, '404.html'));
writeFileSync(join(dir, '.nojekyll'), '');

const problems = [];
if (!existsSync(join(dir, 'config.js'))) problems.push('falta config.js');
else if (/service_role|sb_secret_/.test(readFileSync(join(dir, 'config.js'), 'utf8'))) problems.push('config.js contiene una clave secreta');
const baseHref = readFileSync(join(dir, 'index.html'), 'utf8').match(/<base href="([^"]*)"/)?.[1];
if (problems.length) {
  console.error(`[prepare-pages] ${dir}: ${problems.join('; ')}`);
  process.exit(1);
}
console.log(`[prepare-pages] OK. Carpeta a publicar: ${dir} · base href: ${baseHref}`);
