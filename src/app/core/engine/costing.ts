import {
  AdditionalCostCategory,
  CHECKLIST_CATEGORIES,
  ChecklistCategory,
  ChecklistDecision,
  CostingStatus,
  DecimalString,
  Material,
  Product,
  SharedCostSettings,
  Unit,
} from '../models/domain';
import {
  CosteaValidationError,
  Decimal,
  ZERO,
  requireNonNegative,
  str,
  toDecimal,
} from './decimal';
import { PricingResult, computePricing } from './pricing';
import { convertQuantity } from './units';

/* ------------------------------------------------------------------ */
/* Fórmulas básicas                                                    */
/* ------------------------------------------------------------------ */

/** (precio comprado / cantidad comprada) × cantidad utilizada, con unidades normalizadas. */
export function materialCost(
  material: Pick<Material, 'purchasePrice' | 'purchaseQuantity' | 'unit'>,
  usedQuantity: string | Decimal,
  usedUnit: Unit,
): Decimal {
  const price = requireNonNegative(material.purchasePrice, '¿Cuánto te costó?');
  const bought = requireNonNegative(material.purchaseQuantity, '¿Cuánto trae?', { positive: true });
  const used = requireNonNegative(usedQuantity, '¿Cuánto necesitas?');
  const usedInPurchaseUnit = convertQuantity(used, usedUnit, material.unit);
  return price.div(bought).mul(usedInPurchaseUnit);
}

/** (minutos / 60) × valor por hora. */
export function laborCost(minutes: string | Decimal, hourlyRate: string | Decimal): Decimal {
  const min = requireNonNegative(minutes, 'minutos de trabajo');
  const rate = requireNonNegative(hourlyRate, 'valor por hora');
  return min.div(60).mul(rate);
}

/** Semanas promedio por mes: 52 semanas ÷ 12 meses ≈ 4,33. */
export const WEEKS_PER_MONTH = new Decimal(52).div(12);

/**
 * Horas productivas al mes a partir de lo que la persona sabe responder:
 * días que produce a la semana × horas que produce al día × 4,33 semanas.
 * Se redondea a 2 decimales (así se guarda en la base de datos).
 */
export function monthlyProductiveHours(daysPerWeek: string | Decimal, hoursPerDay: string | Decimal): Decimal {
  const days = requireNonNegative(daysPerWeek, 'días que produces a la semana', { positive: true });
  const hours = requireNonNegative(hoursPerDay, 'horas que produces al día', { positive: true });
  if (days.gt(7)) {
    throw new CosteaValidationError('too_many_days', 'Una semana tiene máximo 7 días.', 'productionDaysPerWeek');
  }
  if (hours.gt(24)) {
    throw new CosteaValidationError('too_many_hours', 'Un día tiene máximo 24 horas.', 'productionHoursPerDay');
  }
  return days.mul(hours).mul(WEEKS_PER_MONTH).toDecimalPlaces(2);
}

/** (gasto mensual / horas productivas mensuales) × horas de producción de la tanda. */
export function sharedCostForBatch(
  monthlyAmount: string | Decimal,
  productiveHoursPerMonth: string | Decimal,
  productionHours: string | Decimal,
): Decimal {
  const monthly = requireNonNegative(monthlyAmount, 'gasto mensual compartido');
  const hours = requireNonNegative(productiveHoursPerMonth, 'horas productivas al mes', {
    positive: true,
  });
  const used = requireNonNegative(productionHours, 'horas de producción');
  return monthly.div(hours).mul(used);
}

/** C = costos de la tanda / unidades vendibles + costos por unidad. */
export function unitCost(
  batchCosts: string | Decimal,
  sellableUnits: string | Decimal,
  perUnitCosts: string | Decimal = '0',
): Decimal {
  const batch = requireNonNegative(batchCosts, 'costos de la tanda');
  const units = requireNonNegative(sellableUnits, 'unidades vendibles', { positive: true });
  const perUnit = requireNonNegative(perUnitCosts, 'costos por unidad');
  return batch.div(units).plus(perUnit);
}

