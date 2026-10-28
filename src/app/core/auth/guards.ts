import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionService } from './session.service';

/** Área privada: requiere sesión de Supabase o modo demo explícito. (La seguridad real está en RLS.) */
export const appAreaGuard: CanMatchFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.whenReady();
  return session.mode() !== 'none' ? true : router.parseUrl('/ingresar');
};

/** Páginas de acceso: si ya hay sesión, van directo a la app. */
export const guestGuard: CanMatchFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.whenReady();
  return session.isSignedIn() ? router.parseUrl('/app') : true;
};
