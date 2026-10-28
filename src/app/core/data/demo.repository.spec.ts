import { computeCosting, suggestedPrice } from '../engine/costing';
import { Business, Material, Product } from '../models/domain';
import { cloneProduct, newBusiness, newMaterial, newProduct } from '../models/factories';
import { ReportSnapshot } from '../models/snapshot';
import { DEMO_STORAGE_KEY, DemoRepository } from './demo.repository';
import { buildDemoSeed } from './demo-seed';
import { RepositoryError } from './repository';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const costingOf = (p: Product, materials: Material[], b: Business) =>
  computeCosting({
    product: p,
    materials,
    shared: { monthlyAmount: b.sharedMonthlyAmount, productiveHoursPerMonth: b.productiveHoursPerMonth },
  });

describe('DemoRepository: flujos de producto', () => {
  let storage: MemoryStorage;
  let repo: DemoRepository;
  let business: Business;
  let harina: Material;

  beforeEach(async () => {
    storage = new MemoryStorage();
    repo = new DemoRepository(storage);
    business = await repo.saveBusiness(newBusiness({ name: 'Panadería' }));
    harina = await repo.saveMaterial(
      newMaterial(business.id, { name: 'Harina', purchasePrice: '5000', purchaseQuantity: '1000', unit: 'g' }),
    );
  });

  function pan(): Product {
    return newProduct(business.id, {
      name: 'Pan',
      sellableUnits: '12',
      materials: [{ id: 'l1', materialId: harina.id, quantity: '300', unit: 'g', isEstimated: false }],
      costs: [{ id: 'c1', category: 'packaging', name: 'Bolsa', amount: '200', scope: 'unit', isEstimated: false }],
    });
  }

  it('crea, edita, duplica y persiste entre instancias (recarga del navegador)', async () => {
    // Crear
    const created = await repo.saveProduct(pan());
    expect((await repo.listProducts(business.id)).length).toBe(1);

    // Editar
    await repo.saveProduct({ ...created, name: 'Pan de masa madre', sellableUnits: '10', costs: [] });
    const edited = await repo.getProduct(created.id);
    expect(edited!.name).toBe('Pan de masa madre');
    expect(edited!.costs).toEqual([]);

    // Duplicar: ids nuevos, original intacto
    const copy = await repo.saveProduct(cloneProduct(edited!, 'Pan de masa madre (copia)'));
    expect(copy.id).not.toBe(created.id);
    expect(copy.materials[0].id).not.toBe(edited!.materials[0].id);
    expect(copy.materials[0].materialId).toBe(harina.id);

    // Persistencia: una instancia nueva sobre el mismo almacenamiento ve los mismos datos
    const reloaded = new DemoRepository(storage);
    const names = (await reloaded.listProducts(business.id)).map((p) => p.name);
    expect(names).toEqual(['Pan de masa madre', 'Pan de masa madre (copia)']);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toContain('Pan de masa madre');

    // El costeo recargado coincide con el calculado antes de guardar
    const r = costingOf((await reloaded.getProduct(created.id))!, [harina], business);
    expect(r.unitCost).toBe('150'); // 1.500 / 10
  });

  it('no permite usar materiales de otro negocio (IDs manipulados)', async () => {
    const otro = await repo.saveBusiness(newBusiness({ name: 'Velas' }));
    const cera = await repo.saveMaterial(
      newMaterial(otro.id, { name: 'Cera', purchasePrice: '1', purchaseQuantity: '1', unit: 'kg' }),
    );
    const product = pan();
    product.materials[0].materialId = cera.id;
    await expect(repo.saveProduct(product)).rejects.toThrowError(RepositoryError);
    expect((await repo.listProducts(business.id)).length).toBe(0);
  });

  it('rechaza unidades incompatibles y protege materiales en uso', async () => {
    const product = pan();
    product.materials[0].unit = 'ml';
    await expect(repo.saveProduct(product)).rejects.toThrowError(/no es compatible/);

    await repo.saveProduct(pan());
    await expect(repo.deleteMaterial(harina.id)).rejects.toThrowError(/se usa en uno o más productos/);
    await expect(repo.saveMaterial({ ...harina, unit: 'ml' })).rejects.toThrowError(/unidad compatible/);
    // Cambiar a una unidad compatible sí se permite
    await expect(repo.saveMaterial({ ...harina, unit: 'kg', purchaseQuantity: '1' })).resolves.toBeTruthy();
  });

  it('las instantáneas conservan sus valores aunque cambie el precio del material o se borre el producto', async () => {
    const product = await repo.saveProduct(pan());
    const before = costingOf(product, [harina], business);
    const snapshot: ReportSnapshot = {
      id: 's1',
      businessId: business.id,
      productId: product.id,
      productName: product.name,
      currency: 'COP',
      unitCost: before.unitCost,
      suggestedPrice: suggestedPrice(before),
      status: before.status,
      createdAt: new Date().toISOString(),
      data: {
        version: 1,
        business: { ...business },
        product,
        materials: [harina],
        result: before,
      },
    };
    await repo.saveSnapshot(snapshot);
    await expect(repo.saveSnapshot(snapshot)).rejects.toThrowError(/no se pueden modificar/);

    // Sube el precio del material: el costeo actual cambia, el reporte no
    const pricier = await repo.saveMaterial({ ...harina, purchasePrice: '10000' });
    const now = costingOf(product, [pricier], business);
    expect(now.unitCost).toBe('450'); // 3.000/12 + 200
    expect(before.unitCost).toBe('325'); // 1.500/12 + 200

    await repo.deleteProduct(product.id);
    const kept = await repo.getSnapshot('s1');
    expect(kept!.productId).toBeNull();
    expect(kept!.unitCost).toBe('325');
    expect(kept!.data.result.unitCost).toBe('325');
  });

  it('eliminar un negocio elimina sus datos en cascada', async () => {
    await repo.saveProduct(pan());
    await repo.deleteBusiness(business.id);
    expect(await repo.listBusinesses()).toEqual([]);
    expect(await repo.listMaterials(business.id)).toEqual([]);
    expect(await repo.listProducts(business.id)).toEqual([]);
  });
});

