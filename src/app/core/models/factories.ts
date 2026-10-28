import {
  Business,
  CHECKLIST_CATEGORIES,
  ChecklistDecisions,
  Material,
  Product,
} from './domain';

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function emptyChecklist(): ChecklistDecisions {
  return Object.fromEntries(CHECKLIST_CATEGORIES.map((c) => [c, 'pending'])) as ChecklistDecisions;
}

export function newBusiness(overrides: Partial<Business> = {}): Business {
  const now = nowIso();
  return {
    id: uuid(),
    name: '',
    category: '',
    currency: 'COP',
    sharedMonthlyAmount: '0',
    productiveHoursPerMonth: null,
    productionDaysPerWeek: null,
    productionHoursPerDay: null,
    sharedExpensesNote: '',
    defaultHourlyRate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function newMaterial(businessId: string, overrides: Partial<Material> = {}): Material {
  const now = nowIso();
  return {
    id: uuid(),
    businessId,
    name: '',
    purchasePrice: '0',
    purchaseQuantity: '1',
    unit: 'g',
    isEstimated: false,
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function newProduct(businessId: string, overrides: Partial<Product> = {}): Product {
  const now = nowIso();
  return {
    id: uuid(),
    businessId,
    name: '',
    description: '',
    costingMode: 'batch',
    sellableUnits: '1',
    unitsMade: null,
    lossesAccounted: false,
    laborMinutes: '0',
    laborHourlyRate: '0',
    laborIsEstimated: false,
    includeSharedCosts: false,
    productionMinutes: '0',
    materials: [],
    costs: [],
    checklist: emptyChecklist(),
    pricing: {
      mode: 'margin',
      targetMargin: '0.3',
      markup: '0.5',
      commissionRate: '0',
      fixedSaleFee: '0',
      roundingStep: null,
      manualPrice: null,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Copia profunda con ids nuevos para duplicar un producto. */
export function cloneProduct(source: Product, name: string): Product {
  const now = nowIso();
  return {
    ...structuredClone(source),
    id: uuid(),
    name,
    materials: source.materials.map((l) => ({ ...l, id: uuid() })),
    costs: source.costs.map((c) => ({ ...c, id: uuid() })),
    checklist: { ...source.checklist },
    pricing: { ...source.pricing },
    createdAt: now,
    updatedAt: now,
  };
}
