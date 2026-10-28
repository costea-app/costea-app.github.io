import { Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { ReportSnapshot } from '../../core/models/snapshot';
import { CostingResultView } from '../../shared/costing-result-view';
import { ReportDetails } from './report-details';

/** Reporte guardado: muestra los valores congelados, sin recalcular. */
@Component({
  selector: 'app-snapshot',
  imports: [RouterLink, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, CostingResultView, ReportDetails],
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando reporte" />
    } @else if (error() || !snapshot()) {
      <div class="state" role="alert">
        <mat-icon aria-hidden="true">error</mat-icon>
        <h1>No encontramos este reporte</h1>
        <p>{{ error() ?? 'Puede que se haya eliminado.' }}</p>
        <a mat-flat-button routerLink="/app">Volver</a>
      </div>
    } @else if (snapshot(); as s) {
      <nav class="breadcrumb no-print" aria-label="Ruta de navegación">
        <a routerLink="/app">Mis negocios</a> › <a [routerLink]="['/app/negocios', s.businessId, 'reportes']">{{ s.data.business.name }}</a>
      </nav>
      <div class="page-header">
        <div class="page-header-text">
          <p class="muted small">{{ s.data.business.name }} · Reporte guardado el {{ s.createdAt | date: 'd MMM y, h:mm a' }}</p>
          <h1>{{ s.productName }}</h1>
        </div>
        <div class="actions no-print">
          @if (s.productId) {
            <a mat-stroked-button [routerLink]="['/app/negocios', s.businessId, 'productos', s.productId, 'reporte']">Ver costeo actual</a>
          }
          <button mat-flat-button (click)="print()"><mat-icon>print</mat-icon> Imprimir o guardar PDF</button>
        </div>
      </div>
      <div class="notice notice-info no-print">
        <mat-icon aria-hidden="true">photo_camera</mat-icon>
        <div>Este reporte conserva los valores del momento en que se guardó. Los cambios posteriores en materiales o en el producto no lo modifican.</div>
      </div>
      <app-costing-result-view [result]="s.data.result" [currency]="s.currency" [mode]="s.data.product.costingMode" />
      <app-report-details [product]="s.data.product" [result]="s.data.result" [currency]="s.currency" />
      <p class="small muted">Valores en {{ s.currency }}, antes de impuestos. Generado con Costea.</p>
    }
  `,
})
export class SnapshotPage {
  readonly snapshotId = input.required<string>();
  private readonly data = inject(DataService);
  readonly snapshot = signal<ReportSnapshot | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => void this.load(this.snapshotId()));
  }

  private async load(id: string): Promise<void> {
    try {
      this.snapshot.set(await this.data.repo.getSnapshot(id));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  print(): void {
    window.print();
  }
}
