import { Injectable, inject } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { CostingResult, computeCosting, suggestedPrice } from '../engine/costing';
import { Business, Material, Product } from '../models/domain';
import { cloneProduct, uuid } from '../models/factories';
import { ReportSnapshot } from '../models/snapshot';
import { CosteaRepository, RepositoryError } from './repository';
import { SupabaseRepository } from './supabase.repository';

/**
 * Punto único de acceso a datos para las páginas. Elige el adaptador según el modo
 * de sesión y concentra los flujos que combinan persistencia y motor de cálculo.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly session = inject(SessionService);
  private supabaseRepo: SupabaseRepository | null = null;

  get repo(): CosteaRepository {
    const mode = this.session.mode();
    if (mode === 'demo') return this.session.demoRepository;
    if (mode === 'account' && this.session.supabase) {
      this.supabaseRepo ??= new SupabaseRepository(this.session.supabase);
      return this.supabaseRepo;
    }
    throw new RepositoryError('Inicia sesión o entra al modo demo para ver tus datos.');
  }

  costing(product: Product, materials: Material[], business: Business): CostingResult {
    return computeCosting({
      product,
      materials,
      shared: {
        monthlyAmount: business.sharedMonthlyAmount,
        productiveHoursPerMonth: business.productiveHoursPerMonth,
      },
    });
  }

  async duplicateProduct(product: Product, existingNames: string[]): Promise<Product> {
    let name = `${product.name} (copia)`;
    for (let i = 2; existingNames.includes(name); i++) name = `${product.name} (copia ${i})`;
    return this.repo.saveProduct(cloneProduct(product, name.slice(0, 120)));
  }

  /** Congela el costeo actual en un reporte que no cambiará aunque se editen los datos. */
  async saveSnapshot(product: Product, materials: Material[], business: Business): Promise<ReportSnapshot> {
    const result = this.costing(product, materials, business);
    const used = new Set(product.materials.map((l) => l.materialId));
    const snapshot: ReportSnapshot = {
      id: uuid(),
      businessId: business.id,
      productId: product.id,
      productName: product.name,
      currency: business.currency,
      unitCost: result.unitCost,
      suggestedPrice: suggestedPrice(result),
      status: result.status,
      createdAt: new Date().toISOString(),
      data: {
        version: 1,
        business: {
          name: business.name,
          category: business.category,
          currency: business.currency,
          sharedMonthlyAmount: business.sharedMonthlyAmount,
          productiveHoursPerMonth: business.productiveHoursPerMonth,
        },
        product: structuredClone(product),
        materials: structuredClone(materials.filter((m) => used.has(m.id))),
        result,
      },
    };
    return this.repo.saveSnapshot(snapshot);
  }
}
