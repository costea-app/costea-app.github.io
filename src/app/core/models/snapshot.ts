import type { CostingResult } from '../engine/costing';
import { Business, CostingStatus, DecimalString, Material, Product } from './domain';

/** Datos congelados de un reporte: no cambian aunque luego se editen materiales o productos. */
export interface SnapshotData {
  version: 1;
  business: Pick<
    Business,
    'name' | 'category' | 'currency' | 'sharedMonthlyAmount' | 'productiveHoursPerMonth'
  >;
  product: Product;
  materials: Material[];
  result: CostingResult;
}

export interface ReportSnapshot {
  id: string;
  businessId: string;
  /** null si el producto se eliminó después de guardar el reporte. */
  productId: string | null;
  productName: string;
  currency: string;
  unitCost: DecimalString | null;
  suggestedPrice: DecimalString | null;
  status: CostingStatus;
  data: SnapshotData;
  createdAt: string;
}
