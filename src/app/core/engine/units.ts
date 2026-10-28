import { Unit } from '../models/domain';
import { CosteaValidationError, Decimal, toDecimal } from './decimal';

export type Dimension = 'mass' | 'volume' | 'count' | 'length';

interface UnitInfo {
  dimension: Dimension;
  /** Cuántas unidades base (g, ml, unidad, cm) equivalen a 1 de esta unidad. */
  toBase: number;
  label: string;
  short: string;
}

export const UNITS: Record<Unit, UnitInfo> = {
  g: { dimension: 'mass', toBase: 1, label: 'gramos', short: 'g' },
  kg: { dimension: 'mass', toBase: 1000, label: 'kilogramos', short: 'kg' },
  ml: { dimension: 'volume', toBase: 1, label: 'mililitros', short: 'ml' },
  l: { dimension: 'volume', toBase: 1000, label: 'litros', short: 'L' },
  unit: { dimension: 'count', toBase: 1, label: 'unidades', short: 'und.' },
  cm: { dimension: 'length', toBase: 1, label: 'centímetros', short: 'cm' },
  m: { dimension: 'length', toBase: 100, label: 'metros', short: 'm' },
};

export const ALL_UNITS = Object.keys(UNITS) as Unit[];

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && value in UNITS;
}

export function areCompatible(a: Unit, b: Unit): boolean {
  return UNITS[a].dimension === UNITS[b].dimension;
}

/** Unidades a las que se puede convertir `unit` sin un factor explícito. */
export function compatibleUnits(unit: Unit): Unit[] {
  return ALL_UNITS.filter((u) => areCompatible(u, unit));
}

/**
 * Convierte `quantity` de `from` a `to`.
 *
 * Entre dimensiones distintas (p. ej. g → ml) se rechaza la conversión salvo que se
 * pase `explicitFactor`: cuántas unidades `to` equivalen a 1 unidad `from`.
 * Esta versión no incluye tablas de densidades.
 */
export function convertQuantity(
  quantity: string | Decimal,
  from: Unit,
  to: Unit,
  explicitFactor?: string | Decimal,
): Decimal {
  if (!isUnit(from) || !isUnit(to)) {
    throw new CosteaValidationError('unknown_unit', 'La unidad de medida no es válida.');
  }
  const q = toDecimal(quantity, 'cantidad');
  if (explicitFactor !== undefined) {
    const factor = toDecimal(explicitFactor, 'factor de conversión');
    if (factor.lte(0)) {
      throw new CosteaValidationError(
        'invalid_factor',
        'El factor de conversión debe ser mayor que cero.',
      );
    }
    return q.mul(factor);
  }
  if (!areCompatible(from, to)) {
    throw new CosteaValidationError(
      'incompatible_units',
      `No se puede convertir ${UNITS[from].label} a ${UNITS[to].label} sin un factor de conversión.`,
    );
  }
  return q.mul(UNITS[from].toBase).div(UNITS[to].toBase);
}
