import { Material, Product } from '../models/domain';
import { emptyChecklist, newProduct } from '../models/factories';
import { CosteaValidationError, Decimal } from './decimal';
import {
  computeCosting,
  laborCost,
  materialCost,
  monthlyProductiveHours,
  sharedCostForBatch,
  suggestedPrice,
  unitCost,
} from './costing';
import { parseLocaleDecimal, toLocaleInput, formatMoney, formatPercent } from './number-format';
import {
  computePricing,
  evaluatePrice,
  priceForMarkup,
  priceForTargetMargin,
  roundUpToStep,
} from './pricing';
import { convertQuantity, compatibleUnits, areCompatible } from './units';

const d6 = (v: Decimal | string) => new Decimal(v).toDecimalPlaces(6).toFixed();

const harina: Material = {
  id: 'm-harina',
  businessId: 'b1',
  name: 'Harina',
  purchasePrice: '5000',
  purchaseQuantity: '1000',
  unit: 'g',
  isEstimated: false,
  notes: '',
  createdAt: '',
  updatedAt: '',
};

describe('Fórmulas básicas', () => {
  it('material de $5.000 por 1.000 g y uso de 300 g cuesta $1.500', () => {
    expect(materialCost(harina, '300', 'g').toFixed()).toBe('1500');
  });

  it('normaliza unidades antes de calcular (comprado en kg, usado en g)', () => {
    const enKg = { ...harina, purchaseQuantity: '1', unit: 'kg' as const };
    expect(materialCost(enKg, '300', 'g').toFixed()).toBe('1500');
  });

  it('rechaza unidades incompatibles en el costo de material', () => {
    expect(() => materialCost(harina, '300', 'ml')).toThrowError(CosteaValidationError);
  });

  it('rechaza cantidad comprada cero (división por cero)', () => {
    expect(() => materialCost({ ...harina, purchaseQuantity: '0' }, '300', 'g')).toThrowError(
      /mayor que cero/,
    );
  });

  it('admite costo cero intencional', () => {
    expect(materialCost({ ...harina, purchasePrice: '0' }, '300', 'g').toFixed()).toBe('0');
  });

  it('trabajo de la tanda = (minutos / 60) × valor por hora', () => {
    expect(laborCost('90', '10000').toFixed()).toBe('15000');
  });

  it('gastos compartidos = (mensual / horas mensuales) × horas de la tanda', () => {
    expect(sharedCostForBatch('400000', '160', '2').toFixed()).toBe('5000');
    expect(() => sharedCostForBatch('400000', '0', '2')).toThrowError(CosteaValidationError);
  });

  it('calcula las horas productivas del mes a partir de días y horas', () => {
    expect(monthlyProductiveHours('5', '8').toFixed()).toBe('173.33'); // 5 × 8 × 4,33
    expect(monthlyProductiveHours('6', '6').toFixed()).toBe('156');
    expect(monthlyProductiveHours('3', '2.5').toFixed()).toBe('32.5');
    expect(() => monthlyProductiveHours('8', '8')).toThrowError(/máximo 7 días/);
    expect(() => monthlyProductiveHours('5', '25')).toThrowError(/máximo 24 horas/);
    expect(() => monthlyProductiveHours('0', '8')).toThrowError(/mayor que cero/);
  });

  it('tanda de $24.000 con 12 unidades da costo unitario de $2.000', () => {
    expect(unitCost('24000', '12').toFixed()).toBe('2000');
  });

  it('suma los costos por unidad después de dividir la tanda', () => {
    expect(unitCost('24000', '12', '500').toFixed()).toBe('2500');
  });

  it('rechaza cero unidades vendibles y negativos', () => {
    expect(() => unitCost('24000', '0')).toThrowError(/mayor que cero/);
    expect(() => unitCost('-1', '12')).toThrowError(/negativo/);
  });
});

