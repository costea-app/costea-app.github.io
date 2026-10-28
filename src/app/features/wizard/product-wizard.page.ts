import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { map, startWith } from 'rxjs';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { CHECKLIST_LABELS, MaterialLineResult, suggestedPrice } from '../../core/engine/costing';
import { Decimal } from '../../core/engine/decimal';
import { formatMoney, formatNumber } from '../../core/engine/number-format';
import { UNITS, areCompatible, compatibleUnits } from '../../core/engine/units';
import {
  AdditionalCostCategory,
  Business,
  CHECKLIST_CATEGORIES,
  ChecklistCategory,
  Material,
  Product,
  Unit,
} from '../../core/models/domain';
import { newProduct } from '../../core/models/factories';
import { CostingResultView } from '../../shared/costing-result-view';
import { canonical, fieldError } from '../../shared/decimal-field';
import { MoneyPipe, PercentFractionPipe, QuantityPipe } from '../../shared/format.pipes';
import { StatusChip } from '../../shared/status-chip';
import { HasUnsavedChanges } from '../../shared/unsaved-changes.guard';
import { MaterialDialog, MaterialDialogData } from '../materials/material-dialog';
import { CostForm, LineForm, buildProductForm, costForm, formToProduct, lineForm, patchForm } from './product-form';

export const COST_SECTIONS: { category: AdditionalCostCategory; title: string; hint: string; example: string }[] = [
  { category: 'packaging', title: 'Empaques', hint: 'Bolsas, cajas, etiquetas, cintas o stickers.', example: 'Bolsa kraft' },
  { category: 'services', title: 'Servicios de producción', hint: 'Gas, luz o agua usados directamente al producir esta tanda.', example: 'Gas del horno' },
  { category: 'transport', title: 'Transporte asumido por el negocio', hint: 'Domicilios que tú pagas o el viaje para comprar materiales.', example: 'Domicilio' },
  { category: 'other', title: 'Otros costos', hint: 'Cualquier otro costo directo que no encaje arriba.', example: 'Moldes desechables' },
];

export const CHECKLIST_HELP: Record<ChecklistCategory, { text: string; step: number }> = {
  materials: { text: 'Todo lo que se transforma en el producto: ingredientes, cera, tela, hilo…', step: 1 },
  packaging: { text: 'Bolsas, cajas, etiquetas, cintas o stickers.', step: 2 },
  labor: { text: 'Tu tiempo también cuesta, aunque no te pagues un sueldo.', step: 2 },
  services: { text: 'Gas, luz o agua usados directamente al producir.', step: 2 },
  transport: { text: 'Domicilios o compras de materiales que paga el negocio.', step: 2 },
  losses: { text: 'Lo que se daña, se quema o sobra. Se incluye usando cantidades realmente consumidas y unidades realmente vendibles.', step: 1 },
  shared: { text: 'Arriendo, internet y otros gastos del mes, repartidos según las horas de producción.', step: 2 },
  commissions: { text: 'Lo que cobran plataformas, datáfonos o apps de domicilio por cada venta. Se registra en el último paso.', step: 4 },
};

