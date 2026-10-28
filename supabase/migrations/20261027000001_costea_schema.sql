-- =====================================================================
-- Costea — esquema inicial
--
-- Principios de seguridad:
--  * Cada tabla tiene user_id y RLS con user_id = auth.uid() en
--    SELECT/INSERT/UPDATE/DELETE (USING y WITH CHECK).
--  * Claves foráneas compuestas (…, business_id) y (business_id, user_id)
--    impiden asociar materiales o productos de otro negocio u otro usuario
--    aunque se manipulen los IDs: las FK se validan siempre en la base de datos.
--  * Importes y cantidades en NUMERIC.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.unit_dimension(u text)
returns text language sql immutable set search_path = '' as $$
  select case u
    when 'g' then 'mass' when 'kg' then 'mass'
    when 'ml' then 'volume' when 'l' then 'volume'
    when 'unit' then 'count'
    when 'cm' then 'length' when 'm' then 'length'
  end
$$;

-- ---------------------------------------------------------------------
-- Negocios
-- ---------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  category text not null default '' check (length(category) <= 80),
  currency char(3) not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  shared_monthly_amount numeric(18, 4) not null default 0 check (shared_monthly_amount >= 0),
  productive_hours_per_month numeric(10, 2) check (productive_hours_per_month > 0),
  shared_expenses_note text not null default '' check (length(shared_expenses_note) <= 500),
  default_hourly_rate numeric(18, 4) check (default_hourly_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- Si hay gastos compartidos, deben existir horas productivas para repartirlos.
  check (shared_monthly_amount = 0 or productive_hours_per_month is not null)
);
create index businesses_user_id_idx on public.businesses (user_id);

-- ---------------------------------------------------------------------
-- Biblioteca de materiales (por negocio)
-- ---------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  purchase_price numeric(18, 4) not null check (purchase_price >= 0),
  purchase_quantity numeric(18, 6) not null check (purchase_quantity > 0),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'unit', 'cm', 'm')),
  is_estimated boolean not null default false,
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade
);
create index materials_business_id_idx on public.materials (business_id);
create index materials_user_id_idx on public.materials (user_id);

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  costing_mode text not null default 'batch' check (costing_mode in ('unit', 'batch')),
  sellable_units numeric(14, 4) not null default 1 check (sellable_units > 0),
  units_made numeric(14, 4) check (units_made > 0),
  losses_accounted boolean not null default false,
  labor_minutes numeric(10, 2) not null default 0 check (labor_minutes >= 0),
  labor_hourly_rate numeric(18, 4) not null default 0 check (labor_hourly_rate >= 0),
  labor_is_estimated boolean not null default false,
  include_shared_costs boolean not null default false,
  production_minutes numeric(10, 2) not null default 0 check (production_minutes >= 0),
  pricing_mode text not null default 'margin' check (pricing_mode in ('margin', 'markup')),
  target_margin numeric(9, 6) not null default 0.3 check (target_margin >= 0 and target_margin < 1),
  markup numeric(12, 6) not null default 0.5 check (markup >= 0),
  commission_rate numeric(9, 6) not null default 0 check (commission_rate >= 0 and commission_rate < 1),
  fixed_sale_fee numeric(18, 4) not null default 0 check (fixed_sale_fee >= 0),
  rounding_step numeric(18, 4) check (rounding_step > 0),
  manual_price numeric(18, 4) check (manual_price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  check (pricing_mode <> 'margin' or target_margin + commission_rate < 1),
  check (costing_mode = 'unit' or units_made is null or units_made >= sellable_units)
);
create index products_business_id_idx on public.products (business_id);
create index products_user_id_idx on public.products (user_id);

-- ---------------------------------------------------------------------
-- Líneas de materiales de un producto
-- ---------------------------------------------------------------------
create table public.product_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  product_id uuid not null,
  material_id uuid not null,
  quantity numeric(18, 6) not null check (quantity >= 0),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'unit', 'cm', 'm')),
  is_estimated boolean not null default false,
  position int not null default 0,
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  -- El producto y el material deben pertenecer al MISMO negocio.
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade,
  foreign key (material_id, business_id) references public.materials (id, business_id) on delete restrict
);
create index product_materials_product_id_idx on public.product_materials (product_id);
create index product_materials_material_id_idx on public.product_materials (material_id);
create index product_materials_user_id_idx on public.product_materials (user_id);