describe('Conversiones de unidades', () => {
  it('kg ↔ g', () => {
    expect(convertQuantity('1.5', 'kg', 'g').toFixed()).toBe('1500');
    expect(convertQuantity('250', 'g', 'kg').toFixed()).toBe('0.25');
  });
  it('L ↔ ml', () => {
    expect(convertQuantity('2', 'l', 'ml').toFixed()).toBe('2000');
    expect(convertQuantity('330', 'ml', 'l').toFixed()).toBe('0.33');
  });
  it('m ↔ cm y unidades', () => {
    expect(convertQuantity('1.2', 'm', 'cm').toFixed()).toBe('120');
    expect(convertQuantity('35', 'cm', 'm').toFixed()).toBe('0.35');
    expect(convertQuantity('3', 'unit', 'unit').toFixed()).toBe('3');
  });
  it('rechaza gramos a mililitros sin un factor explícito', () => {
    expect(() => convertQuantity('100', 'g', 'ml')).toThrowError(/sin un factor de conversión/);
    expect(() => convertQuantity('1', 'unit', 'g')).toThrowError(CosteaValidationError);
  });
  it('acepta un factor explícito positivo y rechaza uno inválido', () => {
    expect(convertQuantity('100', 'ml', 'g', '0.92').toFixed()).toBe('92');
    expect(() => convertQuantity('100', 'ml', 'g', '0')).toThrowError(/mayor que cero/);
  });
  it('lista solo unidades compatibles', () => {
    expect(compatibleUnits('kg').sort()).toEqual(['g', 'kg']);
    expect(areCompatible('l', 'ml')).toBe(true);
    expect(areCompatible('g', 'ml')).toBe(false);
  });
});

describe('Precio sugerido', () => {
  it('costo $10.000 y margen 30 %, sin comisiones → ≈ $14.285,714286', () => {
    expect(d6(priceForTargetMargin('10000', '0.3'))).toBe('14285.714286');
  });

  it('costo $10.000, margen 30 % y comisión 5 % → ≈ $15.384,615385', () => {
    const P = priceForTargetMargin('10000', '0.3', '0.05');
    expect(d6(P)).toBe('15384.615385');
    // Al precio calculado, el margen efectivo es exactamente el objetivo.
    const out = evaluatePrice(P, '10000', '0.05');
    expect(d6(out.effectiveMargin!)).toBe('0.3');
  });

  it('incluye el cargo fijo de venta por unidad en el numerador', () => {
    // (10.000 + 500) / (1 − 0,3) = 15.000
    expect(priceForTargetMargin('10000', '0.3', '0', '500').toFixed()).toBe('15000');
  });

  it('valida que margen + comisión sea menor que 100 %', () => {
    expect(() => priceForTargetMargin('10000', '0.6', '0.4')).toThrowError(/menos de 100 %/);
    expect(() => priceForTargetMargin('10000', '0.7', '0.35')).toThrowError(CosteaValidationError);
  });

  it('rechaza porcentajes fuera de rango y negativos', () => {
    expect(() => priceForTargetMargin('10000', '1')).toThrowError(/entre 0 %/);
    expect(() => priceForTargetMargin('10000', '-0.1')).toThrowError(/entre 0 %/);
    expect(() => priceForMarkup('10000', '-0.5')).toThrowError(/negativo/);
    expect(() => evaluatePrice('10000', '5000', '1.2')).toThrowError(/entre 0 %/);
  });

  it('recargo sobre el costo: P = (C + f) × (1 + r) y el margen efectivo descuenta la comisión', () => {
    const P = priceForMarkup('10000', '0.5', '0');
    expect(P.toFixed()).toBe('15000');
    const out = evaluatePrice(P, '10000', '0.1', '0');
    // G = 15.000 − 10.000 − 1.500 = 3.500 → margen 23,33 %
    expect(out.profit).toBe('3500');
    expect(d6(out.effectiveMargin!)).toBe('0.233333');
  });

  it('redondea hacia arriba a múltiplos y recalcula ganancia y margen', () => {
    expect(roundUpToStep('14285.714286', '100').toFixed()).toBe('14300');
    expect(roundUpToStep('14285.714286', '500').toFixed()).toBe('14500');
    expect(roundUpToStep('14500', '500').toFixed()).toBe('14500');
    expect(() => roundUpToStep('100', '0')).toThrowError(CosteaValidationError);

    const r = computePricing('10000', {
      mode: 'margin',
      targetMargin: '0.3',
      markup: '0',
      commissionRate: '0',
      fixedSaleFee: '0',
      roundingStep: '500',
      manualPrice: null,
    });
    expect(d6(r.calculated.price)).toBe('14285.714286');
    expect(r.rounded!.price).toBe('14500');
    expect(r.rounded!.profit).toBe('4500');
    expect(d6(r.rounded!.effectiveMargin!)).toBe('0.310345');
  });

  it('simulador con precio manual calcula ganancia y margen (incluso pérdida)', () => {
    const r = computePricing('10000', {
      mode: 'margin',
      targetMargin: '0.3',
      markup: '0',
      commissionRate: '0.05',
      fixedSaleFee: '200',
      roundingStep: null,
      manualPrice: '10000',
    });
    // G = 10.000 − 10.000 − 200 − 500 = −700
    expect(r.manual!.profit).toBe('-700');
    expect(r.manual!.effectiveMargin).toBe('-0.07');
  });

  it('precio manual inválido se informa sin romper el cálculo', () => {
    const r = computePricing('10000', {
      mode: 'markup',
      targetMargin: '0',
      markup: '0.2',
      commissionRate: '0',
      fixedSaleFee: '0',
      roundingStep: null,
      manualPrice: '0',
    });
    expect(r.manual).toBeNull();
    expect(r.manualError).toMatch(/mayor que cero/);
  });

  it('con costo y precio cero el margen es indefinido (null), no una división por cero', () => {
    expect(evaluatePrice('0', '0').effectiveMargin).toBeNull();
  });
});

