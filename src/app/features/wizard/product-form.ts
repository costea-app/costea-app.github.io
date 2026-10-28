import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';
import { fractionToPercent, percentToFraction, toLocaleInput } from '../../core/engine/number-format';
import {
  AdditionalCost,
  AdditionalCostCategory,
  CHECKLIST_CATEGORIES,
  ChecklistCategory,
  ChecklistDecision,
  CostScope,
  CostingMode,
  MaterialLine,
  PricingMode,
  Product,
  Unit,
} from '../../core/models/domain';
import { uuid } from '../../core/models/factories';
import { canonical, decimalValidator } from '../../shared/decimal-field';

export type LineForm = FormGroup<{
  id: FormControl<string>;
  materialId: FormControl<string>;
  quantity: FormControl<string>;
  unit: FormControl<Unit>;
  isEstimated: FormControl<boolean>;
}>;

export type CostForm = FormGroup<{
  id: FormControl<string>;
  category: FormControl<AdditionalCostCategory>;
  name: FormControl<string>;
  amount: FormControl<string>;
  scope: FormControl<CostScope>;
  isEstimated: FormControl<boolean>;
}>;

export const ROUNDING_OPTIONS = ['none', '50', '100', '500', '1000', 'custom'] as const;
export type RoundingOption = (typeof ROUNDING_OPTIONS)[number];

export function buildProductForm(fb: NonNullableFormBuilder) {
  return fb.group({
    info: fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      description: ['', [Validators.maxLength(1000)]],
      costingMode: ['batch' as CostingMode],
      sellableUnits: ['', decimalValidator({ required: true, min: 0, minExclusive: true })],
      unitsMade: ['', decimalValidator({ min: 0, minExclusive: true })],
    }),
    materials: fb.array<LineForm>([]),
    lossesAccounted: [false],
    labor: fb.group({
      minutes: ['', decimalValidator({ min: 0 })],
      hourlyRate: ['', decimalValidator({ min: 0 })],
      isEstimated: [false],
      includeShared: [false],
      productionMinutes: ['', decimalValidator({ min: 0 })],
    }),
    costs: fb.array<CostForm>([]),
    checklist: fb.group(
      Object.fromEntries(CHECKLIST_CATEGORIES.map((c) => [c, fb.control<ChecklistDecision>('pending')])) as Record<
        ChecklistCategory,
        FormControl<ChecklistDecision>
      >,
    ),
    pricing: fb.group({
      mode: ['margin' as PricingMode],
      targetMargin: ['30', decimalValidator({ required: true, min: 0, maxExclusive: 100 })],
      markup: ['50', decimalValidator({ required: true, min: 0 })],
      commission: ['0', decimalValidator({ min: 0, maxExclusive: 100 })],
      fixedFee: ['0', decimalValidator({ min: 0 })],
      rounding: ['none' as RoundingOption],
      customRounding: ['', decimalValidator({ min: 0, minExclusive: true })],
      manualPrice: ['', decimalValidator({ min: 0, minExclusive: true })],
    }),
  });
}

export type ProductForm = ReturnType<typeof buildProductForm>;

export function lineForm(fb: NonNullableFormBuilder, line: Partial<MaterialLine> = {}): LineForm {
  return fb.group({
    id: [line.id ?? uuid()],
    materialId: [line.materialId ?? '', Validators.required],
    quantity: [toLocaleInput(line.quantity), decimalValidator({ required: true, min: 0 })],
    unit: [(line.unit ?? 'g') as Unit],
    isEstimated: [line.isEstimated ?? false],
  });
}

export function costForm(fb: NonNullableFormBuilder, cost: Partial<AdditionalCost> = {}): CostForm {
  return fb.group({
    id: [cost.id ?? uuid()],
    category: [(cost.category ?? 'other') as AdditionalCostCategory],
    name: [cost.name ?? '', [Validators.required, Validators.maxLength(120)]],
    amount: [toLocaleInput(cost.amount), decimalValidator({ required: true, min: 0 })],
    scope: [(cost.scope ?? 'batch') as CostScope],
    isEstimated: [cost.isEstimated ?? false],
  });
}

