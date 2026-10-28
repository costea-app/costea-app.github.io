import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { Business, Material, Product } from '../../core/models/domain';
import { CostingResultView } from '../../shared/costing-result-view';
import { ReportDetails } from './report-details';

@Component({
  selector: 'app-product-report',
  imports: [RouterLink, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, CostingResultView, ReportDetails],
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando reporte" />
    } @else if (error()) {
      <div class="state" role="alert">
        <mat-icon aria-hidden="true">error</mat-icon>
        <h1>No pudimos cargar el reporte</h1>
        <p>{{ error() }}</p>
        <a mat-flat-button routerLink="/app">Volver</a>
      </div>
    } @else if (product() && business() && result(); as r) {
      @let b = business()!;
      @let p = product()!;
      <nav class="breadcrumb no-print" aria-label="Ruta de navegación">
        <a routerLink="/app">Mis negocios</a> › <a [routerLink]="['/app/negocios', b.id, 'productos']">{{ b.name }}</a>
      </nav>
      <div class="page-header">
        <div class="page-header-text">
          <p class="muted small">{{ b.name }} · Reporte de costeo · {{ today | date: 'd MMM y' }}</p>
          <h1>{{ p.name }}</h1>
          @if (p.description) { <p>{{ p.description }}</p> }
        </div>
        <div class="actions no-print">
          <a mat-stroked-button [routerLink]="['/app/negocios', b.id, 'productos', p.id, 'editar']"><mat-icon>edit</mat-icon> Editar</a>
          <button mat-stroked-button (click)="saveSnapshot()" [disabled]="saving()"><mat-icon>bookmark_add</mat-icon> Guardar reporte</button>
          <button mat-flat-button (click)="print()"><mat-icon>print</mat-icon> Imprimir o guardar PDF</button>
        </div>
      </div>
      <app-costing-result-view [result]="r" [currency]="b.currency" [mode]="p.costingMode" />
      <app-report-details [product]="p" [result]="r" [currency]="b.currency" />
      <p class="small muted">Valores en {{ b.currency }}, antes de impuestos. Generado con Costea.</p>
    }
  `,
})
export class ProductReportPage {
  readonly businessId = input.required<string>();
  readonly productId = input.required<string>();
  private readonly data = inject(DataService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly today = new Date();

  readonly business = signal<Business | null>(null);
  readonly product = signal<Product | null>(null);
  readonly materials = signal<Material[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = computed(() => {
    const b = this.business();
    const p = this.product();
    return b && p ? this.data.costing(p, this.materials(), b) : null;
  });

  constructor() {
    effect(() => void this.load(this.businessId(), this.productId()));
  }

  private async load(businessId: string, productId: string): Promise<void> {
    this.loading.set(true);
    try {
      const [b, p, m] = await Promise.all([
        this.data.repo.getBusiness(businessId),
        this.data.repo.getProduct(productId),
        this.data.repo.listMaterials(businessId),
      ]);
      if (!b || !p || p.businessId !== b.id) throw new Error('not found');
      this.business.set(b);
      this.product.set(p);
      this.materials.set(m);
    } catch (e) {
      this.error.set(errorMessage(e, 'El producto no existe o no pertenece a tu cuenta.'));
    } finally {
      this.loading.set(false);
    }
  }

  print(): void {
    window.print();
  }

  async saveSnapshot(): Promise<void> {
    this.saving.set(true);
    try {
      const s = await this.data.saveSnapshot(this.product()!, this.materials(), this.business()!);
      const ref = this.snack.open('Reporte guardado. Conservará estos valores aunque cambies los datos.', 'Ver');
      ref.onAction().subscribe(() => void this.router.navigate(['/app/negocios', s.businessId, 'reportes', s.id]));
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar');
    } finally {
      this.saving.set(false);
    }
  }
}