-- ---------------------------------------------------------------------
-- Costos adicionales (empaque, servicios, transporte, otros)
-- ---------------------------------------------------------------------
create table public.product_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  product_id uuid not null,
  category text not null check (category in ('packaging', 'services', 'transport', 'other')),
  name text not null check (length(btrim(name)) between 1 and 120),
  amount numeric(18, 4) not null check (amount >= 0),
  scope text not null check (scope in ('batch', 'unit')),
  is_estimated boolean not null default false,
  position int not null default 0,
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);
create index product_costs_product_id_idx on public.product_costs (product_id);
create index product_costs_user_id_idx on public.product_costs (user_id);

-- ---------------------------------------------------------------------
-- Revisión del checklist (decisión de la persona por categoría)
-- ---------------------------------------------------------------------
create table public.product_checklist (
  product_id uuid not null,
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  category text not null check (category in
    ('materials', 'packaging', 'labor', 'services', 'transport', 'losses', 'shared', 'commissions')),
  decision text not null default 'pending' check (decision in ('pending', 'included', 'not_applicable')),
  primary key (product_id, category),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);
create index product_checklist_user_id_idx on public.product_checklist (user_id);

-- ---------------------------------------------------------------------
-- Instantáneas de reportes (inmutables: conservan los valores originales)
-- ---------------------------------------------------------------------
create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  product_id uuid,
  product_name text not null check (length(btrim(product_name)) between 1 and 120),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  unit_cost numeric check (unit_cost >= 0),
  suggested_price numeric check (suggested_price >= 0),
  status text not null check (status in ('pending', 'estimated', 'reviewed')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  -- Si se elimina el producto, el reporte se conserva sin vínculo.
  foreign key (product_id, business_id) references public.products (id, business_id)
    on delete set null (product_id)
);
create index report_snapshots_business_id_idx on public.report_snapshots (business_id, created_at desc);
create index report_snapshots_product_id_idx on public.report_snapshots (product_id);
create index report_snapshots_user_id_idx on public.report_snapshots (user_id);

-- ---------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- La unidad de una línea debe ser convertible a la unidad del material.
create or replace function public.check_line_unit()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_unit text;
begin
  select m.unit into v_unit from public.materials m where m.id = new.material_id;
  if v_unit is not null and public.unit_dimension(v_unit) <> public.unit_dimension(new.unit) then
    raise exception 'La unidad % no es compatible con la unidad del material (%)', new.unit, v_unit
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger product_materials_unit_check before insert or update on public.product_materials
  for each row execute function public.check_line_unit();

-- No se puede cambiar un material a una unidad de otra dimensión si ya se usa.
create or replace function public.check_material_unit_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.unit_dimension(new.unit) <> public.unit_dimension(old.unit)
     and exists (select 1 from public.product_materials pm where pm.material_id = new.id) then
    raise exception 'El material se usa en productos; no se puede cambiar a una unidad incompatible'
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger materials_unit_change_check before update of unit on public.materials
  for each row execute function public.check_material_unit_change();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.materials enable row level security;