describe('Datos demo', () => {
  it('incluye pan artesanal, pastel y un producto no alimentario con costeos válidos', () => {
    const seed = buildDemoSeed();
    const names = seed.products.map((p) => p.name);
    expect(names).toEqual(['Pan artesanal', 'Pastel de fresas', 'Vela aromática en frasco']);

    const results = seed.products.map((p) => {
      const b = seed.businesses.find((x) => x.id === p.businessId)!;
      return costingOf(p, seed.materials, b);
    });
    for (const r of results) {
      expect(r.valid).toBe(true);
      expect(r.pricing).not.toBeNull();
    }
    // Cifras del pan que muestra la landing (tarjeta de ejemplo)
    const pan = results[0];
    const byKey = Object.fromEntries(pan.breakdown.map((b) => [b.key, Number(b.unitAmount)]));
    expect(Math.round(byKey['materials'])).toBe(769);
    expect(Math.round(byKey['labor'])).toBe(1125);
    expect(Math.round(byKey['packaging'])).toBe(180);
    expect(Math.round(byKey['services'] + byKey['shared'])).toBe(929);
    expect(pan.pricing!.rounded!.price).toBe('4700');
    // Muestran los tres estados posibles
    expect(results.map((r) => r.status)).toEqual(['reviewed', 'pending', 'estimated']);
    expect(results[1].pendingCategories).toEqual(['services']);
  });

  it('se puede cargar en el adaptador demo sin violar sus reglas', async () => {
    const repo = new DemoRepository(new MemoryStorage());
    const seed = buildDemoSeed();
    repo.replaceAll(seed);
    for (const p of seed.products) await expect(repo.saveProduct(p)).resolves.toBeTruthy();
  });
});
