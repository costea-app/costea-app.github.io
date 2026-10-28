/**
 * Prueba el adaptador REAL de Supabase (supabase-js + SupabaseRepository) contra PostgREST
 * y Postgres con las migraciones del proyecto, usando JWT de dos usuarios distintos.
 */
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SupabaseRepository } from '../../../src/app/core/data/supabase.repository';
import { RepositoryError } from '../../../src/app/core/data/repository';
import { computeCosting } from '../../../src/app/core/engine/costing';
import { cloneProduct, newBusiness, newMaterial, newProduct, uuid } from '../../../src/app/core/models/factories';

const URL = process.env['IT_SUPABASE_URL'] ?? 'http://localhost:8081';
const SECRET = process.env['IT_JWT_SECRET'] ?? '';
const USER_A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const USER_B = 'bbbbbbbb-0000-0000-0000-00000000000b';

function jwt(sub: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

function repoFor(sub: string): SupabaseRepository {
  const token = jwt(sub);
  const client = createClient(URL, 'clave-publicable-de-prueba', { accessToken: async () => token });
  return new SupabaseRepository(client);
}

describe('SupabaseRepository contra PostgREST', () => {
  const a = repoFor(USER_A);
  const b = repoFor(USER_B);

  it('flujo completo: negocio, material, producto, editar, duplicar, reporte y aislamiento', async () => {
    const business = await a.saveBusiness(
      newBusiness({
        name: 'Panadería IT', sharedMonthlyAmount: '400000', productiveHoursPerMonth: '173.33',
        productionDaysPerWeek: '5', productionHoursPerDay: '7.5',
      }),
    );
    expect(business.sharedMonthlyAmount).toBe('400000');
    expect(business.productionDaysPerWeek).toBe('5');
    expect(business.productionHoursPerDay).toBe('7.5');

    const harina = await a.saveMaterial(
      newMaterial(business.id, { name: 'Harina', purchasePrice: '5000', purchaseQuantity: '1000', unit: 'g' }),
    );
    expect(harina.purchaseQuantity).toBe('1000');

    // Crear (RPC transaccional)
    const draft = newProduct(business.id, {
      name: 'Pan IT',
      sellableUnits: '12',
      unitsMade: '13',
      laborMinutes: '60',
      laborHourlyRate: '12000',
      includeSharedCosts: true,
      productionMinutes: '120',
      materials: [{ id: uuid(), materialId: harina.id, quantity: '0.3', unit: 'kg', isEstimated: true }],
      costs: [
        { id: uuid(), category: 'packaging', name: 'Bolsa', amount: '150.5', scope: 'unit', isEstimated: false },
        { id: uuid(), category: 'services', name: 'Gas', amount: '2000', scope: 'batch', isEstimated: false },
      ],
      pricing: {
        mode: 'margin', targetMargin: '0.333333', markup: '0.5', commissionRate: '0.05',
        fixedSaleFee: '0', roundingStep: '100', manualPrice: null,
      },
    });
    draft.checklist.transport = 'not_applicable';
    const created = await a.saveProduct(draft);
    expect(created.materials).toHaveLength(1);
    expect(created.materials[0].quantity).toBe('0.3');
    expect(created.costs.map((c) => c.amount)).toEqual(['150.5', '2000']);
    expect(created.pricing.targetMargin).toBe('0.333333');
    expect(created.checklist.transport).toBe('not_applicable');

    // El costeo con datos leídos de la BD es idéntico al del borrador
    const shared = { monthlyAmount: business.sharedMonthlyAmount, productiveHoursPerMonth: business.productiveHoursPerMonth };
    const before = computeCosting({ product: draft, materials: [harina], shared });
    const after = computeCosting({ product: created, materials: [harina], shared });
    expect(after.unitCost).toBe(before.unitCost);

    // Editar
    const edited = await a.saveProduct({ ...created, name: 'Pan IT editado', costs: created.costs.slice(0, 1) });
    expect(edited.name).toBe('Pan IT editado');
    expect(edited.costs).toHaveLength(1);

    // Duplicar
    const copy = await a.saveProduct(cloneProduct(edited, 'Pan IT (copia)'));
    expect((await a.listProducts(business.id)).map((p) => p.name)).toEqual(['Pan IT (copia)', 'Pan IT editado']);
    expect(copy.materials[0].materialId).toBe(harina.id);

    // Reporte (instantánea)
    const snapshot = await a.saveSnapshot({
      id: uuid(), businessId: business.id, productId: edited.id, productName: edited.name, currency: 'COP',
      unitCost: after.unitCost, suggestedPrice: '2500', status: after.status, createdAt: new Date().toISOString(),
      data: { version: 1, business, product: edited, materials: [harina], result: after },
    });
    expect((await a.listSnapshots(business.id)).map((s) => s.id)).toEqual([snapshot.id]);

    // Material en uso: mensaje comprensible
    await expect(a.deleteMaterial(harina.id)).rejects.toThrowError(/se usa en uno o más productos/);

    // ---- Aislamiento: el usuario B no ve ni toca nada de A ----
    // (B puede tener negocios propios de ejecuciones anteriores; nunca los de A)
    expect((await b.listBusinesses()).map((x) => x.id)).not.toContain(business.id);
    expect(await b.getProduct(edited.id)).toBeNull();
    expect(await b.listMaterials(business.id)).toEqual([]);
    expect(await b.getSnapshot(snapshot.id)).toBeNull();
    await expect(b.saveMaterial(newMaterial(business.id, { name: 'x', purchaseQuantity: '1' }))).rejects.toThrowError(RepositoryError);

    const businessB = await b.saveBusiness(newBusiness({ name: 'Negocio B' }));
    const robo = newProduct(businessB.id, {
      name: 'Robo',
      materials: [{ id: uuid(), materialId: harina.id, quantity: '1', unit: 'g', isEstimated: false }],
    });
    await expect(b.saveProduct(robo)).rejects.toThrowError(RepositoryError);
    expect(await b.listProducts(businessB.id)).toEqual([]);
    await b.deleteProduct(edited.id); // RLS: no afecta filas de A
    expect(await a.getProduct(edited.id)).not.toBeNull();

    // Eliminar producto conserva el reporte
    await a.deleteProduct(edited.id);
    const kept = await a.getSnapshot(snapshot.id);
    expect(kept?.productId).toBeNull();
    expect(kept?.unitCost).toBe(after.unitCost);
  });
});
