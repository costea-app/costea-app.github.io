// Genera public/config.js con la configuración PÚBLICA de Supabase a partir de variables de entorno.
// Se ejecuta antes de `ng serve` (docker compose) y antes de `ng build` (GitHub Pages / build local).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = (process.env.SUPABASE_URL ?? '').trim();
const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();

function fail(msg) {
  console.error(`\n[write-config] ${msg}\n`);
  process.exit(1);
}

if (key.startsWith('sb_secret_')) fail('SUPABASE_PUBLISHABLE_KEY contiene una clave SECRETA (sb_secret_…). Usa la clave publicable.');
if (key.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (payload.role === 'service_role') fail('La clave es service_role. Nunca la publiques en el frontend.');
  } catch {
    /* no es un JWT legible: se acepta */
  }
}
if (url && !/^https?:\/\//.test(url)) fail('SUPABASE_URL debe empezar por https://');

const config = { supabaseUrl: url, supabasePublishableKey: key };
const target = fileURLToPath(new URL('../public/config.js', import.meta.url));
writeFileSync(
  target,
  `// Generado por scripts/write-config.mjs. Solo configuración pública.\nwindow.__COSTEA_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
);
console.log(
  url && key
    ? `[write-config] Supabase configurado: ${url}`
    : '[write-config] Sin SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY: solo funcionará el modo demo.',
);
