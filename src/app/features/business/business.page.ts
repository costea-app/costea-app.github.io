import { Component, effect, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { Business } from '../../core/models/domain';
import { confirmAction } from '../../shared/confirm-dialog';
import { MoneyPipe, QuantityPipe } from '../../shared/format.pipes';
import { BusinessDialog } from '../businesses/business-dialog';
import { BusinessContext } from './business-context';

@Component({
  selector: 'app-business',
  providers: [BusinessContext],
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatTabsModule, MatProgressBarModule, MoneyPipe, QuantityPipe],
  template: `
    <nav class="breadcrumb" aria-label="Ruta de navegación"><a routerLink="/app">Mis negocios</a></nav>
    @if (ctx.loading() && !ctx.business()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando negocio" />
    } @else if (ctx.error()) {
      <div class="state" role="alert">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        <h1>No pudimos cargar el negocio</h1>
        <p>{{ ctx.error() }}</p>
        <button mat-flat-button (click)="ctx.load(businessId())">Reintentar</button>
      </div>
    } @else if (ctx.notFound()) {
      <div class="state">
        <mat-icon aria-hidden="true">search_off</mat-icon>
        <h1>Este negocio no existe</h1>
        <p>Puede que se haya eliminado o que pertenezca a otra cuenta.</p>
        <a mat-flat-button routerLink="/app">Ver mis negocios</a>
      </div>
    } @else if (ctx.business(); as b) {
      <div class="page-header">
        <div class="page-header-text">
          <h1>{{ b.name }}</h1>
          <p>
            {{ b.category || 'Sin categoría' }} · {{ b.currency }}
            @if (b.sharedMonthlyAmount !== '0') { · Gastos compartidos: {{ b.sharedMonthlyAmount | money: b.currency }} al mes ({{ b.productiveHoursPerMonth | qty }} h de producción) }
          </p>
        </div>
        <div class="actions">
          <button mat-stroked-button (click)="edit(b)"><mat-icon>edit</mat-icon> Editar negocio</button>
          <button mat-button (click)="remove(b)"><mat-icon>delete</mat-icon> Eliminar</button>
        </div>
      </div>
      <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Secciones del negocio">
        <a mat-tab-link routerLink="productos" routerLinkActive #p="routerLinkActive" [active]="p.isActive">Productos</a>
        <a mat-tab-link routerLink="materiales" routerLinkActive #m="routerLinkActive" [active]="m.isActive">Materiales</a>
        <a mat-tab-link routerLink="reportes" routerLinkActive #r="routerLinkActive" [active]="r.isActive">Reportes guardados</a>
      </nav>
      <mat-tab-nav-panel #panel class="tab-panel"><router-outlet /></mat-tab-nav-panel>
    }
  `,
  styles: `.tab-panel { display: block; padding-top: 20px; }`,
})
export class BusinessPage {
  readonly businessId = input.required<string>();
  readonly ctx = inject(BusinessContext);
  private readonly dialog = inject(MatDialog);
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  constructor() {
    effect(() => void this.ctx.load(this.businessId()));
  }

  edit(b: Business): void {
    this.dialog
      .open(BusinessDialog, { data: b, width: '640px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((saved?: Business) => {
        if (saved) {
          this.ctx.business.set(saved);
          this.snack.open('Negocio actualizado. Los costeos se recalcularon con los nuevos datos.');
        }
      });
  }

  async remove(b: Business): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: `¿Eliminar “${b.name}”?`,
      message: 'Se eliminarán también sus materiales, productos y reportes guardados. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar negocio',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.data.repo.deleteBusiness(b.id);
      this.snack.open('Negocio eliminado.');
      await this.router.navigateByUrl('/app');
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar');
    }
  }
}
