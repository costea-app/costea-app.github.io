import { Business, Material, Product } from '../models/domain';
import { emptyChecklist, newBusiness, newMaterial, newProduct, uuid } from '../models/factories';
import { DemoState } from './demo.repository';

/** Negocios de ejemplo. Solo se cargan en el modo demo, nunca en cuentas reales. */
export function buildDemoSeed(): DemoState {
  const panaderia: Business = newBusiness({
    name: 'Panadería La Espiga',
    category: 'Panadería y repostería',
    currency: 'COP',
    sharedMonthlyAmount: '450000',
    productiveHoursPerMonth: '156',
    productionDaysPerWeek: '6',
    productionHoursPerDay: '6',
    sharedExpensesNote: 'Arriendo del local, internet y luz general. El gas del horno se registra por tanda.',
    defaultHourlyRate: '9000',
  });
  const velas: Business = newBusiness({
    name: 'Luz de Monte',
    category: 'Velas y aromas',
    currency: 'COP',
    sharedMonthlyAmount: '0',
    productiveHoursPerMonth: null,
    defaultHourlyRate: '10000',
  });

  const m = (b: Business, name: string, price: string, qty: string, unit: Material['unit'], isEstimated = false) =>
    newMaterial(b.id, { name, purchasePrice: price, purchaseQuantity: qty, unit, isEstimated });

  const harina = m(panaderia, 'Harina de trigo', '4800', '1', 'kg');
  const mantequilla = m(panaderia, 'Mantequilla', '13500', '500', 'g');
  const azucar = m(panaderia, 'Azúcar', '4200', '1', 'kg');
  const huevos = m(panaderia, 'Huevos', '16500', '30', 'unit');
  const levadura = m(panaderia, 'Levadura seca', '9800', '500', 'g');
  const leche = m(panaderia, 'Leche entera', '4300', '1', 'l');
  const sal = m(panaderia, 'Sal', '2000', '1', 'kg');
  const crema = m(panaderia, 'Crema de leche', '16000', '1', 'l');
  const fresas = m(panaderia, 'Fresas', '7000', '500', 'g', true);

  const cera = m(velas, 'Cera de soya', '38000', '1', 'kg');
  const esencia = m(velas, 'Esencia de lavanda', '12000', '30', 'ml', true);
  const pabilo = m(velas, 'Pabilo encerado', '8000', '10', 'm');
  const frasco = m(velas, 'Frasco de vidrio', '30000', '12', 'unit');

  const line = (mat: Material, quantity: string, unit: Material['unit'] = mat.unit, isEstimated = false) => ({
    id: uuid(),
    materialId: mat.id,
    quantity,
    unit,
    isEstimated,
  });

  const pan: Product = newProduct(panaderia.id, {
    name: 'Pan artesanal',
    description: 'Tanda de pan de masa madre con mantequilla.',
    costingMode: 'batch',
    unitsMade: '13',
    sellableUnits: '12',
    lossesAccounted: true,
    materials: [
      line(harina, '1000', 'g'),
      line(levadura, '20'),
      line(sal, '20', 'g'),
      line(mantequilla, '100'),
      line(leche, '300', 'ml'),
    ],
    laborMinutes: '90',
    laborHourlyRate: '9000',
    includeSharedCosts: true,
    productionMinutes: '180',
    costs: [
      { id: uuid(), category: 'packaging', name: 'Bolsa kraft', amount: '180', scope: 'unit', isEstimated: false },
      { id: uuid(), category: 'services', name: 'Gas del horno', amount: '2500', scope: 'batch', isEstimated: false },
    ],
    checklist: { ...emptyChecklist(), transport: 'not_applicable', commissions: 'not_applicable' },
    pricing: {
      mode: 'margin',
      targetMargin: '0.35',
      markup: '0.5',
      commissionRate: '0',
      fixedSaleFee: '0',
      roundingStep: '100',
      manualPrice: null,
    },
  });

  const pastel: Product = newProduct(panaderia.id, {
    name: 'Pastel de fresas',
    description: 'Pastel de 20 cm para domicilio por aplicación.',
    costingMode: 'unit',
    sellableUnits: '1',
    lossesAccounted: true,
    materials: [
      line(harina, '300', 'g'),
      line(azucar, '250', 'g'),
      line(huevos, '6'),
      line(mantequilla, '200'),
      line(crema, '500', 'ml'),
      line(fresas, '400'),
    ],
    laborMinutes: '150',
    laborHourlyRate: '9000',
    includeSharedCosts: true,
    productionMinutes: '120',
    costs: [
      { id: uuid(), category: 'packaging', name: 'Caja para pastel', amount: '3500', scope: 'unit', isEstimated: false },
      { id: uuid(), category: 'transport', name: 'Domicilio asumido', amount: '6000', scope: 'batch', isEstimated: true },
    ],
    // "Servicios" se deja pendiente a propósito: el ejemplo muestra un precio provisional.
    checklist: { ...emptyChecklist() },
    pricing: {
      mode: 'margin',
      targetMargin: '0.3',
      markup: '0.5',
      commissionRate: '0.12',
      fixedSaleFee: '0',
      roundingStep: '1000',
      manualPrice: '85000',
    },
  });

  const vela: Product = newProduct(velas.id, {
    name: 'Vela aromática en frasco',
    description: 'Vela de soya de 180 g con esencia de lavanda.',
    costingMode: 'batch',
    unitsMade: '10',
    sellableUnits: '10',
    lossesAccounted: true,
    materials: [line(cera, '1.8', 'kg'), line(esencia, '60'), line(pabilo, '120', 'cm'), line(frasco, '10')],
    laborMinutes: '120',
    laborHourlyRate: '10000',
    costs: [
      { id: uuid(), category: 'packaging', name: 'Etiqueta', amount: '500', scope: 'unit', isEstimated: false },
      { id: uuid(), category: 'packaging', name: 'Caja de regalo', amount: '1200', scope: 'unit', isEstimated: false },
    ],
    checklist: {
      ...emptyChecklist(),
      services: 'not_applicable',
      transport: 'not_applicable',
      shared: 'not_applicable',
    },
    pricing: {
      mode: 'markup',
      targetMargin: '0.3',
      markup: '0.8',
      commissionRate: '0.1',
      fixedSaleFee: '300',
      roundingStep: '500',
      manualPrice: null,
    },
  });

  return {
    version: 1,
    businesses: [panaderia, velas],
    materials: [harina, mantequilla, azucar, huevos, levadura, leche, sal, crema, fresas, cera, esencia, pabilo, frasco],
    products: [pan, pastel, vela],
    snapshots: [],
  };
}