@Component({
  selector: 'app-product-wizard',
  imports: [
    ReactiveFormsModule, RouterLink, MatStepperModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatIconModule, MatProgressBarModule,
    CostingResultView, MoneyPipe, PercentFractionPipe, QuantityPipe, StatusChip,
  ],
  templateUrl: './product-wizard.page.html',
})
export class ProductWizardPage implements HasUnsavedChanges {
  readonly businessId = input.required<string>();
  readonly productId = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly stepper = viewChild(MatStepper);
  readonly vertical = toSignal(
    inject(BreakpointObserver).observe('(max-width: 720px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly form = buildProductForm(this.fb);
  readonly business = signal<Business | null>(null);
  readonly materials = signal<Material[]>([]);
  readonly base = signal<Product | null>(null);
  readonly isNew = signal(true);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly costSections = COST_SECTIONS;
  readonly checklistCategories = CHECKLIST_CATEGORIES;
  readonly checklistLabels = CHECKLIST_LABELS;
  readonly checklistHelp = CHECKLIST_HELP;
  readonly err = fieldError;
  readonly units = UNITS;

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())));

  readonly product = computed(() => {
    this.formValue();
    const base = this.base();
    return base ? formToProduct(this.form, base) : null;
  });

  readonly result = computed(() => {
    const p = this.product();
    const b = this.business();
    return p && b ? this.data.costing(p, this.materials(), b) : null;
  });

  readonly price = computed(() => {
    const r = this.result();
    return r ? suggestedPrice(r) : null;
  });

  readonly currency = computed(() => this.business()?.currency ?? 'COP');
  readonly isBatch = computed(() => (this.formValue()?.info.costingMode ?? 'batch') === 'batch');

  readonly lossesInfo = computed(() => {
    const v = this.formValue();
    if (!v || v.info.costingMode !== 'batch') return null;
    const made = canonical(v.info.unitsMade, null);
    const sellable = canonical(v.info.sellableUnits, null);
    if (!made || !sellable) return null;
    const lost = new Decimal(made).minus(sellable);
    return lost.gte(0) ? formatNumber(lost.toFixed()) : null;
  });

  readonly laborCost = computed(() => this.result()?.breakdown.find((b) => b.key === 'labor')?.batchAmount ?? '0');
  readonly sharedCost = computed(() => this.result()?.breakdown.find((b) => b.key === 'shared')?.batchAmount ?? '0');
  readonly sharedPerHour = computed(() => {
    const b = this.business();
    if (!b?.productiveHoursPerMonth || new Decimal(b.productiveHoursPerMonth).lte(0)) return null;
    return new Decimal(b.sharedMonthlyAmount).div(b.productiveHoursPerMonth).toFixed();
  });
  readonly hasServices = computed(() => (this.formValue()?.costs ?? []).some((c) => c.category === 'services'));

  constructor() {
    effect(() => {
      const businessId = this.businessId();
      const productId = this.productId();
      untracked(() => void this.load(businessId, productId));
    });

    // El modo unidad no pregunta unidades vendibles (siempre 1).
    this.form.controls.info.controls.costingMode.valueChanges.subscribe((mode) => this.applyMode(mode));

    // Una categoría con datos reales queda incluida automáticamente.
    effect(() => {
      const r = this.result();
      if (!r) return;
      untracked(() => {
        for (const item of r.checklist) {
          const control = this.form.controls.checklist.controls[item.category];
          if (item.hasData && control.value === 'pending') control.setValue('included');
        }
      });
    });
  }

  private applyMode(mode: 'unit' | 'batch'): void {
    const { sellableUnits, unitsMade } = this.form.controls.info.controls;
    if (mode === 'unit') {
      sellableUnits.disable({ emitEvent: false });
      unitsMade.disable({ emitEvent: false });
    } else {
      sellableUnits.enable({ emitEvent: false });
      unitsMade.enable({ emitEvent: false });
    }
  }

  private async load(businessId: string, productId?: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [business, materials, product] = await Promise.all([
        this.data.repo.getBusiness(businessId),
        this.data.repo.listMaterials(businessId),
        productId ? this.data.repo.getProduct(productId) : Promise.resolve(null),
      ]);
      if (!business) throw new Error('not found');
      if (productId && (!product || product.businessId !== businessId)) throw new Error('not found');
      this.business.set(business);
      this.materials.set(materials);
      const p =
        product ??
        newProduct(businessId, {
          sellableUnits: '12',
          laborHourlyRate: business.defaultHourlyRate ?? '0',
        });
      this.isNew.set(!product);
      patchForm(this.fb, this.form, p);
      if (!product) this.form.controls.info.controls.sellableUnits.setValue('', { emitEvent: false });
      this.applyMode(p.costingMode);
      this.base.set(p);
      this.form.markAsPristine();
      this.form.updateValueAndValidity();
    } catch (e) {
      this.loadError.set(errorMessage(e, 'No encontramos este producto o no pertenece a tu cuenta.'));
    } finally {
      this.loading.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  /* ----------------------------- Materiales ----------------------------- */

  get lines() {
    return this.form.controls.materials;
  }

  materialById(id: string): Material | undefined {
    return this.materials().find((m) => m.id === id);
  }

  unitsFor(line: LineForm): Unit[] {
    const m = this.materialById(line.controls.materialId.value);
    return m ? compatibleUnits(m.unit) : [line.controls.unit.value];
  }

  lineResult(line: LineForm): MaterialLineResult | undefined {
    return this.result()?.materialLines.find((l) => l.lineId === line.controls.id.value);
  }

  lineFormula(line: LineForm): string | null {
    const m = this.materialById(line.controls.materialId.value);
    const qty = canonical(line.controls.quantity.value, null);
    if (!m || qty === null) return null;
    const cur = this.currency();
    return `(${formatMoney(m.purchasePrice, cur)} ÷ ${formatNumber(m.purchaseQuantity)} ${UNITS[m.unit].short}) × ${formatNumber(qty)} ${UNITS[line.controls.unit.value].short}`;
  }

  onMaterialChange(line: LineForm): void {
    const m = this.materialById(line.controls.materialId.value);
    if (m && !areCompatible(m.unit, line.controls.unit.value)) line.controls.unit.setValue(m.unit);
  }

  addLine(materialId = ''): void {
    const m = this.materialById(materialId);
    this.lines.push(lineForm(this.fb, { materialId, unit: m?.unit ?? 'g' }));
    this.form.markAsDirty();
  }

  removeLine(i: number): void {
    this.lines.removeAt(i);
    this.form.markAsDirty();
  }

  createMaterial(line?: LineForm): void {
    const business = this.business();
    if (!business) return;
    const data: MaterialDialogData = { business };
    this.dialog
      .open(MaterialDialog, { data, width: '560px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((m?: Material) => {
        if (!m) return;
        this.materials.update((list) => [...list, m].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        if (line) {
          line.controls.materialId.setValue(m.id);
          line.controls.unit.setValue(m.unit);
        } else {
          this.addLine(m.id);
        }
        this.snack.open(`“${m.name}” se agregó a la biblioteca de materiales.`);
      });
  }

  /* ------------------------------- Costos ------------------------------- */

  get costs() {
    return this.form.controls.costs;
  }

  costsOf(category: AdditionalCostCategory): { form: CostForm; index: number }[] {
    this.formValue();
    return this.costs.controls.map((form, index) => ({ form, index })).filter((c) => c.form.controls.category.value === category);
  }

  addCost(category: AdditionalCostCategory): void {
    this.costs.push(costForm(this.fb, { category, scope: category === 'packaging' ? 'unit' : 'batch' }));
    this.form.markAsDirty();
  }

  removeCost(index: number): void {
    this.costs.removeAt(index);
    this.form.markAsDirty();
  }

  /* ------------------------------ Checklist ------------------------------ */

  checklistItem(category: ChecklistCategory) {
    return this.result()?.checklist.find((c) => c.category === category);
  }

  goToStep(step: number): void {
    const s = this.stepper();
    if (s) s.selectedIndex = step;
  }

  /* ------------------------------- Guardar ------------------------------- */

  async save(goToReport = false): Promise<void> {
    this.form.markAllAsTouched();
    this.saveError.set(null);
    const product = this.product();
    if (!product) return;
    if (this.form.invalid || !product.name) {
      this.saveError.set('Revisa los campos marcados en rojo antes de guardar.');
      if (this.form.controls.info.invalid || !product.name) this.goToStep(0);
      else if (this.lines.invalid) this.goToStep(1);
      else if (this.form.controls.labor.invalid || this.costs.invalid) this.goToStep(2);
      else if (this.form.controls.pricing.invalid) this.goToStep(4);
      return;
    }
    this.saving.set(true);
    try {
      const saved = await this.data.repo.saveProduct(product);
      this.base.set(saved);
      this.form.markAsPristine();
      this.justSaved.set(true);
      const pending = this.result()?.pendingCategories.length ?? 0;
      this.snack.open(
        pending ? `Guardado. Quedan ${pending} categorías pendientes: el precio es provisional.` : 'Costeo guardado.',
      );
      if (goToReport) {
        await this.router.navigate(['/app/negocios', saved.businessId, 'productos', saved.id, 'reporte']);
      } else if (this.isNew()) {
        this.isNew.set(false);
        await this.router.navigate(['/app/negocios', saved.businessId, 'productos', saved.id, 'editar'], { replaceUrl: true });
      }
    } catch (e) {
      this.saveError.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
