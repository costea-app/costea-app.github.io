/**
 * Configuración PÚBLICA de Supabase.
 *
 * Angular no lee archivos .env. La configuración llega en tiempo de ejecución desde
 * `/config.js`, que `scripts/write-config.mjs` genera a partir de variables de entorno
 * (SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY) antes de compilar o servir la app.
 * Solo debe contener la URL del proyecto y la clave publicable; nunca service_role ni secretos.
 */
export interface PublicConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

declare global {
  interface Window {
    __COSTEA_CONFIG__?: Partial<PublicConfig>;
  }
}

export function readPublicConfig(): PublicConfig | null {
  const raw = typeof window !== 'undefined' ? window.__COSTEA_CONFIG__ : undefined;
  const url = raw?.supabaseUrl?.trim();
  const key = raw?.supabasePublishableKey?.trim();
  if (!url || !key) return null;
  return { supabaseUrl: url, supabasePublishableKey: key };
}
