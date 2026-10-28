import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { ReportSnapshot } from '../../core/models/snapshot';
import { confirmAction } from '../../shared/confirm-dialog';
import { MoneyPipe } from '../../shared/format.pipes';
import { StatusChip } from '../../shared/status-chip';
import { BusinessContext } from './business-context';

@Component({
  selector: 'app-reports',
  imports: [RouterLink, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, MoneyPipe, StatusChip],
  template: `
    <p class="muted">
      Un reporte guardado es una foto del costeo en ese momento: conserva sus valores aunque después cambies precios de materiales o el producto.
    </p>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando reportes" />
    } @else if (error()) {
      <div class="state" role="alert"><h2>No pudimos cargar los reportes</h2><p>{{ error() }}</p></div>
    } @else if (snapshots().length === 0) {
      <div class="state card">
        <mat-icon aria-hidden="true">description</mat-icon>
        <h2>Aún no has guardado reportes</h2>
        <p>Abre el resultado de un producto y usa “Guardar reporte” para conservar el costeo de hoy.</p>
      </div>
    } @else {
      <div class="card table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Reportes guardados</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th><th scope="col">Fecha</th><th scope="col" class="num">Costo por unidad</th>
              <th scope="col" class="num">Precio sugerido</th><th scope="col">Estado</th><th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (s of snapshots(); track s.id) {
              <tr>
                <th scope="row"><a [routerLink]="['/app/negocios', s.businessId, 'reportes', s.id]">{{ s.productName }}</a></th>
                <td>{{ s.createdAt | date: 'd MMM y, h:mm a' }}</td>
                <td class="num">{{ s.unitCost | money: s.currency }}</td>
                <td class="num">{{ s.suggestedPrice | money: s.currency }}</td>
                <td><app-status-chip [status]="s.status" /></td>
                <td class="num"><button mat-icon-button (click)="remove(s)" [attr.aria-label]="'Eliminar reporte de ' + s.productName"><mat-icon>delete</mat-icon></button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class ReportsPage {
  private readonly ctx = inject(BusinessContext);
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly snapshots = signal<ReportSnapshot[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const b = this.ctx.business();
      if (b) void this.load(b.id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.snapshots.set(await this.data.repo.listSnapshots(id));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async remove(s: ReportSnapshot): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: '¿Eliminar este reporte?',
      message: `Se eliminará el reporte de “${s.productName}”. El producto no se modifica.`,
      confirmLabel: 'Eliminar reporte',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.data.repo.deleteSnapshot(s.id);
      this.snapshots.update((l) => l.filter((x) => x.id !== s.id));
      this.snack.open('Reporte eliminado.');
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar');
    }
  }
}
