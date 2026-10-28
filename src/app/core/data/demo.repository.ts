import { Business, Material, Product } from '../models/domain';
import { nowIso } from '../models/factories';
import { ReportSnapshot } from '../models/snapshot';
import { areCompatible } from '../engine/units';
import { CosteaRepository, RepositoryError } from './repository';

export const DEMO_STORAGE_KEY = 'costea.demo.v1';

export interface DemoState {
  version: 1;
  businesses: Business[];
  materials: Material[];
  products: Product[];
  snapshots: ReportSnapshot[];
}

export function emptyDemoState(): DemoState {
  return { version: 1, businesses: [], materials: [], products: [], snapshots: [] };
}

/**
 * Persistencia del modo demo: todo vive en el localStorage de este navegador.
 * Reproduce las mismas reglas de integridad que la base de datos real
 * (mismo negocio para producto y material, unidades compatibles, material en uso…).
 */
export class DemoRepository implements CosteaRepository {
  readonly kind = 'demo' as const;

  constructor(private readonly storage: Storage = localStorage) {}

  hasData(): boolean {
    return this.storage.getItem(DEMO_STORAGE_KEY) !== null;
  }

  replaceAll(state: DemoState): void {
    this.write(state);
  }

  clear(): void {
    this.storage.removeItem(DEMO_STORAGE_KEY);
  }

  private read(): DemoState {
    const raw = this.storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return emptyDemoState();
    try {
      const parsed = JSON.parse(raw) as DemoState;
      return parsed?.version === 1 ? parsed : emptyDemoState();
    } catch {
      return emptyDemoState();
    }
  }

  private write(state: DemoState): void {
    try {
      this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      throw new RepositoryError(
        'No pudimos guardar en este navegador (¿almacenamiento lleno o bloqueado?).',
        e,
      );
    }
  }

  private mutate<T>(fn: (s: DemoState) => T): T {
    const state = this.read();
    const result = fn(state);
    this.write(state);
    return structuredClone(result);
  }

  private static upsert<T extends { id: string }>(list: T[], item: T): void {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item;
    else list.push(item);
  }

  async listBusinesses(): Promise<Business[]> {
    return this.read().businesses.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async getBusiness(id: string): Promise<Business | null> {
    return this.read().businesses.find((b) => b.id === id) ?? null;
  }

  async saveBusiness(business: Business): Promise<Business> {
    return this.mutate((s) => {
      const saved = { ...business, updatedAt: nowIso() };
      DemoRepository.upsert(s.businesses, saved);
      return saved;
    });
  }

  async deleteBusiness(id: string): Promise<void> {
    this.mutate((s) => {
      s.businesses = s.businesses.filter((b) => b.id !== id);
      s.materials = s.materials.filter((m) => m.businessId !== id);
      s.products = s.products.filter((p) => p.businessId !== id);
      s.snapshots = s.snapshots.filter((r) => r.businessId !== id);
    });
  }

  async listMaterials(businessId: string): Promise<Material[]> {
    return this.read()
      .materials.filter((m) => m.businessId === businessId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async saveMaterial(material: Material): Promise<Material> {
    return this.mutate((s) => {
      if (!s.businesses.some((b) => b.id === material.businessId)) {
        throw new RepositoryError('El negocio no existe.');
      }
      const previous = s.materials.find((m) => m.id === material.id);
      if (previous && previous.businessId !== material.businessId) {
        throw new RepositoryError('Un material no puede moverse de negocio.');
      }
      if (previous && !areCompatible(previous.unit, material.unit)) {
        const used = s.products.some((p) => p.materials.some((l) => l.materialId === material.id));
        if (used) {
          throw new RepositoryError(
            'Este material ya se usa en productos; solo puedes cambiarlo a una unidad compatible.',
          );
        }
      }
      const saved = { ...material, updatedAt: nowIso() };
      DemoRepository.upsert(s.materials, saved);
      return saved;
    });
  }

  async deleteMaterial(id: string): Promise<void> {
    this.mutate((s) => {
      if (s.products.some((p) => p.materials.some((l) => l.materialId === id))) {
        throw new RepositoryError(
          'Este material se usa en uno o más productos. Quítalo de esos productos antes de eliminarlo.',
        );
      }
      s.materials = s.materials.filter((m) => m.id !== id);
    });
  }

  async listProducts(businessId: string): Promise<Product[]> {
    return this.read()
      .products.filter((p) => p.businessId === businessId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async getProduct(id: string): Promise<Product | null> {
    return this.read().products.find((p) => p.id === id) ?? null;
  }

  async saveProduct(product: Product): Promise<Product> {
    // Se valida todo antes de escribir: la escritura es única, así que no hay estados parciales.
    return this.mutate((s) => {
      if (!s.businesses.some((b) => b.id === product.businessId)) {
        throw new RepositoryError('El negocio no existe.');
      }
      const previous = s.products.find((p) => p.id === product.id);
      if (previous && previous.businessId !== product.businessId) {
        throw new RepositoryError('Un producto no puede moverse de negocio.');
      }
      for (const line of product.materials) {
        const m = s.materials.find((x) => x.id === line.materialId);
        if (!m || m.businessId !== product.businessId) {
          throw new RepositoryError('Uno de los materiales no pertenece a este negocio.');
        }
        if (!areCompatible(m.unit, line.unit)) {
          throw new RepositoryError(`La unidad usada para “${m.name}” no es compatible.`);
        }
      }
      const saved: Product = { ...structuredClone(product), updatedAt: nowIso() };
      DemoRepository.upsert(s.products, saved);
      return saved;
    });
  }

  async deleteProduct(id: string): Promise<void> {
    this.mutate((s) => {
      s.products = s.products.filter((p) => p.id !== id);
      s.snapshots = s.snapshots.map((r) => (r.productId === id ? { ...r, productId: null } : r));
    });
  }

  async listSnapshots(businessId: string): Promise<ReportSnapshot[]> {
    return this.read()
      .snapshots.filter((r) => r.businessId === businessId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getSnapshot(id: string): Promise<ReportSnapshot | null> {
    return this.read().snapshots.find((r) => r.id === id) ?? null;
  }

  async saveSnapshot(snapshot: ReportSnapshot): Promise<ReportSnapshot> {
    return this.mutate((s) => {
      if (s.snapshots.some((r) => r.id === snapshot.id)) {
        throw new RepositoryError('Los reportes guardados no se pueden modificar.');
      }
      s.snapshots.push(structuredClone(snapshot));
      return snapshot;
    });
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.mutate((s) => {
      s.snapshots = s.snapshots.filter((r) => r.id !== id);
    });
  }
}
