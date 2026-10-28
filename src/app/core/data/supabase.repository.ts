import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  AdditionalCost,
  Business,
  CHECKLIST_CATEGORIES,
  ChecklistDecision,
  Material,
  MaterialLine,
  Product,
} from '../models/domain';
import { emptyChecklist } from '../models/factories';
import { ReportSnapshot, SnapshotData } from '../models/snapshot';
import { Decimal } from '../engine/decimal';
import { CosteaRepository, RepositoryError } from './repository';

/* Las columnas NUMERIC se piden como texto (::text) para no perder precisión en JSON. */
const BUSINESS_COLS =
  'id,name,category,currency,shared_monthly_amount::text,productive_hours_per_month::text,production_days_per_week::text,production_hours_per_day::text,shared_expenses_note,default_hourly_rate::text,created_at,updated_at';
const MATERIAL_COLS =
  'id,business_id,name,purchase_price::text,purchase_quantity::text,unit,is_estimated,notes,created_at,updated_at';
const PRODUCT_COLS = [
  'id,business_id,name,description,costing_mode,sellable_units::text,units_made::text,losses_accounted',
  'labor_minutes::text,labor_hourly_rate::text,labor_is_estimated,include_shared_costs,production_minutes::text',
  'pricing_mode,target_margin::text,markup::text,commission_rate::text,fixed_sale_fee::text',
  'rounding_step::text,manual_price::text,created_at,updated_at',
  'product_materials(id,material_id,quantity::text,unit,is_estimated,position)',
  'product_costs(id,category,name,amount::text,scope,is_estimated,position)',
  'product_checklist(category,decision)',
].join(',');
const SNAPSHOT_COLS =
  'id,business_id,product_id,product_name,currency,unit_cost::text,suggested_price::text,status,data,created_at';

type Row = Record<string, unknown>;

/** "5000.0000" → "5000"; null se conserva. */
function num(v: unknown): string {
  return new Decimal(String(v)).toFixed();
}
function numOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : num(v);
}

