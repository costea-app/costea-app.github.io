import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { WEEKS_PER_MONTH, monthlyProductiveHours } from '../../core/engine/costing';
import { Decimal } from '../../core/engine/decimal';
import { formatMoney, formatNumber, toLocaleInput } from '../../core/engine/number-format';
import { Business } from '../../core/models/domain';
import { newBusiness } from '../../core/models/factories';
import { canonical, decimalValidator, fieldError } from '../../shared/decimal-field';

export const CURRENCIES = [
  { code: 'COP', label: 'Peso colombiano (COP)' },
  { code: 'USD', label: 'Dólar estadounidense (USD)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
  { code: 'PEN', label: 'Sol peruano (PEN)' },
  { code: 'CLP', label: 'Peso chileno (CLP)' },
  { code: 'ARS', label: 'Peso argentino (ARS)' },
  { code: 'EUR', label: 'Euro (EUR)' },
];

const DAYS = ['1', '2', '3', '4', '5', '6', '7'];

/** Para negocios guardados antes de pedir días y horas: deduce valores razonables. */
function initialSchedule(b: Business | null): { days: string; hours: string } {
  if (b?.productionDaysPerWeek && b.productionHoursPerDay) {
    return { days: b.productionDaysPerWeek, hours: b.productionHoursPerDay };
  }
  if (b?.productiveHoursPerMonth) {
    const perDay = new Decimal(b.productiveHoursPerMonth).div(WEEKS_PER_MONTH.mul(5)).toDecimalPlaces(1);
    return { days: '5', hours: perDay.toFixed() };
  }
  return { days: '5', hours: '' };
}

@Component({
  selector: 'app-business-dialog',
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatIconModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar negocio' : 'Nuevo negocio' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="stack">
        @if (error()) { <div class="notice notice-error" role="alert"><mat-icon aria-hidden="true">error</mat-icon><div>{{ error() }}</div></div> }
        <mat-form-field>
          <mat-label>Nombre del negocio</mat-label>
          <input matInput formControlName="name" maxlength="120" required cdkFocusInitial />
          @if (form.controls.name.invalid) { <mat-error>{{ err(form.controls.name) }}</mat-error> }
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>¿Qué vendes?</mat-label>
            <input matInput formControlName="category" maxlength="80" placeholder="Panadería, velas, accesorios…" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Moneda</mat-label>
            <mat-select formControlName="currency">
              @for (c of currencies; track c.code) { <mat-option [value]="c.code">{{ c.label }}</mat-option> }
            </mat-select>
            <mat-hint>Una moneda por negocio, sin conversiones.</mat-hint>
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>¿Cuánto vale una hora de tu trabajo? (opcional)</mat-label>
          <input matInput formControlName="defaultHourlyRate" inputmode="decimal" />
          <mat-hint>Se propone en cada producto nuevo. {{ preview(form.controls.defaultHourlyRate.value) }}</mat-hint>
          @if (form.controls.defaultHourlyRate.invalid) { <mat-error>{{ err(form.controls.defaultHourlyRate) }}</mat-error> }
        </mat-form-field>

        <fieldset class="fieldset stack">
          <legend>Gastos compartidos</legend>
          <p id="shared-q" style="margin:0">
            <strong>¿Pagas cada mes cosas que no son de un solo producto?</strong><br />
            <span class="muted small">Por ejemplo: arriendo del local, internet, la luz general o la cuota de una máquina.</span>
          </p>
          <mat-button-toggle-group formControlName="hasShared" aria-labelledby="shared-q">
            <mat-button-toggle [value]="true">Sí</mat-button-toggle>
            <mat-button-toggle [value]="false">No</mat-button-toggle>
          </mat-button-toggle-group>

          @if (v().hasShared) {
            <mat-form-field>
              <mat-label>¿Cuánto suman al mes?</mat-label>
              <input matInput formControlName="sharedMonthlyAmount" inputmode="decimal" required />
              <mat-hint>{{ preview(form.controls.sharedMonthlyAmount.value) }}</mat-hint>
              @if (form.controls.sharedMonthlyAmount.invalid) { <mat-error>{{ err(form.controls.sharedMonthlyAmount) }}</mat-error> }
            </mat-form-field>
            <mat-form-field>
              <mat-label>¿Qué incluye?</mat-label>
              <input matInput formControlName="sharedExpensesNote" maxlength="500" placeholder="Arriendo, internet, luz general…" />
              <mat-hint>No incluyas cosas que ya anotes en un producto (por ejemplo, el gas del horno), para no contarlas dos veces.</mat-hint>
            </mat-form-field>

            <p style="margin:0"><strong>¿Cuánto tiempo produces?</strong></p>
            <div class="row">
              <mat-form-field>
                <mat-label>Días a la semana</mat-label>
                <mat-select formControlName="productionDaysPerWeek">
                  @for (d of days; track d) { <mat-option [value]="d">{{ d }} {{ d === '1' ? 'día' : 'días' }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Horas en un día normal</mat-label>
                <input matInput formControlName="productionHoursPerDay" inputmode="decimal" required />
                <span matTextSuffix>h</span>
                @if (form.controls.productionHoursPerDay.invalid) { <mat-error>{{ err(form.controls.productionHoursPerDay) }}</mat-error> }
              </mat-form-field>
            </div>

            @if (calc(); as c) {
              <div class="explain" aria-live="polite">
                <p>Produces unas <strong>{{ c.hours }} horas al mes</strong>&nbsp;<span class="muted">({{ c.days }} días × {{ c.perDay }} h × 4,33 semanas)</span>.</p>
                <p>Entonces, cada hora de producción le suma <strong>{{ c.perHour }}</strong> de gastos compartidos al costo.
                  Por ejemplo, una tanda que tarda 2 horas suma <strong>{{ c.twoHours }}</strong>.</p>
                <p class="muted small">Es una estimación: el gasto se reparte según el tiempo que ocupa cada producto, no en partes iguales.</p>
              </div>
            }
          }
        </fieldset>
        @if (saving()) { <mat-progress-bar mode="indeterminate" aria-label="Guardando" /> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.fieldset { border: 1px solid var(--c-border); border-radius: 12px; padding: 12px 14px 16px; margin: 0; } legend { font-weight: 700; padding: 0 6px; }`,
})
export class BusinessDialog {
  readonly data = inject<Business | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly ref = inject(MatDialogRef<BusinessDialog, Business>);
  private readonly dataService = inject(DataService);
  readonly currencies = CURRENCIES;
  readonly days = DAYS;
  readonly err = fieldError;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private readonly schedule = initialSchedule(this.data);
  readonly form = inject(NonNullableFormBuilder).group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    category: [this.data?.category ?? ''],
    currency: [this.data?.currency ?? 'COP'],
    defaultHourlyRate: [toLocaleInput(this.data?.defaultHourlyRate), decimalValidator({ min: 0 })],
    hasShared: [!!this.data && this.data.sharedMonthlyAmount !== '0'],
    sharedMonthlyAmount: [
      this.data && this.data.sharedMonthlyAmount !== '0' ? toLocaleInput(this.data.sharedMonthlyAmount) : '',
      decimalValidator({ required: true, min: 0, minExclusive: true }),
    ],
    sharedExpensesNote: [this.data?.sharedExpensesNote ?? ''],
    productionDaysPerWeek: [this.schedule.days],
    productionHoursPerDay: [
      toLocaleInput(this.schedule.hours),
      decimalValidator({ required: true, min: 0, minExclusive: true, max: 24 }),
    ],
  });
  readonly v = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  constructor() {
    // Las preguntas de gastos compartidos solo se validan cuando la respuesta es "Sí".
    const toggle = (on: boolean) => {
      const c = this.form.controls;
      for (const ctrl of [c.sharedMonthlyAmount, c.productionDaysPerWeek, c.productionHoursPerDay]) {
        if (on) ctrl.enable({ emitEvent: false });
        else ctrl.disable({ emitEvent: false });
      }
    };
    toggle(this.form.controls.hasShared.value);
    this.form.controls.hasShared.valueChanges.subscribe(toggle);
  }

  /** Horas al mes y costo por hora, calculados en vivo. */
  readonly calc = computed(() => {
    const v = this.v();
    if (!v.hasShared) return null;
    const amount = canonical(v.sharedMonthlyAmount, null);
    const days = v.productionDaysPerWeek ?? null;
    const perDay = canonical(v.productionHoursPerDay, null);
    if (!amount || !days || !perDay) return null;
    try {
      const hours = monthlyProductiveHours(days, perDay);
      const perHour = new Decimal(amount).div(hours);
      const currency = this.form.controls.currency.value;
      return {
        hours: formatNumber(hours.toFixed(), 1),
        days,
        perDay: formatNumber(perDay, 2),
        perHour: formatMoney(perHour.toFixed(), currency),
        twoHours: formatMoney(perHour.mul(2).toFixed(), currency),
      };
    } catch {
      return null;
    }
  });

  preview(value: string): string {
    const c = canonical(value, null);
    return c === null ? '' : `= ${formatMoney(c, this.form.controls.currency.value)}`;
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (!v.name.trim()) {
      this.form.controls.name.setErrors({ required: true });
      return;
    }
    let shared = { amount: '0', hours: null as string | null, days: null as string | null, perDay: null as string | null };
    if (v.hasShared) {
      const perDay = canonical(v.productionHoursPerDay, null)!;
      shared = {
        amount: canonical(v.sharedMonthlyAmount, '0'),
        hours: monthlyProductiveHours(v.productionDaysPerWeek, perDay).toFixed(),
        days: v.productionDaysPerWeek,
        perDay,
      };
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const business = await this.dataService.repo.saveBusiness({
        ...(this.data ?? newBusiness()),
        name: v.name.trim(),
        category: v.category.trim(),
        currency: v.currency,
        defaultHourlyRate: canonical(v.defaultHourlyRate, null),
        sharedMonthlyAmount: shared.amount,
        productiveHoursPerMonth: shared.hours,
        productionDaysPerWeek: shared.days,
        productionHoursPerDay: shared.perDay,
        sharedExpensesNote: v.hasShared ? v.sharedExpensesNote.trim() : '',
      });
      this.ref.close(business);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
