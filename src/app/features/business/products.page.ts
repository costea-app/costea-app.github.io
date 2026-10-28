import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { CostingResult, suggestedPrice } from '../../core/engine/costing';
import { Product } from '../../core/models/domain';
import { confirmAction } from '../../shared/confirm-dialog';
import { MoneyPipe } from '../../shared/format.pipes';
import { StatusChip } from '../../shared/status-chip';
import { BusinessContext } from './business-context';

interface ProductCard {
  product: Product;
  result: CostingResult;
  price: string | null;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

@Component({
  selector: 'app-products',
  imports: [RouterLink, FormsModule, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MoneyPipe, StatusChip],
  template: `
    @let b = ctx.business()!;
    <div class="page-header">
      <mat-form-field class="search">
        <mat-label>Buscar producto</mat-label>
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input matInput type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </mat-form-field>
      <a mat-flat-button [routerLink]="['/app/negocios', b.id, 'productos', 'nuevo']"><mat-icon>add</mat-icon> Nuevo producto</a>
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando productos" />
    } @else if (error()) {
      <div class="state" role="alert">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        <h2>No pudimos cargar los productos</h2>
        <p>{{ error() }}</p>
        <button mat-flat-button (click)="load()">Reintentar</button>
      </div>
    } @else if (cards().length === 0) {
      <div class="state card">
        <mat-icon aria-hidden="true">bakery_dining</mat-icon>
        <h2>Aún no tienes productos</h2>
        <p>Costea tu primer producto: te guiamos paso a paso para que no se te escape ningún costo.</p>
        <a mat-flat-button [routerLink]="['/app/negocios', b.id, 'productos', 'nuevo']">Costear mi primer producto</a>
      </div>
    } @else {
      <p class="visually-hidden" aria-live="polite">{{ filtered().length }} productos</p>
      @if (filtered().length === 0) {
        <p class="state">Ningún producto coincide con “{{ query() }}”.</p>
      }
      <ul class="grid-cards" role="list" style="list-style:none;padding:0;margin:0">
        @for (c of filtered(); track c.product.id) {
          <li>
            <article class="card item-card" [attr.aria-labelledby]="'p-' + c.product.id">
              <div class="item-card-head">
                <h3 [id]="'p-' + c.product.id">{{ c.product.name }}</h3>
                <app-status-chip [status]="c.result.status" />
              </div>
              <p class="muted small" style="margin:0">
                {{ c.product.costingMode === 'batch' ? 'Tanda de ' + c.result.sellableUnits + ' unidades vendibles' : 'Costeo por unidad' }}
                @if (c.result.pendingCategories.length) { · {{ c.result.pendingCategories.length }} pendientes }
              </p>
              <div class="item-figures">
                <div class="figure"><span>Costo por unidad</span><strong>{{ c.result.unitCost | money: b.currency }}</strong></div>
                <div class="figure">
                  <span>Precio sugerido{{ c.result.pendingCategories.length ? ' (provisional)' : '' }}</span>
                  <strong>{{ c.price | money: b.currency }}</strong>
                </div>
              </div>
              @if (!c.result.valid) { <p class="error-text small" style="margin:0">Hay datos por corregir.</p> }
              <div class="item-card-actions">
                <a mat-button [routerLink]="['/app/negocios', b.id, 'productos', c.product.id, 'reporte']">Ver resultado</a>
                <a mat-stroked-button [routerLink]="['/app/negocios', b.id, 'productos', c.product.id, 'editar']">Editar</a>
                <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Más acciones para ' + c.product.name">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="duplicate(c.product)"><mat-icon>content_copy</mat-icon>Duplicar</button>
                  <button mat-menu-item (click)="remove(c.product)"><mat-icon>delete</mat-icon>Eliminar</button>
                </mat-menu>
              </div>
            </article>
          </li>
        }
      </ul>
    }
  `,
  styles: `.search { flex: 1 1 280px; max-width: 420px; }`,
})
export class ProductsPage {
  readonly ctx = inject(BusinessContext);
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly query = signal('');

  readonly cards = computed<ProductCard[]>(() => {
    const business = this.ctx.business();
    if (!business) return [];
    return this.products().map((product) => {
      const result = this.data.costing(product, this.ctx.materials(), business);
      return { product, result, price: suggestedPrice(result) };
    });
  });

  readonly filtered = computed(() => {
    const q = normalize(this.query().trim());
    return q ? this.cards().filter((c) => normalize(c.product.name).includes(q)) : this.cards();
  });

  constructor() {
    effect(() => {
      if (this.ctx.business()?.id) void this.load();
    });
  }

  async load(): Promise<void> {
    const business = this.ctx.business();
    if (!business) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.products.set(await this.data.repo.listProducts(business.id));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async duplicate(product: Product): Promise<void> {
    try {
      const copy = await this.data.duplicateProduct(product, this.products().map((p) => p.name));
      this.products.update((list) => [...list, copy].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      this.snack.open(`Se creó “${copy.name}”.`);
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar');
    }
  }

  async remove(product: Product): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: `¿Eliminar “${product.name}”?`,
      message: 'Se eliminará el costeo de este producto. Los reportes que ya guardaste se conservan.',
      confirmLabel: 'Eliminar producto',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.data.repo.deleteProduct(product.id);
      this.products.update((list) => list.filter((p) => p.id !== product.id));
      this.snack.open('Producto eliminado.');
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar');
    }
  }
}