/** Carga un producto en el formulario (los porcentajes se muestran como 30, no 0,3). */
export function patchForm(fb: NonNullableFormBuilder, form: ProductForm, p: Product): void {
  form.controls.materials.clear({ emitEvent: false });
  p.materials.forEach((l) => form.controls.materials.push(lineForm(fb, l), { emitEvent: false }));
  form.controls.costs.clear({ emitEvent: false });
  p.costs.forEach((c) => form.controls.costs.push(costForm(fb, c), { emitEvent: false }));
  const step = p.pricing.roundingStep;
  const preset = step && (ROUNDING_OPTIONS as readonly string[]).includes(step) ? (step as RoundingOption) : null;
  form.setValue(
    {
      info: {
        name: p.name,
        description: p.description,
        costingMode: p.costingMode,
        sellableUnits: toLocaleInput(p.sellableUnits),
        unitsMade: toLocaleInput(p.unitsMade),
      },
      materials: form.controls.materials.getRawValue(),
      lossesAccounted: p.lossesAccounted,
      labor: {
        minutes: toLocaleInput(p.laborMinutes),
        hourlyRate: toLocaleInput(p.laborHourlyRate),
        isEstimated: p.laborIsEstimated,
        includeShared: p.includeSharedCosts,
        productionMinutes: toLocaleInput(p.productionMinutes),
      },
      costs: form.controls.costs.getRawValue(),
      checklist: { ...p.checklist },
      pricing: {
        mode: p.pricing.mode,
        targetMargin: toLocaleInput(fractionToPercent(p.pricing.targetMargin)),
        markup: toLocaleInput(fractionToPercent(p.pricing.markup)),
        commission: toLocaleInput(fractionToPercent(p.pricing.commissionRate)),
        fixedFee: toLocaleInput(p.pricing.fixedSaleFee),
        rounding: step === null ? 'none' : (preset ?? 'custom'),
        customRounding: step !== null && !preset ? toLocaleInput(step) : '',
        manualPrice: toLocaleInput(p.pricing.manualPrice),
      },
    },
    { emitEvent: false },
  );
}

/** Convierte el formulario en un Product (valores inválidos o vacíos → valores neutros). */
export function formToProduct(form: ProductForm, base: Product): Product {
  const v = form.getRawValue();
  const pct = (s: string, fallback: string) => percentToFraction(canonical(s, null)) ?? fallback;
  const rounding =
    v.pricing.rounding === 'none'
      ? null
      : v.pricing.rounding === 'custom'
        ? canonical(v.pricing.customRounding, null)
        : v.pricing.rounding;
  const isUnit = v.info.costingMode === 'unit';
  return {
    ...base,
    name: v.info.name.trim(),
    description: v.info.description.trim(),
    costingMode: v.info.costingMode,
    sellableUnits: isUnit ? '1' : canonical(v.info.sellableUnits, '0'),
    unitsMade: isUnit ? null : canonical(v.info.unitsMade, null),
    lossesAccounted: v.lossesAccounted,
    laborMinutes: canonical(v.labor.minutes, '0'),
    laborHourlyRate: canonical(v.labor.hourlyRate, '0'),
    laborIsEstimated: v.labor.isEstimated,
    includeSharedCosts: v.labor.includeShared,
    productionMinutes: canonical(v.labor.productionMinutes, '0'),
    materials: v.materials
      .filter((l) => l.materialId)
      .map((l) => ({ id: l.id, materialId: l.materialId, quantity: canonical(l.quantity, '0'), unit: l.unit, isEstimated: l.isEstimated })),
    costs: v.costs.map((c) => ({
      id: c.id,
      category: c.category,
      name: c.name.trim() || 'Costo sin nombre',
      amount: canonical(c.amount, '0'),
      scope: c.scope,
      isEstimated: c.isEstimated,
    })),
    checklist: { ...v.checklist },
    pricing: {
      mode: v.pricing.mode,
      targetMargin: pct(v.pricing.targetMargin, '0'),
      markup: pct(v.pricing.markup, '0'),
      commissionRate: pct(v.pricing.commission, '0'),
      fixedSaleFee: canonical(v.pricing.fixedFee, '0'),
      roundingStep: rounding,
      manualPrice: canonical(v.pricing.manualPrice, null),
    },
  };
}

export type ProductFormArray = FormArray<LineForm>;
