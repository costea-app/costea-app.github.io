import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { formatMoney, toLocaleInput } from '../../core/engine/number-format';
import { ALL_UNITS, UNITS, compatibleUnits } from '../../core/engine/units';
import { Decimal } from '../../core/engine/decimal';
import { Business, Material, Product, Unit } from '../../core/models/domain';
import { newMaterial } from '../../core/models/factories';
import { canonical, decimalValidator, fieldError } from '../../shared/decimal-field';

export interface MaterialDialogData {
  business: Business;
  material?: Material;
  /** Para explicar el impacto del cambio de precio. */
  products?: Product[];
  materials?: Material[];
  initialName?: string;
}

interface Impact {
  name: string;
  before: string | null;
  after: string | null;
}

@Component({
  selector: 'app-material-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>{{ data.material ? 'Editar material' : 'Nuevo material' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="stack">
        @if (error()) { <div class="notice notice-error" role="alert"><mat-icon aria-hidden="true">error</mat-icon><div>{{ error() }}</div></div> }
        <mat-form-field>
          <mat-label>¿Qué compraste?</mat-label>
          <input matInput formControlName="name" maxlength="120" placeholder="Harina de trigo, cera de soya…" required />
          @if (form.controls.name.invalid) { <mat-error>{{ err(form.controls.name) }}</mat-error> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>¿Cuánto te costó?</mat-label>
          <input matInput formControlName="purchasePrice" inputmode="decimal" required />
          <mat-hint>{{ money(form.controls.purchasePrice.value) }}</mat-hint>
          @if (form.controls.purchasePrice.invalid) { <mat-error>{{ err(form.controls.purchasePrice) }}</mat-error> }
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>¿Cuánto trae?</mat-label>
            <input matInput formControlName="purchaseQuantity" inputmode="decimal" required />
            <mat-hint>Por ejemplo, 1 kg, 500 g o 30 unidades.</mat-hint>
            @if (form.controls.purchaseQuantity.invalid) { <mat-error>{{ err(form.controls.purchaseQuantity) }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Unidad</mat-label>
            <mat-select formControlName="unit">
              @for (u of allowedUnits(); track u) { <mat-option [value]="u">{{ unitLabel(u) }}</mat-option> }
            </mat-select>
            @if (inUse()) { <mat-hint>Ya se usa en productos: solo unidades compatibles.</mat-hint> }
          </mat-form-field>
        </div>
        @if (unitPrice(); as up) { <p class="formula" aria-live="polite">Precio por {{ unitShort() }}: <strong>{{ up }}</strong></p> }
        <mat-checkbox formControlName="isEstimated">El precio es estimado (no lo tengo exacto)</mat-checkbox>

        @if (impacts().length) {
          <div class="explain" aria-live="polite">
            <p><strong>Si guardas este cambio, se recalculan los costeos actuales de:</strong></p>
            <ul>
              @for (i of impacts(); track i.name) {
                <li>{{ i.name }}: {{ i.before }} → <strong>{{ i.after }}</strong> por unidad</li>
              }
            </ul>
            <p>Los reportes que ya guardaste <strong>no cambian</strong>: conservan los valores del momento en que los guardaste.</p>
          </div>
        }
        @if (saving()) { <mat-progress-bar mode="indeterminate" aria-label="Guardando" /> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Guardar material</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class MaterialDialog {
  readonly data = inject<MaterialDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<MaterialDialog, Material>);
  private readonly dataService = inject(DataService);
  readonly err = fieldError;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private readonly m = this.data.material;
  readonly form = inject(NonNullableFormBuilder).group({
    name: [this.m?.name ?? this.data.initialName ?? '', [Validators.required, Validators.maxLength(120)]],
    purchasePrice: [toLocaleInput(this.m?.purchasePrice), decimalValidator({ required: true, min: 0 })],
    purchaseQuantity: [toLocaleInput(this.m?.purchaseQuantity), decimalValidator({ required: true, min: 0, minExclusive: true })],
    unit: [(this.m?.unit ?? 'g') as Unit],
    isEstimated: [this.m?.isEstimated ?? false],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly usedBy = (this.data.products ?? []).filter((p) => this.m && p.materials.some((l) => l.materialId === this.m!.id));
  readonly inUse = signal(this.usedBy.length > 0);
  readonly allowedUnits = computed(() => (this.m && this.inUse() ? compatibleUnits(this.m.unit) : ALL_UNITS));

  unitLabel(u: Unit): string {
    return `${UNITS[u].label} (${UNITS[u].short})`;
  }
  unitShort(): string {
    return UNITS[this.form.controls.unit.value].short;
  }
  money(v: string): string {
    const c = canonical(v, null);
    return c === null ? '' : `= ${formatMoney(c, this.data.business.currency)}`;
  }

  readonly unitPrice = computed(() => {
    const v = this.value();
    const price = canonical(v.purchasePrice, null);
    const qty = canonical(v.purchaseQuantity, null);
    if (price === null || qty === null || new Decimal(qty).lte(0) || new Decimal(price).lt(0)) return null;
    return formatMoney(new Decimal(price).div(qty).toFixed(), this.data.business.currency, 2);
  });

  private draft(): Material | null {
    const v = this.form.getRawValue();
    const price = canonical(v.purchasePrice, null);
    const qty = canonical(v.purchaseQuantity, null);
    if (price === null || qty === null) return null;
    return {
      ...(this.m ?? newMaterial(this.data.business.id)),
      name: v.name.trim(),
      purchasePrice: price,
      purchaseQuantity: qty,
      unit: v.unit,
      isEstimated: v.isEstimated,
    };
  }

  readonly impacts = computed<Impact[]>(() => {
    this.value();
    if (!this.m || this.usedBy.length === 0 || this.form.invalid) return [];
    const edited = this.draft();
    if (!edited) return [];
    const all = this.data.materials ?? [];
    const swapped = all.map((x) => (x.id === edited.id ? edited : x));
    return this.usedBy.map((p) => ({
      name: p.name,
      before: formatMoney(this.dataService.costing(p, all, this.data.business).unitCost, this.data.business.currency),
      after: formatMoney(this.dataService.costing(p, swapped, this.data.business).unitCost, this.data.business.currency),
    }));
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const draft = this.draft();
    if (this.form.invalid || !draft) return;
    if (!draft.name) {
      this.form.controls.name.setErrors({ required: true });
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.dataService.repo.saveMaterial(draft));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
