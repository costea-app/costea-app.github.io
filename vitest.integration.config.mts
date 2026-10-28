import { defineConfig } from 'vitest/config';

// Pruebas de integración del adaptador de Supabase contra PostgREST en Docker.
// Ejecutar con: docker compose --profile integration run --rm it-test
export default defineConfig({
  test: {
    include: ['supabase/tests/integration/**/*.it.spec.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