alter table public.products enable row level security;
alter table public.product_materials enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_checklist enable row level security;
alter table public.report_snapshots enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['businesses', 'materials', 'products', 'product_materials',
                           'product_costs', 'product_checklist'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

-- Las instantáneas no se editan: solo leer, crear y eliminar.
create policy report_snapshots_select_own on public.report_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
create policy report_snapshots_insert_own on public.report_snapshots
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy report_snapshots_delete_own on public.report_snapshots
  for delete to authenticated using (user_id = (select auth.uid()));

-- Privilegios: anon no tiene acceso; authenticated opera bajo RLS.
revoke all on public.businesses, public.materials, public.products, public.product_materials,
  public.product_costs, public.product_checklist, public.report_snapshots from anon;
grant select, insert, update, delete on public.businesses, public.materials, public.products,
  public.product_materials, public.product_costs, public.product_checklist to authenticated;
grant select, insert, delete on public.report_snapshots to authenticated;

-- ---------------------------------------------------------------------
-- Guardado transaccional de un producto completo
--
-- SECURITY INVOKER: se ejecuta con los permisos de quien llama, así que RLS
-- y las FK compuestas siguen aplicando. Toda la función es una transacción:
-- si cualquier escritura falla, no queda ningún estado parcial.
-- ---------------------------------------------------------------------
create or replace function public.save_product(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p ->> 'id')::uuid;
  v_business uuid := (p ->> 'business_id')::uuid;
  v_existing_business uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if v_id is null or v_business is null then
    raise exception 'Faltan id o business_id' using errcode = '22023';
  end if;

  select business_id into v_existing_business from public.products where id = v_id;

  if v_existing_business is null then
    insert into public.products (
      id, user_id, business_id, name, description, costing_mode, sellable_units, units_made,
      losses_accounted, labor_minutes, labor_hourly_rate, labor_is_estimated, include_shared_costs,
      production_minutes, pricing_mode, target_margin, markup, commission_rate, fixed_sale_fee,
      rounding_step, manual_price)
    values (
      v_id, v_uid, v_business, p ->> 'name', coalesce(p ->> 'description', ''),
      p ->> 'costing_mode', (p ->> 'sellable_units')::numeric, (p ->> 'units_made')::numeric,
      coalesce((p ->> 'losses_accounted')::boolean, false), (p ->> 'labor_minutes')::numeric,
      (p ->> 'labor_hourly_rate')::numeric, coalesce((p ->> 'labor_is_estimated')::boolean, false),
      coalesce((p ->> 'include_shared_costs')::boolean, false), (p ->> 'production_minutes')::numeric,
      p ->> 'pricing_mode', (p ->> 'target_margin')::numeric, (p ->> 'markup')::numeric,
      (p ->> 'commission_rate')::numeric, (p ->> 'fixed_sale_fee')::numeric,
      (p ->> 'rounding_step')::numeric, (p ->> 'manual_price')::numeric);
  else
    if v_existing_business <> v_business then
      raise exception 'Un producto no puede moverse de negocio' using errcode = '22023';
    end if;
    update public.products set
      name = p ->> 'name',
      description = coalesce(p ->> 'description', ''),
      costing_mode = p ->> 'costing_mode',
      sellable_units = (p ->> 'sellable_units')::numeric,
      units_made = (p ->> 'units_made')::numeric,
      losses_accounted = coalesce((p ->> 'losses_accounted')::boolean, false),
      labor_minutes = (p ->> 'labor_minutes')::numeric,
      labor_hourly_rate = (p ->> 'labor_hourly_rate')::numeric,
      labor_is_estimated = coalesce((p ->> 'labor_is_estimated')::boolean, false),
      include_shared_costs = coalesce((p ->> 'include_shared_costs')::boolean, false),
      production_minutes = (p ->> 'production_minutes')::numeric,
      pricing_mode = p ->> 'pricing_mode',
      target_margin = (p ->> 'target_margin')::numeric,
      markup = (p ->> 'markup')::numeric,
      commission_rate = (p ->> 'commission_rate')::numeric,
      fixed_sale_fee = (p ->> 'fixed_sale_fee')::numeric,
      rounding_step = (p ->> 'rounding_step')::numeric,
      manual_price = (p ->> 'manual_price')::numeric
    where id = v_id;
  end if;

  delete from public.product_materials where product_id = v_id;
  insert into public.product_materials (id, user_id, business_id, product_id, material_id, quantity, unit, is_estimated, position)
  select coalesce(x.id, gen_random_uuid()), v_uid, v_business, v_id, x.material_id, x.quantity, x.unit,
         coalesce(x.is_estimated, false), x.ord - 1
  from rows from (jsonb_to_recordset(coalesce(p -> 'materials', '[]'::jsonb))
         as (id uuid, material_id uuid, quantity numeric, unit text, is_estimated boolean))
       with ordinality as x(id, material_id, quantity, unit, is_estimated, ord);

  delete from public.product_costs where product_id = v_id;
  insert into public.product_costs (id, user_id, business_id, product_id, category, name, amount, scope, is_estimated, position)
  select coalesce(x.id, gen_random_uuid()), v_uid, v_business, v_id, x.category, x.name, x.amount, x.scope,
         coalesce(x.is_estimated, false), x.ord - 1
  from rows from (jsonb_to_recordset(coalesce(p -> 'costs', '[]'::jsonb))
         as (id uuid, category text, name text, amount numeric, scope text, is_estimated boolean))
       with ordinality as x(id, category, name, amount, scope, is_estimated, ord);

  delete from public.product_checklist where product_id = v_id;
  insert into public.product_checklist (product_id, user_id, business_id, category, decision)
  select v_id, v_uid, v_business, e.key, e.value
  from jsonb_each_text(coalesce(p -> 'checklist', '{}'::jsonb)) as e;

  return v_id;
end $$;

revoke all on function public.save_product(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated;
