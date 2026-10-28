import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SessionService } from '../../core/auth/session.service';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, MatButtonModule, MatIconModule, Logo],
  template: `
    <main id="contenido" class="auth-page">
      <a routerLink="/" class="auth-logo" aria-label="Volver al inicio de Costea"><app-logo /></a>
      <div class="card auth-card">
        <h1>{{ heading() }}</h1>
        @if (requiresAccounts() && !session.accountsAvailable) {
          <div class="notice notice-warning" role="alert">
            <mat-icon aria-hidden="true">cloud_off</mat-icon>
            <div>
              <strong>Las cuentas no están configuradas en esta instalación.</strong>
              Falta la configuración pública de Supabase (consulta el README). Mientras tanto puedes usar el modo demo,
              que guarda los datos solo en este navegador.
              <div class="actions" style="margin-top: 8px">
                <button mat-stroked-button type="button" (click)="tryDemo()">Usar el modo demo</button>
              </div>
            </div>
          </div>
        }
        <ng-content />
      </div>
    </main>
  `,
  styles: `
    .auth-page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 32px 16px; gap: 24px;
      background: linear-gradient(180deg, #e6f2e4 0%, var(--c-bg) 60%); }
    .auth-logo { text-decoration: none; }
    .auth-card { width: 100%; max-width: 440px; }
    h1 { font-size: 1.6rem; }
  `,
})
export class AuthLayout {
  readonly heading = input.required<string>();
  readonly requiresAccounts = input(true);
  readonly session = inject(SessionService);
  private readonly router = inject(Router);

  async tryDemo(): Promise<void> {
    this.session.startDemo();
    await this.router.navigateByUrl('/app');
  }
}
