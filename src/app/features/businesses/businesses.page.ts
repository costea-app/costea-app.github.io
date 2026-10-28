import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { SessionService } from '../../core/auth/session.service';
import { Business } from '../../core/models/domain';
import { BusinessDialog } from './business-dialog';

@Component({
  selector: 'app-businesses',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="page-header">
      <div class="page-header-text">
        <h1>Mis negocios</h1>
        <p>Cada negocio tiene sus propios materiales, productos y moneda.</p>
      </div>
      <button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> Nuevo negocio</button>
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando negocios" />
    } @else if (error()) {
      <div class="state" role="alert">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        <h2>No pudimos cargar tus negocios</h2>
        <p>{{ error() }}</p>
        <button mat-flat-button (click)="load()">Reintentar</button>
      </div>
    } @else if (businesses().length === 0) {
      <div class="state card">
        <mat-icon aria-hidden="true">storefront</mat-icon>
        <h2>Empieza creando tu negocio</h2>
        <p>Ponle un nombre, elige la moneda y luego agrega tus materiales y productos.</p>
        <button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> Crear mi primer negocio</button>
      </div>
    } @else {
      <ul class="grid-cards" role="list" style="list-style:none;padding:0;margin:0">
        @for (b of businesses(); track b.id) {
          <li>
            <a class="card item-card business-link" [routerLink]="['/app/negocios', b.id]">
              <div class="item-card-head">
                <h2 style="font-size:1.2rem">{{ b.name }}</h2>
                <mat-icon aria-hidden="true">chevron_right</mat-icon>
              </div>
              <p class="muted">{{ b.category || 'Sin categoría' }} · {{ b.currency }}</p>
            </a>
          </li>
        }
      </ul>
    }
  `,
  styles: `.business-link { text-decoration: none; color: inherit; transition: border-color .15s; } .business-link:hover { border-color: var(--c-primary); }`,
})
export class BusinessesPage implements OnInit {
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly businesses = signal<Business[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.businesses.set(await this.data.repo.listBusinesses());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  create(): void {
    this.dialog
      .open(BusinessDialog, { width: '640px', maxWidth: '96vw', autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((b?: Business) => {
        if (b) void this.router.navigate(['/app/negocios', b.id]);
      });
  }
}
