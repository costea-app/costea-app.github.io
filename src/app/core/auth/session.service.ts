import { Injectable, computed, signal } from '@angular/core';
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';
import { readPublicConfig } from '../config/app-config';
import { DemoRepository } from '../data/demo.repository';
import { buildDemoSeed } from '../data/demo-seed';

export type AppMode = 'none' | 'demo' | 'account';

const DEMO_FLAG = 'costea.mode';

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Error con un mensaje en español listo para mostrar. */
export class AccountError extends Error {
  override name = 'AccountError';
}

/** Traduce errores de Supabase Auth a mensajes en español. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof AccountError) return error.message;
  const e = error as Partial<AuthError> & { message?: string };
  const msg = (e?.message ?? '').toLowerCase();
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return 'El correo o la contraseña no coinciden.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'Esta cuenta está pendiente de confirmación. En Supabase desactiva “Confirm email” (ver README) y vuelve a intentarlo.';
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.';
  if (code === 'weak_password' || msg.includes('password should'))
    return 'La contraseña es muy débil. Usa al menos 8 caracteres combinando letras y números.';
  if (code === 'over_email_send_rate_limit' || e?.status === 429 || msg.includes('rate limit'))
    return 'Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
  if (msg.includes('fetch') || msg.includes('network'))
    return 'No pudimos conectar con el servidor de cuentas. Revisa tu conexión.';
  return 'No pudimos completar la operación. Intenta de nuevo.';
}

/**
 * Estado de sesión. Hay dos modos explícitos:
 *  - 'account': sesión de Supabase Auth; los datos van a Supabase.
 *  - 'demo': sin cuenta; los datos van al localStorage de este navegador.
 * Nunca se pasa a modo demo automáticamente si Supabase falla.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly config = readPublicConfig();
  /** Cliente de Supabase; se crea (y se descarga la librería) solo si hay configuración. */
  private _supabase: SupabaseClient | null = null;
  get supabase(): SupabaseClient | null {
    return this._supabase;
  }
  readonly accountsAvailable = this.config !== null;

  readonly demoRepository = new DemoRepository(safeStorage() ?? undefined);

  private readonly _mode = signal<AppMode>('none');
  private readonly _user = signal<User | null>(null);
  private readonly _ready = signal(false);
  private readonly _initError = signal<string | null>(null);

  readonly mode = this._mode.asReadonly();
  readonly user = this._user.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly initError = this._initError.asReadonly();
  readonly isDemo = computed(() => this._mode() === 'demo');
  readonly isSignedIn = computed(() => this._mode() === 'account');

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.init();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    if (this.config) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        this._supabase = createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
          // Solo correo y contraseña: no hay enlaces de correo que leer en la URL.
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        });
      } catch {
        this._initError.set('No pudimos cargar el módulo de cuentas. Revisa tu conexión y recarga la página.');
      }
    }
    if (this.supabase) {
      this.supabase.auth.onAuthStateChange((_event, session) => {
        this.applySession(session?.user ?? null);
      });
      try {
        const { data, error } = await this.supabase.auth.getSession();
        if (error) throw error;
        this.applySession(data.session?.user ?? null);
      } catch (e) {
        this._initError.set(authErrorMessage(e));
      }
    }
    if (this._mode() === 'none' && safeStorage()?.getItem(DEMO_FLAG) === 'demo') {
      this._mode.set('demo');
    }
    this._ready.set(true);
  }

  private applySession(user: User | null): void {
    this._user.set(user);
    if (user) {
      safeStorage()?.removeItem(DEMO_FLAG);
      this._mode.set('account');
    } else if (this._mode() === 'account') {
      this._mode.set('none');
    }
  }

  /* -------------------------- Modo demo -------------------------- */

  startDemo(): void {
    if (this.isSignedIn()) throw new Error('Cierra sesión antes de usar el modo demo.');
    if (!this.demoRepository.hasData()) this.demoRepository.replaceAll(buildDemoSeed());
    safeStorage()?.setItem(DEMO_FLAG, 'demo');
    this._mode.set('demo');
  }

  resetDemo(): void {
    this.demoRepository.replaceAll(buildDemoSeed());
  }

  /** Sale del modo demo. `deleteData` borra los datos del navegador. */
  exitDemo(deleteData: boolean): void {
    if (deleteData) this.demoRepository.clear();
    safeStorage()?.removeItem(DEMO_FLAG);
    this._mode.set('none');
  }

  /* -------------------------- Cuentas -------------------------- */

  private requireClient(): SupabaseClient {
    if (!this.supabase) {
      if (this.config) throw new AccountError(this._initError() ?? 'El módulo de cuentas aún no está listo.');
      throw new AccountError('Las cuentas no están configuradas en esta instalación.');
    }
    return this.supabase;
  }

  /**
   * Registro con correo y contraseña. La app espera que en Supabase esté desactivado
   * “Confirm email”: así la cuenta queda lista al instante, sin enviar correos.
   */
  async signUp(email: string, password: string): Promise<void> {
    const { data, error } = await this.requireClient().auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) {
      throw new AccountError(
        'Tu cuenta se creó, pero Supabase está pidiendo confirmar el correo. Desactiva “Confirm email” en Supabase (ver README) e ingresa con tu correo y contraseña.',
      );
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.requireClient().auth.signOut();
    if (error) throw error;
    this.applySession(null);
  }
}
