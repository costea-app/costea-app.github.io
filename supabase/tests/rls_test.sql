-- =====================================================================
-- Pruebas de aislamiento (RLS), integridad y guardado transaccional.
-- Cualquier aserción fallida aborta el script (ON_ERROR_STOP).
-- =====================================================================

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Ejecuta SQL dinámico como el rol actual y exige que falle con un mensaje que contenga `pattern`.
create function tests.expect_error(label text, sql text, pattern text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then
      raise notice 'ok  %', label;
      return;
    end if;
    raise exception 'FALLO %: error inesperado: %', label, sqlerrm;
  end;
  raise exception 'FALLO %: se esperaba un error y la operación se permitió', label;
end $$;

create function tests.expect_eq(label text, actual bigint, expected bigint) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLO %: esperado %, obtenido %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

-- Cuenta filas afectadas por una sentencia (para comprobar UPDATE/DELETE silenciosamente filtrados por RLS).
create function tests.affected(sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- IDs fijos
-- Usuario A: aaaaaaaa-…   Usuario B: bbbbbbbb-…
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@example.com');

-- ---------------------------------------------------------------------
-- Usuario A crea sus datos
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);

insert into public.businesses (id, name, category) values
  ('a0000000-0000-0000-0000-00000000b001', 'Panadería A', 'Panadería'),
  ('a0000000-0000-0000-0000-00000000b002', 'Velas A', 'Velas');
insert into public.materials (id, business_id, name, purchase_price, purchase_quantity, unit) values
  ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-00000000b001', 'Harina', 5000, 1000, 'g'),
  ('a0000000-0000-0000-0000-00000000a002', 'a0000000-0000-0000-0000-00000000b002', 'Cera de soya', 40000, 1, 'kg');

-- Crear producto (flujo: crear)
select public.save_product('{
  "id": "a0000000-0000-0000-0000-00000000c001",
  "business_id": "a0000000-0000-0000-0000-00000000b001",
  "name": "Pan artesanal", "costing_mode": "batch", "sellable_units": "12",
  "labor_minutes": "60", "labor_hourly_rate": "12000", "production_minutes": "90",
  "pricing_mode": "margin", "target_margin": "0.3", "markup": "0.5",
  "commission_rate": "0", "fixed_sale_fee": "0",
  "materials": [{"material_id": "a0000000-0000-0000-0000-00000000a001", "quantity": "300", "unit": "g"}],
  "costs": [{"category": "packaging", "name": "Bolsa", "amount": "300", "scope": "unit"}],
  "checklist": {"materials": "included", "packaging": "included", "transport": "not_applicable"}
}'::jsonb);

select tests.expect_eq('crear: producto persistido', (select count(*) from public.products), 1);
select tests.expect_eq('crear: línea de material', (select count(*) from public.product_materials), 1);
select tests.expect_eq('crear: costo adicional', (select count(*) from public.product_costs), 1);
select tests.expect_eq('crear: checklist', (select count(*) from public.product_checklist), 3);
select tests.expect_eq('crear: user_id asignado por la BD',
  (select count(*) from public.products where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1);

-- Editar producto (flujo: editar) — reemplaza líneas sin dejar huérfanas
select public.save_product('{
  "id": "a0000000-0000-0000-0000-00000000c001",
  "business_id": "a0000000-0000-0000-0000-00000000b001",
  "name": "Pan artesanal de masa madre", "costing_mode": "batch", "sellable_units": "10",
  "labor_minutes": "75", "labor_hourly_rate": "12000", "production_minutes": "90",
  "pricing_mode": "markup", "target_margin": "0.3", "markup": "0.8",
  "commission_rate": "0.05", "fixed_sale_fee": "0", "rounding_step": "500",
  "materials": [
    {"material_id": "a0000000-0000-0000-0000-00000000a001", "quantity": "0.35", "unit": "kg"},
    {"material_id": "a0000000-0000-0000-0000-00000000a001", "quantity": "20", "unit": "g", "is_estimated": true}
  ],
  "costs": [],
  "checklist": {"materials": "included"}
}'::jsonb);
select tests.expect_eq('editar: nombre actualizado',
  (select count(*) from public.products where name = 'Pan artesanal de masa madre' and sellable_units = 10), 1);
select tests.expect_eq('editar: líneas reemplazadas', (select count(*) from public.product_materials), 2);
select tests.expect_eq('editar: costos reemplazados', (select count(*) from public.product_costs), 0);
select tests.expect_eq('editar: checklist reemplazado', (select count(*) from public.product_checklist), 1);

-- Duplicar producto (flujo: duplicar = guardar copia con id nuevo)
select public.save_product(
  (select jsonb_build_object(
     'id', 'a0000000-0000-0000-0000-00000000c002', 'business_id', business_id,
     'name', name || ' (copia)', 'costing_mode', costing_mode, 'sellable_units', sellable_units,
     'labor_minutes', labor_minutes, 'labor_hourly_rate', labor_hourly_rate,
     'production_minutes', production_minutes, 'pricing_mode', pricing_mode,
     'target_margin', target_margin, 'markup', markup, 'commission_rate', commission_rate,
     'fixed_sale_fee', fixed_sale_fee, 'rounding_step', rounding_step,
     'materials', (select jsonb_agg(jsonb_build_object('material_id', material_id, 'quantity', quantity, 'unit', unit))
                   from public.product_materials where product_id = p.id),
     'costs', '[]'::jsonb, 'checklist', '{}'::jsonb)
   from public.products p where id = 'a0000000-0000-0000-0000-00000000c001'));
select tests.expect_eq('duplicar: dos productos', (select count(*) from public.products), 2);
select tests.expect_eq('duplicar: líneas copiadas',
  (select count(*) from public.product_materials where product_id = 'a0000000-0000-0000-0000-00000000c002'), 2);
select tests.expect_eq('duplicar: original intacto',
  (select count(*) from public.product_materials where product_id = 'a0000000-0000-0000-0000-00000000c001'), 2);

-- Transaccionalidad: un costo inválido revierte TODO el guardado
select tests.expect_error('transacción: costo negativo revierte el guardado', $q$
  select public.save_product('{
    "id": "a0000000-0000-0000-0000-00000000c001",
    "business_id": "a0000000-0000-0000-0000-00000000b001",
    "name": "NOMBRE QUE NO DEBE QUEDAR", "costing_mode": "batch", "sellable_units": "10",
    "labor_minutes": "0", "labor_hourly_rate": "0", "production_minutes": "0",
    "pricing_mode": "margin", "target_margin": "0.3", "markup": "0", "commission_rate": "0", "fixed_sale_fee": "0",
    "materials": [], "costs": [{"category": "other", "name": "x", "amount": "-5", "scope": "batch"}], "checklist": {}
  }'::jsonb)$q$, 'check');
select tests.expect_eq('transacción: nombre sin cambios',
  (select count(*) from public.products where name = 'Pan artesanal de masa madre'), 1);
select tests.expect_eq('transacción: líneas sin cambios',
  (select count(*) from public.product_materials where product_id = 'a0000000-0000-0000-0000-00000000c001'), 2);

-- Validaciones del dominio en la BD
select tests.expect_error('margen + comisión >= 100 % rechazado', $q$
  update public.products set pricing_mode = 'margin', target_margin = 0.7, commission_rate = 0.3
  where id = 'a0000000-0000-0000-0000-00000000c001'$q$, 'check');
select tests.expect_error('unidades vendibles en cero rechazadas', $q$
  update public.products set sellable_units = 0 where id = 'a0000000-0000-0000-0000-00000000c001'$q$, 'check');
select tests.expect_error('cantidad comprada cero rechazada', $q$
  update public.materials set purchase_quantity = 0 where id = 'a0000000-0000-0000-0000-00000000a001'$q$, 'check');
select tests.expect_error('unidad incompatible en una línea (g → ml)', $q$
  insert into public.product_materials (business_id, product_id, material_id, quantity, unit)
  values ('a0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000c001',
          'a0000000-0000-0000-0000-00000000a001', 100, 'ml')$q$, 'no es compatible');
select tests.expect_error('material usado no puede cambiar a otra dimensión', $q$
  update public.materials set unit = 'ml' where id = 'a0000000-0000-0000-0000-00000000a001'$q$, 'incompatible');
select tests.expect_error('material de OTRO negocio del mismo usuario rechazado', $q$
  insert into public.product_materials (business_id, product_id, material_id, quantity, unit)
  values ('a0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000c001',
          'a0000000-0000-0000-0000-00000000a002', 1, 'kg')$q$, 'foreign key');
select tests.expect_error('eliminar material en uso rechazado', $q$
  delete from public.materials where id = 'a0000000-0000-0000-0000-00000000a001'$q$, 'foreign key');

-- Instantánea: conserva valores aunque cambie el material y se elimine el producto
insert into public.report_snapshots (id, business_id, product_id, product_name, currency, unit_cost, suggested_price, status, data)
values ('a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b001',
        'a0000000-0000-0000-0000-00000000c002', 'Pan (copia)', 'COP', 1550, 2500, 'pending',
        '{"result": {"unitCost": "1550"}}');
update public.materials set purchase_price = 9000 where id = 'a0000000-0000-0000-0000-00000000a001';
select tests.expect_error('instantáneas inmutables (sin UPDATE)', $q$
  update public.report_snapshots set unit_cost = 1 where id = 'a0000000-0000-0000-0000-00000000d001'$q$,
  'permission denied');
delete from public.products where id = 'a0000000-0000-0000-0000-00000000c002';
select tests.expect_eq('instantánea conservada tras eliminar producto',
  (select count(*) from public.report_snapshots
   where product_id is null and unit_cost = 1550 and data -> 'result' ->> 'unitCost' = '1550'), 1);

reset role;

-- ---------------------------------------------------------------------
-- Usuario B: aislamiento total respecto de A
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001"}', false);

insert into public.businesses (id, name) values ('b0000000-0000-0000-0000-00000000b001', 'Negocio B');
insert into public.materials (id, business_id, name, purchase_price, purchase_quantity, unit)
values ('b0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b001', 'Azúcar', 4000, 1000, 'g');

select tests.expect_eq('B solo ve su negocio', (select count(*) from public.businesses), 1);
select tests.expect_eq('B solo ve su material', (select count(*) from public.materials), 1);
select tests.expect_eq('B no ve productos de A', (select count(*) from public.products), 0);
select tests.expect_eq('B no ve líneas de A', (select count(*) from public.product_materials), 0);
select tests.expect_eq('B no ve checklist de A', (select count(*) from public.product_checklist), 0);
select tests.expect_eq('B no ve reportes de A', (select count(*) from public.report_snapshots), 0);

select tests.expect_eq('B no puede actualizar el negocio de A',
  tests.affected($q$update public.businesses set name = 'hackeado' where id = 'a0000000-0000-0000-0000-00000000b001'$q$), 0);
select tests.expect_eq('B no puede eliminar productos de A',
  tests.affected($q$delete from public.products where id = 'a0000000-0000-0000-0000-00000000c001'$q$), 0);
select tests.expect_eq('B no puede eliminar reportes de A',
  tests.affected($q$delete from public.report_snapshots where id = 'a0000000-0000-0000-0000-00000000d001'$q$), 0);

select tests.expect_error('B no puede crear un negocio a nombre de A', $q$
  insert into public.businesses (name, user_id) values ('x', 'aaaaaaaa-0000-0000-0000-000000000001')$q$,
  'row-level security');
select tests.expect_error('B no puede transferir su material a A', $q$
  update public.materials set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'b0000000-0000-0000-0000-00000000a001'$q$, 'row-level security');
select tests.expect_error('B no puede crear material en el negocio de A (ID manipulado)', $q$
  insert into public.materials (business_id, name, purchase_price, purchase_quantity, unit)
  values ('a0000000-0000-0000-0000-00000000b001', 'x', 1, 1, 'g')$q$, 'foreign key');
select tests.expect_error('B no puede usar el material de A en su producto (ID manipulado)', $q$
  select public.save_product('{
    "id": "b0000000-0000-0000-0000-00000000c001", "business_id": "b0000000-0000-0000-0000-00000000b001",
    "name": "Robo", "costing_mode": "unit", "sellable_units": "1", "labor_minutes": "0",
    "labor_hourly_rate": "0", "production_minutes": "0", "pricing_mode": "margin", "target_margin": "0.3",
    "markup": "0", "commission_rate": "0", "fixed_sale_fee": "0",
    "materials": [{"material_id": "a0000000-0000-0000-0000-00000000a001", "quantity": "1", "unit": "g"}],
    "costs": [], "checklist": {}}'::jsonb)$q$, 'foreign key');
select tests.expect_eq('… y no quedó un producto parcial', (select count(*) from public.products), 0);
select tests.expect_error('B no puede guardar un producto en el negocio de A', $q$
  select public.save_product('{
    "id": "b0000000-0000-0000-0000-00000000c002", "business_id": "a0000000-0000-0000-0000-00000000b001",
    "name": "x", "costing_mode": "unit", "sellable_units": "1", "labor_minutes": "0",
    "labor_hourly_rate": "0", "production_minutes": "0", "pricing_mode": "margin", "target_margin": "0.3",
    "markup": "0", "commission_rate": "0", "fixed_sale_fee": "0", "materials": [], "costs": [], "checklist": {}}'::jsonb)$q$,
  'foreign key');
select tests.expect_error('B no puede sobrescribir el producto de A reutilizando su id', $q$
  select public.save_product('{
    "id": "a0000000-0000-0000-0000-00000000c001", "business_id": "b0000000-0000-0000-0000-00000000b001",
    "name": "x", "costing_mode": "unit", "sellable_units": "1", "labor_minutes": "0",
    "labor_hourly_rate": "0", "production_minutes": "0", "pricing_mode": "margin", "target_margin": "0.3",
    "markup": "0", "commission_rate": "0", "fixed_sale_fee": "0", "materials": [], "costs": [], "checklist": {}}'::jsonb)$q$,
  'duplicate key');
select tests.expect_error('B no puede insertar líneas en el producto de A', $q$
  insert into public.product_materials (business_id, product_id, material_id, quantity, unit)
  values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000c001',
          'b0000000-0000-0000-0000-00000000a001', 1, 'g')$q$, 'foreign key');
select tests.expect_error('B no puede crear reportes en el negocio de A', $q$
  insert into public.report_snapshots (business_id, product_name, currency, status, data)
  values ('a0000000-0000-0000-0000-00000000b001', 'x', 'COP', 'pending', '{}')$q$, 'foreign key');

reset role;

-- ---------------------------------------------------------------------
-- Visitante anónimo: sin acceso
-- ---------------------------------------------------------------------
set role anon;
select set_config('request.jwt.claims', '', false);
select tests.expect_error('anon no puede leer negocios', 'select * from public.businesses', 'permission denied');
select tests.expect_error('anon no puede ejecutar save_product',
  $q$select public.save_product('{}'::jsonb)$q$, 'permission denied');
select tests.expect_eq('anon puede ejecutar keep_alive',
  (select count(*) from (select public.keep_alive()) as k), 1);
reset role;

-- Comprobación final como superusuario: los datos de A siguen intactos
select tests.expect_eq('datos de A intactos',
  (select count(*) from public.businesses where name = 'Panadería A'), 1);
set role authenticated;
select set_config('request.jwt.claims', '', false);
select tests.expect_error('save_product sin sesión exige iniciar sesión',
  $q$select public.save_product('{"id":"c0000000-0000-0000-0000-000000000001","business_id":"c0000000-0000-0000-0000-000000000001"}'::jsonb)$q$,
  'Debes iniciar sesión');
reset role;
