import { Business, Material, Product } from '../models/domain';
import { ReportSnapshot } from '../models/snapshot';

/**
 * Contrato de persistencia. Lo implementan el adaptador de Supabase (cuentas reales)
 * y el adaptador demo (localStorage). Ambos usan el mismo motor de cálculo.
 */
export interface CosteaRepository {
  readonly kind: 'supabase' | 'demo';

  listBusinesses(): Promise<Business[]>;
  getBusiness(id: string): Promise<Business | null>;
  saveBusiness(business: Business): Promise<Business>;
  deleteBusiness(id: string): Promise<void>;

  listMaterials(businessId: string): Promise<Material[]>;
  saveMaterial(material: Material): Promise<Material>;
  deleteMaterial(id: string): Promise<void>;

  listProducts(businessId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  /** Guarda el producto completo (datos, líneas, costos y checklist) de forma atómica. */
  saveProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  listSnapshots(businessId: string): Promise<ReportSnapshot[]>;
  getSnapshot(id: string): Promise<ReportSnapshot | null>;
  saveSnapshot(snapshot: ReportSnapshot): Promise<ReportSnapshot>;
  deleteSnapshot(id: string): Promise<void>;
}

/** Error de persistencia con un mensaje en español listo para mostrar. */
export class RepositoryError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export function errorMessage(e: unknown, fallback = 'Algo salió mal. Intenta de nuevo.'): string {
  if (e instanceof RepositoryError) return e.message;
  if (e instanceof Error && e.name === 'CosteaValidationError') return e.message;
  return fallback;
}