describe('Costeo completo', () => {
  function pan(overrides: Partial<Product> = {}): Product {
    return {
      ...newProduct('b1'),
      id: 'p1',
      name: 'Pan',
      costingMode: 'batch',
      sellableUnits: '12',
      materials: [{ id: 'l1', materialId: 'm-harina', quantity: '300', unit: 'g', isEstimated: false }],
      laborMinutes: '60',
      laborHourlyRate: '12000',
      ...overrides,
    };
  }
  const shared = { monthlyAmount: '0', productiveHoursPerMonth: null };

  it('combina materiales, trabajo y costos por tanda y por unidad', () => {
    const product = pan({
      costs: [
        { id: 'c1', category: 'packaging', name: 'Bolsa', amount: '300', scope: 'unit', isEstimated: false },
        { id: 'c2', category: 'services', name: 'Gas', amount: '1500', scope: 'batch', isEstimated: true },
      ],
    });
    const r = computeCosting({ product, materials: [harina], shared });
    expect(r.valid).toBe(true);
    // Tanda: 1.500 + 12.000 + 1.500 = 15.000; /12 = 1.250; + 300 = 1.550
    expect(r.batchCosts).toBe('15000');
    expect(r.unitCost).toBe('1550');
    expect(r.batchTotal).toBe('18600');
    const packaging = r.breakdown.find((b) => b.key === 'packaging')!;
    expect(packaging.unitAmount).toBe('300');
    expect(packaging.batchAmount).toBe('3600');
    expect(r.hasEstimates).toBe(true);
  });

  it('no incluye comisión ni cargo fijo dentro del costo unitario', () => {
    const product = pan({
      pricing: { ...pan().pricing, commissionRate: '0.1', fixedSaleFee: '1000' },
    });
    const r = computeCosting({ product, materials: [harina], shared });
    expect(r.unitCost).toBe('1125'); // (1.500 + 12.000) / 12
  });

  it('modo unidad ignora las unidades vendibles y usa 1', () => {
    const r = computeCosting({
      product: pan({ costingMode: 'unit', sellableUnits: '0' }),
      materials: [harina],
      shared,
    });
    expect(r.unitCost).toBe('13500');
  });

  it('asigna gastos compartidos por horas de producción y exige horas mensuales', () => {
    const product = pan({ includeSharedCosts: true, productionMinutes: '120' });
    const ok = computeCosting({
      product,
      materials: [harina],
      shared: { monthlyAmount: '400000', productiveHoursPerMonth: '160' },
    });
    expect(ok.breakdown.find((b) => b.key === 'shared')!.batchAmount).toBe('5000');
    expect(ok.checklist.find((c) => c.category === 'shared')!.status).toBe('included');

    const bad = computeCosting({
      product,
      materials: [harina],
      shared: { monthlyAmount: '400000', productiveHoursPerMonth: '0' },
    });
    expect(bad.valid).toBe(false);
    expect(bad.unitCost).toBeNull();
    expect(bad.errors.map((e) => e.code)).toContain('shared_hours_required');
  });

  it('valida que las unidades vendibles no superen las producidas', () => {
    const r = computeCosting({ product: pan({ unitsMade: '10' }), materials: [harina], shared });
    expect(r.errors.map((e) => e.code)).toContain('units_made_below_sellable');
  });

  it('informa unidades incompatibles en una línea sin romper todo el cálculo', () => {
    const product = pan({
      materials: [{ id: 'l1', materialId: 'm-harina', quantity: '300', unit: 'ml', isEstimated: false }],
    });
    const r = computeCosting({ product, materials: [harina], shared });
    expect(r.valid).toBe(false);
    expect(r.materialLines[0].error).toMatch(/sin un factor/);
  });

  it('un margen + comisión imposible deja el costo y reporta el error de precio', () => {
    const product = pan({ pricing: { ...pan().pricing, targetMargin: '0.8', commissionRate: '0.3' } });
    const r = computeCosting({ product, materials: [harina], shared });
    expect(r.unitCost).toBe('1125');
    expect(r.pricing).toBeNull();
    expect(r.pricingError!.code).toBe('margin_plus_commission_too_high');
  });

  it('costo cero intencional es válido y advierte precio cero', () => {
    const product = pan({ materials: [], laborMinutes: '0' });
    const r = computeCosting({ product, materials: [], shared });
    expect(r.valid).toBe(true);
    expect(r.unitCost).toBe('0');
    expect(r.warnings.map((w) => w.code)).toContain('zero_price');
  });
});