/* ------------------------------------------------------------------ */
/* Costeo completo de un producto                                     */
/* ------------------------------------------------------------------ */

export type BreakdownKey = 'materials' | 'labor' | 'shared' | AdditionalCostCategory;

export interface Issue {
  code: string;
  message: string;
  field?: string;
  category?: ChecklistCategory;
}

export interface MaterialLineResult {
  lineId: string;
  materialId: string;
  materialName: string;
  quantity: DecimalString;
  unit: Unit;
  cost: DecimalString | null;
  isEstimated: boolean;
  error: string | null;
}

export interface BreakdownItem {
  key: BreakdownKey;
  label: string;
  /** Monto de la categoría en toda la tanda. */
  batchAmount: DecimalString;
  /** Monto de la categoría por unidad vendible. */
  unitAmount: DecimalString;
  isEstimated: boolean;
}

export interface ChecklistItemResult {
  category: ChecklistCategory;
  label: string;
  decision: ChecklistDecision;
  /** Estado efectivo: "incluida" solo si hay datos reales en el costeo. */
  status: ChecklistDecision;
  hasData: boolean;
  isEstimated: boolean;
  summary: string;
}

export interface CostingResult {
  engineVersion: 1;
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
  sellableUnits: DecimalString;
  materialLines: MaterialLineResult[];
  breakdown: BreakdownItem[];
  /** Suma de los costos por tanda (materiales, trabajo, compartidos y otros por tanda). */
  batchCosts: DecimalString;
  /** Suma de los costos que se pagan por cada unidad. */
  perUnitCosts: DecimalString;
  /** Costo total de la tanda = costos por tanda + costos por unidad × unidades vendibles. */
  batchTotal: DecimalString | null;
  /** Costo unitario C. No incluye comisión ni cargo fijo de venta. */
  unitCost: DecimalString | null;
  pricing: PricingResult | null;
  pricingError: Issue | null;
  checklist: ChecklistItemResult[];
  pendingCategories: ChecklistCategory[];
  hasEstimates: boolean;
  status: CostingStatus;
}

export interface CostingInput {
  product: Product;
  /** Biblioteca de materiales del negocio (se busca cada línea por id). */
  materials: Material[];
  shared: SharedCostSettings;
}

export const CHECKLIST_LABELS: Record<ChecklistCategory, string> = {
  materials: 'Materiales',
  packaging: 'Empaque',
  labor: 'Tu trabajo',
  services: 'Servicios de producción',
  transport: 'Transporte',
  losses: 'Pérdidas',
  shared: 'Gastos compartidos',
  commissions: 'Comisiones de venta',
};

export const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  materials: 'Materiales',
  labor: 'Tu trabajo',
  shared: 'Gastos compartidos',
  packaging: 'Empaque',
  services: 'Servicios de producción',
  transport: 'Transporte',
  other: 'Otros costos',
};

const BREAKDOWN_ORDER: BreakdownKey[] = [
  'materials',
  'packaging',
  'labor',
  'services',
  'transport',
  'shared',
  'other',
];

function safe(value: string | null | undefined, fallback = '0'): string {
  return value === null || value === undefined || value.trim() === '' ? fallback : value;
}

/**
 * Calcula el costeo completo de un producto. Nunca lanza: los problemas de datos
 * se devuelven como `errors` (bloquean el resultado) o `warnings` (informativos).
 */
