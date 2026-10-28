import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SessionService, authErrorMessage } from '../../core/auth/session.service';
import { confirmAction } from '../../shared/confirm-dialog';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, Logo],
  template: `
    <mat-toolbar class="app-toolbar">
      <div class="container toolbar-inner">
        <a routerLink="/app" class="brand" aria-label="Costea, ir a mis negocios"><app-logo /></a>
        <span class="spacer"></span>
        @if (session.isDemo()) {
          <button mat-stroked-button [matMenuTriggerFor]="demoMenu" aria-label="Opciones del modo demo">
            <mat-icon>science</mat-icon> Modo demo
          </button>
          <mat-menu #demoMenu="matMenu">
            <button mat-menu-item (click)="resetDemo()"><mat-icon>restart_alt</mat-icon>Reiniciar datos de ejemplo</button>
            <button mat-menu-item (click)="exitDemo(false)"><mat-icon>logout</mat-icon>Salir del demo (conservar datos)</button>
            <button mat-menu-item (click)="exitDemo(true)"><mat-icon>delete_forever</mat-icon>Salir y borrar datos del demo</button>
          </mat-menu>
        } @else if (session.user(); as user) {
          <button mat-button [matMenuTriggerFor]="userMenu" aria-label="Menú de la cuenta">
            <mat-icon>account_circle</mat-icon>
            <span class="user-email">{{ user.email }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <button mat-menu-item (click)="signOut()"><mat-icon>logout</mat-icon>Cerrar sesión</button>
          </mat-menu>
        }
      </div>
    </mat-toolbar>

    @if (session.isDemo()) {
      <div class="demo-banner" role="status">
        <div class="container">
          <mat-icon aria-hidden="true">info</mat-icon>
          <span><strong>Estás en modo demo.</strong> Tus datos se guardan solo en este navegador: no se sincronizan ni se envían a ninguna cuenta.</span>
        </div>
      </div>
    }

    <main id="contenido" class="container page">
      <router-outlet />
    </main>
  `,
  styles: `
    .app-toolbar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid var(--c-border); padding: 0; }
    .toolbar-inner { display: flex; align-items: center; gap: 8px; }
    .brand { text-decoration: none; display: inline-flex; }
    .spacer { flex: 1; }
    .user-email { max-width: 30vw; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: bottom; }
    @media (max-width: 520px) { .user-email { display: none; } }
    .demo-banner { background: var(--c-warning-bg); color: var(--c-warning-ink); border-bottom: 1px solid var(--c-warning-border); font-size: .92rem; }
    .demo-banner .container { display: flex; gap: 8px; align-items: center; padding-top: 8px; padding-bottom: 8px; }
  `,
})
export class AppShell {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  async resetDemo(): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: '¿Reiniciar los datos de ejemplo?',
      message: 'Se borrarán los cambios que hiciste en el modo demo y se cargarán de nuevo los negocios de ejemplo.',
      confirmLabel: 'Reiniciar',
      danger: true,
    });
    if (!ok) return;
    this.session.resetDemo();
    await this.router.navigateByUrl('/', { skipLocationChange: true });
    await this.router.navigateByUrl('/app');
    this.snack.open('Datos de ejemplo reiniciados.');
  }

  async exitDemo(deleteData: boolean): Promise<void> {
    if (deleteData) {
      const ok = await confirmAction(this.dialog, {
        title: '¿Borrar los datos del demo?',
        message: 'Se eliminarán de este navegador todos los negocios, materiales y productos del modo demo.',
        confirmLabel: 'Borrar y salir',
        danger: true,
      });
      if (!ok) return;
    }
    this.session.exitDemo(deleteData);
    await this.router.navigateByUrl('/');
  }

  async signOut(): Promise<void> {
    try {
      await this.session.signOut();
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.snack.open(authErrorMessage(e), 'Cerrar');
    }
  }
}