describe('Checklist y estado', () => {
  const shared = { monthlyAmount: '0', productiveHoursPerMonth: null };
  const base = (): Product => ({
    ...newProduct('b1'),
    id: 'p1',
    name: 'Vela',
    costingMode: 'unit',
    materials: [{ id: 'l1', materialId: 'm-harina', quantity: '100', unit: 'g', isEstimated: false }],
  });

  it('"incluida" sin datos sigue pendiente y no declara el costeo completo', () => {
    const product = base();
    product.checklist = { ...emptyChecklist(), packaging: 'included' };
    const r = computeCosting({ product, materials: [harina], shared });
    const packaging = r.checklist.find((c) => c.category === 'packaging')!;
    expect(packaging.status).toBe('pending');
    expect(r.warnings.map((w) => w.code)).toContain('included_without_data');
    expect(r.status).toBe('pending');
    expect(r.pendingCategories).toContain('packaging');
  });

  it('una categoría con datos queda incluida automáticamente', () => {
    const r = computeCosting({ product: base(), materials: [harina], shared });
    expect(r.checklist.find((c) => c.category === 'materials')!.status).toBe('included');
  });

  it('todo resuelto sin estimados → revisado; con estimados → estimado', () => {
    const product = base();
    product.laborMinutes = '30';
    product.laborHourlyRate = '10000';
    product.lossesAccounted = true;
    product.checklist = {
      ...emptyChecklist(),
      packaging: 'not_applicable',
      services: 'not_applicable',
      transport: 'not_applicable',
      shared: 'not_applicable',
      commissions: 'not_applicable',
    };
    const reviewed = computeCosting({ product, materials: [harina], shared });
    expect(reviewed.pendingCategories).toEqual([]);
    expect(reviewed.status).toBe('reviewed');

    product.laborIsEstimated = true;
    expect(computeCosting({ product, materials: [harina], shared }).status).toBe('estimated');

    const estimatedMaterial = { ...harina, isEstimated: true };
    product.laborIsEstimated = false;
    expect(computeCosting({ product, materials: [estimatedMaterial], shared }).status).toBe('estimated');
  });

  it('el precio sugerido usa el redondeado si existe', () => {
    const product = base();
    product.pricing = { ...product.pricing, targetMargin: '0.3', roundingStep: '100' };
    const r = computeCosting({ product, materials: [harina], shared });
    // C = 500 → 714,28… → 800
    expect(suggestedPrice(r)).toBe('800');
  });
});

describe('Entrada y formato es-CO', () => {
  it('interpreta separadores de miles y coma decimal', () => {
    expect(parseLocaleDecimal('5.000')).toBe('5000');
    expect(parseLocaleDecimal('1.250,5')).toBe('1250.5');
    expect(parseLocaleDecimal('0,3')).toBe('0.3');
    expect(parseLocaleDecimal('1.5')).toBe('1.5');
    expect(parseLocaleDecimal('$ 12.000')).toBe('12000');
    expect(parseLocaleDecimal('')).toBeNull();
    expect(parseLocaleDecimal('abc')).toBeUndefined();
    expect(parseLocaleDecimal('1,2,3')).toBeUndefined();
    expect(parseLocaleDecimal('-20')).toBe('-20');
  });
  it('escribe valores canónicos en formato editable', () => {
    expect(toLocaleInput('1250.5')).toBe('1.250,5');
    expect(toLocaleInput('5000')).toBe('5.000');
  });
  it('formatea dinero y porcentajes para mostrar', () => {
    expect(formatMoney('14285.714286').replace(/\s/g, ' ')).toBe('$ 14.285,71');
    expect(formatMoney('1730.8').replace(/\s/g, ' ')).toBe('$ 1.730,80');
    expect(formatMoney('2000.0000').replace(/\s/g, ' ')).toBe('$ 2.000');
    expect(formatPercent('0.3')).toBe('30 %');
  });
});