export function computeCosting({ product, materials, shared }: CostingInput): CostingResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const attempt = <T>(fn: () => T, field?: string): T | null => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof CosteaValidationError) {
        errors.push({ code: e.code, message: e.message, field: field ?? e.field });
        return null;
      }
      throw e;
    }
  };

  const isUnitMode = product.costingMode === 'unit';

  // Unidades vendibles
  const sellable = isUnitMode
    ? new Decimal(1)
    : attempt(
        () =>
          requireNonNegative(product.sellableUnits, '¿Cuántas unidades puedes vender?', {
            positive: true,
          }),
        'sellableUnits',
      );

  if (!isUnitMode && product.unitsMade !== null && product.unitsMade !== '' && sellable) {
    const made = attempt(
      () => requireNonNegative(product.unitsMade!, 'unidades que salen en total', { positive: true }),
      'unitsMade',
    );
    if (made && made.lt(sellable)) {
      errors.push({
        code: 'units_made_below_sellable',
        field: 'unitsMade',
        message: 'Las unidades vendibles no pueden ser más que las unidades que salen en total.',
      });
    }
  }

  // Materiales
  const byId = new Map(materials.map((m) => [m.id, m]));
  const materialLines: MaterialLineResult[] = product.materials.map((line) => {
    const material = byId.get(line.materialId);
    const base = {
      lineId: line.id,
      materialId: line.materialId,
      materialName: material?.name ?? 'Material no encontrado',
      quantity: line.quantity,
      unit: line.unit,
      isEstimated: line.isEstimated || !!material?.isEstimated,
    };
    if (!material) {
      errors.push({
        code: 'material_not_found',
        message: 'Una línea usa un material que ya no existe en la biblioteca.',
        category: 'materials',
      });
      return { ...base, cost: null, error: 'Material no encontrado' };
    }
    try {
      return { ...base, cost: str(materialCost(material, line.quantity, line.unit)), error: null };
    } catch (e) {
      if (!(e instanceof CosteaValidationError)) throw e;
      errors.push({ code: e.code, message: `${material.name}: ${e.message}`, category: 'materials' });
      return { ...base, cost: null, error: e.message };
    }
  });
  const materialsTotal = materialLines.reduce(
    (acc, l) => (l.cost === null ? acc : acc.plus(l.cost)),
    ZERO,
  );

  // Trabajo
  const labor =
    attempt(() => laborCost(safe(product.laborMinutes), safe(product.laborHourlyRate)), 'labor') ??
    ZERO;
  const laborMinutes = peek(product.laborMinutes);
  if (laborMinutes.gt(0) && peek(product.laborHourlyRate).isZero()) {
    warnings.push({
      code: 'labor_rate_zero',
      category: 'labor',
      message: 'Tu trabajo está valorado en $0 por hora. Si es intencional, puedes dejarlo así.',
    });
  }

  // Gastos compartidos
  let sharedTotal = ZERO;
  const monthly = attempt(() => requireNonNegative(safe(shared.monthlyAmount), 'gasto mensual compartido'));
  const productionMinutes =
    attempt(() => requireNonNegative(safe(product.productionMinutes), 'minutos de producción')) ??
    ZERO;
  let sharedHasData = false;
  if (product.includeSharedCosts && monthly) {
    if (monthly.isZero()) {
      warnings.push({
        code: 'shared_not_configured',
        category: 'shared',
        message: 'El negocio no tiene gastos compartidos mensuales registrados.',
      });
    } else if (!shared.productiveHoursPerMonth || toDecimal(shared.productiveHoursPerMonth, 'horas').lte(0)) {
      errors.push({
        code: 'shared_hours_required',
        category: 'shared',
        field: 'productiveHoursPerMonth',
        message: 'Para repartir gastos compartidos indica las horas productivas al mes del negocio (mayores que cero).',
      });
    } else if (productionMinutes.isZero()) {
      warnings.push({
        code: 'shared_production_minutes_zero',
        category: 'shared',
        message: 'Indica cuántos minutos de producción usa la tanda para asignarle gastos compartidos.',
      });
    } else {
      sharedTotal =
        attempt(() =>
          sharedCostForBatch(monthly, shared.productiveHoursPerMonth!, productionMinutes.div(60)),
        ) ?? ZERO;
      sharedHasData = true;
    }
  }

  // Costos adicionales
  const extra: Record<AdditionalCostCategory, { batch: Decimal; unit: Decimal; est: boolean; n: number }> = {
    packaging: { batch: ZERO, unit: ZERO, est: false, n: 0 },
    services: { batch: ZERO, unit: ZERO, est: false, n: 0 },
    transport: { batch: ZERO, unit: ZERO, est: false, n: 0 },
    other: { batch: ZERO, unit: ZERO, est: false, n: 0 },
  };
  for (const cost of product.costs) {
    const amount = attempt(
      () => requireNonNegative(safe(cost.amount), cost.name || 'costo adicional'),
      'costs',
    );
    const bucket = extra[cost.category];
    if (!bucket) continue;
    bucket.n++;
    bucket.est ||= cost.isEstimated;
    if (!amount) continue;
    if (cost.scope === 'unit') bucket.unit = bucket.unit.plus(amount);
    else bucket.batch = bucket.batch.plus(amount);
  }

  if (product.includeSharedCosts && sharedHasData && extra.services.n > 0) {
    warnings.push({
      code: 'shared_vs_services',
      category: 'shared',
      message:
        'Tienes servicios registrados como costo directo y también gastos compartidos. Verifica que el gasto mensual no incluya esos mismos servicios para no contarlos dos veces.',
    });
  }

  // Totales y desglose
  const batchByKey: Record<BreakdownKey, { batch: Decimal; unit: Decimal; est: boolean }> = {
    materials: { batch: materialsTotal, unit: ZERO, est: materialLines.some((l) => l.isEstimated) },
    labor: { batch: labor, unit: ZERO, est: product.laborIsEstimated },
    shared: { batch: sharedTotal, unit: ZERO, est: false },
    packaging: { batch: extra.packaging.batch, unit: extra.packaging.unit, est: extra.packaging.est },
    services: { batch: extra.services.batch, unit: extra.services.unit, est: extra.services.est },
    transport: { batch: extra.transport.batch, unit: extra.transport.unit, est: extra.transport.est },
    other: { batch: extra.other.batch, unit: extra.other.unit, est: extra.other.est },
  };
  const batchCosts = Object.values(batchByKey).reduce((a, b) => a.plus(b.batch), ZERO);
  const perUnitCosts = Object.values(batchByKey).reduce((a, b) => a.plus(b.unit), ZERO);

  const breakdown: BreakdownItem[] = BREAKDOWN_ORDER.map((key) => {
    const b = batchByKey[key];
    return {
      key,
      label: BREAKDOWN_LABELS[key],
      batchAmount: str(sellable ? b.batch.plus(b.unit.mul(sellable)) : b.batch),
      unitAmount: str(sellable ? b.batch.div(sellable).plus(b.unit) : b.unit),
      isEstimated: b.est,
    };
  }).filter((b) => !new Decimal(b.batchAmount).isZero() || !new Decimal(b.unitAmount).isZero());

  const C = errors.length === 0 && sellable ? unitCost(batchCosts, sellable, perUnitCosts) : null;
  const batchTotal = C && sellable ? C.mul(sellable) : null;

  // Precio
  let pricing: PricingResult | null = null;
  let pricingError: Issue | null = null;
  if (C) {
    try {
      pricing = computePricing(C, {
        mode: product.pricing.mode,
        targetMargin: safe(product.pricing.targetMargin),
        markup: safe(product.pricing.markup),
        commissionRate: safe(product.pricing.commissionRate),
        fixedSaleFee: safe(product.pricing.fixedSaleFee),
        roundingStep: product.pricing.roundingStep,
        manualPrice: product.pricing.manualPrice,
      });
      if (new Decimal(pricing.calculated.price).isZero()) {
        warnings.push({
          code: 'zero_price',
          message: 'Con costo cero el precio sugerido es $0. Usa el simulador para probar un precio.',
        });
      }
    } catch (e) {
      if (!(e instanceof CosteaValidationError)) throw e;
      pricingError = { code: e.code, message: e.message, field: e.field };
    }
  }

  // Checklist
  const commissionRate = peek(product.pricing.commissionRate);
  const fixedFee = peek(product.pricing.fixedSaleFee);
  const lossesHasData =
    product.lossesAccounted ||
    (!isUnitMode && product.unitsMade !== null && product.unitsMade !== '');

  const facts: Record<ChecklistCategory, { hasData: boolean; est: boolean; summary: string }> = {
    materials: {
      hasData: product.materials.length > 0,
      est: batchByKey.materials.est,
      summary: plural(product.materials.length, 'material', 'materiales'),
    },
    packaging: costFacts(extra.packaging, 'empaque', 'empaques'),
    labor: {
      hasData: laborMinutes.gt(0),
      est: product.laborIsEstimated,
      summary: laborMinutes.gt(0) ? `${laborMinutes.toFixed()} min de trabajo` : 'Sin minutos registrados',
    },
    services: costFacts(extra.services, 'servicio', 'servicios'),
    transport: costFacts(extra.transport, 'costo de transporte', 'costos de transporte'),
    losses: {
      hasData: lossesHasData,
      est: false,
      summary: lossesHasData
        ? 'Cantidades reales consumidas y unidades vendibles'
        : 'Sin confirmar',
    },
    shared: {
      hasData: sharedHasData,
      est: false,
      summary: sharedHasData
        ? `Asignado por ${productionMinutes.toFixed()} min de producción`
        : 'No asignados a este producto',
    },
    commissions: {
      hasData: commissionRate.gt(0) || fixedFee.gt(0),
      est: false,
      summary:
        commissionRate.gt(0) || fixedFee.gt(0)
          ? 'Comisión o cargo fijo registrados en el precio'
          : 'Sin comisiones registradas',
    },
  };

  const checklist: ChecklistItemResult[] = CHECKLIST_CATEGORIES.map((category) => {
    const decision = product.checklist?.[category] ?? 'pending';
    const f = facts[category];
    let status: ChecklistDecision;
    if (decision === 'not_applicable') {
      status = 'not_applicable';
      if (f.hasData && category !== 'losses') {
        warnings.push({
          code: 'not_applicable_with_data',
          category,
          message: `Marcaste “${CHECKLIST_LABELS[category]}” como no aplica, pero tiene datos registrados que sí se están sumando.`,
        });
      }
    } else if (f.hasData) {
      status = 'included';
    } else {
      status = 'pending';
      if (decision === 'included') {
        warnings.push({
          code: 'included_without_data',
          category,
          message: `“${CHECKLIST_LABELS[category]}” está marcada como incluida, pero no tiene datos en el costeo. Sigue pendiente.`,
        });
      }
    }
    return {
      category,
      label: CHECKLIST_LABELS[category],
      decision,
      status,
      hasData: f.hasData,
      isEstimated: status === 'included' && f.est,
      summary: f.summary,
    };
  });

  const pendingCategories = checklist.filter((c) => c.status === 'pending').map((c) => c.category);
  const hasEstimates = checklist.some((c) => c.isEstimated);
  const status: CostingStatus =
    pendingCategories.length > 0 || errors.length > 0
      ? 'pending'
      : hasEstimates
        ? 'estimated'
        : 'reviewed';

  return {
    engineVersion: 1,
    valid: errors.length === 0,
    errors,
    warnings,
    sellableUnits: sellable ? str(sellable) : safe(product.sellableUnits),
    materialLines,
    breakdown,
    batchCosts: str(batchCosts),
    perUnitCosts: str(perUnitCosts),
    batchTotal: batchTotal ? str(batchTotal) : null,
    unitCost: C ? str(C) : null,
    pricing,
    pricingError,
    checklist,
    pendingCategories,
    hasEstimates,
    status,
  };
}

/** Lee un número sin registrar errores (ya se validó en otro punto); inválido → 0. */
function peek(value: string | null | undefined): Decimal {
  try {
    return toDecimal(safe(value));
  } catch {
    return ZERO;
  }
}

function costFacts(
  bucket: { n: number; est: boolean },
  one: string,
  many: string,
): { hasData: boolean; est: boolean; summary: string } {
  return { hasData: bucket.n > 0, est: bucket.est, summary: plural(bucket.n, one, many) };
}

function plural(n: number, one: string, many: string): string {
  if (n === 0) return `Sin ${many} registrados`;
  return `${n} ${n === 1 ? one : many}`;
}

/** Recomendación de precio a mostrar: el redondeado si existe; si no, el calculado. */
export function suggestedPrice(result: CostingResult): DecimalString | null {
  return result.pricing?.rounded?.price ?? result.pricing?.calculated.price ?? null;
}
