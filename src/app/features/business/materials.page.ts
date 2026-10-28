import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { Decimal } from '../../core/engine/decimal';
import { UNITS } from '../../core/engine/units';
import { Material, Product } from '../../core/models/domain';
import { confirmAction } from '../../shared/confirm-dialog';
import { MoneyPipe, QuantityPipe } from '../../shared/format.pipes';
import { MaterialDialog, MaterialDialogData } from '../materials/material-dialog';
import { BusinessContext } from './business-context';

@Component({
  selector: 'app-materials',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MoneyPipe, QuantityPipe],
  template: `
    @let b = ctx.business()!;
    <div class="page-header">
      <mat-form-field class="search">
        <mat-label>Buscar material</mat-label>
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input matInput type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </mat-form-field>
      <button mat-flat-button (click)="open()"><mat-icon>add</mat-icon> Nuevo material</button>
    </div>
    <p class="muted">Registra cada material una sola vez y reutilízalo en todos tus productos.</p>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando" />
    } @else if (ctx.materials().length === 0) {
      <div class="state card">
        <mat-icon aria-hidden="true">inventory_2</mat-icon>
        <h2>Tu biblioteca de materiales está vacía</h2>
        <p>Agrega lo que compras para producir: harina, cera, frascos, hilo… Indica cuánto te costó y cuánto trae.</p>
        <button mat-flat-button (click)="open()">Agregar mi primer material</button>
      </div>
    } @else {
      <div class="card table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Materiales de {{ b.name }}</caption>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col" class="num">Te costó</th>
              <th scope="col" class="num">Trae</th>
              <th scope="col" class="num">Precio por unidad de medida</th>
              <th scope="col">Se usa en</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (m of filtered(); track m.id) {
              <tr>
                <th scope="row">{{ m.name }}@if (m.isEstimated) { <span class="tag-est">estimado</span> }</th>
                <td class="num">{{ m.purchasePrice | money: b.currency }}</td>
                <td class="num">{{ m.purchaseQuantity | qty: m.unit }}</td>
                <td class="num">{{ perUnit(m) | money: b.currency : 2 }} / {{ short(m) }}</td>
                <td>{{ usage(m) }}</td>
                <td class="num">
                  <button mat-icon-button (click)="open(m)" [attr.aria-label]="'Editar ' + m.name"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button (click)="remove(m)" [attr.aria-label]="'Eliminar ' + m.name"><mat-icon>delete</mat-icon></button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">Ningún material coincide con “{{ query() }}”.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `.search { flex: 1 1 280px; max-width: 420px; }`,
})
export class MaterialsPage {
  readonly ctx = inject(BusinessContext);
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.ctx.materials().filter((m) => m.name.toLowerCase().includes(q)) : this.ctx.materials();
  });

  constructor() {
    effect(() => {
      const b = this.ctx.business();
      if (b) void this.loadProducts(b.id);
    });
  }

  private async loadProducts(businessId: string): Promise<void> {
    try {
      this.products.set(await this.data.repo.listProducts(businessId));
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar');
    } finally {
      this.loading.set(false);
    }
  }

  perUnit(m: Material): string {
    return new Decimal(m.purchasePrice).div(m.purchaseQuantity).toFixed();
  }
  short(m: Material): string {
    return UNITS[m.unit].short;
  }
  usage(m: Material): string {
    const names = this.products().filter((p) => p.materials.some((l) => l.materialId === m.id)).map((p) => p.name);
    return names.length ? names.join(', ') : '—';
  }

  open(material?: Material): void {
    const data: MaterialDialogData = {
      business: this.ctx.business()!,
      material,
      products: this.products(),
      materials: this.ctx.materials(),
    };
    this.dialog
      .open(MaterialDialog, { data, width: '560px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe(async (saved?: Material) => {
        if (!saved) return;
        await this.ctx.reloadMaterials();
        this.snack.open(material ? 'Material actualizado. Los costeos actuales ya usan el nuevo valor.' : 'Material agregado.');
      });
  }

  async remove(m: Material): Promise<void> {
    const ok = await confirmAction(this.dialog, {
      title: `¿Eliminar “${m.name}”?`,
      message: 'Solo se puede eliminar si ningún producto lo usa. Los reportes guardados no se ven afectados.',
      confirmLabel: 'Eliminar material',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.data.repo.deleteMaterial(m.id);
      await this.ctx.reloadMaterials();
      this.snack.open('Material eliminado.');
    } catch (e) {
      this.snack.open(errorMessage(e), 'Cerrar', { duration: 8000 });
    }
  }
}
