/**
 * Modelos de dominio de Costea, independientes de la persistencia.
 *
 * Todos los importes y cantidades viajan como `DecimalString`: texto canónico
 * con punto decimal y sin separadores de miles (p. ej. "5000", "0.3", "1250.5").
 * Así no se pierde precisión entre la base de datos (NUMERIC), el motor (decimal.js) y la UI.
 */
export type DecimalString = string;

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'unit' | 'cm' | 'm';

export type CostingMode = 'unit' | 'batch';
export type CostScope = 'batch' | 'unit';
export type AdditionalCostCategory = 'packaging' | 'services' | 'transport' | 'other';
export type PricingMode = 'margin' | 'markup';

export const CHECKLIST_CATEGORIES = [
  'materials',
  'packaging',
  'labor',
  'services',
  'transport',
  'losses',
  'shared',
  'commissions',
] as const;
export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number];

/** Decisión que toma la persona en el checklist. */
export type ChecklistDecision = 'pending' | 'included' | 'not_applicable';
/** Estado del costeo de un producto. */
export type CostingStatus = 'pending' | 'estimated' | 'reviewed';

export interface Business {
  id: string;
  name: string;
  category: string;
  /** Código ISO 4217. Una sola moneda por negocio, sin conversiones. */
  currency: string;
  /** Gastos compartidos del mes (arriendo, internet, luz general…). */
  sharedMonthlyAmount: DecimalString;
  /** Horas productivas al mes; las calcula la app con días × horas × 4,33 semanas. */
  productiveHoursPerMonth: DecimalString | null;
  /** "¿Cuántos días a la semana produces?" (1–7). */
  productionDaysPerWeek: DecimalString | null;
  /** "¿Cuántas horas produces en un día normal?" */
  productionHoursPerDay: DecimalString | null;
  /** Qué incluye el gasto compartido, para no duplicarlo como costo directo. */
  sharedExpensesNote: string;
  /** Valor por hora sugerido para el trabajo en los productos nuevos. */
  defaultHourlyRate: DecimalString | null;
  createdAt: string;
  updatedAt: string;
}

export interface Material {
  id: string;
  businessId: string;
  name: string;
  /** "¿Cuánto te costó?" */
  purchasePrice: DecimalString;
  /** "¿Cuánto trae?" */
  purchaseQuantity: DecimalString;
  unit: Unit;
  isEstimated: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialLine {
  id: string;
  materialId: string;
  /** "¿Cuánto necesitas?" en la unidad `unit` (compatible con la del material). */
  quantity: DecimalString;
  unit: Unit;
  isEstimated: boolean;
}

export interface AdditionalCost {
  id: string;
  category: AdditionalCostCategory;
  name: string;
  amount: DecimalString;
  /** 'batch': se paga una vez por tanda. 'unit': se paga por cada unidad vendible. */
  scope: CostScope;
  isEstimated: boolean;
}

export interface PricingSettings {
  mode: PricingMode;
  /** Margen objetivo sobre la venta, como fracción (0.3 = 30 %). */
  targetMargin: DecimalString;
  /** Recargo sobre el costo, como fracción (0.5 = 50 %). */
  markup: DecimalString;
  /** Comisión porcentual sobre el precio de venta, como fracción. */
  commissionRate: DecimalString;
  /** Cargo fijo de venta por cada unidad vendida (no por pedido). */
  fixedSaleFee: DecimalString;
  /** Redondeo comercial hacia arriba (p. ej. 100 o 500); null = sin redondeo. */
  roundingStep: DecimalString | null;
  /** Precio manual para el simulador; null = sin simulación. */
  manualPrice: DecimalString | null;
}

export type ChecklistDecisions = Record<ChecklistCategory, ChecklistDecision>;

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description: string;
  costingMode: CostingMode;
  /** "¿Cuántas unidades puedes vender?" de la tanda (1 en modo unidad). */
  sellableUnits: DecimalString;
  /** Unidades que salen en total, incluidas las que no se pueden vender (opcional). */
  unitsMade: DecimalString | null;
  /** La persona confirma que las cantidades de materiales son las realmente consumidas. */
  lossesAccounted: boolean;
  laborMinutes: DecimalString;
  laborHourlyRate: DecimalString;
  laborIsEstimated: boolean;
  includeSharedCosts: boolean;
  /** Minutos de producción usados para asignar gastos compartidos. */
  productionMinutes: DecimalString;
  materials: MaterialLine[];
  costs: AdditionalCost[];
  checklist: ChecklistDecisions;
  pricing: PricingSettings;
  createdAt: string;
  updatedAt: string;
}

export interface SharedCostSettings {
  monthlyAmount: DecimalString;
  productiveHoursPerMonth: DecimalString | null;
}
