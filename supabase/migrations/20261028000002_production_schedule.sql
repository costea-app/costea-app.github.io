-- =====================================================================
-- Costea — días y horas de producción del negocio
-- La app calcula las horas productivas del mes (días × horas × 4,33 semanas);
-- estas columnas guardan lo que la persona respondió para poder editarlo después.
-- =====================================================================
alter table public.businesses
  add column if not exists production_days_per_week numeric(3, 1)
    check (production_days_per_week > 0 and production_days_per_week <= 7),
  add column if not exists production_hours_per_day numeric(4, 2)
    check (production_hours_per_day > 0 and production_hours_per_day <= 24);
