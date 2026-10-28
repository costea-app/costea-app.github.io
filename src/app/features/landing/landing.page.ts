import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SessionService } from '../../core/auth/session.service';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, MatButtonModule, MatIconModule, Logo],
  template: `
    <header class="container landing-nav">
      <app-logo />
      <nav class="actions" aria-label="Acceso">
        @if (session.mode() !== 'none') {
          <a mat-flat-button routerLink="/app">Ir a mis negocios</a>
        } @else {
          <a mat-button routerLink="/ingresar">Ingresar</a>
          <a mat-flat-button routerLink="/registro">Crear cuenta</a>
        }
      </nav>
    </header>

    <main id="contenido">
      <section class="hero">
        <div class="container hero-inner">
          <div class="hero-text">
            <p class="eyebrow">Costeo fácil para emprendedores</p>
            <h1>Que ningún costo se quede por fuera</h1>
            <p class="lead">
              Costea te guía paso a paso para saber cuánto te cuesta hacer cada producto —materiales, empaques,
              tu trabajo y los gastos del negocio— y te sugiere un precio de venta según la ganancia que quieres.
            </p>
            <div class="actions">
              <button mat-flat-button class="cta" (click)="tryDemo()" [disabled]="session.isSignedIn()">
                <mat-icon>storefront</mat-icon> Probar con un negocio de ejemplo
              </button>
              @if (session.mode() === 'none') {
                <a mat-stroked-button routerLink="/registro">Crear mi cuenta gratis</a>
              }
            </div>
            <p class="muted small">
              El ejemplo funciona sin cuenta y guarda los datos solo en este navegador.
              @if (session.isSignedIn()) { Cierra sesión si quieres probar el ejemplo. }
            </p>
          </div>
          <div class="hero-card card" aria-hidden="true">
            <p class="muted small">Pan artesanal · tanda de 12</p>
            <div class="mock-row"><span>Materiales</span><strong>$ 769</strong></div>
            <div class="mock-row"><span>Tu trabajo</span><strong>$ 1.125</strong></div>
            <div class="mock-row"><span>Empaque</span><strong>$ 180</strong></div>
            <div class="mock-row"><span>Gas y gastos compartidos</span><strong>$ 929</strong></div>
            <div class="mock-total"><span>Precio sugerido</span><strong>$ 4.700</strong></div>
          </div>
        </div>
      </section>

      <section class="container features" aria-labelledby="como-funciona">
        <h2 id="como-funciona">Así funciona</h2>
        <ol class="grid-cards steps" role="list">
          <li class="card">
            <mat-icon aria-hidden="true">inventory_2</mat-icon>
            <h3>1. Registra tus materiales</h3>
            <p>“¿Cuánto te costó?” y “¿Cuánto trae?”. Los reutilizas en todos tus productos.</p>
          </li>
          <li class="card">
            <mat-icon aria-hidden="true">checklist</mat-icon>
            <h3>2. Costea con una guía</h3>
            <p>Materiales, tu tiempo, empaques, transporte y pérdidas. Un checklist te avisa lo que falta.</p>
          </li>
          <li class="card">
            <mat-icon aria-hidden="true">sell</mat-icon>
            <h3>3. Define tu precio</h3>
            <p>Elige tu margen, suma comisiones de plataformas y redondea a un precio comercial.</p>
          </li>
        </ol>
        <p class="muted small scope-note">
          Los precios que calcula Costea son <strong>antes de impuestos</strong>. Esta versión no calcula IVA ni otros impuestos.
          Sirve para panes, pasteles, velas, accesorios, artesanías y otros productos físicos.
        </p>
      </section>
    </main>
  `,
  styles: `
    .landing-nav { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; padding-bottom: 16px; gap: 8px; }
    .hero { background: linear-gradient(180deg, #e6f2e4 0%, var(--c-bg) 100%); padding: 40px 0 56px; }
    .hero-inner { display: grid; gap: 32px; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: center; }
    @media (max-width: 820px) { .hero-inner { grid-template-columns: minmax(0, 1fr); } }
    .eyebrow { color: var(--c-primary-strong); font-weight: 800; text-transform: uppercase; letter-spacing: .06em; font-size: .85rem; }
    h1 { font-size: clamp(2rem, 4vw + 1rem, 3.2rem); letter-spacing: -.02em; }
    .lead { font-size: 1.15rem; color: var(--c-ink-2); max-width: 46ch; }
    .cta { padding: 0 20px; height: 48px; }
    .hero-card { display: flex; flex-direction: column; gap: 8px; }
    .mock-row, .mock-total { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--c-border); }
    .mock-total { border: none; font-size: 1.25rem; color: var(--c-primary-strong); font-weight: 800; }
    .features { padding: 40px 16px 64px; }
    .steps { list-style: none; padding: 0; margin: 16px 0; }
    .steps mat-icon { color: var(--c-primary); font-size: 32px; width: 32px; height: 32px; }
    .scope-note { max-width: 70ch; }
  `,
})
export class LandingPage {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);

  async tryDemo(): Promise<void> {
    this.session.startDemo();
    await this.router.navigateByUrl('/app');
  }
}