function toBusiness(r: Row): Business {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    category: (r['category'] as string) ?? '',
    currency: r['currency'] as string,
    sharedMonthlyAmount: num(r['shared_monthly_amount']),
    productiveHoursPerMonth: numOrNull(r['productive_hours_per_month']),
    productionDaysPerWeek: numOrNull(r['production_days_per_week']),
    productionHoursPerDay: numOrNull(r['production_hours_per_day']),
    sharedExpensesNote: (r['shared_expenses_note'] as string) ?? '',
    defaultHourlyRate: numOrNull(r['default_hourly_rate']),
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function toMaterial(r: Row): Material {
  return {
    id: r['id'] as string,
    businessId: r['business_id'] as string,
    name: r['name'] as string,
    purchasePrice: num(r['purchase_price']),
    purchaseQuantity: num(r['purchase_quantity']),
    unit: r['unit'] as Material['unit'],
    isEstimated: !!r['is_estimated'],
    notes: (r['notes'] as string) ?? '',
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

const byPosition = (a: Row, b: Row) => (a['position'] as number) - (b['position'] as number);

function toProduct(r: Row): Product {
  const checklist = emptyChecklist();
  for (const c of (r['product_checklist'] as Row[]) ?? []) {
    const cat = c['category'] as (typeof CHECKLIST_CATEGORIES)[number];
    if (CHECKLIST_CATEGORIES.includes(cat)) checklist[cat] = c['decision'] as ChecklistDecision;
  }
  return {
    id: r['id'] as string,
    businessId: r['business_id'] as string,
    name: r['name'] as string,
    description: (r['description'] as string) ?? '',
    costingMode: r['costing_mode'] as Product['costingMode'],
    sellableUnits: num(r['sellable_units']),
    unitsMade: numOrNull(r['units_made']),
    lossesAccounted: !!r['losses_accounted'],
    laborMinutes: num(r['labor_minutes']),
    laborHourlyRate: num(r['labor_hourly_rate']),
    laborIsEstimated: !!r['labor_is_estimated'],
    includeSharedCosts: !!r['include_shared_costs'],
    productionMinutes: num(r['production_minutes']),
    materials: [...((r['product_materials'] as Row[]) ?? [])].sort(byPosition).map(
      (l): MaterialLine => ({
        id: l['id'] as string,
        materialId: l['material_id'] as string,
        quantity: num(l['quantity']),
        unit: l['unit'] as MaterialLine['unit'],
        isEstimated: !!l['is_estimated'],
      }),
    ),
    costs: [...((r['product_costs'] as Row[]) ?? [])].sort(byPosition).map(
      (c): AdditionalCost => ({
        id: c['id'] as string,
        category: c['category'] as AdditionalCost['category'],
        name: c['name'] as string,
        amount: num(c['amount']),
        scope: c['scope'] as AdditionalCost['scope'],
        isEstimated: !!c['is_estimated'],
      }),
    ),
    checklist,
    pricing: {
      mode: r['pricing_mode'] as Product['pricing']['mode'],
      targetMargin: num(r['target_margin']),
      markup: num(r['markup']),
      commissionRate: num(r['commission_rate']),
      fixedSaleFee: num(r['fixed_sale_fee']),
      roundingStep: numOrNull(r['rounding_step']),
      manualPrice: numOrNull(r['manual_price']),
    },
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function toSnapshot(r: Row): ReportSnapshot {
  return {
    id: r['id'] as string,
    businessId: r['business_id'] as string,
    productId: (r['product_id'] as string | null) ?? null,
    productName: r['product_name'] as string,
    currency: r['currency'] as string,
    unitCost: numOrNull(r['unit_cost']),
    suggestedPrice: numOrNull(r['suggested_price']),
    status: r['status'] as ReportSnapshot['status'],
    data: r['data'] as SnapshotData,
    createdAt: r['created_at'] as string,
  };
}

/** Traduce errores de PostgREST/Postgres a mensajes comprensibles. */
function translate(error: PostgrestError | Error, context: string): RepositoryError {
  const code = (error as PostgrestError).code;
  const msg = error.message ?? '';
  let text: string;
  switch (code) {
    case '23503':
      text = msg.includes('product_materials')
        ? 'Este material se usa en uno o más productos. Quítalo de esos productos antes de eliminarlo.'
        : 'Algún dato hace referencia a un elemento que no existe o no te pertenece.';
      break;
    case '23514':
      text = msg.includes('compatible')
        ? 'La unidad elegida no es compatible con la del material.'
        : 'Algún dato no cumple las reglas (por ejemplo, un número negativo o un porcentaje fuera de rango).';
      break;
    case '23505':
      text = 'Ya existe un elemento con ese identificador.';
      break;
    case '42501':
    case 'PGRST301':
      text = 'Tu sesión no tiene permiso para esta acción. Vuelve a iniciar sesión.';
      break;
    default:
      text =
        error instanceof TypeError || /fetch|network/i.test(msg)
          ? 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
          : `No pudimos ${context}. Intenta de nuevo.`;
  }
  return new RepositoryError(text, error);
}

export class SupabaseRepository implements CosteaRepository {
  readonly kind = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  private async run<T>(context: string, op: () => PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
    let res: { data: T; error: PostgrestError | null };
    try {
      res = await op();
    } catch (e) {
      throw translate(e as Error, context);
    }
    if (res.error) throw translate(res.error, context);
    return res.data;
  }

  async listBusinesses(): Promise<Business[]> {
    const rows = await this.run('cargar tus negocios', () =>
      this.client.from('businesses').select(BUSINESS_COLS).order('name'),
    );
    return (rows as Row[]).map(toBusiness);
  }

  async getBusiness(id: string): Promise<Business | null> {
    const row = await this.run('cargar el negocio', () =>
      this.client.from('businesses').select(BUSINESS_COLS).eq('id', id).maybeSingle(),
    );
    return row ? toBusiness(row as Row) : null;
  }

  async saveBusiness(b: Business): Promise<Business> {
    const row = await this.run('guardar el negocio', () =>
      this.client
        .from('businesses')
        .upsert({
          id: b.id,
          name: b.name.trim(),
          category: b.category.trim(),
          currency: b.currency,
          shared_monthly_amount: b.sharedMonthlyAmount,
          productive_hours_per_month: b.productiveHoursPerMonth,
          production_days_per_week: b.productionDaysPerWeek,
          production_hours_per_day: b.productionHoursPerDay,
          shared_expenses_note: b.sharedExpensesNote,
          default_hourly_rate: b.defaultHourlyRate,
        })
        .select(BUSINESS_COLS)
        .single(),
    );
    return toBusiness(row as Row);
  }

  async deleteBusiness(id: string): Promise<void> {
    await this.run('eliminar el negocio', () => this.client.from('businesses').delete().eq('id', id));
  }

  async listMaterials(businessId: string): Promise<Material[]> {
    const rows = await this.run('cargar los materiales', () =>
      this.client.from('materials').select(MATERIAL_COLS).eq('business_id', businessId).order('name'),
    );
    return (rows as Row[]).map(toMaterial);
  }

  async saveMaterial(m: Material): Promise<Material> {
    const row = await this.run('guardar el material', () =>
      this.client
        .from('materials')
        .upsert({
          id: m.id,
          business_id: m.businessId,
          name: m.name.trim(),
          purchase_price: m.purchasePrice,
          purchase_quantity: m.purchaseQuantity,
          unit: m.unit,
          is_estimated: m.isEstimated,
          notes: m.notes,
        })
        .select(MATERIAL_COLS)
        .single(),
    );
    return toMaterial(row as Row);
  }

  async deleteMaterial(id: string): Promise<void> {
    await this.run('eliminar el material', () => this.client.from('materials').delete().eq('id', id));
  }

  async listProducts(businessId: string): Promise<Product[]> {
    const rows = await this.run('cargar los productos', () =>
      this.client.from('products').select(PRODUCT_COLS).eq('business_id', businessId).order('name'),
    );
    return (rows as unknown as Row[]).map(toProduct);
  }

  async getProduct(id: string): Promise<Product | null> {
    const row = await this.run('cargar el producto', () =>
      this.client.from('products').select(PRODUCT_COLS).eq('id', id).maybeSingle(),
    );
    return row ? toProduct(row as unknown as Row) : null;
  }

  async saveProduct(p: Product): Promise<Product> {
    // Una sola llamada RPC = una sola transacción en Postgres (sin estados parciales).
    const payload = {
      id: p.id,
      business_id: p.businessId,
      name: p.name.trim(),
      description: p.description,
      costing_mode: p.costingMode,
      sellable_units: p.costingMode === 'unit' ? '1' : p.sellableUnits,
      units_made: p.costingMode === 'unit' ? null : p.unitsMade,
      losses_accounted: p.lossesAccounted,
      labor_minutes: p.laborMinutes,
      labor_hourly_rate: p.laborHourlyRate,
      labor_is_estimated: p.laborIsEstimated,
      include_shared_costs: p.includeSharedCosts,
      production_minutes: p.productionMinutes,
      pricing_mode: p.pricing.mode,
      target_margin: p.pricing.targetMargin,
      markup: p.pricing.markup,
      commission_rate: p.pricing.commissionRate,
      fixed_sale_fee: p.pricing.fixedSaleFee,
      rounding_step: p.pricing.roundingStep,
      manual_price: p.pricing.manualPrice,
      materials: p.materials.map((l) => ({
        id: l.id,
        material_id: l.materialId,
        quantity: l.quantity,
        unit: l.unit,
        is_estimated: l.isEstimated,
      })),
      costs: p.costs.map((c) => ({
        id: c.id,
        category: c.category,
        name: c.name.trim(),
        amount: c.amount,
        scope: c.scope,
        is_estimated: c.isEstimated,
      })),
      checklist: p.checklist,
    };
    await this.run('guardar el producto', () => this.client.rpc('save_product', { p: payload }));
    const saved = await this.getProduct(p.id);
    if (!saved) throw new RepositoryError('El producto se guardó, pero no pudimos volver a cargarlo.');
    return saved;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.run('eliminar el producto', () => this.client.from('products').delete().eq('id', id));
  }

  async listSnapshots(businessId: string): Promise<ReportSnapshot[]> {
    const rows = await this.run('cargar los reportes', () =>
      this.client
        .from('report_snapshots')
        .select(SNAPSHOT_COLS)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false }),
    );
    return (rows as Row[]).map(toSnapshot);
  }

  async getSnapshot(id: string): Promise<ReportSnapshot | null> {
    const row = await this.run('cargar el reporte', () =>
      this.client.from('report_snapshots').select(SNAPSHOT_COLS).eq('id', id).maybeSingle(),
    );
    return row ? toSnapshot(row as Row) : null;
  }

  async saveSnapshot(s: ReportSnapshot): Promise<ReportSnapshot> {
    const row = await this.run('guardar el reporte', () =>
      this.client
        .from('report_snapshots')
        .insert({
          id: s.id,
          business_id: s.businessId,
          product_id: s.productId,
          product_name: s.productName,
          currency: s.currency,
          unit_cost: s.unitCost,
          suggested_price: s.suggestedPrice,
          status: s.status,
          data: s.data,
        })
        .select(SNAPSHOT_COLS)
        .single(),
    );
    return toSnapshot(row as Row);
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.run('eliminar el reporte', () => this.client.from('report_snapshots').delete().eq('id', id));
  }
}
